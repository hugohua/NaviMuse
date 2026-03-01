import { EmbeddingService } from '../ai/EmbeddingService';
import { AIFactory } from '../ai/AIFactory';
import { metadataRepo, SongMetadata } from '../../db';

export interface SearchOptions {
    limit?: number;
    is_instrumental?: boolean; // Filter: true/false/undefined (any)
    ai_mode?: boolean; // Toggle: Bypass AI Reranking if false
}

export class SearchService {
    private embeddingService: EmbeddingService;

    constructor() {
        this.embeddingService = new EmbeddingService();
    }

    /**
     * Performs a Hybrid Search:
     * 1. Vector Search (Recall) based on semantic meaning.
     * 2. SQL Filtering (Pre/Post-filter) applied during recall.
     * 3. AI Reranking (Rerank) for final relevance sorting.
     */
    async hybridSearch(query: string, options: SearchOptions = {}): Promise<SongMetadata[]> {
        console.log(`[Search] Query: "${query}", Options:`, options);

        // 1. Embed Query
        const vector = await this.embeddingService.embed(query);

        // 2. Recall & Filter
        // We ask for top 50 (or user limit) candidates from DB
        const candidates = metadataRepo.searchVectors(vector, {
            limit: options.limit || 50,
            is_instrumental: options.is_instrumental
        });

        console.log(`[Search] Recall found ${candidates.length} candidates.`);
        if (candidates.length === 0) return [];

        // 3. Rerank
        // If ai_mode is explicitly false, use hybrid scoring (distance + popularity) instead of AI
        if (options.ai_mode === false) {
            console.log(`[Search] AI Mode is OFF. Applying hybrid sort (distance + popularity).`);

            // Normalize distances to 0-1 range for blending
            const maxDist = Math.max(...candidates.map(c => (c as any).distance || 0), 0.001);

            const scored = candidates.map(c => {
                const normalizedDist = ((c as any).distance || 0) / maxDist; // 0 = closest, 1 = farthest
                const popularity = (c as any).visual_popularity ?? 0;        // 0-1, higher = more popular
                // Lower score = better. Distance matters 70%, popularity 30%.
                const blendedScore = normalizedDist * 0.7 + (1 - popularity) * 0.3;
                return { song: c, blendedScore };
            });

            scored.sort((a, b) => a.blendedScore - b.blendedScore);
            return scored.map(s => s.song);
        }

        // Call LLM to reorder based on query nuance
        const aiService = AIFactory.getService();
        const rankedIds = await aiService.rerankSongs(query, candidates);

        // 4. Reorder candidates based on rankedIds
        const candidateMap = new Map(candidates.map(c => [String(c.navidrome_id), c]));

        const orderedSongs: SongMetadata[] = [];
        // Add ranked songs first
        for (const id of rankedIds) {
            const song = candidateMap.get(id);
            if (song) {
                orderedSongs.push(song);
                candidateMap.delete(id);
            }
        }

        // Append any remaining candidates that weren't in the ranking response (fallback)
        for (const song of candidateMap.values()) {
            orderedSongs.push(song);
        }

        console.log(`[Search] Final result count: ${orderedSongs.length}`);
        return orderedSongs;
    }
}

export const searchService = new SearchService();
