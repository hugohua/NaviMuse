
/**
 * 向量状态同步实用工具
 * 
 * 功能：
 * 1. 检查 smart_metadata 表与 vec_songs 表的对应关系
 * 2. 同步 embedding_status 字段，确保数据库状态反映真实的向量化情况
 * 
 * 用法：
 * npx ts-node --project tsconfig.server.json scripts/sync-embedding-status.ts
 */
import { db } from '../src/db';
import { config } from '../src/config';

console.log('[Sync] Starting Embedding Status Synchronization...');
console.log(`[Sync] Configured Dimension: ${config.embedding.dimensions}`);

// 1. Get all song IDs that have valid vectors in vec_songs
// We verify dimension by checking the length of the blob essentially, 
// but sqlite-vec stores float32 array. Size in bytes should be dim * 4.
const expectedSize = config.embedding.dimensions * 4;

console.log('[Sync] Fetching vector stats (Reading all IDs first)...');

// Iterate over vec_songs to check validity and update smart_metadata
// Use .all() to load into memory to avoid SQLITE_BUSY when writing later
const allRows = db.prepare('SELECT song_id, length(embedding) as len FROM vec_songs').all() as { song_id: number, len: number }[];

let validCount = 0;
let invalidCount = 0;
let updatedCount = 0;

const batchSize = 1000;
const allValidIds: number[] = [];

// Filter valid IDs
for (const r of allRows) {
    if (r.len === expectedSize) {
        allValidIds.push(r.song_id);
        validCount++;
    } else {
        invalidCount++;
    }
}

console.log(`[Sync] Found ${validCount} valid vectors. Starting batch updates...`);

// Batch Update
for (let i = 0; i < allValidIds.length; i += batchSize) {
    const chunk = allValidIds.slice(i, i + batchSize);
    const placeholders = chunk.map(() => '?').join(',');

    // We update smart_metadata where rowid is in the chunk
    // Note: song_id in vec_songs corresponds to rowid in smart_metadata
    db.prepare(`UPDATE smart_metadata SET embedding_status = 'COMPLETED' WHERE rowid IN (${placeholders})`).run(...chunk);

    updatedCount += chunk.length;
    process.stdout.write(`\r[Sync] Updated status for ${updatedCount} / ${validCount} songs...`);
}

console.log('\n');
console.log('--- Sync Results ---');
console.log(`Valid Vectors Found: ${validCount}`);
console.log(`Invalid Vectors Found: ${invalidCount}`);
console.log(`Marked as COMPLETED: ${updatedCount}`);

if (invalidCount > 0) {
    console.warn(`WARNING: Found ${invalidCount} vectors with incorrect dimensions.`);
}

console.log('[Sync] Done.');
