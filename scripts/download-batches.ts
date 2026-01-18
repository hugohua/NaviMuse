
/**
 * 批量结果下载工具
 * 
 * 功能：
 * 1. 从百炼 API 下载已完成 Batch 任务的结果文件
 * 
 * 用法：
 * npx ts-node --project tsconfig.server.json scripts/download-batches.ts
 */
import fs from 'fs';
import path from 'path';
import 'dotenv/config';
import OpenAI from 'openai';
import { config } from '../src/config';

// 需要下载的 Batch IDs (按时间顺序排列)
const BATCH_IDS = [
    'batch_fe5c3ef4-6c86-42ab-916b-7c7e62e3beef', // Oldest
    'batch_9bf04d61-d4ae-4242-b5a3-a607310dc387',
    'batch_3c4bcb8a-8b97-4b7f-bad1-0174bcb7cabe'  // Newest
];

const OUTPUT_DIR = path.join(process.cwd(), 'data/batch/meta');

// Helper to format timestamp
const formatTime = (ts: number) => {
    const date = new Date(ts * 1000);
    const YYYY = date.getFullYear();
    const MM = String(date.getMonth() + 1).padStart(2, '0');
    const DD = String(date.getDate()).padStart(2, '0');
    const HH = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    return `${YYYY}${MM}${DD}_${HH}${mm}`;
};

async function downloadBatch(client: OpenAI, batchId: string, index: number) {
    console.log(`\n[${index + 1}/${BATCH_IDS.length}] [${batchId}] Checking status...`);

    try {
        // 1. 获取 Batch 详情
        const batch = await client.batches.retrieve(batchId);
        console.log(`Status: ${batch.status}`);

        if (!batch.output_file_id) {
            console.log(`No output_file_id found. (Status: ${batch.status})`);
            return;
        }

        console.log(`Output File ID: ${batch.output_file_id}`);

        // 2. 下载文件内容
        console.log(`Downloading result...`);
        const fileResponse = await client.files.content(batch.output_file_id);
        const content = await fileResponse.text();

        // 构造文件名: batch_download_{Index}_{Time}_{ShortID}_output.jsonl
        const timeStr = formatTime(batch.created_at);
        const shortId = batchId.replace('batch_', '').substring(0, 8);
        const indexStr = String(index + 1).padStart(3, '0');
        const fileName = `batch_download_${indexStr}_${timeStr}_${shortId}_output.jsonl`;
        const outputPath = path.join(OUTPUT_DIR, fileName);

        // 确保目录存在
        if (!fs.existsSync(OUTPUT_DIR)) {
            fs.mkdirSync(OUTPUT_DIR, { recursive: true });
        }

        fs.writeFileSync(outputPath, content, 'utf-8');
        console.log(`✅ Saved to: ${outputPath}`);
        console.log(`   Size: ${(content.length / 1024 / 1024).toFixed(2)} MB`);

    } catch (e: any) {
        console.error(`Error processing batch ${batchId}:`, e.message);
    }
}

async function main() {
    // 强制清除代理环境变量
    delete process.env.http_proxy;
    delete process.env.https_proxy;
    delete process.env.HTTP_PROXY;
    delete process.env.HTTPS_PROXY;

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        console.error('Error: OPENAI_API_KEY not found in environment.');
        return;
    }

    console.log('[Batch Download] Using OpenAI SDK with Aliyun Compatible Endpoint');

    // 初始化兼容模式客户端
    const client = new OpenAI({
        apiKey,
        baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        timeout: 60000
    });

    console.log(`Target Directory: ${OUTPUT_DIR}`);

    // 使用 for loop with index
    for (let i = 0; i < BATCH_IDS.length; i++) {
        await downloadBatch(client, BATCH_IDS[i], i);
    }
}

main();
