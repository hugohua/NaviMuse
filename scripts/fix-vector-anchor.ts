/**
 * 修复扁平化的 vector_anchor 数据
 * 
 * 问题: 约 39% 的数据中，vector_anchor 被错误地输出为字符串，
 *       其他字段 (semantic_push, cultural_weight) 被提升到顶层。
 * 
 * 修复策略:
 *   将扁平化格式转换为正确的嵌套格式:
 *   - vector_anchor: string -> { acoustic_model: string }
 *   - 顶层 semantic_push, cultural_weight 移入 vector_anchor
 */

import { initDB, db } from '../src/db';

interface FlattenedFormat {
    id: string;
    vector_anchor: string; // 错误：应该是对象
    semantic_push: string;
    cultural_weight: string;
    embedding_tags: any;
    language: string;
    is_instrumental: boolean;
    popularity_raw: number;
}

interface CorrectFormat {
    id: string;
    vector_anchor: {
        acoustic_model: string;
        semantic_push: string;
        cultural_weight: string;
    };
    embedding_tags: any;
    language: string;
    is_instrumental: boolean;
    popularity_raw: number;
}

function fixFlattenedData(data: FlattenedFormat): CorrectFormat {
    return {
        id: data.id,
        vector_anchor: {
            acoustic_model: data.vector_anchor,
            semantic_push: data.semantic_push,
            cultural_weight: data.cultural_weight,
        },
        embedding_tags: data.embedding_tags,
        language: data.language,
        is_instrumental: data.is_instrumental,
        popularity_raw: data.popularity_raw,
    };
}

async function main() {
    const args = process.argv.slice(2);
    const dryRun = !args.includes('--apply');

    console.log('[Fix Vector Anchor] 初始化数据库...');
    initDB();

    // 查询需要修复的数据
    const query = `
        SELECT navidrome_id, analysis_json
        FROM smart_metadata 
        WHERE analysis_json IS NOT NULL 
          AND json_type(analysis_json, '$.vector_anchor') = 'text'
    `;

    const rows = db.prepare(query).all() as { navidrome_id: string; analysis_json: string }[];
    console.log(`[Fix Vector Anchor] 发现 ${rows.length} 条需要修复的数据`);

    if (rows.length === 0) {
        console.log('✅ 无需修复');
        return;
    }

    if (dryRun) {
        console.log('\n🔍 Dry Run 模式 - 显示前 3 条修复预览:\n');

        for (let i = 0; i < Math.min(3, rows.length); i++) {
            const row = rows[i];
            const original = JSON.parse(row.analysis_json) as FlattenedFormat;
            const fixed = fixFlattenedData(original);

            console.log(`--- ${row.navidrome_id} ---`);
            console.log('原始 vector_anchor:', typeof original.vector_anchor === 'string' ?
                original.vector_anchor.substring(0, 50) + '...' : 'object');
            console.log('修复后 vector_anchor:', JSON.stringify(fixed.vector_anchor, null, 2).substring(0, 200));
            console.log('');
        }

        console.log('========================================');
        console.log(`📋 共 ${rows.length} 条数据待修复`);
        console.log('使用 --apply 参数执行实际修复');
        console.log('========================================');
        return;
    }

    // 执行修复
    console.log('\n[Fix Vector Anchor] 开始修复...');

    const updateStmt = db.prepare(`
        UPDATE smart_metadata 
        SET analysis_json = ?
        WHERE navidrome_id = ?
    `);

    let successCount = 0;
    let errorCount = 0;

    const transaction = db.transaction(() => {
        for (const row of rows) {
            try {
                const original = JSON.parse(row.analysis_json) as FlattenedFormat;
                const fixed = fixFlattenedData(original);
                updateStmt.run(JSON.stringify(fixed), row.navidrome_id);
                successCount++;
            } catch (e) {
                console.warn(`⚠️ ${row.navidrome_id}: 修复失败`);
                errorCount++;
            }
        }
    });

    transaction();

    console.log('\n========================================');
    console.log(`✅ 修复完成！`);
    console.log(`   成功: ${successCount}`);
    console.log(`   失败: ${errorCount}`);
    console.log('========================================');
}

main().catch(console.error);
