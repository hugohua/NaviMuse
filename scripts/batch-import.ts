/**
 * 批量导入脚本 - 查询任务状态并导入结果到数据库
 * 
 * 使用方式:
 *   npx tsx scripts/batch-import.ts --status     # 查看所有任务状态
 *   npx tsx scripts/batch-import.ts --import     # 导入已完成的任务结果
 *   npx tsx scripts/batch-import.ts --batch-id <id>  # 导入指定任务
 * 
 * 环境变量:
 *   DASHSCOPE_API_KEY - 阿里云百炼 API Key
 */

import 'dotenv/config';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { initDB, metadataRepo, db } from '../src/db';
import { parseAIResponse } from '../src/services/ai/systemPrompt';

const BATCH_DIR = path.join(process.cwd(), 'data', 'batch');
const JOBS_FILE = path.join(BATCH_DIR, 'batch_jobs.json');

interface BatchJob {
    id: string;
    file: string;
    status: string;
    created: string;
    output_file_id?: string;
    imported?: boolean;
}

interface JobsStore {
    jobs: BatchJob[];
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

async function checkStatus(client: OpenAI, store: JobsStore) {
    console.log('[Batch Status] 正在查询任务状态...\n');

    for (const job of store.jobs) {
        try {
            const batch = await client.batches.retrieve(job.id);
            job.status = batch.status;
            if (batch.output_file_id) {
                job.output_file_id = batch.output_file_id;
            }

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

            console.log(`${statusEmoji} ${job.file}: ${batch.status}`);
            if (batch.request_counts) {
                console.log(`   完成: ${batch.request_counts.completed}/${batch.request_counts.total}`);
            }
        } catch (error: any) {
            console.log(`❌ ${job.file}: 查询失败 - ${error.message}`);
        }
    }

    saveJobs(store);
    console.log('\n状态已更新到 batch_jobs.json');
}

async function importResults(client: OpenAI, store: JobsStore, targetBatchId?: string) {
    console.log('[Batch Import] 初始化数据库...');
    initDB();

    const jobsToImport = store.jobs.filter(job => {
        if (targetBatchId) {
            return job.id === targetBatchId;
        }
        return job.status === 'completed' && !job.imported && job.output_file_id;
    });

    if (jobsToImport.length === 0) {
        console.log('📋 没有待导入的任务');
        return;
    }

    console.log(`[Batch Import] 发现 ${jobsToImport.length} 个待导入任务`);

    for (const job of jobsToImport) {
        console.log(`\n[Batch Import] 处理任务: ${job.id} (${job.file})`);

        try {
            // 获取最新状态
            const batch = await client.batches.retrieve(job.id);
            if (batch.status !== 'completed' || !batch.output_file_id) {
                console.log(`   ⏳ 任务未完成，跳过`);
                continue;
            }

            // 下载结果文件
            console.log(`   📥 下载结果文件: ${batch.output_file_id}`);
            const response = await client.files.content(batch.output_file_id);
            const content = await response.text();

            // 保存原始结果文件 (用于调试)
            const resultFile = path.join(BATCH_DIR, `result_${job.file}`);
            fs.writeFileSync(resultFile, content, 'utf-8');
            console.log(`   💾 结果已保存: result_${job.file}`);

            // 加载 batch 到歌曲 ID 的映射
            const mappingFile = path.join(BATCH_DIR, 'batch_mapping.json');
            let batchMapping: Record<string, string[]> = {};
            if (fs.existsSync(mappingFile)) {
                batchMapping = JSON.parse(fs.readFileSync(mappingFile, 'utf-8'));
            } else {
                console.log(`   ⚠️ 找不到 batch_mapping.json，将使用 AI 返回的 ID`);
            }

            // 解析并导入
            const lines = content.trim().split('\n').filter(Boolean);
            let successCount = 0;
            let errorCount = 0;

            const updateMeta = db.prepare(`
                UPDATE smart_metadata SET
                    description = @description,
                    tags = @tags,
                    mood = @mood,
                    is_instrumental = @is_instrumental,
                    analysis_json = @analysis_json,
                    energy_level = @energy_level,
                    visual_popularity = @visual_popularity,
                    language = @language,
                    spectrum = @spectrum,
                    spatial = @spatial,
                    scene_tag = @scene_tag,
                    tempo_vibe = @tempo_vibe,
                    timbre_texture = @timbre_texture,
                    llm = @llm,
                    last_analyzed = @last_analyzed,
                    processing_status = 'COMPLETED'
                WHERE navidrome_id = @navidrome_id
            `);

            const transaction = db.transaction(() => {
                for (const line of lines) {
                    try {
                        const result = JSON.parse(line);
                        const customId = result.custom_id; // e.g. "batch_0"

                        if (result.error) {
                            console.log(`   ⚠️ ${customId}: ${result.error.message}`);
                            errorCount++;
                            continue;
                        }

                        const aiContent = result.response?.body?.choices?.[0]?.message?.content;
                        if (!aiContent) {
                            console.log(`   ⚠️ ${customId}: 无 AI 响应内容`);
                            errorCount++;
                            continue;
                        }

                        // 解析 AI 返回的 JSON (现在是数组)
                        let cleaned = aiContent.replace(/```json/g, '').replace(/```/g, '').trim();
                        let metadataArray: any[];

                        try {
                            const parsed = JSON.parse(cleaned);
                            metadataArray = Array.isArray(parsed) ? parsed : [parsed];
                        } catch (e) {
                            // 整体解析失败，尝试基于 `},{` 分割逐项解析与修复
                            // 这可以避免修复逻辑误伤合法的项目
                            // console.log(`   ℹ️ ${customId}: 整体解析失败，尝试逐项恢复...`);

                            const innerContent = cleaned.trim().replace(/^\[/, '').replace(/\]$/, '');
                            const chunks = innerContent.split('},{');

                            metadataArray = [];
                            let recoveryFailed = false;

                            for (let i = 0; i < chunks.length; i++) {
                                let chunk = chunks[i];
                                // 补全分割掉的大括号
                                if (i > 0) chunk = '{' + chunk;
                                if (i < chunks.length - 1) chunk = chunk + '}';

                                try {
                                    metadataArray.push(JSON.parse(chunk));
                                } catch (chunkError) {
                                    // 尝试修复单个项目
                                    let fixedChunk = chunk;

                                    // 1. vector_anchor 字符串修复
                                    fixedChunk = fixedChunk.replace(/"vector_anchor":\s*"((?:[^"\\]|\\.)*)"\s*}\s*,\s*"embedding_tags"/g,
                                        '"vector_anchor":{"acoustic_model":"$1"},"embedding_tags"');

                                    // 2. Oracle 修复 (移除 vector_anchor/cultural_weight 后多余的闭包)
                                    fixedChunk = fixedChunk.replace(/}\s*,\s*"embedding_tags"\s*:/g, ',"embedding_tags":');

                                    // 3. scene_tag ] 修复
                                    fixedChunk = fixedChunk.replace(/"scene_tag"\s*:\s*"((?:[^"\\]|\\.)*)"\s*\]/g,
                                        '"scene_tag":"$1"}');

                                    try {
                                        metadataArray.push(JSON.parse(fixedChunk));
                                    } catch (finalError) {
                                        console.log(`   ⚠️ ${customId}: 项目 ${i} 解析失败`);
                                        recoveryFailed = true;
                                        break;
                                    }
                                }
                            }

                            if (recoveryFailed) {
                                errorCount++;
                                continue;
                            }
                        }

