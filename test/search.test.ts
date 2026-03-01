import { describe, it, expect, beforeAll, vi } from 'vitest';
import type { Database } from 'better-sqlite3';

// Mock EmbeddingService
const mockEmbed = vi.fn();
vi.mock('../src/services/ai/EmbeddingService', () => ({
    EmbeddingService: class {
        async embed(text: string) {
            return mockEmbed(text);
        }
    }
}));

// Mock AIFactory and GeminiService
const mockRerank = vi.fn();
vi.mock('../src/services/ai/AIFactory', () => ({
    AIFactory: {
        getService: () => ({
            rerankSongs: mockRerank
        })
    }
}));

describe('Hybrid Search Integration', () => {
    let db: Database;
    let initDB: () => void;
    let metadataRepo: any;
    let searchService: any;

    beforeAll(async () => {
        process.env.DB_PATH = ':memory:';

        // Dynamic imports to pick up env var
        const dbModule = await import('../src/db');
        db = dbModule.db;
        initDB = dbModule.initDB;
        metadataRepo = dbModule.metadataRepo;

        initDB();

        // Populate Test Data
        // Song 1: Happy Pop (Instrumental)
        metadataRepo.saveBasicInfo({
            navidrome_id: '1', title: 'Happy Song', artist: 'Pop Star', album: 'Album A', duration: 100, file_path: '/1.mp3',
            is_instrumental: 1, mood: 'Happy', description: 'Upbeat piano',
            last_updated: new Date().toISOString(), hash: 'hash1'
        });
        metadataRepo.updateAnalysis('1', { description: 'Upbeat piano', tags: ['happy'], mood: 'Happy', is_instrumental: true });
        metadataRepo.saveVector(1, new Array(1024).fill(0.1));

        // Song 2: Sad Rock (Vocal)
        metadataRepo.saveBasicInfo({
            navidrome_id: '2', title: 'Sad Song', artist: 'Rock Star', album: 'Album B', duration: 200, file_path: '/2.mp3',
            is_instrumental: 0, mood: 'Sad', description: 'Melancholic guitar',
            last_updated: new Date().toISOString(), hash: 'hash2'
        });
        metadataRepo.updateAnalysis('2', { description: 'Melancholic guitar', tags: ['sad'], mood: 'Sad', is_instrumental: false });
        metadataRepo.saveVector(2, new Array(1024).fill(0.9)); // Different vector

        const searchModule = await import('../src/services/search/SearchService');
        searchService = searchModule.searchService;
    });

    it('should recall and filter correctly', async () => {
        // Query clearly matches Song 2 (closer to 0.9)
        mockEmbed.mockResolvedValue(new Array(1024).fill(0.9));

        // Mock rerank to just return IDs as is for this test
        mockRerank.mockResolvedValue(['2', '1']);

        // Case 1: Search for "Sad" (should match Song 2)
        let results = await searchService.hybridSearch("Sad music");
        expect(results.length).toBe(2);
        expect(results[0].title).toBe('Sad Song');

        // Case 2: Filter Instrumental
        results = await searchService.hybridSearch("Happy music", { is_instrumental: true });
        expect(results.length).toBe(1);
        expect(results[0].title).toBe('Happy Song');
    });

    it('should rerank results via AI by default or when ai_mode is true', async () => {
        mockEmbed.mockResolvedValue(new Array(1024).fill(0.1));

        // Force Rerank to reverse the order (promote Song 2 over Song 1 even if Song 1 is closer)
        // Note: In our mock vector setup, Song 1 (0.1) is closer to query (0.1).
        // Let's assume AI thinks Song 2 is better for some reason.
        mockRerank.mockResolvedValue(['2', '1']);

        // Test with default ai_mode (undefined)
        const resultsDefault = await searchService.hybridSearch("Test Query");
        expect(resultsDefault[0].navidrome_id).toBe('2');
        expect(resultsDefault[1].navidrome_id).toBe('1');
        expect(mockRerank).toHaveBeenCalled();

        mockRerank.mockClear();

        // Test with explicit ai_mode: true
        const resultsTrue = await searchService.hybridSearch("Test Query", { ai_mode: true });
        expect(resultsTrue[0].navidrome_id).toBe('2');
        expect(resultsTrue[1].navidrome_id).toBe('1');
        expect(mockRerank).toHaveBeenCalled();
    });

    it('should bypass AI rerank when ai_mode is false', async () => {
        mockEmbed.mockResolvedValue(new Array(1024).fill(0.1));
        mockRerank.mockClear();

        // With ai_mode false, it should return the raw recall from the DB.
        // Assuming the DB returns them in some order (often distance based, but here we just check it doesn't call rerank).
        const results = await searchService.hybridSearch("Test Query", { ai_mode: false });

        // Assert that rerank was never called
        expect(mockRerank).not.toHaveBeenCalled();

        // Assert we still got results back
        expect(results.length).toBeGreaterThan(0);
    });
});
