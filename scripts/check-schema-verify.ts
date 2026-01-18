/**
 * 数据库 Schema 验证脚本
 * 
 * 功能：
 * 1. 检查 smart_metadata 表的字段结构
 * 2. 验证是否包含所有必需的 AI 分析和向量字段
 * 
 * 用法：
 * npx ts-node --project tsconfig.server.json scripts/check-schema-verify.ts
 */
import { db, initDB } from '../src/db';

initDB();

const columns = db.prepare("PRAGMA table_info(smart_metadata)").all() as any[];
const hasTempo = columns.some(c => c.name === 'tempo_vibe');
const hasTimbre = columns.some(c => c.name === 'timbre_texture');

console.log('Columns Check:');
console.log('tempo_vibe:', hasTempo ? 'OK' : 'MISSING');
console.log('timbre_texture:', hasTimbre ? 'OK' : 'MISSING');

if (!hasTempo || !hasTimbre) {
    process.exit(1);
}
// Optionally check indexes if relevant
