
import { db } from '../src/db';
import { config } from '../src/config';

console.log('Analyzing Database Integrity...');
console.log(`DB Path: ${process.env.DB_PATH || 'default (data/navimuse.db)'}`);

// Basic Counts
const totalSongs = (db.prepare('SELECT COUNT(*) as c FROM smart_metadata').get() as any).c;
const analyzed = (db.prepare('SELECT COUNT(*) as c FROM smart_metadata WHERE last_analyzed IS NOT NULL').get() as any).c;
const pending = (db.prepare("SELECT COUNT(*) as c FROM smart_metadata WHERE processing_status = 'PENDING'").get() as any).c;
const processing = (db.prepare("SELECT COUNT(*) as c FROM smart_metadata WHERE processing_status = 'PROCESSING'").get() as any).c;
const completed = (db.prepare("SELECT COUNT(*) as c FROM smart_metadata WHERE processing_status = 'COMPLETED'").get() as any).c;
const failed = (db.prepare("SELECT COUNT(*) as c FROM smart_metadata WHERE processing_status = 'FAILED'").get() as any).c;

const embeddingPending = (db.prepare("SELECT COUNT(*) as c FROM smart_metadata WHERE embedding_status = 'PENDING'").get() as any).c;
const embeddingCompleted = (db.prepare("SELECT COUNT(*) as c FROM smart_metadata WHERE embedding_status = 'COMPLETED'").get() as any).c;

const vecCount = (db.prepare('SELECT COUNT(*) as c FROM vec_songs').get() as any).c;

// Mismatches
// Songs analyzed but no JSON
const noJson = (db.prepare('SELECT COUNT(*) as c FROM smart_metadata WHERE last_analyzed IS NOT NULL AND analysis_json IS NULL').get() as any).c;
// Songs analyzed but no embedding blob in metadata (if we keep it there)
const noMetaEmbedding = (db.prepare('SELECT COUNT(*) as c FROM smart_metadata WHERE last_analyzed IS NOT NULL AND embedding IS NULL').get() as any).c;

// Songs that are COMPLETED but not in vec_songs
const completedButNoVec = (db.prepare(`
    SELECT COUNT(*) as c 
    FROM smart_metadata m
    WHERE m.processing_status = 'COMPLETED'
      AND m.rowid NOT IN (SELECT song_id FROM vec_songs)
`).get() as any).c;

console.log('--- Statistics ---');
console.log(`Total Songs: ${totalSongs}`);
console.log(`Analyzed (Metadata): ${analyzed}`);
console.log(`  - No JSON: ${noJson}`);
console.log(`  - No Blob in Meta: ${noMetaEmbedding}`);
console.log(`Processing Status:`);
console.log(`  - PENDING: ${pending}`);
console.log(`  - PROCESSING: ${processing}`);
console.log(`  - COMPLETED: ${completed}`);
console.log(`  - FAILED: ${failed}`);
console.log(`Embedding Status:`);
console.log(`  - PENDING: ${embeddingPending}`);
console.log(`  - COMPLETED: ${embeddingCompleted}`);
console.log(`Vector Table (vec_songs):`);
console.log(`  - Count: ${vecCount}`);
console.log(`  - Discrepancy (Completed Meta but no Vector): ${completedButNoVec}`);

if (completedButNoVec > 0) {
    console.warn(`WARNING: ${completedButNoVec} songs have 'COMPLETED' status but are missing from vec_songs table.`);
}
