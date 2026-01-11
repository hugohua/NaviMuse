import { navidromeClient } from './navidrome';
import { llmClient } from './llm';
import { config } from '../config';
import { Song, CuratorResponse, DiscoveryMode } from '../types';

/**
 * 策展服务 (Curator Service)
 * 核心业务逻辑层，编排 ETL 流程：
 * 1. Extract: 从 Navidrome 抽取候选歌曲池 (混合随机与收藏)
 * 2. Transform: 调用 AI 进行重排序和筛选
 * 3. Load: 将确定的歌单回写到 Navidrome
 */
export class CuratorService {

    /**
     * 生成用户画像
     * 获取一定数量代表性歌曲（优先红心，其次高频播放）并调用 LLM 分析
     */
    async generateUserProfile(): Promise<import('../types').UserProfile> {
        console.log('[Curator] Generating User Profile logic...');

        // 1. 获取数据 (红心歌曲 + 常听歌曲)
        // 扩大样本池：除了显式喜欢的 (Starred)，加入隐式喜欢的 (Most Played)
        const [starredSongs, mostPlayed] = await Promise.all([
            navidromeClient.getStarred(),
            navidromeClient.getMostPlayed(20) // Top 20 frequent albums
        ]);

        // 2. 合并与去重
        const map = new Map<string, Song>();
        // 优先放入常听 (通常更有时效性或代表性)
        mostPlayed.forEach(s => map.set(s.id, s));
        // 补充红心 (如果已存在则保留，或覆盖，这里 Song 对象一致所以没区别)
        starredSongs.forEach(s => {
            if (!map.has(s.id)) map.set(s.id, s);
        });

        const allCandidates = Array.from(map.values());
        console.log(`[Curator] Profile Source: ${allCandidates.length} unique songs (Starred + Most Played).`);

        // 3. 筛选 Top N
        // 策略: 严格按播放量排序。对于 PlayCount=0 的红心歌曲，排在最后。
        const sampleSize = config.app.profileSampleSize;
        const topSongs = allCandidates
            .sort((a, b) => (b.playCount || 0) - (a.playCount || 0))
            .slice(0, sampleSize);

        console.log(`[Curator] Analyzed ${topSongs.length} songs for profile.`);

        // 4. 调用 LLM
        return await llmClient.analyzeUserProfile(topSongs);
    }

    /**
     * 主策展流程
     * @param scene 用户输入的 prompt (场景/心情/流派)
     * @param mode 探索模式 (default | familiar | fresh)
     * @param userProfilePrecalced 前端传入的预计算用户画像 (可选)
     */
    async curate(scene: string, mode: DiscoveryMode = 'default', userProfilePrecalced?: import('../types').UserProfile): Promise<CuratorResponse> {
        console.log(`[Curator] Starting flow for scene: "${scene}" (Mode: ${mode})`);

        // --- Step 1: Extract (抽取 - 基于模式的混合采样) ---
        console.log('[Curator] Step 1: Extracting candidates...');

        // 定义采样配比
        let randomCount = 100;
        let starredCount = 100;

        // Data containers
        let randomSongs: Song[] = [];
        let starredSongs: Song[] = [];

        if (mode === 'familiar') {
            // Strategy: 20 Random + 180 Familiar (Starred + Most Played)
            randomCount = 20;

            const [rando, starred, mostPlayed] = await Promise.all([
                navidromeClient.getRandomSongs(randomCount),
                navidromeClient.getStarred(),
                navidromeClient.getMostPlayed(20)   // Fetch songs from Top 20 frequent albums
            ]);

            randomSongs = rando;

            // Merge & Dedupe Familiar Pool
            const map = new Map<string, Song>();
            mostPlayed.forEach(s => map.set(s.id, s));
            starred.forEach(s => {
                if (!map.has(s.id)) map.set(s.id, s);
            });

            const allFamiliar = Array.from(map.values());
            console.log(`[Curator] Familiar Pool: ${allFamiliar.length} unique songs (Starred + Most Played).`);

            // Slice to 180
            starredSongs = allFamiliar.sort(() => 0.5 - Math.random()).slice(0, 180);

        } else {
            // Default or Fresh
            if (mode === 'fresh') {
                randomCount = 200;
                starredCount = 20;
            }

            const [rando, starred] = await Promise.all([
                navidromeClient.getRandomSongs(randomCount),
                navidromeClient.getStarred(),
            ]);

            randomSongs = rando;
            starredSongs = starred.sort(() => 0.5 - Math.random()).slice(0, starredCount);
        }

        // Merge Pools
        const candidatePool = [...randomSongs, ...starredSongs];

        // 去重 (根据 ID)
        const uniquePoolMap = new Map<string, Song>();
        candidatePool.forEach(s => uniquePoolMap.set(s.id, s));
        const uniqueCandidates = Array.from(uniquePoolMap.values());

        console.log(`[Curator] Pool ready. Total candidates: ${uniqueCandidates.length} (Random: ${randomSongs.length}, Starred: ${starredSongs.length})`);

        // --- Step 2: Transform (AI 筛选与重排) ---
        console.log('[Curator] Step 2: AI Reranking...');

        // 用户画像摘要: 简单的取用户红心歌曲最多的 5 个流派
        const favGenres = this.getTopGenres(starredSongs);

        // 构建上下文说明供 AI 参考 (Default Profile if not provided)
        let userContext: import('../types').UserProfile;

        if (userProfilePrecalced) {
            console.log('[Curator] Using provided User Persona.');
            userContext = userProfilePrecalced;
        } else {
            // Construct a temporary/default profile based on simple stats
            userContext = {
                technical_profile: {
                    summary_tags: favGenres,
                    taste_anchors: [],
                    dimensions: {
                        era_preference: "Unknown",
                        energy_level: "Balanced",
                        vocal_style: "Various"
                    },
                    blacklist_inference: []
                },
                display_card: {
                    title: "Guest User",
                    message: "A balanced mix based on your top genres."
                }
            };
        }

        // 调用 LLM
        const curation = await llmClient.curatePlaylist(scene, userContext, uniqueCandidates);
        console.log(`[Curator] AI selected ${curation.tracks.length} tracks.`);

        // --- Step 3: Load (回写歌单) ---
        console.log('[Curator] Step 3: Creating Playlist...');

        // 防幻觉检查: 确保 AI 返回的 ID 确实存在于我们的候选池中
        const validSongIds = curation.tracks
            .map(t => t.songId)
            .filter(id => uniquePoolMap.has(id));

        if (validSongIds.length === 0) {
            throw new Error("AI returned no valid song IDs from the pool.");
        }

        // 调用 Navidrome API 创建歌单
        // Enforce "NaviMuse" prefix
        let finalPlaylistName = curation.playlistName;
        if (!finalPlaylistName.startsWith("NaviMuse")) {
            finalPlaylistName = `NaviMuse: ${finalPlaylistName}`;
        }

        const playlist = await navidromeClient.createPlaylist(finalPlaylistName, validSongIds);
        console.log(`[Curator] Success! Playlist created: ${playlist.name} (${playlist.songCount} songs)`);

        // Update response to reflect actual name
        curation.playlistName = playlist.name;

        return curation;
    }

    /**
     * 辅助方法: 计算 Top 5 流派
     */
    private getTopGenres(songs: Song[]): string[] {
        const counts: Record<string, number> = {};
        songs.forEach(s => {
            if (s.genre) {
                counts[s.genre] = (counts[s.genre] || 0) + 1;
            }
        });
        // 降序排列并取前5
        return Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([g]) => g);
    }
}

export const curatorService = new CuratorService();
