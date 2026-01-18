/**
 * 数据库完整性分析脚本
 * 
 * 功能：
 * 1. 深度扫描 `smart_metadata` 表中的数据质量
 * 2. 识别缺失关键字段、格式错误（如 vector_anchor 扁平化）的记录
 * 3. 统计待处理（元数据或向量缺失）的数量
 * 
 * 用法：
 * npx ts-node --project tsconfig.server.json scripts/analyze-db-integrity.ts
 */

import { db, initDB } from '../src/db';
import { config } from '../src/config';
import fs from 'fs';

console.log('Analyzing Database Integrity...');
console.log(`DB Path: ${process.env.DB_PATH || 'default (data/navimuse.db)'}`);

// Helper to time queries
function timedQuery<T>(name: string, fn: () => T): T {
    console.log(`  [Query] ${name}...`);
    const start = Date.now();
    const result = fn();
    console.log(`  [Query] ${name} - ${Date.now() - start}ms`);
    return result;
}

// Basic Counts
const totalSongs = timedQuery('Total Songs', () =>
    (db.prepare('SELECT COUNT(*) as c FROM smart_metadata').get() as any).c);

const analyzed = timedQuery('Analyzed', () =>
    (db.prepare('SELECT COUNT(*) as c FROM smart_metadata WHERE last_analyzed IS NOT NULL').get() as any).c);

const pending = timedQuery('PENDING status', () =>
    (db.prepare("SELECT COUNT(*) as c FROM smart_metadata WHERE processing_status = 'PENDING'").get() as any).c);

const processing = timedQuery('PROCESSING status', () =>
    (db.prepare("SELECT COUNT(*) as c FROM smart_metadata WHERE processing_status = 'PROCESSING'").get() as any).c);

const completed = timedQuery('COMPLETED status', () =>
    (db.prepare("SELECT COUNT(*) as c FROM smart_metadata WHERE processing_status = 'COMPLETED'").get() as any).c);

const failed = timedQuery('FAILED status', () =>
    (db.prepare("SELECT COUNT(*) as c FROM smart_metadata WHERE processing_status = 'FAILED'").get() as any).c);

const embeddingPending = timedQuery('Embedding PENDING', () =>
    (db.prepare("SELECT COUNT(*) as c FROM smart_metadata WHERE embedding_status = 'PENDING'").get() as any).c);

const embeddingCompleted = timedQuery('Embedding COMPLETED', () =>
    (db.prepare("SELECT COUNT(*) as c FROM smart_metadata WHERE embedding_status = 'COMPLETED'").get() as any).c);

const vecCount = timedQuery('Vec Count', () =>
    (db.prepare('SELECT COUNT(*) as c FROM vec_songs').get() as any).c);

// Mismatches
const noJson = timedQuery('No JSON (analyzed but missing)', () =>
    (db.prepare('SELECT COUNT(*) as c FROM smart_metadata WHERE last_analyzed IS NOT NULL AND analysis_json IS NULL').get() as any).c);

const noMetaEmbedding = timedQuery('No Meta Embedding', () =>
    (db.prepare('SELECT COUNT(*) as c FROM smart_metadata WHERE last_analyzed IS NOT NULL AND embedding IS NULL').get() as any).c);

// 待处理歌曲 - 使用 UNION 优化
const needsProcessing = timedQuery('Needs Processing (UNION)', () =>
    (db.prepare(`
        SELECT COUNT(*) as c FROM (
            SELECT navidrome_id FROM smart_metadata WHERE last_analyzed IS NULL
            UNION
            SELECT navidrome_id FROM smart_metadata WHERE analysis_json IS NULL
        )
    `).get() as any).c);

// Songs that are COMPLETED but not in vec_songs - 跳过慢查询
console.log('  [Query] Completed but no Vec - SKIPPED (vec table join is slow)');
const completedButNoVec = -1; // 跳过此查询

console.log('--- Statistics ---');
console.log(`Total Songs: ${totalSongs}`);
console.log(`Needs Processing (未分析或结果丢失): ${needsProcessing}`);
console.log(`Analyzed (Metadata): ${analyzed}`);
console.log(`  - No JSON: ${noJson}`);
console.log(`  - No Blob in Meta: ${noMetaEmbedding}`);
console.log(`Processing Status:`);
console.log(`  - PENDING: ${pending}`);
console.log(`  - PROCESSING: ${processing}`);
console.log(`  - COMPLETED: ${completed}`);
console.log(`  - FAILED: ${failed}`);
console.log(`Embedding Status:`);
console.log(`  - PENDING: ${embeddingPending}`);
console.log(`  - COMPLETED: ${embeddingCompleted}`);
console.log(`Vector Table (vec_songs):`);
console.log(`  - Count: ${vecCount}`);
console.log(`  - Discrepancy (Completed Meta but no Vector): ${completedButNoVec}`);

