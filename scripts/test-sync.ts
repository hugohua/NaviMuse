import { navidromeSyncService } from '../src/services/navidromeSync';
import { db, initDB } from '../src/db';

async function main() {
    try {
        console.log("=== Starting Manual Sync Test ===");
        initDB();
        const result = await navidromeSyncService.syncFromNavidrome(100);
        console.log("Sync Result:", result);

        const count = db.prepare('SELECT count(*) as c FROM smart_metadata').get() as { c: number };
        console.log(`Total songs in DB: ${count.c}`);

        // Check one entry if exists
        const entry = db.prepare('SELECT * FROM smart_metadata LIMIT 1').get();
        if (entry) {
            console.log("Sample Entry:", entry);
        } else {
            console.log("No entries found.");
        }

    } catch (e) {
        console.error("Sync Test Failed:", e);
    }
}

main();
