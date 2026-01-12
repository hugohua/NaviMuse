import { describe, it, expect, vi, beforeEach } from 'vitest';
import { navidromeClient } from '../src/services/navidrome';
import { metadataRepo } from '../src/db';
import { navidromeSyncService } from '../src/services/navidromeSync';

// Mock navidromeClient
vi.mock('../src/services/navidrome', () => ({
    navidromeClient: {
        getAllSongs: vi.fn()
    }
}));

// Mock DB
vi.mock('../src/db', () => ({
    metadataRepo: {
        getAllIds: vi.fn(),
        saveBasicInfo: vi.fn(),
    },
    db: {
        transaction: (fn: any) => () => fn(), // Pass-through transaction
    }
}));

describe('NavidromeSyncService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should sync new songs correctly', async () => {
        // Arrange
        const mockSongs = [
            { id: '1', title: 'New Song', artist: 'Artist', album: 'Album', duration: 180, path: '/music/1.mp3', created: '2023-01-01' },
        ];
        (navidromeClient.getAllSongs as any).mockResolvedValue(mockSongs);
        (metadataRepo.getAllIds as any).mockReturnValue([]); // No existing songs

        // Act
        const result = await navidromeSyncService.syncFromNavidrome();

        // Assert
        expect(result.added).toBe(1);
        expect(result.updated).toBe(0);
        expect(result.skipped).toBe(0);
        expect(metadataRepo.saveBasicInfo).toHaveBeenCalledWith(expect.objectContaining({
            navidrome_id: '1',
            title: 'New Song',
            file_path: '/music/1.mp3'
        }));
    });

    it('should skip existing songs', async () => {
        // Arrange
        const mockSongs = [
            { id: '1', title: 'Existing Song', artist: 'Artist', album: 'Album', duration: 180, path: '/music/1.mp3', created: '2023-01-01' },
        ];
        (navidromeClient.getAllSongs as any).mockResolvedValue(mockSongs);
        (metadataRepo.getAllIds as any).mockReturnValue([
            { navidrome_id: '1', hash: 'oldhash', last_updated: '2023-01-01' }
        ]);

        // Act
        const result = await navidromeSyncService.syncFromNavidrome();

        // Assert
        expect(result.added).toBe(0);
        expect(result.skipped).toBe(1);
        expect(metadataRepo.saveBasicInfo).not.toHaveBeenCalled();
    });
});
