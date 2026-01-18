/**
 * 数据库向量扩展调试工具
 * 
 * 功能：
 * 1. 尝试加载 sqlite-vec 扩展
 * 2. 验证向量表创建和查询是否正常
 * 3. 检查系统环境对向量数据库的支持情况
 * 
 * 用法：
 * npx ts-node --project tsconfig.server.json scripts/debug-vec.ts
 */
import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import path from 'path';

const dbPath = path.join(process.cwd(), 'data', 'navimuse.db');
const db = new Database(dbPath, { verbose: console.log });

console.log("Checking sqlite-vec version/path:", sqliteVec);

try {
    console.log("Loading extension...");
    sqliteVec.load(db);
    console.log("Extension loaded.");

    console.log("Dropping smart_metadata (cleanup)...");
    db.exec("DROP TABLE IF EXISTS smart_metadata");
    console.log("Dropped smart_metadata.");

    console.log("Creating smart_metadata...");
    db.exec(`
    CREATE TABLE IF NOT EXISTS smart_metadata (
        navidrome_id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        artist TEXT NOT NULL,
        album TEXT,
        duration INTEGER,
        file_path TEXT,
        description TEXT,
        tags TEXT, 
        mood TEXT,
        is_instrumental INTEGER DEFAULT 0,
        embedding BLOB,
        last_analyzed TEXT,
        last_updated TEXT,
        hash TEXT
    );
    `);
    console.log("smart_metadata created.");

    // Check if module is loaded by querying sqlite_monitor or similar? 
    // Or just try to create table.

    console.log("Creating virtual table...");
    db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS vec_songs USING vec0(
            song_id INTEGER PRIMARY KEY, 
            embedding float[768]
        );
    `);
    console.log("Table created.");

} catch (err) {
    console.error("Debug failed:", err);
    if ((err as any).code) {
        console.error("Error Code:", (err as any).code);
    }
}
