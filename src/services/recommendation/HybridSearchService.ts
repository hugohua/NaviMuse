
import { EmbeddingService } from '../ai/EmbeddingService';
import { AIFactory } from '../ai/AIFactory';
import { IAIService } from '../ai/IAIService';
import { metadataRepo, userProfileRepo, SongMetadata } from '../../db';
import { userProfileService } from './UserProfileService';
import { config } from '../../config';
import fs from 'fs';
import path from 'path';

/**
 * 多路召回参数配置 (按 Mode 差异化)
 */
interface RecallConfig {
    vectorLimit: number;
    attributeLimit: number;
    randomLimit: number;
    starredInjectionRatio: number; // 红心注入上限比例
    mostPlayedInjectionRatio: number; // 高频播放注入上限比例
    mmrLambda: number; // 0=纯多样性, 1=纯相关性
    mmrTargetCount: number; // MMR 筛出的目标数量
    temperature: number; // LLM 策展 temperature
}

const MODE_CONFIGS: Record<string, RecallConfig> = {
    default: { vectorLimit: 80, attributeLimit: 30, randomLimit: 20, starredInjectionRatio: 0.10, mostPlayedInjectionRatio: 0.10, mmrLambda: 0.5, mmrTargetCount: 100, temperature: 1 },
    familiar: { vectorLimit: 80, attributeLimit: 20, randomLimit: 0, starredInjectionRatio: 0.20, mostPlayedInjectionRatio: 0.15, mmrLambda: 0.7, mmrTargetCount: 100, temperature: 1 },
    fresh: { vectorLimit: 100, attributeLimit: 40, randomLimit: 40, starredInjectionRatio: 0.00, mostPlayedInjectionRatio: 0.00, mmrLambda: 0.3, mmrTargetCount: 100, temperature: 1 },
};

export class HybridSearchService {
    private embeddingService: EmbeddingService;

    constructor() {
        this.embeddingService = new EmbeddingService();
    }

