/**
 * 批量向量化提交脚本 - 上传 JSONL 文件并创建 Batch Embedding 任务
 * 
 * 使用方式:
 *   npx tsx scripts/embedding-submit.ts --file embedding_001.jsonl
 *   npx tsx scripts/embedding-submit.ts --all
 */

import 'dotenv/config';
import OpenAI from 'openai';
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

async function submitFile(client: OpenAI, filePath: string): Promise<EmbeddingJob | null> {
    const fileName = path.basename(filePath);
    const stats = fs.statSync(filePath);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(2);

    console.log(`[Embedding Submit] 准备上传: ${fileName} (${sizeMB} MB)`);

    const timer = setInterval(() => {
        process.stdout.write('.');
    }, 1000);

    try {
        console.log(`[Embedding Submit] 开始上传... (请耐心等待)`);

        // 1. 上传文件
        const file = await client.files.create({
            file: fs.createReadStream(filePath),
            purpose: 'batch'
        });

        clearInterval(timer);
        process.stdout.write('\n');
        console.log(`[Embedding Submit] ✅ 上传成功: ${file.id}`);

        // 2. 创建批处理任务 (注意 endpoint 是 /v1/embeddings)
        const batch = await client.batches.create({
            input_file_id: file.id,
            endpoint: '/v1/embeddings',
            completion_window: '24h'
        });
        console.log(`[Embedding Submit] 任务创建成功: ${batch.id}`);

        return {
            id: batch.id,
            file: fileName,
            status: batch.status,
            created: new Date().toISOString().split('T')[0]
        };
    } catch (error: any) {
        clearInterval(timer);
        process.stdout.write('\n');
        console.error(`[Embedding Submit] ❌ 提交失败:`, error.message);
        return null;
    }
}

async function main() {
    // 清除代理环境变量
    delete process.env.http_proxy;
    delete process.env.https_proxy;
    delete process.env.HTTP_PROXY;
    delete process.env.HTTPS_PROXY;
    console.log('[Embedding Submit] 已清除代理配置，直连阿里云...');

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        console.error('❌ 错误: 请设置环境变量 OPENAI_API_KEY');
        process.exit(1);
    }

    const client = new OpenAI({
        apiKey,
        baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        timeout: 120000 // 120秒超时 (向量文件可能较大)
    });

    const args = process.argv.slice(2);
    const fileIndex = args.indexOf('--file');
    const submitAll = args.includes('--all');

    const store = loadJobs();

    if (fileIndex !== -1) {
        // 提交单个文件
        let filePath = args[fileIndex + 1];
        if (!filePath.startsWith('/')) {
            filePath = path.join(BATCH_DIR, filePath);
        }
        if (!fs.existsSync(filePath)) {
            console.error(`❌ 文件不存在: ${filePath}`);
            process.exit(1);
        }

        const job = await submitFile(client, filePath);
        if (job) {
            store.jobs.push(job);
            saveJobs(store);
            console.log(`✅ 任务已保存到 embedding_jobs.json`);
        }
    } else if (submitAll) {
        // 提交所有未提交的文件
        const files = fs.readdirSync(BATCH_DIR)
            .filter(f => f.startsWith('embedding_') && f.endsWith('.jsonl'));

        const submittedFiles = new Set(store.jobs.map(j => j.file));
        const pendingFiles = files.filter(f => !submittedFiles.has(f));

        if (pendingFiles.length === 0) {
            console.log('📋 所有文件已提交，没有待处理的文件');
            return;
        }

        console.log(`[Embedding Submit] 发现 ${pendingFiles.length} 个待提交文件`);

        for (const file of pendingFiles) {
            const filePath = path.join(BATCH_DIR, file);
            const job = await submitFile(client, filePath);
            if (job) {
                store.jobs.push(job);
                saveJobs(store);
            }
            await new Promise(r => setTimeout(r, 2000));
        }

        console.log(`✅ 全部提交完成，共 ${pendingFiles.length} 个任务`);
    } else {
        console.log(`
使用方式:
  npx tsx scripts/embedding-submit.ts --file <jsonl文件名>
  npx tsx scripts/embedding-submit.ts --all

示例:
  npx tsx scripts/embedding-submit.ts --file embedding_001.jsonl
        `);
    }
}

main().catch(console.error);
