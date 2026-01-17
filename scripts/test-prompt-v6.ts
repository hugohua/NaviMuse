/**
 * 测试新 Prompt V6 生成质量
 * 随机选取 20 首没有元数据的歌曲，调用 Qwen 生成并分析结果
 */

import 'dotenv/config';
import { initDB, db } from '../src/db';
import { config } from '../src/config';
import OpenAI from 'openai';
import { METADATA_SYSTEM_PROMPT } from '../src/services/ai/systemPrompt';
import fs from 'fs';
import path from 'path';

interface TestSong {
    navidrome_id: string;
    title: string;
    artist: string;
}

async function main() {
    console.log('[Prompt Test] 初始化...');
    console.log(`[Prompt Test] 模型: ${config.ai.model}`);
    console.log(`[Prompt Test] 温度: ${config.ai.temperature}`);

    initDB();

    // 随机选取 3 首歌曲 (减少数量以避免超时)
    const songs = db.prepare(`
        SELECT navidrome_id, title, artist 
        FROM smart_metadata 
        WHERE analysis_json IS NULL
        ORDER BY RANDOM()
        LIMIT 3
    `).all() as TestSong[];

    console.log(`[Prompt Test] 选取了 ${songs.length} 首歌曲进行测试\n`);

    if (songs.length === 0) {
        console.log('没有待处理的歌曲');
        return;
    }

    // 构建测试请求
    const testInput = songs.map((s, i) => ({
        id: s.navidrome_id,
        title: s.title,
        artist: s.artist
    }));

    console.log('测试歌曲列表:');
    testInput.forEach((s, i) => {
        console.log(`  ${i + 1}. ${s.title} - ${s.artist}`);
    });
    console.log('');

    // 清除代理
    delete process.env.http_proxy;
    delete process.env.https_proxy;
    delete process.env.HTTP_PROXY;
    delete process.env.HTTPS_PROXY;

    const client = new OpenAI({
        apiKey: config.ai.apiKey,
        baseURL: config.ai.baseURL,
        timeout: 120000
    });

    console.log('[Prompt Test] 调用 Qwen API (Streaming)...\n');

    const startTime = Date.now();
    const stream = await client.chat.completions.create({
        model: config.ai.model,
        temperature: config.ai.temperature,
        messages: [
            { role: 'system', content: METADATA_SYSTEM_PROMPT },
            { role: 'user', content: JSON.stringify(testInput) }
        ],
        stream: true
    });

    let content = '';
    process.stdout.write('Generating: ');

    for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content || '';
        content += delta;
        process.stdout.write(delta); // 实时输出
    }

    console.log('\n\n');
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(`[Prompt Test] API 响应完成 (${elapsed}s)`);

    // 保存原始响应
    const outputDir = path.join(process.cwd(), 'data', 'batch');
    const rawFile = path.join(outputDir, 'test_prompt_v6_raw.txt');
    fs.writeFileSync(rawFile, content, 'utf-8');
    console.log(`[Prompt Test] 原始响应已保存: test_prompt_v6_raw.txt`);

    // 尝试解析
    console.log('\n========================================');
    console.log('分析结果:');
    console.log('========================================\n');

    // 清理 markdown 标记
    let cleaned = content.replace(/```json/g, '').replace(/```/g, '').trim();

    try {
        const parsed = JSON.parse(cleaned);
        const results = Array.isArray(parsed) ? parsed : [parsed];

        console.log(`✅ JSON 解析成功，共 ${results.length} 条记录\n`);

        // 分析每条记录的质量
        let issues = {
            flattenedVectorAnchor: 0,
            missingPopularityRaw: 0,
            missingMoodCoord: 0,
            missingObjects: 0,
            missingSceneTag: 0,
            emptyArrays: 0
        };

        results.forEach((item: any, idx: number) => {
            const problems: string[] = [];

            // 检查 vector_anchor 结构
            if (typeof item.vector_anchor === 'string') {
                problems.push('vector_anchor 被扁平化');
                issues.flattenedVectorAnchor++;
            } else if (!item.vector_anchor?.acoustic_model || !item.vector_anchor?.semantic_push) {
                problems.push('vector_anchor 子字段不完整');
            }

            // 检查 popularity_raw
            if (item.popularity_raw === undefined || item.popularity_raw === null) {
                problems.push('缺少 popularity_raw');
                issues.missingPopularityRaw++;
            }

            // 检查数组字段
            if (!item.embedding_tags?.mood_coord || item.embedding_tags.mood_coord.length === 0) {
                problems.push('mood_coord 空或缺失');
                issues.missingMoodCoord++;
            } else if (item.embedding_tags.mood_coord.length < 2) {
                problems.push('mood_coord 少于 2 项');
                issues.emptyArrays++;
            }

            if (!item.embedding_tags?.objects || item.embedding_tags.objects.length === 0) {
                problems.push('objects 空或缺失');
                issues.missingObjects++;
            } else if (item.embedding_tags.objects.length < 2) {
                problems.push('objects 少于 2 项');
                issues.emptyArrays++;
            }

            if (!item.embedding_tags?.scene_tag) {
                problems.push('缺少 scene_tag');
                issues.missingSceneTag++;
            }

            // 输出每条记录的状态
            const song = testInput.find(s => s.id === item.id);
            const status = problems.length === 0 ? '✅' : '⚠️';
            console.log(`${status} [${idx + 1}] ${song?.title || item.id}`);
            if (problems.length > 0) {
                problems.forEach(p => console.log(`      └─ ${p}`));
            }
        });

        // 汇总统计
        console.log('\n========================================');
        console.log('质量统计:');
        console.log('========================================');
        console.log(`总记录数: ${results.length}`);
        console.log(`vector_anchor 扁平化: ${issues.flattenedVectorAnchor} (${(issues.flattenedVectorAnchor / results.length * 100).toFixed(1)}%)`);
        console.log(`缺少 popularity_raw: ${issues.missingPopularityRaw} (${(issues.missingPopularityRaw / results.length * 100).toFixed(1)}%)`);
        console.log(`缺少/空 mood_coord: ${issues.missingMoodCoord}`);
        console.log(`缺少/空 objects: ${issues.missingObjects}`);
        console.log(`缺少 scene_tag: ${issues.missingSceneTag}`);

        const perfectCount = results.filter((item: any) => {
            return typeof item.vector_anchor === 'object' &&
                item.vector_anchor?.acoustic_model &&
                item.vector_anchor?.semantic_push &&
                item.vector_anchor?.cultural_weight &&
                item.popularity_raw !== undefined &&
                item.embedding_tags?.mood_coord?.length >= 2 &&
                item.embedding_tags?.objects?.length >= 2 &&
                item.embedding_tags?.scene_tag;
        }).length;

        console.log(`\n完美记录: ${perfectCount}/${results.length} (${(perfectCount / results.length * 100).toFixed(1)}%)`);

        // 保存解析后的结果
        const parsedFile = path.join(outputDir, 'test_prompt_v6_parsed.json');
        fs.writeFileSync(parsedFile, JSON.stringify(results, null, 2), 'utf-8');
        console.log(`\n解析结果已保存: test_prompt_v6_parsed.json`);

    } catch (e: any) {
        console.log(`❌ JSON 解析失败: ${e.message}`);
        console.log('\n原始内容前 500 字符:');
        console.log(cleaned.substring(0, 500));
    }
}

main().catch(console.error);