                        // 获取对应的歌曲 ID 列表
                        const songIds = batchMapping[customId] || metadataArray.map(m => m.id);

                        for (let i = 0; i < metadataArray.length; i++) {
                            const metadata = metadataArray[i];
                            // 优先使用 mapping 中的 ID，否则使用 AI 返回的 ID
                            const songId = songIds[i] || String(metadata.id);

                            if (!songId) {
                                console.log(`   ⚠️ ${customId}[${i}]: 无法确定歌曲 ID`);
                                errorCount++;
                                continue;
                            }

                            // 提取字段
                            const acoustic = metadata.vector_anchor?.acoustic_model || "";
                            const semantic = metadata.vector_anchor?.semantic_push || "";
                            const description = `${acoustic}\n\n[Imagery] ${semantic}`;

                            const tags = [
                                ...(metadata.embedding_tags?.mood_coord || []),
                                ...(metadata.embedding_tags?.objects || [])
                            ];
                            if (metadata.embedding_tags?.scene_tag) tags.push(metadata.embedding_tags.scene_tag);
                            if (metadata.embedding_tags?.spectrum) tags.push(`#Spectrum:${metadata.embedding_tags.spectrum}`);

                            // 写入数据库
                            updateMeta.run({
                                navidrome_id: songId,
                                description: description,
                                tags: JSON.stringify(tags),
                                mood: (metadata.embedding_tags?.mood_coord || [])[0] || "Unknown",
                                is_instrumental: metadata.is_instrumental ? 1 : 0,
                                analysis_json: JSON.stringify(metadata),
                                energy_level: metadata.embedding_tags?.energy,
                                visual_popularity: metadata.popularity_raw,
                                language: metadata.language,
                                spectrum: metadata.embedding_tags?.spectrum,
                                spatial: metadata.embedding_tags?.spatial,
                                scene_tag: metadata.embedding_tags?.scene_tag,
                                tempo_vibe: metadata.embedding_tags?.tempo_vibe,
                                timbre_texture: metadata.embedding_tags?.timbre_texture,
                                llm: 'qwen-plus',
                                last_analyzed: new Date().toISOString()
                            });

                            successCount++;
                        }
                    } catch (parseError: any) {
                        console.log(`   ⚠️ 解析错误: ${parseError.message}`);
                        errorCount++;
                    }
                }
            });

            transaction();

            console.log(`   ✅ 导入完成: ${successCount} 成功, ${errorCount} 失败`);

            // 标记为已导入
            job.imported = true;
            saveJobs(store);

        } catch (error: any) {
            console.error(`   ❌ 导入失败: ${error.message}`);
        }
    }

    console.log('\n========================================');
    console.log('✅ 导入完成！');
    console.log('');
    console.log('下一步 - 生成向量:');
    console.log('  npx tsx scripts/batch-embeddings.ts');
    console.log('========================================');
}

async function main() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        console.error('❌ 错误: 请设置环境变量 OPENAI_API_KEY');
        process.exit(1);
    }

    const client = new OpenAI({
        apiKey,
        baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1'
    });

    const args = process.argv.slice(2);
    const store = loadJobs();

    if (args.includes('--status')) {
        await checkStatus(client, store);
    } else if (args.includes('--import')) {
        await importResults(client, store);
    } else if (args.includes('--batch-id')) {
        const batchIdIndex = args.indexOf('--batch-id');
        const batchId = args[batchIdIndex + 1];
        await importResults(client, store, batchId);
    } else {
        console.log(`
使用方式:
  npx tsx scripts/batch-import.ts --status      # 查看所有任务状态
  npx tsx scripts/batch-import.ts --import      # 导入已完成的任务结果
  npx tsx scripts/batch-import.ts --batch-id <id>  # 导入指定任务

工作流程:
  1. 先用 --status 查看任务状态
  2. 任务完成后用 --import 导入结果
        `);
    }
}

main().catch(console.error);
