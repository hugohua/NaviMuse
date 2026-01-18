
/**
 * 数据库状态检查脚本
 * 
 * 功能：
 * 1. 统计数据库中歌曲总数
 * 2. 统计已生成的元数据数量
 * 3. 统计已生成的向量数量
 * 4. 检查新 Schema 字段的覆盖情况
 * 
 * 用法：
 * npx ts-node --project tsconfig.server.json scripts/check-db-status.ts
 */

import { initDB, db } from '../src/db';
import 'dotenv/config';

initDB();

const vecCount = db.prepare('SELECT count(*) as c FROM vec_songs').get() as { c: number };
const metaCount = db.prepare('SELECT count(*) as c FROM smart_metadata').get() as { c: number };

console.log("Smart Metadata Count:", metaCount.c);
console.log("Vector Count:", vecCount.c);
