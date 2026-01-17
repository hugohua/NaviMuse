/**
 * 阿里云百炼 Batch API 全链路测试脚本 (使用官方测试模型)
 * 
 * 使用测试模型 batch-test-model，不产生推理费用
 * 验证：文件上传 -> 任务创建 -> 状态查询 -> 结果下载
 * 
 * 使用方式:
 *   npx tsx scripts/batch-test-full.ts
 */

import 'dotenv/config';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';

const BATCH_DIR = path.join(process.cwd(), 'data', 'batch');
const TEST_FILE = path.join(BATCH_DIR, 'test_model.jsonl');
const RESULT_FILE = path.join(BATCH_DIR, 'test_result.jsonl');
const ERROR_FILE = path.join(BATCH_DIR, 'test_error.jsonl');

// 确保目录存在
if (!fs.existsSync(BATCH_DIR)) {
    fs.mkdirSync(BATCH_DIR, { recursive: true });
}

async function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    console.log('═'.repeat(60));
    console.log('🧪 阿里云百炼 Batch API 全链路测试 (使用官方测试模型)');
    console.log('═'.repeat(60));

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        console.error('\n❌ 错误: 请设置环境变量 OPENAI_API_KEY');
        process.exit(1);
    }

    const client = new OpenAI({
        apiKey,
        baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1'
    });

    // ========================================
    // Step 0: 准备测试文件
    // ========================================
    console.log('\n📝 Step 0: 准备测试文件...');

    // 使用官方测试模型格式：model=batch-test-model, url=/v1/chat/ds-test
    const testData = [
        {
            custom_id: "test_1",
            method: "POST",
            url: "/v1/chat/ds-test",  // 测试模型专用 endpoint
            body: {
                model: "batch-test-model",  // 测试模型，不产生费用
                messages: [
                    { role: "system", content: "You are a helpful assistant." },
                    { role: "user", content: "你好！这是第一条测试消息。" }
                ]
            }
        },
        {
            custom_id: "test_2",
            method: "POST",
            url: "/v1/chat/ds-test",
            body: {
                model: "batch-test-model",
                messages: [
                    { role: "system", content: "You are a helpful assistant." },
                    { role: "user", content: "What is 2+2?" }
                ]
            }
        },
        {
            custom_id: "test_3",
            method: "POST",
            url: "/v1/chat/ds-test",
            body: {
                model: "batch-test-model",
                messages: [
                    { role: "system", content: "You are a helpful assistant." },
                    { role: "user", content: "这是第三条测试消息，用于验证批量处理。" }
                ]
            }
        }
    ];

    const testContent = testData.map(d => JSON.stringify(d)).join('\n') + '\n';
    fs.writeFileSync(TEST_FILE, testContent, 'utf-8');
    console.log(`   ✅ 测试文件已生成: ${TEST_FILE}`);
    console.log(`   📊 文件大小: ${Buffer.byteLength(testContent)} bytes, 行数: ${testData.length}`);

    // ========================================
    // Step 1: 上传文件
    // ========================================
    console.log('\n📤 Step 1: 上传测试文件...');
    let inputFileId: string;
    try {
        const fileObject = await client.files.create({
            file: fs.createReadStream(TEST_FILE),
            purpose: 'batch'
        });
        inputFileId = fileObject.id;
        console.log(`   ✅ 文件上传成功: ${inputFileId}`);
    } catch (error: any) {
        console.error(`   ❌ 文件上传失败: ${error.message}`);
        process.exit(1);
    }

    // ========================================
    // Step 2: 创建 Batch 任务
    // ========================================
    console.log('\n🚀 Step 2: 创建 Batch 任务...');
    let batchId: string;
    try {
        // 注意：测试模型使用 /v1/chat/ds-test endpoint
        const batch = await client.batches.create({
            input_file_id: inputFileId,
            endpoint: '/v1/chat/ds-test' as any,  // 测试模型专用 endpoint
            completion_window: '24h'
        });
        batchId = batch.id;
        console.log(`   ✅ Batch 任务创建成功: ${batchId}`);
    } catch (error: any) {
        console.error(`   ❌ 任务创建失败: ${error.message}`);
        process.exit(1);
    }

    // ========================================
    // Step 3: 轮询任务状态
    // ========================================
    console.log('\n⏳ Step 3: 等待任务完成...');
    let status = '';
    let batch: any;
    const startTime = Date.now();
    const maxWaitTime = 5 * 60 * 1000; // 最长等待 5 分钟

    while (!['completed', 'failed', 'expired', 'cancelled'].includes(status)) {
        batch = await client.batches.retrieve(batchId);
        status = batch.status;

        const elapsed = Math.round((Date.now() - startTime) / 1000);
        console.log(`   🔄 状态: ${status} (已等待 ${elapsed}s)`);

        if (batch.request_counts) {
            console.log(`      完成: ${batch.request_counts.completed}/${batch.request_counts.total}`);
        }

        if (Date.now() - startTime > maxWaitTime) {
            console.log('   ⚠️ 等待超时，退出轮询');
            break;
        }

        if (!['completed', 'failed', 'expired', 'cancelled'].includes(status)) {
            await sleep(5000); // 每 5 秒查询一次
        }
    }

    // ========================================
    // Step 4: 处理结果
    // ========================================
    console.log('\n📥 Step 4: 处理结果...');

    if (status === 'failed') {
        console.log(`   ❌ 任务失败`);
        if (batch.errors) {
            console.log(`   错误信息: ${JSON.stringify(batch.errors)}`);
        }
        console.log('   参见错误码文档: https://help.aliyun.com/zh/model-studio/developer-reference/error-code');
        process.exit(1);
    }

    if (status === 'completed') {
        // 下载成功结果
        if (batch.output_file_id) {
            console.log(`   📄 下载成功结果: ${batch.output_file_id}`);
            const content = await client.files.content(batch.output_file_id);
            const text = await content.text();
            fs.writeFileSync(RESULT_FILE, text, 'utf-8');
            console.log(`   ✅ 结果已保存: ${RESULT_FILE}`);

            // 解析并显示结果
            const lines = text.trim().split('\n');
            console.log(`\n   📊 结果预览 (${lines.length} 条):`);
            for (const line of lines.slice(0, 3)) {
                try {
                    const result = JSON.parse(line);
                    const content = result.response?.body?.choices?.[0]?.message?.content || '(无内容)';
                    console.log(`      ${result.custom_id}: ${content}`);
                } catch (e) {
                    console.log(`      解析失败: ${line.substring(0, 50)}...`);
                }
            }
        }

        // 下载错误结果
        if (batch.error_file_id) {
            console.log(`   📄 下载错误信息: ${batch.error_file_id}`);
            const content = await client.files.content(batch.error_file_id);
            const text = await content.text();
            fs.writeFileSync(ERROR_FILE, text, 'utf-8');
            console.log(`   ⚠️ 错误信息已保存: ${ERROR_FILE}`);
        }
    }

    // ========================================
    // 汇总
    // ========================================
    console.log('\n' + '═'.repeat(60));
    console.log('📊 测试结果汇总');
    console.log('═'.repeat(60));
    console.log(`   文件上传: ✅ 通过`);
    console.log(`   任务创建: ✅ 通过`);
    console.log(`   状态轮询: ✅ 通过`);
    console.log(`   结果下载: ${status === 'completed' ? '✅ 通过' : '❌ 失败 (' + status + ')'}`);

    if (status === 'completed') {
        console.log('\n🎉 全链路测试通过！可以放心提交正式任务了');
        console.log(`
下一步 - 提交正式任务:
  npm run batch:submit -- --all
        `);
    }
}

main().catch(console.error);
