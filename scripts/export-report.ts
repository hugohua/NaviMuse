import { db, initDB } from '../src/db';
import fs from 'fs';
import path from 'path';

initDB();

const OUTPUT_FILE = path.join(process.cwd(), 'ai_report.json');

import { config } from '../src/config';

// Configuration details used during generation
const CONFIG_META = {
    model: process.env.GEMINI_MODEL || "gemini-3-flash-preview",
    temperature: config.ai.temperature, // Source from config
    system_prompt_version: "V5 (Vector Description)",
    generated_at: new Date().toISOString()
};

function main() {
    console.log("Exporting AI Generation Report...");

    try {
        const rows = db.prepare(`
            SELECT 
                navidrome_id, 
                title, 
                artist, 
                description as vector_description, 
                tags, 
                mood, 
                is_instrumental, 
                last_analyzed 
            FROM smart_metadata 
            WHERE last_analyzed IS NOT NULL
        `).all();

        const report = {
            meta: CONFIG_META,
            count: rows.length,
            data: rows.map((row: any) => ({
                ...row,
                tags: JSON.parse(row.tags || '[]'), // Parse JSON string back to array
                is_instrumental: Boolean(row.is_instrumental)
            }))
        };

        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(report, null, 2), 'utf-8');
        console.log(`Successfully exported ${rows.length} records to ${OUTPUT_FILE}`);

    } catch (err) {
        console.error("Export failed:", err);
    }
}

main();
