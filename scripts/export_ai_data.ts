
/**
 * AI 数据导出实用脚本
 * 
 * 功能：
 * 1. 将现有的结构化元数据分析结果导出为外部可读格式
 * 
 * 用法：
 * npx ts-node --project tsconfig.server.json scripts/export_ai_data.ts
 */
import Database from 'better-sqlite3';
import path from 'path';
import * as fs from 'fs';

const DB_PATH = path.join(process.cwd(), 'data', 'navimuse.db');
const OUTPUT_FILE = path.join(process.cwd(), 'ai_atmosphere_export.json');

console.log(`Open DB: ${DB_PATH}`);
const db = new Database(DB_PATH, { readonly: true });

const query = `
    SELECT navidrome_id, title, artist, description, mood, tags 
    FROM smart_metadata 
    WHERE description IS NOT NULL AND description != ''
    LIMIT 20
`;

try {
    const stmt = db.prepare(query);
    const rows = stmt.all();
    console.log(`Found ${rows.length} records with AI description.`);

    // Parse tags if they are strings
    const validRows = rows.map((row: any) => {
        let tags = [];
        try {
            if (row.tags) tags = JSON.parse(row.tags);
        } catch (e) {
            if (row.tags) tags = [row.tags]; // Fallback
        }
        return {
            title: row.title,
            artist: row.artist,
            description: row.description,
            mood: row.mood,
            tags: tags,
            id: row.navidrome_id
        };
    });

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(validRows, null, 2));
    console.log(`Exported to ${OUTPUT_FILE}`);
} catch (error) {
    console.error("Export failed:", error);
    process.exit(1);
}
