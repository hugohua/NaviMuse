import { describe, it, expect, beforeAll, vi } from 'vitest';
import type { Database } from 'better-sqlite3';

// Mock Navidrome API Client to avoid real network requests
vi.mock('../src/services/navidrome', () => ({
    navidromeClient: {
        getAllSongs: vi.fn().mockResolvedValue([
            { id: 'song1', title: 'Song One', artist: 'Artist A', path: '/music/1.mp3' },
            { id: 'song2', title: 'Song Two', artist: 'Artist B', path: '/music/2.mp3' }
        ])
    }
}));

describe('Sync Service Integration', () => {
    let db: Database;
    let initDB: () => void;
    let navidromeSyncService: any;
    let metadataRepo: any;

    beforeAll(async () => {
        // Use In-Memory DB
        process.env.DB_PATH = ':memory:';

        // Dynamic import
        const dbModule = await import('../src/db');
        db = dbModule.db;
        initDB = dbModule.initDB;
        metadataRepo = dbModule.metadataRepo;

        const syncModule = await import('../src/services/navidromeSync');
        navidromeSyncService = syncModule.navidromeSyncService;

        initDB();
    });

    it('should sync songs from mocked Navidrome to local DB', async () => {
        // Run Sync
        const result = await navidromeSyncService.syncFromNavidrome();

        // Verify Result Stats
        expect(result.added).toBe(2);

        // Verify DB Content
        const count = db.prepare('SELECT count(*) as c FROM smart_metadata').get() as { c: number };
        expect(count.c).toBe(2);

        const song1 = metadataRepo.get('song1');
        expect(song1).toBeDefined();
        expect(song1.title).toBe('Song One');
    });
});
