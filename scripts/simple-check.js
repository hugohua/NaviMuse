
const Database = require('better-sqlite3');
const path = require('path');

// Manually resolve path as per src/db/index.ts logic
const dbPath = path.join(process.cwd(), 'data', 'navimuse.db');
console.log("Opening DB at:", dbPath);

try {
    const db = new Database(dbPath);

    const rowCount = db.prepare('SELECT COUNT(*) as c FROM smart_metadata').get();
    const vecCount = db.prepare('SELECT COUNT(*) as c FROM vec_songs').get();
    const newSchemaCount = db.prepare('SELECT COUNT(*) as c FROM smart_metadata WHERE analysis_json IS NOT NULL').get();

    console.log("--- STATUS ---");
    console.log("Total Metadata Rows:", rowCount.c);
    console.log("Total Vectors:", vecCount.c);
    console.log("New Schema Rows:", newSchemaCount.c);

} catch (e) {
    console.error("DB Error:", e.message);
}
