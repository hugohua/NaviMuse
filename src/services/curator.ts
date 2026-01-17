import { navidromeClient } from './navidrome';
import { recommendationService } from './recommendation/RecommendationService';
import { userProfileService } from './recommendation/UserProfileService';
import { hybridSearchService } from './recommendation/HybridSearchService';
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
    /**
     * 生成用户画像
     * 获取一定数量代表性歌曲（优先红心，其次高频播放）并调用 LLM 分析
     */
    async generateUserProfile(): Promise<import('../types').UserProfile> {
        console.log('[Curator] Delegating Profile Generaton to UserProfileService...');
        // Default to 'admin' for single-user implementation
        const profile = await userProfileService.syncUserProfile('admin');
        // syncUserProfile returns the JSON object directly based on previous update
        return profile as import('../types').UserProfile;
    }

    /**
     * 主策展流程
     * @param scene 用户输入的 prompt (场景/心情/流派)
     * @param mode 探索模式 (default | familiar | fresh)
     * @param userProfilePrecalced 前端传入的预计算用户画像 (可选)
     */
    async curate(scene: string, mode: DiscoveryMode = 'default', userProfilePrecalced?: import('../types').UserProfile): Promise<CuratorResponse> {
        console.log(`[Curator] Starting flow for scene: "${scene}" (Mode: ${mode})`);

        // Map Frontend DiscoveryMode to Hybrid Logic
        // CuratorService acts as a facade/controller here

        // 1. Call Hybrid Search
        // We use 'admin' as distinct userId
        // search() returns CuratorResponse because useAI=true
        console.log('[Curator] Delegating to HybridSearchService...');

        const hybridResult = await hybridSearchService.search(scene, {
            candidateLimit: mode === 'fresh' ? 300 : (mode === 'familiar' ? 100 : 150),
            finalLimit: 20,
            userId: 'admin',
            mode: mode
        });

        // 2. Validate Result
        let result: CuratorResponse;
        if (Array.isArray(hybridResult)) {
            // Fallback case (HybridSearch returned array mostly on error or useAI=false)
            // But we requested useAI=true. If it fell back, it wraps in array.
            console.warn("[Curator] Hybrid Search returned raw list (Fallback). Wrapping...");
            result = {
                scene: scene,
                playlistName: `NaviMuse: ${scene} (Fallback)`,
                description: "AI service busy, showing best matches.",
                tracks: hybridResult.map((r: any) => ({
                    songId: r.id,
                    reason: r.reason || "Vector Match"
                }))
            };
        } else {
            result = hybridResult as CuratorResponse;
        }

        // 3. Create Playlist in Navidrome
        console.log('[Curator] Creating Playlist in Navidrome...');

        // Enforce "NaviMuse" prefix
        let finalPlaylistName = result.playlistName;
        if (!finalPlaylistName.startsWith("NaviMuse")) {
            finalPlaylistName = `NaviMuse: ${finalPlaylistName}`;
        }

        const songIds = result.tracks.map(t => t.songId);

        try {
            const playlist = await navidromeClient.createPlaylist(finalPlaylistName, songIds);
            console.log(`[Curator] Success! Playlist created: ${playlist.name} (${playlist.songCount} songs)`);
            result.playlistName = playlist.name;
        } catch (e: any) {
            console.error("[Curator] Failed to create playlist in Navidrome:", e.message);
            // Don't fail the request, just warn
        }

        return result;
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
