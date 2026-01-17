
import { initDB, db } from '../src/db';
import { METADATA_SYSTEM_PROMPT } from '../src/services/ai/systemPrompt';
import fs from 'fs';
import path from 'path';

// 配置
const BATCH_DIR = path.join(process.cwd(), 'data', 'batch');
const RETRY_FILE_NAME = 'batch_retry_001.jsonl';
const RETRY_MAPPING_FILE = 'batch_retry_mapping.json';
const FAILED_LIST_FILE = 'failed_batches.txt';
const SONGS_PER_REQUEST = 15;
const MODEL = 'qwen-plus'; // Hardcoded for consistency with export script

interface Song {
    navidrome_id: string;
    title: string;
    artist: string;
}

function buildBatchLine(songs: Song[], batchIndex: number): string {
    const songsPayload = songs.map(s => ({
        id: s.navidrome_id,
        title: s.title,
        artist: s.artist
    }));

    const request = {
        custom_id: `retry_batch_${batchIndex}`,
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
    console.log('[Retry Prep] 初始化...');
    initDB();

    // 1. 读取失败批次列表
    const failedBatchesPath = path.join(process.cwd(), FAILED_LIST_FILE);
    if (!fs.existsSync(failedBatchesPath)) {
        console.error(`❌ 找不到失败列表文件: ${FAILED_LIST_FILE}`);
        process.exit(1);
    }
    const failedBatches = fs.readFileSync(failedBatchesPath, 'utf-8')
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 0);

    console.log(`[Retry Prep] 共有 ${failedBatches.length} 个失败批次`);

    // 2. 读取原始映射
    const mappingPath = path.join(BATCH_DIR, 'batch_mapping.json');
    if (!fs.existsSync(mappingPath)) {
        console.error(`❌ 找不到映射文件: ${mappingPath}`);
        process.exit(1);
    }
    const originalMapping = JSON.parse(fs.readFileSync(mappingPath, 'utf-8'));

    // 3. 收集所有需要重试的歌曲ID
    let songIds: string[] = [];
    let missingBatches = 0;
    for (const batchId of failedBatches) {
        if (originalMapping[batchId]) {
            songIds.push(...originalMapping[batchId]);
        } else {
            console.warn(`⚠️ 映射文件中找不到批次: ${batchId}`);
            missingBatches++;
        }
    }
    console.log(`[Retry Prep] 收集到 ${songIds.length} 个歌曲ID (缺失批次: ${missingBatches})`);

    if (songIds.length === 0) {
        console.log('[Retry Prep] 没有需要重试的歌曲，退出');
        return;
    }

    // 4. 从数据库获取歌曲详情
    // SQLite has limits on variable count, so chunk the queries
    const CHUNK_SIZE = 900;
    let songs: Song[] = [];

    for (let i = 0; i < songIds.length; i += CHUNK_SIZE) {
        const chunkIds = songIds.slice(i, i + CHUNK_SIZE);
        const placeholders = chunkIds.map(() => '?').join(',');
        const query = `
            SELECT navidrome_id, title, artist 
            FROM smart_metadata 
            WHERE navidrome_id IN (${placeholders})
        `;
        const result = db.prepare(query).all(...chunkIds) as Song[];
        songs.push(...result);
    }

    console.log(`[Retry Prep] 从数据库检索到 ${songs.length} 首歌曲详情`);

    // 5. 重新分组并生成文件
    const newRequests: { songs: Song[], batchIndex: number }[] = [];
    const newMapping: Record<string, string[]> = {};

    // 按原始 15 个一组的逻辑重新打包
    // 注意：这里我们不一定要保持原来的分组，但保持一致可能更好。
    // 不过简单起见，且为了避免原来的组合可能导致特定问题的迷信，我们重新打包也没问题。
    // 但是，为了确保每个请求不超过 15 个，我们还是重新分组。

    for (let i = 0; i < songs.length; i += SONGS_PER_REQUEST) {
        const chunk = songs.slice(i, i + SONGS_PER_REQUEST);
        const batchIndex = newRequests.length;
        newRequests.push({
            songs: chunk,
            batchIndex: batchIndex
        });
        newMapping[`retry_batch_${batchIndex}`] = chunk.map(s => s.navidrome_id);
    }

    // 6. 写入 JSONL 文件
    const outputLines = newRequests.map(req => buildBatchLine(req.songs, req.batchIndex));
    const outputPath = path.join(BATCH_DIR, RETRY_FILE_NAME);
    fs.writeFileSync(outputPath, outputLines.join('\n') + '\n', 'utf-8');

    // 7. 写入新的 Mapping 文件
    const mappingOutputPath = path.join(BATCH_DIR, RETRY_MAPPING_FILE);
    fs.writeFileSync(mappingOutputPath, JSON.stringify(newMapping, null, 2), 'utf-8');

    console.log('');
    console.log('========================================');
    console.log(`✅ 重试文件生成完成！`);
    console.log(`   歌曲数量: ${songs.length}`);
    console.log(`   批次数量: ${newRequests.length}`);
    console.log(`   输出文件: ${outputPath}`);
    console.log(`   映射文件: ${mappingOutputPath}`);
    console.log('');
    console.log('下一步 - 提交重试任务:');
    console.log('  你需要手动修改 scripts/batch-submit.ts 或创建一个新的提交脚本来提交这个文件');
    console.log(`  npx tsx scripts/batch-submit.ts --file ${RETRY_FILE_NAME}`);
    console.log('========================================');
}

main().catch(console.error);
