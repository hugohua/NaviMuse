import { EmbeddingService } from '../ai/EmbeddingService';
import { AIFactory } from '../ai/AIFactory';
import { metadataRepo, SongMetadata } from '../../db';

export interface SearchOptions {
    limit?: number;
    is_instrumental?: boolean; // Filter: true/false/undefined (any)
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
