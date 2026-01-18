
/**
 * 数据库基础调试工具
 * 
 * 功能：
 * 1. 打印当前数据库中表结构、记录数等基础统计信息
 * 
 * 用法：
 * npx ts-node --project tsconfig.server.json scripts/debug-db.ts
 */
import { db, metadataRepo, initDB } from '../src/db';
import path from 'path';

console.log('--- Debug DB Info ---');
console.log('CWD:', process.cwd());
console.log('DB Path (env):', process.env.DB_PATH);
console.log('Resolved DB Path:', path.join(process.cwd(), 'data', 'navimuse.db'));

try {
    initDB();
    const total = metadataRepo.getAllIds().length;
    const pending = metadataRepo.getPendingSongs(100000).length;
    console.log(`Total Songs: ${total}`);
    console.log(`Pending Songs: ${pending}`);
} catch (e) {
    console.error('DB Error:', e);
}
