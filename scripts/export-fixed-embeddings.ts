/**
 * 导出修复后的 10,290 首歌曲用于重新向量化
 * 使用之前保存的问题数据 ID 列表
 */

import { initDB, db } from '../src/db';
import { EmbeddingService } from '../src/services/ai/EmbeddingService';
import fs from 'fs';
import path from 'path';

const BATCH_DIR = path.join(process.cwd(), 'data', 'batch');
const ID_LIST_FILE = path.join(BATCH_DIR, 'malformed_vector_anchor_ids.txt');
const OUTPUT_FILE = 'embedding_fixed_001.jsonl';
const MAPPING_FILE = 'embedding_fixed_mapping.json';
const MODEL = process.env.EMBEDDING_MODEL || 'text-embedding-v3';
const DIMENSIONS = parseInt(process.env.EMBEDDING_DIMENSIONS || '1024', 10);

interface SongWithMetadata {
    navidrome_id: string;
    title: string;
    artist: string;
    analysis_json: string | null;
}

function buildEmbeddingLine(songId: string, text: string): string {
    const request = {
        custom_id: `emb_fix_${songId}`,
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
    console.log('[Export Fixed] 初始化...');
    initDB();

    // 读取需要重新导出的 ID 列表
    if (!fs.existsSync(ID_LIST_FILE)) {
        console.error(`❌ 找不到 ID 列表文件: ${ID_LIST_FILE}`);
        process.exit(1);
    }

    const ids = fs.readFileSync(ID_LIST_FILE, 'utf-8')
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 0);

    console.log(`[Export Fixed] 读取到 ${ids.length} 个需要重新导出的 ID`);

    // 分批查询 (SQLite 变量限制)
    const CHUNK_SIZE = 900;
    const allSongs: SongWithMetadata[] = [];

    for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
        const chunkIds = ids.slice(i, i + CHUNK_SIZE);
        const placeholders = chunkIds.map(() => '?').join(',');
        const query = `
            SELECT navidrome_id, title, artist, analysis_json
            FROM smart_metadata
            WHERE navidrome_id IN (${placeholders})
        `;
        const result = db.prepare(query).all(...chunkIds) as SongWithMetadata[];
        allSongs.push(...result);
    }

    console.log(`[Export Fixed] 从数据库检索到 ${allSongs.length} 首歌曲`);

    // 构建向量请求
    const requests: string[] = [];
    const mapping: Record<string, string> = {};
    let skipped = 0;

    for (const song of allSongs) {
        if (!song.analysis_json) {
            skipped++;
            continue;
        }

        try {
            const metadata = JSON.parse(song.analysis_json);
            const vectorText = EmbeddingService.constructVectorText(metadata, {
                title: song.title,
                artist: song.artist,
            });

            const customId = `emb_fix_${song.navidrome_id}`;
            requests.push(buildEmbeddingLine(song.navidrome_id, vectorText));
            mapping[customId] = song.navidrome_id;
        } catch (e) {
            console.warn(`⚠️ ${song.navidrome_id}: 构造向量文本失败`);
            skipped++;
        }
    }

    console.log(`[Export Fixed] 成功构造 ${requests.length} 条请求 (跳过 ${skipped} 条)`);

    // 写入文件
    const outputPath = path.join(BATCH_DIR, OUTPUT_FILE);
    fs.writeFileSync(outputPath, requests.join('\n') + '\n', 'utf-8');

    const mappingPath = path.join(BATCH_DIR, MAPPING_FILE);
    fs.writeFileSync(mappingPath, JSON.stringify(mapping, null, 2), 'utf-8');

    const stats = fs.statSync(outputPath);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(2);

    console.log('');
    console.log('========================================');
    console.log(`✅ 导出完成！`);
    console.log(`   请求数量: ${requests.length}`);
    console.log(`   文件大小: ${sizeMB} MB`);
    console.log(`   输出文件: ${OUTPUT_FILE}`);
    console.log(`   映射文件: ${MAPPING_FILE}`);
    console.log(`📁 位置: ${BATCH_DIR}`);
    console.log('========================================');
}

main().catch(console.error);
