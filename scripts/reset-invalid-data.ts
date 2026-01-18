/**
 * 重置无效数据状态脚本
 * 
 * 功能：
 * 1. 读取 data/invalid_json_ids.txt 中的 ID
 * 2. 将 smart_metadata 表中对应记录的 processing_status 改为 'PENDING'
 * 3. 清空分析结果并移除对应的向量数据
 */

import { db, initDB } from '../src/db';
import fs from 'fs';
import path from 'path';

initDB();

const IDS_FILE = path.join(__dirname, '../data/invalid_json_ids.txt');

async function run() {
    console.log('--- Resetting Invalid Data Status ---');

    if (!fs.existsSync(IDS_FILE)) {
        console.error(`Error: File not found at ${IDS_FILE}`);
        process.exit(1);
    }

    const ids = fs.readFileSync(IDS_FILE, 'utf-8')
        .split('\n')
        .map(id => id.trim())
        .filter(id => id.length > 0);

    console.log(`Found ${ids.length} IDs to reset.`);

    if (ids.length === 0) {
        console.log('No IDs found. Exiting.');
        return;
    }

    // 1. 更新元数据状态
    const updateStmt = db.prepare(`
        UPDATE smart_metadata 
        SET processing_status = 'PENDING',
            last_analyzed = NULL,
            analysis_json = NULL,
            embedding_status = 'PENDING'
        WHERE navidrome_id = ?
    `);

    // 2. 获取 rowid 用户删除向量表数据
    const getRowIdStmt = db.prepare('SELECT rowid FROM smart_metadata WHERE navidrome_id = ?');

    // 3. 删除向量表记录 (vec_songs 使用 song_id 作为主键，对应 metadata 的 rowid)
    const deleteVecStmt = db.prepare(`
        DELETE FROM vec_songs WHERE song_id = ?
    `);

    let successCount = 0;

    const transaction = db.transaction((idList: string[]) => {
        for (const id of idList) {
            // 先处理向量
            const row = getRowIdStmt.get(id) as { rowid: number } | undefined;
            if (row) {
                deleteVecStmt.run(row.rowid);
            }
            // 再更新状态
            updateStmt.run(id);
            successCount++;
        }
    });

    console.log('Starting transaction...');
    try {
        transaction(ids);
        console.log(`Successfully reset ${successCount} records.`);
        console.log('Status set to PENDING, metadata cleared, vector removed.');
    } catch (error) {
        console.error('Transaction failed:', error);
        throw error;
    }
}

run().catch(error => {
    console.error('Critical Error:', error);
    process.exit(1);
});
