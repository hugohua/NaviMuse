
import { db, initDB } from '../src/db';
import 'dotenv/config';

initDB();

const RESET_ALL = true; // Set to true to reset EVERYTHING. False to only reset non-migrated.

console.log("=== Resetting Analysis Status ===");

let stmt;
if (RESET_ALL) {
    console.log("Target: ALL songs (Full Regeneration)");
    stmt = db.prepare('UPDATE smart_metadata SET last_analyzed = NULL');
} else {
    // Only reset if not yet migrated to new schema
    console.log("Target: Only songs missing 'analysis_json'");
    stmt = db.prepare('UPDATE smart_metadata SET last_analyzed = NULL WHERE analysis_json IS NULL');
}

const info = stmt.run();
console.log(`Updated ${info.changes} rows.`);
console.log("Next step: Restart the server/worker to begin reprocessing with the Ultra-Precision prompt.");
