/**
 * 批量导出脚本 - 将待处理歌曲导出为阿里云百炼 Batch API 所需的 JSONL 格式
 * 
 * 使用方式:
 *   npx tsx scripts/batch-export.ts [--limit N]           # 导出未分析的歌曲
 *   npx tsx scripts/batch-export.ts --reprocess [--limit N]  # 导出 JSON 不完整的歌曲
 * 
 * 参数:
 *   --limit N      限制导出数量
 *   --reprocess    从 data/invalid_json_ids.txt 读取 ID 进行重处理
 *                  (需先运行 npx tsx scripts/analyze-db-integrity.ts)
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
const SONGS_PER_REQUEST = 10; // 每个请求处理 10 首歌 
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
            temperature: 0.5
        }
    };
    return JSON.stringify(request);
}

async function main() {
    // 解析参数
    const args = process.argv.slice(2);
    const limitIndex = args.indexOf('--limit');
    const limit = limitIndex !== -1 ? parseInt(args[limitIndex + 1]) : undefined;
    const reprocessMode = args.includes('--reprocess');

    console.log('[Batch Export] 初始化数据库...');
    initDB();

    let songs: Song[];

    if (reprocessMode) {
        // 重处理模式：从 invalid_json_ids.txt 读取需要重新分析的 ID
        const invalidIdsFile = path.join(process.cwd(), 'data', 'invalid_json_ids.txt');
        if (!fs.existsSync(invalidIdsFile)) {
            console.error(`[Batch Export] 错误: ${invalidIdsFile} 不存在`);
            console.error('请先运行 npx tsx scripts/analyze-db-integrity.ts 生成无效 ID 列表');
            return;
        }

        const invalidIds = fs.readFileSync(invalidIdsFile, 'utf-8')
            .split('\n')
            .filter(id => id.trim().length > 0);

        console.log(`[Batch Export] 重处理模式: 从 invalid_json_ids.txt 读取 ${invalidIds.length} 个 ID`);

        if (invalidIds.length === 0) {
            console.log('[Batch Export] 没有需要重处理的歌曲，退出');
            return;
        }

        // 批量查询这些 ID 的歌曲信息
        const placeholders = invalidIds.map(() => '?').join(',');
        const idsToProcess = limit ? invalidIds.slice(0, limit) : invalidIds;
        songs = db.prepare(`
            SELECT navidrome_id, title, artist 
            FROM smart_metadata 
            WHERE navidrome_id IN (${idsToProcess.map(() => '?').join(',')})
        `).all(...idsToProcess) as Song[];

        console.log(`[Batch Export] 找到 ${songs.length} 首需要重处理的歌曲`);
    } else {
        // 正常模式：查询待处理歌曲 (未分析 UNION 分析结果丢失)
        let query = `
            SELECT navidrome_id, title, artist FROM smart_metadata WHERE last_analyzed IS NULL
            UNION
            SELECT navidrome_id, title, artist FROM smart_metadata WHERE analysis_json IS NULL
        `;
        if (limit) {
            query += ` LIMIT ${limit}`;
        }

        songs = db.prepare(query).all() as Song[];
        console.log(`[Batch Export] 找到 ${songs.length} 首待处理歌曲`);
    }

    if (songs.length === 0) {
        console.log('[Batch Export] 没有待处理的歌曲，退出');
        return;
    }

    // 确保输出目录存在
    if (!fs.existsSync(BATCH_DIR)) {
        fs.mkdirSync(BATCH_DIR, { recursive: true });
    }

    // --- 增量导出逻辑 ---
    // 1. 读取现有映射，确定起始 batchIndex
    let nextBatchId = 0;
    const mappingFile = path.join(BATCH_DIR, 'batch_mapping.json');
    let existingMapping: Record<string, string[]> = {};

    if (fs.existsSync(mappingFile)) {
        try {
            existingMapping = JSON.parse(fs.readFileSync(mappingFile, 'utf-8'));
            const keys = Object.keys(existingMapping);
            if (keys.length > 0) {
                // 提取 batch_123 中的数字
                const maxId = keys
                    .map(k => parseInt(k.replace('batch_', '')))
                    .filter(n => !isNaN(n))
                    .reduce((max, current) => Math.max(max, current), -1);
                nextBatchId = maxId + 1;
            }
            console.log(`[Batch Export] 检测到已有映射，起始 Batch ID: ${nextBatchId}`);
        } catch (e) {
            console.warn('[Batch Export] 读取现有映射失败，将重新开始计数');
        }
    }

    // 2. 扫描现有文件，确定起始 fileIndex
    let nextFileId = 1;
    const existingFiles = fs.readdirSync(BATCH_DIR).filter(f => f.match(/^batch_\d+\.jsonl$/));
    if (existingFiles.length > 0) {
        const maxFileId = existingFiles
            .map(f => parseInt(f.replace('batch_', '').replace('.jsonl', '')))
            .filter(n => !isNaN(n))
            .reduce((max, current) => Math.max(max, current), 0);
        nextFileId = maxFileId + 1;
        console.log(`[Batch Export] 检测到已有文件，起始文件名: batch_${String(nextFileId).padStart(3, '0')}.jsonl`);
    }

    // 3. 构建请求，使用全局唯一的 batchIndex
    const requests: { songs: Song[], batchIndex: number }[] = [];
    for (let i = 0; i < songs.length; i += SONGS_PER_REQUEST) {
        requests.push({
            songs: songs.slice(i, i + SONGS_PER_REQUEST),
            batchIndex: nextBatchId + requests.length // 累加 offset
        });
    }
    console.log(`[Batch Export] 生成 ${requests.length} 个新请求 (Batch ID: ${nextBatchId} -> ${nextBatchId + requests.length - 1})`);

    // 4. 更新并保存映射 (合并模式)
    const newMapping: Record<string, string[]> = { ...existingMapping };
    for (const req of requests) {
        newMapping[`batch_${req.batchIndex}`] = req.songs.map(s => s.navidrome_id);
    }
    fs.writeFileSync(mappingFile, JSON.stringify(newMapping, null, 2), 'utf-8');
    console.log(`[Batch Export] 更新 ID 映射: batch_mapping.json`);

    // 5. 写入文件 (使用新的 fileIndex)
    let currentFileId = nextFileId;
    let requestCount = 0;

    for (let i = 0; i < requests.length; i += SONGS_PER_FILE) {
        const chunk = requests.slice(i, i + SONGS_PER_FILE);
        const fileName = `batch_${String(currentFileId).padStart(3, '0')}.jsonl`;
        const filePath = path.join(BATCH_DIR, fileName);

        const lines = chunk.map(req => buildBatchLine(req.songs, req.batchIndex));
        fs.writeFileSync(filePath, lines.join('\n') + '\n', 'utf-8');

        const songCount = chunk.reduce((sum, req) => sum + req.songs.length, 0);
        console.log(`[Batch Export] 写入 ${fileName} (${chunk.length} 请求, ${songCount} 首歌)`);
        requestCount += chunk.length;
        currentFileId++;
    }

    const totalFiles = currentFileId - nextFileId;

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
