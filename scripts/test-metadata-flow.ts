/**
 * 测试脚本：验证元数据生成和向量嵌入完整流程
 * 
 * 功能：
 * 1. 从数据库获取 20 条待处理歌曲
 * 2. 调用 QwenService 生成元数据
 * 3. 调用 EmbeddingService 生成向量
 * 4. 将 Prompt 和生成结果写入文件供审核
 */

import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load environment
dotenv.config({ path: path.join(__dirname, '../.env') });

import { db, initDB, metadataRepo } from '../src/db';
import { AIFactory } from '../src/services/ai/AIFactory';
import { EmbeddingService } from '../src/services/ai/EmbeddingService';
import { METADATA_SYSTEM_PROMPT } from '../src/services/ai/systemPrompt';

const OUTPUT_FILE = path.join(__dirname, 'test-output.md');
const TEST_LIMIT = 20;

async function main() {
    console.log('=== 元数据生成测试脚本 ===\n');

    // 1. 初始化数据库
    initDB();
    console.log('[1/5] 数据库初始化完成');

    // 2. 获取待处理歌曲
    const songs = metadataRepo.getPendingSongs(TEST_LIMIT);
    console.log(`[2/5] 获取到 ${songs.length} 首待处理歌曲`);

    if (songs.length === 0) {
        console.log('没有待处理的歌曲，退出');
        return;
    }

    // 准备输出内容
    const outputLines: string[] = [];
    outputLines.push('# 元数据生成测试报告\n');
    outputLines.push(`生成时间: ${new Date().toISOString()}\n`);
    outputLines.push(`测试歌曲数: ${songs.length}\n\n`);

    // 3. 记录 System Prompt
    outputLines.push('## System Prompt\n');
    outputLines.push('```xml');
    outputLines.push(METADATA_SYSTEM_PROMPT);
    outputLines.push('```\n\n');

    // 4. 调用 AI 服务生成元数据
    console.log('[3/5] 开始生成元数据...');
    const aiService = AIFactory.getService();

    const userPrompt = JSON.stringify(songs.map((s, i) => ({
        id: i + 1,
        title: s.title,
        artist: s.artist
    })));

    outputLines.push('## User Prompt (输入)\n');
    outputLines.push('```json');
    outputLines.push(userPrompt);
    outputLines.push('```\n\n');

    let metadataResults: any[] = [];
    try {
        metadataResults = await aiService.generateBatchMetadata(
            songs.map((s, i) => ({ id: i + 1, title: s.title, artist: s.artist }))
        );
        console.log(`[3/5] 元数据生成成功，返回 ${metadataResults.length} 条结果`);
    } catch (error: any) {
        console.error('[3/5] 元数据生成失败:', error.message);
        outputLines.push('## 错误\n');
        outputLines.push(`元数据生成失败: ${error.message}\n`);
        fs.writeFileSync(OUTPUT_FILE, outputLines.join('\n'), 'utf-8');
        return;
    }

    outputLines.push('## AI 生成结果 (元数据)\n');
    outputLines.push('```json');
    outputLines.push(JSON.stringify(metadataResults, null, 2));
    outputLines.push('```\n\n');

    // 5. 调用 Embedding 服务生成向量
    console.log('[4/5] 开始生成向量嵌入...');
    const embeddingService = new EmbeddingService();

    outputLines.push('## 向量嵌入结果\n');
    outputLines.push('| # | 歌曲 | 向量维度 | 前5个值 |\n');
    outputLines.push('|---|---|---|---|\n');

    let successCount = 0;
    for (let i = 0; i < Math.min(metadataResults.length, songs.length); i++) {
        const song = songs[i];
        const meta = metadataResults[i];

        try {
            // 构建向量文本
            const vectorText = EmbeddingService.constructVectorText(meta, {
                title: song.title,
                artist: song.artist
            });

            // 生成向量
            const vector = await embeddingService.embed(vectorText);

            const preview = vector.slice(0, 5).map(v => v.toFixed(4)).join(', ');
            outputLines.push(`| ${i + 1} | ${song.title} - ${song.artist} | ${vector.length} | [${preview}...] |\n`);
            successCount++;
        } catch (error: any) {
            outputLines.push(`| ${i + 1} | ${song.title} - ${song.artist} | ❌ 失败 | ${error.message} |\n`);
        }
    }

    console.log(`[4/5] 向量生成完成，成功 ${successCount}/${metadataResults.length}`);

    // 6. 写入文件
    outputLines.push('\n## 测试总结\n');
    outputLines.push(`- 元数据生成: ${metadataResults.length}/${songs.length} 成功\n`);
    outputLines.push(`- 向量嵌入: ${successCount}/${metadataResults.length} 成功\n`);
    outputLines.push(`- 向量维度: 1024\n`);

    fs.writeFileSync(OUTPUT_FILE, outputLines.join('\n'), 'utf-8');
    console.log(`[5/5] 测试报告已写入: ${OUTPUT_FILE}`);

    console.log('\n=== 测试完成 ===');
}

main().catch(console.error);
