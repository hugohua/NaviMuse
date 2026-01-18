/**
 * 批量向量化导出脚本 - 将已有元数据的歌曲导出为阿里云 Batch Embedding 格式
 * 
 * 使用方式:
 *   npx tsx scripts/embedding-export.ts [--limit N]
 * 
 * 输出:
 *   data/batch/embedding_001.jsonl, ...
 *   data/batch/embedding_mapping.json
 */

import { initDB, db } from '../src/db';
import { EmbeddingService } from '../src/services/ai/EmbeddingService';
import fs from 'fs';
import path from 'path';

// 配置
const BATCH_DIR = path.join(process.cwd(), 'data', 'batch');
const TEXTS_PER_FILE = 10000; // 每个文件最多 10000 条 (阿里云限制)
const MODEL = process.env.EMBEDDING_MODEL || 'text-embedding-v3';
const DIMENSIONS = parseInt(process.env.EMBEDDING_DIMENSIONS || '1024', 10);

interface SongWithMetadata {
    navidrome_id: string;
    title: string;
    artist: string;
    analysis_json: string | null;
}

/**
 * 构造 OpenAI Batch Embedding API 兼容的请求行
 * @see https://help.aliyun.com/zh/model-studio/developer-reference/batch-inference
 */
function buildEmbeddingLine(songId: string, text: string, index: number): string {
    const request = {
        custom_id: `emb_${songId}`, // 使用歌曲ID作为标识
        method: "POST",
        url: "/v1/embeddings",
        body: {
            model: MODEL,
            input: text,
            dimensions: DIMENSIONS,
        }
    };
    return JSON.stringify(request);
}

async function main() {
    const args = process.argv.slice(2);
    const limitIndex = args.indexOf('--limit');
    const limit = limitIndex !== -1 ? parseInt(args[limitIndex + 1]) : undefined;

    console.log('[Embedding Export] 初始化数据库...');
    initDB();

    const incremental = args.includes('--incremental');

    // 查询已有元数据的歌曲 (analysis_json 不为空)
    // Note: 我们导出所有有元数据的歌曲
    // 如果开启 --incremental，则排除 vec_songs 中已存在的 (通过 rowid 关联)
    let query = `
        SELECT 
            s.navidrome_id, 
            s.title, 
            s.artist,
            s.analysis_json
        FROM smart_metadata s
        WHERE s.analysis_json IS NOT NULL
    `;

    if (incremental) {
        console.log('[Embedding Export] 增量模式: 正在排除已在向量表中的歌曲...');
        query += ` AND NOT EXISTS (SELECT 1 FROM vec_songs v WHERE v.song_id = s.rowid) `;
    }

    if (limit) {
        query += ` LIMIT ${limit}`;
    }

    const songs = db.prepare(query).all() as SongWithMetadata[];
    console.log(`[Embedding Export] 找到 ${songs.length} 首待向量化歌曲`);

    if (songs.length === 0) {
        console.log('[Embedding Export] 没有待处理的歌曲，退出');
        return;
    }

    // 确保输出目录存在
    if (!fs.existsSync(BATCH_DIR)) {
        fs.mkdirSync(BATCH_DIR, { recursive: true });
    }

    // 构建向量文本并生成请求
    const requests: { songId: string, text: string }[] = [];
    const mapping: Record<string, string> = {}; // custom_id -> navidrome_id

    for (const song of songs) {
        try {
            // 解析 analysis_json JSON
            const metadata = JSON.parse(song.analysis_json!);

            // 构造向量文本
            const vectorText = EmbeddingService.constructVectorText(metadata, {
                title: song.title,
                artist: song.artist,
            });

            const customId = `emb_${song.navidrome_id}`;
            requests.push({
                songId: song.navidrome_id,
                text: vectorText
            });
            mapping[customId] = song.navidrome_id;
        } catch (e) {
            console.warn(`⚠️ ${song.navidrome_id}: 无法构造向量文本，跳过`);
        }
    }

    console.log(`[Embedding Export] 成功构造 ${requests.length} 条向量化请求`);

    // 保存映射文件
    const mappingFile = path.join(BATCH_DIR, 'embedding_mapping.json');
    fs.writeFileSync(mappingFile, JSON.stringify(mapping, null, 2), 'utf-8');
    console.log(`[Embedding Export] 保存 ID 映射: embedding_mapping.json`);

    // 分文件写入
    let fileIndex = 1;
    let totalRequests = 0;

    for (let i = 0; i < requests.length; i += TEXTS_PER_FILE) {
        const chunk = requests.slice(i, i + TEXTS_PER_FILE);
        const fileName = `embedding_${String(fileIndex).padStart(3, '0')}.jsonl`;
        const filePath = path.join(BATCH_DIR, fileName);

        const lines = chunk.map((req, idx) => buildEmbeddingLine(req.songId, req.text, i + idx));
        fs.writeFileSync(filePath, lines.join('\n') + '\n', 'utf-8');

        console.log(`[Embedding Export] 写入 ${fileName} (${chunk.length} 条)`);
        totalRequests += chunk.length;
        fileIndex++;
    }

    console.log('');
    console.log('========================================');
    console.log(`✅ 导出完成！`);
    console.log(`   歌曲总数: ${totalRequests}`);
    console.log(`   文件数量: ${fileIndex - 1}`);
    console.log(`   模型: ${MODEL} (维度: ${DIMENSIONS})`);
    console.log(`📁 输出目录: ${BATCH_DIR}`);
    console.log('');
    console.log('下一步 - 提交向量化任务:');
    console.log('  npx tsx scripts/embedding-submit.ts --all');
    console.log('========================================');
}

main().catch(console.error);
