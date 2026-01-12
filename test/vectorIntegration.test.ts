import { describe, it, expect, beforeAll, vi, afterAll } from 'vitest';
import type { Database } from 'better-sqlite3';

// Mock EmbeddingService to avoid API costs and network flakes during tests
// We only want to test the Database Vector Logic here
const mockEmbed = vi.fn();
vi.mock('../src/services/ai/EmbeddingService', () => ({
    EmbeddingService: class {
        async embed(text: string) {
            return mockEmbed(text);
        }
    }
}));

describe('Vector Search Integration (DB)', () => {
    let db: Database;
    let initDB: () => void;
    let metadataRepo: any;

    beforeAll(async () => {
        // Use In-Memory DB for isolation
        process.env.DB_PATH = ':memory:';

        // Dynamic import to enforce new DB connection with env var
        const dbModule = await import('../src/db');
        db = dbModule.db;
        initDB = dbModule.initDB;
        metadataRepo = dbModule.metadataRepo;

        // Initialize Schema (creates tables including vec_songs)
        initDB();
    });

    it('should insert and retrieve vectors correctly', async () => {
        // 1. Mock Embedding (768 dimensions)
        const mockVector = new Array(768).fill(0.1);
        mockEmbed.mockResolvedValue(mockVector);

        // 2. Insert Metadata
        const testId = 'test_song_1';
        metadataRepo.saveBasicInfo({
            navidrome_id: testId,
            title: 'Test Title',
            artist: 'Test Artist',
            album: 'Test Album',
            duration: 180,
            file_path: '/tmp/test.mp3',
            last_updated: new Date().toISOString(),
            hash: 'test_hash'
        });

        // 3. Get Row ID
        const rowId = metadataRepo.getSongRowId(testId);
        expect(rowId).toBeDefined();

        // 4. Save Vector
        metadataRepo.saveVector(rowId!, mockVector);

        // 5. Verify Search
        // Search for same vector, should have distance 0 (or very close)
        const queryVector = new Float32Array(mockVector);

        const results = db.prepare(`
            SELECT song_id as rowid, distance 
            FROM vec_songs 
            WHERE embedding MATCH ? 
            ORDER BY distance 
            LIMIT 5
        `).all(queryVector) as any[];

        expect(results.length).toBeGreaterThan(0);
        const match = results.find(r => r.rowid === rowId);
        expect(match).toBeDefined();
        // Distance should be ~0 for identical vector
        expect(match.distance).toBeLessThan(0.0001);
    });
});
