
import { EmbeddingService } from '../ai/EmbeddingService';
import { AIFactory } from '../ai/AIFactory';
import { metadataRepo, userProfileRepo } from '../../db';

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
        const candidateLimit = options.candidateLimit || 50;
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

                if (profile.tasteVector && profile.tasteVector.length === 768) {

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
                    const blendVector = new Float32Array(768);

                    for (let i = 0; i < 768; i++) {
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
}

export const hybridSearchService = new HybridSearchService();
