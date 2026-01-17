/**
 * 梳理数据库中元数据不完整或缺失的数据
 * 导出为符合 Alibaba Batch API 格式的 JSONL 文件 (使用 Prompt V6)
 */

import 'dotenv/config';
import { initDB, db } from '../src/db';
import fs from 'fs';
import path from 'path';
import { METADATA_SYSTEM_PROMPT } from '../src/services/ai/systemPrompt';

const BATCH_DIR = path.join(process.cwd(), 'data', 'batch');
const OUTPUT_FILE = path.join(BATCH_DIR, 'metadata_fix_batch_v6.jsonl');
const MAPPING_FILE = path.join(BATCH_DIR, 'metadata_fix_mapping_v6.json');
const SONGS_PER_REQUEST = 15;
const MODEL = process.env.OPENAI_MODEL || 'qwen-plus';

interface Song {
    navidrome_id: string;
    title: string;
    artist: string;
}

async function main() {
    console.log('[Export Fix] 初始化...');
    initDB();

    // 查询：1. 没有元数据的 2. 元数据不完整的
    const query = `
        SELECT navidrome_id, title, artist 
        FROM smart_metadata
        WHERE analysis_json IS NULL 
           OR (
               json_extract(analysis_json, '$.popularity_raw') IS NULL OR 
               json_extract(analysis_json, '$.embedding_tags.mood_coord') IS NULL OR
               json_extract(analysis_json, '$.embedding_tags.objects') IS NULL OR
               json_extract(analysis_json, '$.embedding_tags.scene_tag') IS NULL
           )
    `;

    const songs = db.prepare(query).all() as Song[];
    console.log(`[Export Fix] 发现 ${songs.length} 首需要重新生成的歌曲`);

    if (songs.length === 0) {
        console.log('✅ 所有歌曲元数据均完整');
        return;
    }

    // 分批处理
    const requests: any[] = [];
    const mapping: Record<string, string[]> = {};
    let requestCount = 0;

    for (let i = 0; i < songs.length; i += SONGS_PER_REQUEST) {
        const chunk = songs.slice(i, i + SONGS_PER_REQUEST);
        const customId = `fix_v6_batch_${requestCount}`;

        const inputData = chunk.map(s => ({
            id: s.navidrome_id,
            title: s.title,
            artist: s.artist
        }));

        const request = {
            custom_id: customId,
            method: "POST",
            url: "/v1/chat/completions",
            body: {
                model: MODEL,
                messages: [
                    { role: "system", content: METADATA_SYSTEM_PROMPT },
                    { role: "user", content: JSON.stringify(inputData) }
                ],
                temperature: 0.5
            }
        };

        requests.push(JSON.stringify(request));
        mapping[customId] = chunk.map(s => s.navidrome_id);
        requestCount++;
    }

    // 写入 JSONL
    fs.writeFileSync(OUTPUT_FILE, requests.join('\n') + '\n', 'utf-8');
    // 写入映射
    fs.writeFileSync(MAPPING_FILE, JSON.stringify(mapping, null, 2), 'utf-8');

    const fileSizeMB = (fs.statSync(OUTPUT_FILE).size / 1024 / 1024).toFixed(2);

    console.log('\n========================================');
    console.log(`✅ 导出完成！`);
    console.log(`   歌曲总数: ${songs.length}`);
    console.log(`   批量请求: ${requestCount}`);
    console.log(`   文件大小: ${fileSizeMB} MB`);
    console.log(`   输出文件: ${path.basename(OUTPUT_FILE)}`);
    console.log(`   映射文件: ${path.basename(MAPPING_FILE)}`);
    console.log('========================================');
}

main().catch(console.error);
