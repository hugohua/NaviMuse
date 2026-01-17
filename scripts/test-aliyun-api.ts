/**
 * 阿里云百炼 API 连通性测试脚本
 * 
 * 测试内容:
 *   1. 实时推理接口 (Chat Completions)
 *   2. 文件上传接口 (Files API)
 *   3. Batch 任务创建 (可选)
 * 
 * 使用方式:
 *   npx tsx scripts/test-aliyun-api.ts
 * 
 * 环境变量:
 *   OPENAI_API_KEY - 阿里云百炼 API Key (兼容 OpenAI)
 */

import 'dotenv/config';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';

const BATCH_DIR = path.join(process.cwd(), 'data', 'batch');

async function testChatCompletion(client: OpenAI) {
    console.log('\n📝 测试 1: 实时推理接口 (Chat Completions)');
    console.log('─'.repeat(50));

    try {
        const response = await client.chat.completions.create({
            model: 'qwen-plus',
            messages: [
                { role: 'system', content: 'You are a helpful assistant.' },
                { role: 'user', content: '请用一句话介绍周杰伦的音乐风格' }
            ],
            max_tokens: 100
        });

        const content = response.choices[0]?.message?.content || '(无响应)';
        console.log(`✅ 成功！响应内容:`);
        console.log(`   ${content}`);
        console.log(`   Token 使用: ${response.usage?.total_tokens || 'N/A'}`);
        return true;
    } catch (error: any) {
        console.log(`❌ 失败: ${error.message}`);
        if (error.status === 401) {
            console.log('   提示: API Key 无效或未配置正确');
        }
        return false;
    }
}

async function testFileUpload(client: OpenAI) {
    console.log('\n📤 测试 2: 文件上传接口 (Files API)');
    console.log('─'.repeat(50));

    // 创建临时测试文件
    const testFile = path.join(BATCH_DIR, 'test_upload.jsonl');

    // 确保目录存在
    if (!fs.existsSync(BATCH_DIR)) {
        fs.mkdirSync(BATCH_DIR, { recursive: true });
    }

    // 写入测试数据
    const testData = {
        custom_id: 'test-001',
        method: 'POST',
        url: '/v1/chat/completions',
        body: {
            model: 'qwen-plus',
            messages: [
                { role: 'user', content: '测试' }
            ]
        }
    };
    fs.writeFileSync(testFile, JSON.stringify(testData) + '\n', 'utf-8');

    try {
        const file = await client.files.create({
            file: fs.createReadStream(testFile),
            purpose: 'batch'
        });

        console.log(`✅ 文件上传成功!`);
        console.log(`   File ID: ${file.id}`);
        console.log(`   文件名: ${file.filename}`);
        console.log(`   大小: ${file.bytes} bytes`);

        // 清理测试文件
        fs.unlinkSync(testFile);

        return file.id;
    } catch (error: any) {
        console.log(`❌ 失败: ${error.message}`);
        // 清理测试文件
        if (fs.existsSync(testFile)) fs.unlinkSync(testFile);
        return null;
    }
}

async function testBatchCreate(client: OpenAI, fileId: string) {
    console.log('\n🚀 测试 3: Batch 任务创建');
    console.log('─'.repeat(50));

    try {
        const batch = await client.batches.create({
            input_file_id: fileId,
            endpoint: '/v1/chat/completions',
            completion_window: '24h'
        });

        console.log(`✅ Batch 任务创建成功!`);
        console.log(`   Batch ID: ${batch.id}`);
        console.log(`   状态: ${batch.status}`);
        console.log(`   创建时间: ${new Date(batch.created_at * 1000).toLocaleString()}`);

        // 可选：取消测试任务以避免浪费资源
        console.log('\n   ⚠️ 正在取消测试任务...');
        try {
            await client.batches.cancel(batch.id);
            console.log('   ✅ 测试任务已取消');
        } catch (e: any) {
            console.log(`   ℹ️ 无法取消任务 (可能已完成): ${e.message}`);
        }

        return true;
    } catch (error: any) {
        console.log(`❌ 失败: ${error.message}`);
        return false;
    }
}

async function listExistingBatches(client: OpenAI) {
    console.log('\n📋 测试 4: 查询现有 Batch 任务');
    console.log('─'.repeat(50));

    try {
        const batches = await client.batches.list({ limit: 5 });

        if (batches.data.length === 0) {
            console.log('   (暂无 Batch 任务)');
        } else {
            console.log(`   找到 ${batches.data.length} 个任务:`);
            for (const batch of batches.data) {
                const statusEmoji = {
                    'validating': '🔄',
                    'in_progress': '⏳',
                    'finalizing': '📦',
                    'completed': '✅',
                    'failed': '❌',
                    'expired': '⏰',
                    'cancelling': '🚫',
                    'cancelled': '🚫'
                }[batch.status] || '❓';
                console.log(`   ${statusEmoji} ${batch.id} - ${batch.status}`);
            }
        }
        return true;
    } catch (error: any) {
        console.log(`❌ 失败: ${error.message}`);
        return false;
    }
}

async function main() {
    console.log('═'.repeat(50));
    console.log('🧪 阿里云百炼 API 连通性测试');
    console.log('═'.repeat(50));

    // 检查 API Key
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        console.error('\n❌ 错误: 请设置环境变量 OPENAI_API_KEY');
        console.error('   在 .env 文件中添加: OPENAI_API_KEY=sk-xxx');
        process.exit(1);
    }

    console.log(`\n🔑 使用 API Key: ${apiKey.substring(0, 10)}...${apiKey.substring(apiKey.length - 4)}`);
    console.log(`🌐 Endpoint: https://dashscope.aliyuncs.com/compatible-mode/v1`);

    const client = new OpenAI({
        apiKey,
        baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1'
    });

    // 运行测试
    const results = {
        chat: await testChatCompletion(client),
        file: await testFileUpload(client),
        batch: false,
        list: false
    };

    // 如果文件上传成功，测试 Batch 创建
    if (results.file) {
        results.batch = await testBatchCreate(client, results.file as unknown as string);
    }

    // 测试查询现有任务
    results.list = await listExistingBatches(client);

    // 汇总
    console.log('\n' + '═'.repeat(50));
    console.log('📊 测试结果汇总');
    console.log('═'.repeat(50));
    console.log(`   实时推理: ${results.chat ? '✅ 通过' : '❌ 失败'}`);
    console.log(`   文件上传: ${results.file ? '✅ 通过' : '❌ 失败'}`);
    console.log(`   Batch创建: ${results.batch ? '✅ 通过' : '❌ 失败'}`);
    console.log(`   任务查询: ${results.list ? '✅ 通过' : '❌ 失败'}`);

    const allPassed = results.chat && results.file && results.batch && results.list;
    if (allPassed) {
        console.log('\n🎉 所有测试通过! 可以开始使用 Batch API 了');
        console.log(`
下一步:
  1. npm run batch:export          # 导出全量数据
  2. npm run batch:submit -- --all # 提交批处理任务
  3. npm run batch:status          # 查看任务状态
  4. npm run batch:import -- --import  # 导入结果
        `);
    } else {
        console.log('\n⚠️ 部分测试失败，请检查 API Key 和网络连接');
    }
}

main().catch(console.error);
