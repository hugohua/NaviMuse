/**
 * 批量生成向量脚本
 * 
 * 遍历 smart_metadata 中 processing_status='COMPLETED' 但 embedding_status='PENDING' (或 NULL) 的歌曲
 * 使用 EmbeddingService 生成向量并写入 vec_songs 表
 * 
 * 使用方式:
 *   npx tsx scripts/batch-embeddings.ts [--limit N]
 */

import 'dotenv/config';
import { initDB, metadataRepo, db } from '../src/db';
import { EmbeddingService } from '../src/services/ai/EmbeddingService';
import { parseAIResponse } from '../src/services/ai/systemPrompt';

// 配置
const BATCH_SIZE = 10; // DashScope limit is 10
const DELAY_MS = 100; // 请求间隔，避免速率限制

async function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    console.log('═'.repeat(60));
    console.log('🧠 批量生成向量 (Batch Embeddings)');
    console.log('═'.repeat(60));

    // 1. 初始化
    initDB();
    const embeddingService = new EmbeddingService();

    // 解析参数
    const args = process.argv.slice(2);
    const limitIndex = args.indexOf('--limit');
    let limit = limitIndex !== -1 ? parseInt(args[limitIndex + 1]) : 0; // 0 表示无限

    // 2. 循环处理
    let processedCount = 0;
    let errorCount = 0;
    let hasMore = true;

    while (hasMore) {
        if (limit > 0 && processedCount >= limit) break;

        // 获取待处理歌曲 (每次取 BATCH_SIZE)
        const pendingSongs = metadataRepo.getPendingEmbeddings(BATCH_SIZE);

        if (pendingSongs.length === 0) {
            hasMore = false;
            break;
        }

        console.log(`\n📥 处理批次: ${pendingSongs.length} 首`);

        const textsToEmbed: string[] = [];
        const songsToUpdate: any[] = [];

        // 3. 构建向量文本
        for (const song of pendingSongs) {
            try {
                let metadata: any;
                // 尝试解析 analysis_json
                if (song.analysis_json) {
                    metadata = JSON.parse(song.analysis_json);
                } else {
                    console.log(`   ⚠️ 跳过 ${song.title}: 缺少 analysis_json`);
                    metadataRepo.updateEmbeddingStatus(song.navidrome_id, 'FAILED');
                    errorCount++;
                    continue;
                }

                const vectorText = EmbeddingService.constructVectorText(metadata, {
                    title: song.title,
                    artist: song.artist
                });

                textsToEmbed.push(vectorText);
                songsToUpdate.push({
                    id: song.navidrome_id,
                    rowId: metadataRepo.getSongRowId(song.navidrome_id)
                });

            } catch (error: any) {
                console.log(`   ⚠️ 跳过 ${song.title}: 数据解析错误 - ${error.message}`);
                metadataRepo.updateEmbeddingStatus(song.navidrome_id, 'FAILED');
                errorCount++;
            }
        }

        if (textsToEmbed.length === 0) continue;

        // 4. 调用 AI 生成向量
        try {
            console.log(`   🧠 生成向量中... (${textsToEmbed.length} 条)`);
            const vectors = await embeddingService.embedBatch(textsToEmbed);

            if (vectors.length !== textsToEmbed.length) {
                throw new Error(`向量数量不匹配: 期望 ${textsToEmbed.length}, 实际 ${vectors.length}`);
            }

            // 5. 保存结果
            const transaction = db.transaction(() => {
                for (let i = 0; i < vectors.length; i++) {
                    const song = songsToUpdate[i];
                    const vector = vectors[i];

                    if (song.rowId) {
                        metadataRepo.saveVector(song.rowId, vector);
                        metadataRepo.updateEmbeddingStatus(song.id, 'COMPLETED');
                    } else {
                        console.log(`   ⚠️ 找不到 rowId: ${song.id}`);
                    }
                }
            });
            transaction();

            processedCount += vectors.length;
            console.log(`   ✅ 已保存 ${vectors.length} 条向量 (累计: ${processedCount})`);

        } catch (error: any) {
            console.error(`   ❌ 批次失败: ${error.message}`);
            // 标记这批为失败? 或者只是跳过
            // 暂时不标记，允许重试
            errorCount += textsToEmbed.length;
            await sleep(2000); // 出错多停一会
        }

        await sleep(DELAY_MS);
    }

    console.log('\n' + '═'.repeat(60));
    console.log('🎉 向量生成完成!');
    console.log(`   成功: ${processedCount}`);
    console.log(`   失败/跳过: ${errorCount}`);
    console.log('═'.repeat(60));
}

main().catch(console.error);
