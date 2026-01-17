
import Database from 'better-sqlite3';
import path from 'path';


import * as sqliteVec from 'sqlite-vec';

const DB_PATH = process.env.DB_PATH || 'data/navimuse.db';
const db = new Database(DB_PATH);
sqliteVec.load(db);


function main() {
    console.log('🔧 Fixing Embedding Status Discrepancies...');

    // 1. 找出有向量但状态不对的歌曲
    // 逻辑：在 vec_songs 里有记录，但在 smart_metadata 里 embedding_status != 'COMPLETED'
    const query = `
        SELECT sm.navidrome_id 
        FROM smart_metadata sm
        JOIN vec_songs vs ON sm.id = vs.song_id 
        WHERE sm.embedding_status IS NOT 'COMPLETED' OR sm.embedding_status IS NULL
    `;

    // 注意：这里假设 sm.id 与 vs.song_id 是 join key。
    // 但是 vec_songs 表通常使用 rowid 或 integer id。
    // 让我们检查一下 schema。
    // smart_metadata 在 sqlite 中没有显式的 integer primary key 除非用 rowid。
    // vec_songs 的 schema 通常是 (song_id INTEGER, embedding BLOB), 其中 song_id 对应 smart_metadata 的 rowid。

    // 修正查询逻辑使用 rowid
    const fixStmt = db.prepare(`
        UPDATE smart_metadata 
        SET embedding_status = 'COMPLETED'
        WHERE rowid IN (
            SELECT song_id FROM vec_songs
        ) AND (embedding_status != 'COMPLETED' OR embedding_status IS NULL)
    `);

    const result = fixStmt.run();
    console.log(`✅ Fixed ${result.changes} records.`);
    console.log('   (Marked as COMPLETED because vector data exists)');
}

main();
