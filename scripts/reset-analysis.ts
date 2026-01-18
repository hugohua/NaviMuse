
/**
 * 重置分析状态脚本
 * 
 * 功能：
 * 1. 清空 `smart_metadata` 表中的 `last_analyzed` 字段
 * 2. 强制系统在下次运行时重新对所有歌曲进行 AI 分析
 * 
 * 警告：
 * 此操作将导致已生成的 AI 元数据（描述、标签等）被覆盖重新生成。
 * 
 * 用法：
 * npx ts-node --project tsconfig.server.json scripts/reset-analysis.ts
 */

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
