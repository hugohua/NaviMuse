/**
 * 数据库简易计数脚本
 * 
 * 功能：
 * 1. 快速查询 smart_metadata 表中的总记录数
 * 
 * 用法：
 * npx tsx scripts/check-db.ts
 */
import { db, initDB } from '../src/db';

initDB();
const count = db.prepare('SELECT count(*) as c FROM smart_metadata').get() as { c: number };
console.log("DB Count:", count);

const analyzed = db.prepare('SELECT title, artist, description, tags, mood FROM smart_metadata WHERE last_analyzed IS NOT NULL').all();
console.log("\nAnalyzed Count:", analyzed.length);
if (analyzed.length > 0) {
    console.log("Sample Data:", JSON.stringify(analyzed.slice(0, 3), null, 2));
}
