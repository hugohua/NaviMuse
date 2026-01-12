import { navidromeClient } from './navidrome';
import { metadataRepo, SongMetadata } from '../db';

export class NavidromeSyncService {
    /**
     * Syncs songs from Navidrome to local SQLite.
     * Logic:
     * 1. Fetch all songs from Navidrome.
     * 2. Compare with local DB.
     * 3. Insert missing songs as 'pending' (last_analyzed = null).
     * 4. Update existing songs if changed (updated_at mismatch) and mark as pending.
     */
    async syncFromNavidrome(limit?: number) {
        console.log('[Sync] Starting Navidrome sync...');
        const startTime = Date.now();

        // 1. Fetch all songs (remote)
        const allSongs = await navidromeClient.getAllSongs((curr, total) => {
            if (curr % 500 === 0 || curr === total) {
                console.log(`[Sync] Fetched ${curr}/${total} songs...`);
            }
        }, limit);
        console.log(`[Sync] keys fetched: ${allSongs.length}`);

        // 2. Fetch local state
        // We get basic info to compare.
        const localRecords = metadataRepo.getAllIds();
        const localMap = new Map<string, { hash: string, last_updated: string }>();
        localRecords.forEach(r => {
            localMap.set(r.navidrome_id, { hash: r.hash, last_updated: r.last_updated });
        });

        let added = 0;
        let updated = 0;
        let skipped = 0;

        db.transaction(() => {
            for (const song of allSongs) {
                const local = localMap.get(song.id);

                // Determine if we need to update/insert
                // Since we don't have a reliable 'navidrome updated_at' in the standard Song type yet,
                // we'll rely on Missing ID check primarily.
                // If we want to support 'updated_at' check, we would need to extend the Song type or assume 'created' is updated (unlikely).
                // Or if the user updates the file, Navidrome might change the ID or keep it.
                // For now, we assume ID persistence.

                // We construct the metadata object
                const now = new Date().toISOString();

                // Attempt to detect if we should treat it as 'new' content
                // If local is missing -> Insert
                if (!local) {
                    const meta: SongMetadata = {
                        navidrome_id: song.id,
                        title: song.title,
                        artist: song.artist,
                        album: song.album,
                        duration: song.duration,
                        file_path: song.path || '',
                        is_instrumental: 0,
                        last_updated: now,
                        last_analyzed: undefined, // Pending analysis
                        hash: null, // hash not available from API checking
                    };
                    metadataRepo.saveBasicInfo(meta);
                    added++;
                } else {
                    // Check for updates?
                    // If we had a remote modification time, we would compare song.updated vs local.last_updated
                    // Currently we skip unless we implement a hash check or similar.
                    // Implementation note: If we want to force refresh, we could.
                    skipped++;
                }
            }
        })();

        console.log(`[Sync] Completed in ${((Date.now() - startTime) / 1000).toFixed(2)}s. Added: ${added}, Updated: ${updated}, Skipped: ${skipped}`);
        return { added, updated, skipped };
    }
}

// Helper to run transaction if needed, but better-sqlite3 handles it.
// We need to import 'db' to use transaction.
import { db } from '../db';

export const navidromeSyncService = new NavidromeSyncService();
