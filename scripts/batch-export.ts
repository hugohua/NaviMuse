/**
 * 批量导出脚本 - 将待处理歌曲导出为阿里云百炼 Batch API 所需的 JSONL 格式
 * 
 * 使用方式:
 *   npx tsx scripts/batch-export.ts [--limit N]
 * 
 * 输出:
 *   data/batch/batch_001.jsonl, batch_002.jsonl, ...
 */

import { initDB, db } from '../src/db';
import { METADATA_SYSTEM_PROMPT } from '../src/services/ai/systemPrompt';
import fs from 'fs';
import path from 'path';

// 配置
const BATCH_DIR = path.join(process.cwd(), 'data', 'batch');
const SONGS_PER_FILE = 10000; // 每个文件最多 10000 条请求 (安全边界)
const SONGS_PER_REQUEST = 15; // 每个请求处理 15 首歌 (与实时方案一致)
const MODEL = process.env.DASHSCOPE_MODEL || 'qwen-plus';

interface Song {
    navidrome_id: string;
    title: string;
    artist: string;
}

/**
 * 构造 OpenAI Batch API 兼容的请求行
 * 每个请求包含多首歌曲 (批量处理)
 * @see https://help.aliyun.com/zh/model-studio/developer-reference/batch-inference
 */
function buildBatchLine(songs: Song[], batchIndex: number): string {
    // 构造歌曲数组作为用户输入
    const songsPayload = songs.map(s => ({
        id: s.navidrome_id,
        title: s.title,
        artist: s.artist
    }));

    const request = {
        custom_id: `batch_${batchIndex}`, // 批次 ID，用于结果匹配
        method: "POST",
        url: "/v1/chat/completions",
        body: {
            model: MODEL,
            messages: [
                { role: "system", content: METADATA_SYSTEM_PROMPT },
                { role: "user", content: JSON.stringify(songsPayload) }
            ],
            temperature: 0.7
        }
    };
    return JSON.stringify(request);
}

async function main() {
    // 解析参数
    const args = process.argv.slice(2);
    const limitIndex = args.indexOf('--limit');
    const limit = limitIndex !== -1 ? parseInt(args[limitIndex + 1]) : undefined;

    console.log('[Batch Export] 初始化数据库...');
    initDB();

    // 查询待处理歌曲
    let query = `
        SELECT navidrome_id, title, artist 
        FROM smart_metadata 
        WHERE last_analyzed IS NULL
    `;
    if (limit) {
        query += ` LIMIT ${limit}`;
    }

    const songs = db.prepare(query).all() as Song[];
    console.log(`[Batch Export] 找到 ${songs.length} 首待处理歌曲`);

    if (songs.length === 0) {
        console.log('[Batch Export] 没有待处理的歌曲，退出');
        return;
    }

    // 确保输出目录存在
    if (!fs.existsSync(BATCH_DIR)) {
        fs.mkdirSync(BATCH_DIR, { recursive: true });
    }

    // 1. 先将歌曲按 SONGS_PER_REQUEST (15首) 分组成请求
    const requests: { songs: Song[], batchIndex: number }[] = [];
    for (let i = 0; i < songs.length; i += SONGS_PER_REQUEST) {
        requests.push({
            songs: songs.slice(i, i + SONGS_PER_REQUEST),
            batchIndex: requests.length
        });
    }
    console.log(`[Batch Export] 共 ${requests.length} 个请求 (每请求 ${SONGS_PER_REQUEST} 首)`);

    // 2. 保存歌曲 ID 到批次的映射 (用于导入时匹配)
    const batchMapping: Record<string, string[]> = {};
    for (const req of requests) {
        batchMapping[`batch_${req.batchIndex}`] = req.songs.map(s => s.navidrome_id);
    }
    const mappingFile = path.join(BATCH_DIR, 'batch_mapping.json');
    fs.writeFileSync(mappingFile, JSON.stringify(batchMapping, null, 2), 'utf-8');
    console.log(`[Batch Export] 保存 ID 映射: batch_mapping.json`);

    // 3. 将请求按 SONGS_PER_FILE 分文件写入
    let fileIndex = 1;
    let requestCount = 0;

    for (let i = 0; i < requests.length; i += SONGS_PER_FILE) {
        const chunk = requests.slice(i, i + SONGS_PER_FILE);
        const fileName = `batch_${String(fileIndex).padStart(3, '0')}.jsonl`;
        const filePath = path.join(BATCH_DIR, fileName);

        const lines = chunk.map(req => buildBatchLine(req.songs, req.batchIndex));
        fs.writeFileSync(filePath, lines.join('\n') + '\n', 'utf-8');

        const songCount = chunk.reduce((sum, req) => sum + req.songs.length, 0);
        console.log(`[Batch Export] 写入 ${fileName} (${chunk.length} 请求, ${songCount} 首歌)`);
        requestCount += chunk.length;
        fileIndex++;
    }

    const totalFiles = fileIndex - 1;

    // 初始化任务跟踪文件
    const jobsFile = path.join(BATCH_DIR, 'batch_jobs.json');
    if (!fs.existsSync(jobsFile)) {
        fs.writeFileSync(jobsFile, JSON.stringify({ jobs: [] }, null, 2), 'utf-8');
        console.log('[Batch Export] 创建任务跟踪文件: batch_jobs.json');
    }

    console.log('');
    console.log('========================================');
    console.log(`✅ 导出完成！`);
    console.log(`   歌曲总数: ${songs.length}`);
    console.log(`   请求总数: ${requestCount} (每请求 ${SONGS_PER_REQUEST} 首)`);
    console.log(`   文件数量: ${totalFiles}`);
    console.log(`📁 输出目录: ${BATCH_DIR}`);
    console.log('');
    console.log('下一步:');
    console.log('  npm run batch:submit -- --all');
    console.log('========================================');
}

main().catch(console.error);
