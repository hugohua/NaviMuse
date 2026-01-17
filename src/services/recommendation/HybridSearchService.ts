
import { EmbeddingService } from '../ai/EmbeddingService';
import { AIFactory } from '../ai/AIFactory';
import { IAIService } from '../ai/IAIService';
import { metadataRepo, userProfileRepo } from '../../db';
import { userProfileService } from './UserProfileService';
import { config } from '../../config';
import fs from 'fs';
import path from 'path';

export class HybridSearchService {
    private embeddingService: EmbeddingService;

    constructor() {
        this.embeddingService = new EmbeddingService();
    }

    /**
     * 执行混合搜索
     * @param query 用户查询
     * @param options 配置选项
     */
    async search(query: string, options: {
        candidateLimit?: number,
        finalLimit?: number,
        useAI?: boolean,
        userId?: string, // New: Optional User ID for personalization
        mode?: 'default' | 'familiar' | 'fresh' // Add mode
    } = {}) {
        const candidateLimit = options.candidateLimit || 150; // Increased default from 50
        const finalLimit = options.finalLimit || 20;
        const useAI = options.useAI !== false;
        const userId = options.userId;
        const mode = options.mode || 'default'; // Default mode

        console.log(`[HybridSearch] Query: "${query}" (User: ${userId || 'Anonymous'}, Mode: ${mode})`);

        // 1. Vector Retrieval (Rational Stage)
        // Convert query to vector
        let queryVector = await this.embeddingService.embed(query);

        // ... existing code ...
        // I need to refactor the whole method slightly to lift 'profile'.
        // To avoid big rewrite with replace_file_content, I will fetch it again or careful edit.
        // Let's modify the Personalization Logic block to store profile in a wider scope variable.
        let userProfileData: any = null;

        // --- Personalization Logic ---
        if (userId) {
            const profile = userProfileRepo.getProfile(userId);
            if (profile) {
                userProfileData = profile.jsonProfile ? JSON.parse(profile.jsonProfile) : null;

                if (profile.tasteVector && profile.tasteVector.length === config.embedding.dimensions) {

                    // --- Dynamic Alpha Calculation ---
                    let alpha = 0.8;

                    if (mode === 'fresh') {
                        alpha = 1.0; // Ignore taste, pure query
                    } else if (mode === 'familiar') {
                        alpha = 0.4; // Strong taste bias (was 0.3, lets try 0.4)
                    } else {
                        // Default Mode: Heuristic
                        if (query.length < 5) alpha = 0.3;       // Very vague
                        else if (query.length < 15) alpha = 0.6; // Semi-specific
                    }
                    // ---------------------------------

                    console.log(`[HybridSearch] Personalizing... Alpha: ${alpha} (Mode: ${mode})`);

                    // Linear Interpolation: V = alpha * Query + (1-alpha) * Taste
                    const tasteVector = profile.tasteVector;
                    const blendVector = new Float32Array(config.embedding.dimensions);

                    for (let i = 0; i < config.embedding.dimensions; i++) {
                        blendVector[i] = (queryVector[i] * alpha) + (tasteVector[i] * (1 - alpha));
                    }

                    queryVector = Array.from(blendVector); // Convert back to number[] if needed by repo (repo takes number[])
                }
            }
        }
        // -----------------------------

        // Search DB for broad candidates
        const candidates = metadataRepo.searchVectors(queryVector, {
            limit: candidateLimit
        });

        console.log(`[HybridSearch] Vector Search retrieved ${candidates.length} candidates.`);

        // --- Inject Starred Songs (Personalization V2) ---
        if (userId) {
            try {
                // 1. Get Starred Songs with Vectors
                const starredSongs = await userProfileService.getStarredSongsWithVectors(userId);

                if (starredSongs.length > 0) {
                    // 2. Semantic Filter: Calculate similarity with current Query Vector
                    const relevantStarred = starredSongs.map(s => {
                        // Calculate distance (1 - Cosine Similarity) to match sqlite-vec behavior
                        // Note: We use the *blended* queryVector if personalization was active, which matches intent + taste.
                        const sim = this.cosineSimilarity(queryVector, s.vector);
                        return { ...s, distance: 1 - sim, _source: 'starred_injection' };
                    })
                        .filter(s => s.distance < 0.65) // Loose threshold to allow variety (0.65 distance ~ 0.35 similarity)
                        .sort((a, b) => a.distance - b.distance)
                        .slice(0, Math.floor(candidateLimit * 0.25)); // Inject up to 25%

                    console.log(`[HybridSearch] Injected ${relevantStarred.length} relevant starred songs.`);

                    // 3. Merge & Dedup (Mark organic matches as starred too)
                    const existingMap = new Map(candidates.map((c, i) => [c.navidrome_id, i]));

                    for (const s of relevantStarred) {
                        if (existingMap.has(s.navidrome_id)) {
                            // Already in list: Mark as starred (Organic)
                            const idx = existingMap.get(s.navidrome_id)!;
                            (candidates[idx] as any)._source = 'starred_organic';
                            // Optional: Bump score?
                        } else {
                            // Not in list: Inject at top
                            candidates.unshift(s);
                            // Update map in case of duplicates within injected list (unlikely due to set logic in service but good hygiene)
                            existingMap.set(s.navidrome_id, 0);
                        }
                    }
                }
            } catch (e) {
                console.error("[HybridSearch] Failed to inject starred songs:", e);
            }
        }
        // -------------------------------------------------

        // --- Archive candidates for analysis ---
        this.archiveCurationPayload(query, candidates, options.mode || 'default', userId || 'anonymous');
        // ---------------------------------------

        if (candidates.length === 0) {
            return [];
        }

        // 2. LLM Curation (Emotional Stage)
        if (useAI) {
            console.log(`[HybridSearch] Sending to AI for curation (Target: ~${finalLimit} songs)...`);
            const aiService = AIFactory.getService();

            // Call the specialized curation method
            // Note: We need to implement curatePlaylist in IAIService/GeminiService
            // For now, let's assume it exists or use rerankSongs if distinct

            // Casting to any or updating interface in next step
            let curated;
            try {
                // Pass userProfileData to curation
                curated = await (aiService as any).curatePlaylist(query, candidates, finalLimit, userProfileData);
            } catch (e: any) {
                console.error("[HybridSearch] Critical Error calling AI:", e);
                return [];
            }

            if (curated && curated.tracks) {
                console.log(`[HybridSearch] AI selected ${curated.tracks.length} songs.`);
                // --- Generate Automated Markdown Report ---
                this.generateMarkdownReport(query, curated, options.mode || 'default', aiService);
                // ------------------------------------------
                return curated;
            } else {
                console.warn(`[HybridSearch] AI returned invalid format.`);
                return [];
            }
        } else {
            // Fallback: Just return vector results (Top N)
            return candidates.slice(0, finalLimit).map(c => ({
                id: c.navidrome_id,
                title: c.title,
                artist: c.artist,
                reason: `Vector Similarity: ${c.distance?.toFixed(4)}`
            }));
        }
    }

    /**
     * 将发送给 AI 的数据归档到本地文件，方便分析不同 LLM 的表现
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
                    source: c._source || 'vector_search' // Capture Source
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
        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-9); // 1e-9 to prevent div by zero
    }
}

export const hybridSearchService = new HybridSearchService();
