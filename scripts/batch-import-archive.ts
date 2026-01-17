
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';

// 配置
const DB_PATH = process.env.DB_PATH || 'data/navimuse.db';
const META_DIR = path.join(process.cwd(), 'data/batch/meta');

// 数据库初始化
const db = new Database(DB_PATH);
sqliteVec.load(db);

// 预编译语句
const updateStmt = db.prepare(`
    UPDATE smart_metadata 
    SET analysis_json = ?, last_analyzed = CURRENT_TIMESTAMP
    WHERE navidrome_id = ?
`);

// 统计
const stats = {
    files: 0,
    requests: 0,
    songs: 0,
    success: 0,
    errors: 0
};

async function processFile(filePath: string) {
    console.log(`\n📄 Processing: ${path.basename(filePath)}`);
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.trim().split('\n');

    for (const line of lines) {
        if (!line.trim()) continue;
        stats.requests++;

        try {
            const json = JSON.parse(line);

            // 2. 解析 AI 响应内容
            const responseBody = json.response?.body;
            if (!responseBody) {
                // 如果没有 response body，说明可能是一个通过但无内容的请求，或者格式不同
                continue;
            }

            const choices = responseBody.choices;
            if (!choices || !choices[0] || !choices[0].message?.content) {
                continue;
            }

            const aiContent = choices[0].message.content;

            // 3. 解析 AI 返回的 JSON 数组
            const cleanContent = aiContent.replace(/```json/g, '').replace(/```/g, '').trim();
            let parsedSongs: any[];

            try {
                parsedSongs = JSON.parse(cleanContent);
            } catch (e) {
                console.error(`  ❌ JSON Parse Error for request ${json.id}:`, e);
                stats.errors++;
                continue;
            }

            if (!Array.isArray(parsedSongs)) {
                console.error(`  ❌ Response is not an array for request ${json.id}`);
                continue;
            }

            // 4. 直接利用 AI 返回结果中的 ID 更新数据库
            // [IMPORTANT] 这里不再依赖 external mapping file，而是相信 AI 返回数据里携带的 id (Navidrome ID)
            let batchSuccessCount = 0;

            for (const songData of parsedSongs) {
                if (!songData.id) {
                    // ID 缺失，无法更新
                    console.warn('  ⚠️  Skipping a song result without ID');
                    stats.errors++;
                    continue;
                }

                try {
                    // 确保 ID 是字符串
                    const navidromeId = String(songData.id);

                    // 执行更新
                    const result = updateStmt.run(JSON.stringify(songData), navidromeId);

                    if (result.changes > 0) {
                        batchSuccessCount++;
                        stats.success++;
                        // console.log(`    ✅ Updated ${navidromeId}`);
                    } else {
                        // 数据库里可能没有这个 ID (例如被删除了，或者 ID 格式不匹配)
                        // console.warn(`    ⚠️  ID not found in DB: ${navidromeId}`);
                        // 这种情况不算脚本错误，可能是数据不同步
                    }
                } catch (dbErr) {
                    console.error(`  ❌ DB Write Error for song ${songData.id}:`, dbErr);
                    stats.errors++;
                }
            }
            // 可选：打印每个 Batch Request 的成功数
            // console.log(`  Batch Request processed: ${batchSuccessCount}/${parsedSongs.length} songs updated.`);

        } catch (e) {
            console.error(`  ❌ Error processing line in ${path.basename(filePath)}:`, e);
            stats.errors++;
        }
    }
    stats.files++;
}

async function main() {
    console.log('🚀 Starting Archive Import (Direct ID Mode)...');

    // 获取目录下所有 jsonl 文件
    if (!fs.existsSync(META_DIR)) {
        console.error(`Directory not found: ${META_DIR}`);
        return;
    }

    const files = fs.readdirSync(META_DIR).filter(f => f.endsWith('.jsonl'));

    if (files.length === 0) {
        console.log('No .jsonl files found to import.');
        return;
    }

    console.log(`Found ${files.length} files to process.`);

    const runInTransaction = db.transaction(() => {
        for (const file of files) {
            processFile(path.join(META_DIR, file));
        }
    });

    try {
        runInTransaction();
    } catch (e) {
        console.error('Transaction Failed:', e);
    }

    console.log('\n========================================');
    console.log('🎉 Import Summary');
    console.log('========================================');
    console.log(`Files Processed:  ${stats.files}`);
    console.log(`Batch Requests:   ${stats.requests}`);
    console.log(`Songs Updated:    ${stats.success}`);
    console.log(`Errors/Skipped:   ${stats.errors}`);
    console.log('========================================');
}

main();
