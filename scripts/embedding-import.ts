/**
 * 批量向量化导入脚本 - 下载结果并写入数据库
 * 
 * 使用方式:
 *   npx tsx scripts/embedding-import.ts          # 查看任务状态
 *   npx tsx scripts/embedding-import.ts --import # 导入结果
 */

import 'dotenv/config';
import OpenAI from 'openai';
import { initDB, db } from '../src/db';
import fs from 'fs';
import path from 'path';

const BATCH_DIR = path.join(process.cwd(), 'data', 'batch');
const JOBS_FILE = path.join(BATCH_DIR, 'embedding_jobs.json');

interface EmbeddingJob {
    id: string;
    file: string;
    status: string;
    created: string;
    output_file_id?: string;
    imported?: boolean;
}

interface JobsStore {
    jobs: EmbeddingJob[];
}

function loadJobs(): JobsStore {
    if (!fs.existsSync(JOBS_FILE)) {
        return { jobs: [] };
    }
    return JSON.parse(fs.readFileSync(JOBS_FILE, 'utf-8'));
}

function saveJobs(store: JobsStore) {
    fs.writeFileSync(JOBS_FILE, JSON.stringify(store, null, 2), 'utf-8');
}

async function main() {
    // 清除代理
    delete process.env.http_proxy;
    delete process.env.https_proxy;
    delete process.env.HTTP_PROXY;
    delete process.env.HTTPS_PROXY;

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        console.error('❌ 错误: 请设置环境变量 OPENAI_API_KEY');
        process.exit(1);
    }

    const client = new OpenAI({
        apiKey,
        baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        timeout: 60000
    });

    const args = process.argv.slice(2);
    const doImport = args.includes('--import');

    const store = loadJobs();

    if (store.jobs.length === 0) {
        console.log('📋 没有任务记录。请先运行 embedding-submit.ts');
        return;
    }

    // 检查并更新任务状态
    console.log('[Embedding Import] 检查任务状态...\n');

    for (const job of store.jobs) {
        try {
            const batch = await client.batches.retrieve(job.id);
            job.status = batch.status;
            if (batch.output_file_id) {
                job.output_file_id = batch.output_file_id;
            }

            const statusIcon = batch.status === 'completed' ? '✅' :
                batch.status === 'failed' ? '❌' : '⏳';
            console.log(`${statusIcon} ${job.file}: ${batch.status}`);

            if (batch.status === 'completed') {
                console.log(`   Output File: ${batch.output_file_id}`);
            }
        } catch (e: any) {
            console.log(`⚠️ ${job.file}: 无法获取状态 (${e.message})`);
        }
    }

    saveJobs(store);

    if (!doImport) {
        console.log('\n使用 --import 参数导入已完成的任务结果');
        return;
    }

    // 导入结果
    console.log('\n[Embedding Import] 开始导入...');
    initDB();

    // 加载映射 (支持多个映射文件)
    const mainMappingFile = path.join(BATCH_DIR, 'embedding_mapping.json');
    const fixedMappingFile = path.join(BATCH_DIR, 'embedding_fixed_mapping.json');

    let allMappings: Record<string, string> = {};

    // 加载主映射文件
    if (fs.existsSync(mainMappingFile)) {
        const mainMapping = JSON.parse(fs.readFileSync(mainMappingFile, 'utf-8'));
        Object.assign(allMappings, mainMapping);
    }

    // 加载修复映射文件
    if (fs.existsSync(fixedMappingFile)) {
        const fixedMapping = JSON.parse(fs.readFileSync(fixedMappingFile, 'utf-8'));
        Object.assign(allMappings, fixedMapping);
    }

    if (Object.keys(allMappings).length === 0) {
        console.error('❌ 找不到任何映射文件');
        process.exit(1);
    }

    console.log(`[Embedding Import] 加载了 ${Object.keys(allMappings).length} 条 ID 映射`);
    const mapping = allMappings;

    // 准备数据库语句
    const findRowIdStmt = db.prepare(`SELECT rowid FROM smart_metadata WHERE navidrome_id = ?`);
    // vec0 虚拟表不支持 INSERT OR REPLACE，需要先 DELETE 再 INSERT
    const deleteVectorStmt = db.prepare(`DELETE FROM vec_songs WHERE song_id = ?`);
    const insertVectorStmt = db.prepare(`
        INSERT INTO vec_songs (song_id, embedding)
        VALUES (?, ?)
    `);

    let totalSuccess = 0;
    let totalError = 0;

    for (const job of store.jobs) {
        if (job.status !== 'completed' || !job.output_file_id || job.imported) {
            continue;
        }

        console.log(`\n📥 下载并导入 ${job.file}...`);

        try {
            // 下载结果文件
            const response = await client.files.content(job.output_file_id);
            const content = await response.text();

            // 保存到本地
            const resultFileName = `result_${job.file}`;
            const resultPath = path.join(BATCH_DIR, resultFileName);
            fs.writeFileSync(resultPath, content, 'utf-8');
            console.log(`   保存结果文件: ${resultFileName}`);

            // 解析并导入
            const lines = content.trim().split('\n');
            let successCount = 0;
            let errorCount = 0;

            for (const line of lines) {
                try {
                    const result = JSON.parse(line);
                    const customId = result.custom_id;
                    const navidromeId = mapping[customId];

                    if (!navidromeId) {
                        console.warn(`   ⚠️ ${customId}: 映射不存在`);
                        errorCount++;
                        continue;
                    }

                    // 检查响应
                    if (result.error) {
                        console.warn(`   ⚠️ ${customId}: API 错误`);
                        errorCount++;
                        continue;
                    }

                    const embedding = result.response?.body?.data?.[0]?.embedding;
                    if (!embedding || !Array.isArray(embedding)) {
                        console.warn(`   ⚠️ ${customId}: 无有效向量`);
                        errorCount++;
                        continue;
                    }

                    // 查找 song_id (rowid)
                    const rowIdRes = findRowIdStmt.get(navidromeId) as { rowid: number } | undefined;
                    if (!rowIdRes) {
                        console.warn(`   ⚠️ ${customId}: 数据库中找不到歌曲`);
                        errorCount++;
                        continue;
                    }

                    // 写入向量 (先删除旧的，再插入新的)
                    const buffer = Buffer.from(new Float32Array(embedding).buffer);
                    const songId = BigInt(rowIdRes.rowid);
                    deleteVectorStmt.run(songId);
                    insertVectorStmt.run(songId, buffer);
                    successCount++;

                } catch (e: any) {
                    if (errorCount < 5) { // Only log first 5 errors
                        console.warn(`   ⚠️ 解析/导入异常: ${e.message}`);
                    }
                    errorCount++;
                }
            }

            console.log(`   ✅ 导入 ${successCount} 条, ❌ 失败 ${errorCount} 条`);
            totalSuccess += successCount;
            totalError += errorCount;

            job.imported = true;
            saveJobs(store);

        } catch (e: any) {
            console.error(`   ❌ 下载失败: ${e.message}`);
        }
    }

    console.log('\n========================================');
    console.log(`✅ 导入完成！`);
    console.log(`   成功: ${totalSuccess}`);
    console.log(`   失败: ${totalError}`);
    console.log('========================================');
}

main().catch(console.error);