    /**
     * 执行混合搜索 (多路召回 + MMR + LLM 策展)
     */
    async search(query: string, options: {
        candidateLimit?: number,
        finalLimit?: number,
        useAI?: boolean,
        userId?: string,
        mode?: 'default' | 'familiar' | 'fresh'
    } = {}) {
        const finalLimit = options.finalLimit || 20;
        const useAI = options.useAI !== false;
        const userId = options.userId;
        const mode = options.mode || 'default';
        const modeConfig = MODE_CONFIGS[mode] || MODE_CONFIGS.default;

        console.log(`[HybridSearch] Query: "${query}" (User: ${userId || 'Anonymous'}, Mode: ${mode})`);

        // ============ Stage -1: Query 预处理 ============
        const normalizedQuery = this.normalizeQuery(query);
        if (normalizedQuery !== query) {
            console.log(`[HybridSearch] Normalized query: "${normalizedQuery}"`);
        }

        // ============ Stage 0: 准备 Query 向量与个性化 ============
        // 用标准化后的 Query 生成 Embedding（语义更清晰）
        let queryVector = await this.embeddingService.embed(normalizedQuery);
        let userProfileData: any = null;

        if (userId) {
            const profile = userProfileRepo.getProfile(userId);
            if (profile) {
                userProfileData = profile.jsonProfile ? JSON.parse(profile.jsonProfile) : null;

                if (profile.tasteVector && profile.tasteVector.length === config.embedding.dimensions) {
                    let alpha = 0.8;
                    if (mode === 'fresh') alpha = 1.0;
                    else if (mode === 'familiar') {
                        alpha = 0.4;
                    } else {
                        if (query.length < 5) alpha = 0.3;
                        else if (query.length < 15) alpha = 0.6;
                    }

                    console.log(`[HybridSearch] Personalizing... Alpha: ${alpha} (Mode: ${mode})`);

                    const tasteVector = profile.tasteVector;
                    const blendVector = new Float32Array(config.embedding.dimensions);
                    for (let i = 0; i < config.embedding.dimensions; i++) {
                        blendVector[i] = (queryVector[i] * alpha) + (tasteVector[i] * (1 - alpha));
                    }
                    queryVector = Array.from(blendVector);
                }
            }
        }

        // ============ Stage 1: 多路互斥召回 ============
        console.log(`[HybridSearch] Stage 1: Multi-channel recall (vector=${modeConfig.vectorLimit}, attr=${modeConfig.attributeLimit}, random=${modeConfig.randomLimit})`);

        // 通道 1: 向量召回
        const vectorCandidates = metadataRepo.searchVectors(queryVector, {
            limit: modeConfig.vectorLimit
        });
        const collectedIds = new Set(vectorCandidates.map(c => c.navidrome_id));
        console.log(`[HybridSearch]   Vector channel: ${vectorCandidates.length} songs`);

        // 通道 2: 属性召回 (排除向量已召回 ID)
        let attributeCandidates: SongMetadata[] = [];
        if (modeConfig.attributeLimit > 0) {
            // 使用清洗后的 Query 解析属性，避免杂乱符号干扰关键词匹配
            const filters = this.parseQueryAttributes(normalizedQuery);
            if (Object.keys(filters).length > 0) {
                attributeCandidates = metadataRepo.searchByAttributes(
                    filters,
                    modeConfig.attributeLimit,
                    Array.from(collectedIds)
                );
                attributeCandidates.forEach(c => collectedIds.add(c.navidrome_id));
                console.log(`[HybridSearch]   Attribute channel: ${attributeCandidates.length} songs (filters: ${JSON.stringify(filters)})`);
            } else {
                console.log(`[HybridSearch]   Attribute channel: skipped (no parseable filters)`);
            }
        }

        // 通道 3: 随机探索 (排除前两通道 ID)
        let randomCandidates: SongMetadata[] = [];
        if (modeConfig.randomLimit > 0) {
            randomCandidates = metadataRepo.getRandomSongs(
                modeConfig.randomLimit,
                Array.from(collectedIds)
            );
            randomCandidates.forEach(c => collectedIds.add(c.navidrome_id));
            console.log(`[HybridSearch]   Random channel: ${randomCandidates.length} songs`);
        }

        // 合并所有通道
        const allCandidates: any[] = [
            ...vectorCandidates,
            ...attributeCandidates.map(c => ({ ...c, distance: 0.5, _source: 'attribute_recall' })),
            ...randomCandidates.map(c => ({ ...c, distance: 0.8, _source: 'random_exploration' }))
        ];

        console.log(`[HybridSearch] Stage 1 total: ${allCandidates.length} unique candidates`);

        // ============ 红心歌曲注入 (限制比例) ============
        if (userId && modeConfig.starredInjectionRatio > 0) {
            try {
                const starredSongs = await userProfileService.getStarredSongsWithVectors(userId);
                if (starredSongs.length > 0) {
                    const maxInject = Math.floor(allCandidates.length * modeConfig.starredInjectionRatio);
                    const relevantStarred = starredSongs.map(s => {
                        const sim = this.cosineSimilarity(queryVector, s.vector);
                        return { ...s, distance: 1 - sim, _source: 'starred_injection' };
                    })
                        .filter(s => s.distance < 0.65)
                        .sort((a, b) => a.distance - b.distance)
                        .slice(0, maxInject);

                    console.log(`[HybridSearch] Starred injection: ${relevantStarred.length}/${maxInject} max (ratio: ${modeConfig.starredInjectionRatio})`);

                    const existingMap = new Map(allCandidates.map((c, i) => [c.navidrome_id, i]));
                    for (const s of relevantStarred) {
                        if (existingMap.has(s.navidrome_id)) {
                            const idx = existingMap.get(s.navidrome_id)!;
                            (allCandidates[idx] as any)._source = 'starred_organic';
                        } else {
                            allCandidates.push(s);
                        }
                    }
                }
            } catch (e) {
                console.error("[HybridSearch] Failed to inject starred songs:", e);
            }
        }

        // ============ 高频播放歌曲注入 (类似红心注入) ============
        if (userId && modeConfig.mostPlayedInjectionRatio > 0) {
            try {
                const mostPlayedSongs = await userProfileService.getMostPlayedWithVectors();
                if (mostPlayedSongs.length > 0) {
                    const maxInject = Math.floor(allCandidates.length * modeConfig.mostPlayedInjectionRatio);
                    const existingIds = new Set(allCandidates.map(c => c.navidrome_id));

                    // 过滤掉已存在的，计算相关性，取 Top N
                    const relevantMostPlayed = mostPlayedSongs
                        .filter(s => !existingIds.has(s.navidrome_id)) // 去重
                        .map(s => {
                            const sim = this.cosineSimilarity(queryVector, s.vector);
                            return { ...s, distance: 1 - sim, _source: 'most_played_injection' };
                        })
                        .filter(s => s.distance < 0.70) // 比红心通道宽松一些 (0.70 vs 0.65)
                        .sort((a, b) => a.distance - b.distance)
                        .slice(0, maxInject);

                    console.log(`[HybridSearch] Most-played injection: ${relevantMostPlayed.length}/${maxInject} max (ratio: ${modeConfig.mostPlayedInjectionRatio})`);

                    for (const s of relevantMostPlayed) {
                        allCandidates.push(s);
                    }
                }
            } catch (e) {
                console.error("[HybridSearch] Failed to inject most-played songs:", e);
            }
        }

        // [New Phase] Stage 1.8: User Profile Blacklist Interception
        let filteredCandidates = allCandidates;
        const tp = userProfileData?.technical_profile;
        if (tp && tp.blacklist_inference && tp.blacklist_inference.length > 0) {
            console.log(`[HybridSearch] Stage 1.8: Applying Blacklist Interception [${tp.blacklist_inference.join(', ')}]`);
            const beforeCount = filteredCandidates.length;
            filteredCandidates = this.applyBlacklistFilter(filteredCandidates, tp.blacklist_inference);
            console.log(`[HybridSearch] Stage 1.8: Interception removed ${beforeCount - filteredCandidates.length} songs.`);
        }

        // ============ Stage 2: MMR 多样性预筛 ============
        let candidatesForLLM = filteredCandidates;
        if (filteredCandidates.length > modeConfig.mmrTargetCount) {
            console.log(`[HybridSearch] Stage 2: MMR rerank (${filteredCandidates.length} → ${modeConfig.mmrTargetCount}, λ=${modeConfig.mmrLambda})`);
            candidatesForLLM = this.mmrRerank(filteredCandidates, queryVector, modeConfig.mmrTargetCount, modeConfig.mmrLambda);
        } else {
            console.log(`[HybridSearch] Stage 2: Skipped (${filteredCandidates.length} <= ${modeConfig.mmrTargetCount})`);
        }

        // Archive
        this.archiveCurationPayload(normalizedQuery, candidatesForLLM, mode, userId || 'anonymous');

        if (candidatesForLLM.length === 0) return [];

        // ============ Stage 3: LLM 策展 ============
        if (useAI) {
            console.log(`[HybridSearch] Stage 3: LLM curation (${candidatesForLLM.length} candidates → ~${finalLimit} songs, temp=${modeConfig.temperature})`);
            const aiService = AIFactory.getService();

            let curated;
            try {
                curated = await (aiService as any).curatePlaylist(normalizedQuery, candidatesForLLM, finalLimit, userProfileData, {
                    temperature: modeConfig.temperature
                });
            } catch (e: any) {
                console.error("[HybridSearch] Critical Error calling AI:", e);
                return [];
            }

            if (curated && curated.tracks) {
                console.log(`[HybridSearch] AI selected ${curated.tracks.length} songs.`);
                this.generateMarkdownReport(normalizedQuery, curated, mode, aiService);
                return curated;
            } else {
                console.warn(`[HybridSearch] AI returned invalid format.`);
                return [];
            }
        } else {
            return candidatesForLLM.slice(0, finalLimit).map(c => ({
                id: c.navidrome_id,
                title: c.title,
                artist: c.artist,
                reason: `Vector Similarity: ${c.distance?.toFixed(4)}`
            }));
        }
    }