if (completedButNoVec > 0) {
    console.warn(`WARNING: ${completedButNoVec} songs have 'COMPLETED' status but are missing from vec_songs table.`);
}

// ============================================================================
// JSON 字段完整性检查
// ============================================================================
console.log('\n--- JSON Integrity Check ---');

interface AnalysisJSON {
    vector_anchor?: any;
    embedding_tags?: any;
    language?: string;
    is_instrumental?: boolean;
    popularity_raw?: number;
}

// 必填字段定义
const REQUIRED_FIELDS = ['vector_anchor', 'embedding_tags', 'language', 'is_instrumental', 'popularity_raw'];
const REQUIRED_VECTOR_ANCHOR_FIELDS = ['acoustic_model', 'semantic_push', 'cultural_weight'];
const REQUIRED_EMBEDDING_TAGS_FIELDS = ['spectrum', 'spatial', 'energy', 'tempo_vibe', 'timbre_texture', 'mood_coord', 'objects', 'scene_tag'];

// 获取所有有 analysis_json 的记录进行校验
const songsWithJson = timedQuery('Fetch songs with JSON', () =>
    db.prepare(`
        SELECT navidrome_id, title, artist, analysis_json 
        FROM smart_metadata 
        WHERE analysis_json IS NOT NULL
    `).all() as { navidrome_id: string, title: string, artist: string, analysis_json: string }[]);

let invalidCount = 0;
let vectorAnchorStringCount = 0;
let missingFieldsCount = 0;
const invalidIds: string[] = [];

for (const song of songsWithJson) {
    try {
        const json: AnalysisJSON = JSON.parse(song.analysis_json);
        let isInvalid = false;

        // 检查 1: vector_anchor 被错误写成字符串
        if (typeof json.vector_anchor === 'string') {
            vectorAnchorStringCount++;
            isInvalid = true;
        }

        // 检查 2: vector_anchor 必填子字段缺失
        if (json.vector_anchor && typeof json.vector_anchor === 'object') {
            for (const field of REQUIRED_VECTOR_ANCHOR_FIELDS) {
                if (!json.vector_anchor[field]) {
                    missingFieldsCount++;
                    isInvalid = true;
                    break;
                }
            }
        }

        // 检查 3: embedding_tags 必填子字段缺失
        if (json.embedding_tags && typeof json.embedding_tags === 'object') {
            for (const field of REQUIRED_EMBEDDING_TAGS_FIELDS) {
                if (json.embedding_tags[field] === undefined || json.embedding_tags[field] === null) {
                    missingFieldsCount++;
                    isInvalid = true;
                    break;
                }
            }
        } else if (!json.embedding_tags) {
            missingFieldsCount++;
            isInvalid = true;
        }

        // 检查 4: 顶层必填字段缺失
        if (json.popularity_raw === undefined || json.popularity_raw === null) {
            missingFieldsCount++;
            isInvalid = true;
        }

        if (isInvalid) {
            invalidCount++;
            invalidIds.push(song.navidrome_id);
        }
    } catch (e) {
        // JSON 解析失败
        invalidCount++;
        invalidIds.push(song.navidrome_id);
    }
}

console.log(`Total with JSON: ${songsWithJson.length}`);
console.log(`Invalid JSON Count: ${invalidCount}`);
console.log(`  - vector_anchor is string (should be object): ${vectorAnchorStringCount}`);
console.log(`  - Missing required fields: ${missingFieldsCount}`);

// 如果有无效记录，输出前 10 个 ID 供调试
if (invalidIds.length > 0) {
    console.log(`\nSample Invalid IDs (first 10):`);
    invalidIds.slice(0, 10).forEach(id => console.log(`  - ${id}`));

    // 导出到文件供批量重处理
    const outputPath = './data/invalid_json_ids.txt';
    fs.writeFileSync(outputPath, invalidIds.join('\n'), 'utf-8');
    console.log(`\n📁 All ${invalidIds.length} invalid IDs exported to: ${outputPath}`);
}