    // ============ 辅助方法 ============

    /**
     * 预处理 Query：剥离 Vibe Tag 带来的冗余信息 (如 "(Mid)"、"⚡"、数字统计等)
     * 让 Query 更纯净，利于 Embedding 和 LLM 处理
     */
    private normalizeQuery(query: string): string {
        if (!query) return query;

        let q = query;

        // 1. 移除 emoji
        // 使用常见的 emoji 正则剔除
        q = q.replace(/[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|\u2580-\u27BF|\uD83E[\uDD10-\uDDFF]/g, '');

        // 2. 移除括号及括号内的内容 (如 "(Mid)", "(14853)")
        q = q.replace(/\s*\([^)]+\)\s*/g, ' ');

        // 3. 移除特殊符号，但保留常见文字和标点
        q = q.replace(/[#*&^%$@!~`+=\[\]{}<>/\\]/g, ' ');

        // 4. 将多余的空格、逗号、顿号等替换为单个空格
        q = q.replace(/[，、。；_|\s]+/g, ' ');

        return q.trim();
    }

    /**
     * 从自然语言 Query 中提取结构化属性过滤条件 (基于关键词匹配，不依赖 LLM)
     */
    private parseQueryAttributes(query: string): Record<string, any> {
        const filters: Record<string, any> = {};
        const q = query.toLowerCase();

        // 能量级别
        if (/(?:轻柔|安静|平静|舒缓|催眠|放松|quiet|calm|relax|gentle|soft)/i.test(q)) {
            filters.energy_range = [1, 4];
        } else if (/(?:嗨|炸|燃|high.?energy|explosive|intense|激烈|澎湃)/i.test(q)) {
            filters.energy_range = [7, 10];
        } else if (/(?:中等|moderate|适中)/i.test(q)) {
            filters.energy_range = [4, 7];
        }

        // 律动
        if (/(?:慢|静止|ambient|环境|static)/i.test(q)) filters.tempo_vibe = 'Static';
        else if (/(?:漂浮|飘|drifting|chill)/i.test(q)) filters.tempo_vibe = 'Drifting';
        else if (/(?:快|driving|推进|节奏感)/i.test(q)) filters.tempo_vibe = 'Driving';
        else if (/(?:爆发|爆裂|explosive)/i.test(q)) filters.tempo_vibe = 'Explosive';

        // 音色
        if (/(?:电子|electronic|synth|合成)/i.test(q)) filters.timbre_texture = 'Electronic';
        else if (/(?:原声|acoustic|organic|木吉他|钢琴)/i.test(q)) filters.timbre_texture = 'Organic';
        else if (/(?:金属|metallic|metal)/i.test(q)) filters.timbre_texture = 'Metallic';
        else if (/(?:复古|vintage|grainy|颗粒)/i.test(q)) filters.timbre_texture = 'Grainy';

        // 语言
        if (/(?:中文|国语|华语|cn)/i.test(q)) filters.language = 'CN';
        else if (/(?:英文|英语|english|en)/i.test(q)) filters.language = 'EN';
        else if (/(?:日文|日语|日本|jp|japanese)/i.test(q)) filters.language = 'JP';
        else if (/(?:韩文|韩语|韩国|kr|korean)/i.test(q)) filters.language = 'KR';
        else if (/(?:纯音乐|instrumental)/i.test(q)) filters.language = 'Instrumental';

        return filters;
    }

    /**
     * MMR (Maximal Marginal Relevance) 多样性重排
     * 每次选择一首与 Query 最相关但与已选集合最不同的歌曲
     * 使用结构化标签重叠度作为歌曲间相似度的代理（避免 N² 级向量 IO）
     */
    private mmrRerank(
        candidates: any[],
        queryVector: number[],
        targetCount: number,
        lambda: number = 0.5
    ): any[] {
        if (candidates.length <= targetCount) return candidates;

        // 预计算每首候选与 Query 的相似度 (基于 distance 字段)
        const querySims = candidates.map(c => {
            const dist = c.distance ?? 0.5;
            return 1 - Math.min(dist, 1); // similarity: 0-1
        });

        // 为每首歌生成标签指纹，用于计算歌曲间相似度
        const fingerprints = candidates.map(c => ({
            artist: (c.artist || '').toLowerCase(),
            mood: (c.mood || '').toLowerCase(),
            tempo_vibe: (c.tempo_vibe || ''),
            timbre_texture: (c.timbre_texture || ''),
            spectrum: (c.spectrum || ''),
            energy: c.energy_level ?? 5,
        }));

        const selected: number[] = [];
        const remaining = new Set(candidates.map((_, i) => i));

        // 选第一首：纯相关性最高的
        let bestFirst = 0;
        let bestFirstSim = -1;
        for (const idx of remaining) {
            if (querySims[idx] > bestFirstSim) {
                bestFirstSim = querySims[idx];
                bestFirst = idx;
            }
        }
        selected.push(bestFirst);
        remaining.delete(bestFirst);

        // 迭代选择
        while (selected.length < targetCount && remaining.size > 0) {
            let bestIdx = -1;
            let bestScore = -Infinity;

            for (const idx of remaining) {
                const relevance = querySims[idx];

                // 计算与已选集合中最相似的歌曲的标签重叠度
                let maxSimToSelected = 0;
                const fpA = fingerprints[idx];
                for (const selIdx of selected) {
                    const fpB = fingerprints[selIdx];
                    let overlap = 0;
                    let total = 5; // 5 个可比较维度

                    // 同 artist 视为高度重叠
                    if (fpA.artist && fpA.artist === fpB.artist) overlap += 1.5; // 额外权重
                    // 结构化标签精确匹配
                    if (fpA.tempo_vibe && fpA.tempo_vibe === fpB.tempo_vibe) overlap += 1;
                    if (fpA.timbre_texture && fpA.timbre_texture === fpB.timbre_texture) overlap += 1;
                    if (fpA.spectrum && fpA.spectrum === fpB.spectrum) overlap += 1;
                    // 能量接近度 (差值 ≤ 1 视为相似)
                    if (Math.abs(fpA.energy - fpB.energy) <= 1) overlap += 1;

                    const sim = overlap / (total + 1.5); // 归一化到 0-1
                    maxSimToSelected = Math.max(maxSimToSelected, sim);
                }

                const mmrScore = lambda * relevance - (1 - lambda) * maxSimToSelected;
                if (mmrScore > bestScore) {
                    bestScore = mmrScore;
                    bestIdx = idx;
                }
            }

            if (bestIdx >= 0) {
                selected.push(bestIdx);
                remaining.delete(bestIdx);
            } else {
                break;
            }
        }

        return selected.map(idx => candidates[idx]);
    }

    /**
     * 将发送给 AI 的数据归档到本地文件
     */
    private archiveCurationPayload(query: string, candidates: any[], mode: string, userId: string) {
        try {
            const dir = path.join(process.cwd(), 'data/curation_payloads');
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const fileName = `${timestamp}_${mode}_${query.substring(0, 10)}.json`;
            const filePath = path.join(dir, fileName);

            const payload = {
                timestamp: new Date().toISOString(),
                query,
                mode,
                userId,
                candidateCount: candidates.length,
                candidates: candidates.map(c => ({
                    id: c.navidrome_id,
                    title: c.title,
                    artist: c.artist,
                    genre: c.genre,
                    mood: c.mood,
                    tags: c.tags,
                    distance: c.distance,
                    source: c._source || 'vector_search'
                }))
            };

            fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
            console.log(`[HybridSearch] Curation payload archived to: ${fileName}`);
        } catch (e) {
            console.error("[HybridSearch] Failed to archive curation payload:", e);
        }
    }

    /**
     * 生成策展分析报告 (Markdown)
     */
    private generateMarkdownReport(query: string, result: any, mode: string, aiService: IAIService) {
        try {
            const prompts = aiService.getLastPrompts?.() || { system: 'N/A', user: 'N/A' };

            const timestamp = new Date().toISOString().replace(/:/g, '-');
            const fileName = `report_${timestamp}_${mode}_${query.substring(0, 10)}.md`;
            const filePath = path.join(process.cwd(), 'data/curation_payloads', fileName);

            const md = `# 策展分析报告: ${query}

- **时间**: ${new Date().toLocaleString()}
- **模式**: ${mode}
- **状态**: Success

---

## 1. System Prompt (系统提示词)

\`\`\`markdown
${prompts.system}
\`\`\`

---

## 2. User Prompt (包含候选歌曲的完整上下文)

\`\`\`markdown
${prompts.user}
\`\`\`

---

## 3. Result (AI 最终策展结果)

\`\`\`json
${JSON.stringify(result, null, 2)}
\`\`\`
`;

            fs.writeFileSync(filePath, md, 'utf-8');
            console.log(`[HybridSearch] Automated Markdown report generated: ${fileName}`);
        } catch (e) {
            console.error("[HybridSearch] Failed to generate markdown report:", e);
        }
    }

    /**
     * Helper: Cosine Similarity
     */
    private cosineSimilarity(vecA: number[], vecB: number[]): number {
        if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;
        for (let i = 0; i < vecA.length; i++) {
            dotProduct += vecA[i] * vecB[i];
            normA += vecA[i] * vecA[i];
            normB += vecB[i] * vecB[i];
        }
        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-9);
    }
    /**
     * 根据用户画像黑名单，强行过滤掉候选池中的歌曲
     */
    private applyBlacklistFilter(candidates: any[], blacklist: string[]): any[] {
        if (!blacklist || blacklist.length === 0) return candidates;

        const lowerBlacklist = blacklist.map(b => b.toLowerCase());

        return candidates.filter(song => {
            // 将歌曲的核心元数据拍扁成字符串进行盲切匹配
            const searchPool = [
                song.title,
                song.artist,
                song.genre,
                song.mood,
                song.timbre_texture,
                typeof song.tags === 'string' ? song.tags : (Array.isArray(song.tags) ? song.tags.join(' ') : '')
            ].join(' ').toLowerCase();

            // 如果该歌触发了任意一个黑名单词，剔除
            for (const bWord of lowerBlacklist) {
                if (searchPool.includes(bWord)) {
                    return false;
                }
            }
            return true;
        });
    }
}

export const hybridSearchService = new HybridSearchService();
