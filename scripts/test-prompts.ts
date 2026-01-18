/**
 * 通用 Prompt 逻辑测试脚本
 * 
 * 功能：
 * 1. 快速验证 systemPrompt.ts 中配置的提示词是否能产生符合预期的 JSON
 * 
 * 用法：
 * npx ts-node --project tsconfig.server.json scripts/test-prompts.ts
 */
import * as fs from 'fs';
import dotenv from 'dotenv';
import { db } from '../src/db';
import { GeminiService } from '../src/services/ai/GeminiService';
import { METADATA_SYSTEM_PROMPT } from '../src/services/ai/systemPrompt';

// Load environment variables
dotenv.config();

// --- Configuration ---
const OUTPUT_FILE = 'prompt_test_results.txt';

console.log("[Test] Fetching 10 random songs from database...");
const TEST_DATA = db.prepare(`
    SELECT navidrome_id as id, title, artist 
    FROM smart_metadata 
    ORDER BY RANDOM() 
    LIMIT 10
`).all() as { id: string, title: string, artist: string }[];

if (TEST_DATA.length === 0) {
    console.error("Error: Database is empty. Please run sync script first.");
    process.exit(1);
}

// Log fetched songs for verification
console.log("[Test] Songs to process:");
TEST_DATA.forEach(s => console.log(`  - ${s.title} (${s.artist})`));

const TEST_DATA_JSON = JSON.stringify(TEST_DATA);

// *** DEFINE PROMPTS HERE (Not used in direct Service call but logged) ***
const PROMPT_VARIANTS: Record<string, string> = {
    "Live_System_Prompt": METADATA_SYSTEM_PROMPT
};

// --- Main Execution ---

async function runTests() {
    console.log(`Starting Prompt Tests using GeminiService (OpenRouter)`);
    console.log(`Target Output File: ${OUTPUT_FILE} `);

    // Initialize Service
    const service = new GeminiService();

    // Clear existing file
    fs.writeFileSync(OUTPUT_FILE, `-- - Prompt Test Results(${new Date().toLocaleString()})-- -\n\n`);

    console.log(`\nTesting GeminiService.generateBatchMetadata()...`);

    try {
        const result = await service.generateBatchMetadata(TEST_DATA);

        console.log(`  -> Success. Result count: ${result.length} `);

        // Format Output
        const outputBlock = `
=================================================
Ref: Live System Prompt
${METADATA_SYSTEM_PROMPT.trim()}

生成结果 (Via GeminiService/OpenRouter)：
${JSON.stringify(result, null, 2)}
=================================================
\n`;

        fs.appendFileSync(OUTPUT_FILE, outputBlock);

    } catch (error) {
        console.error(`  -> Failed: ${error}`);
        fs.appendFileSync(OUTPUT_FILE, `\n=== ERROR ===\n${error}\n\n`);
    }

    console.log(`\nAll tests completed. Results saved to ${OUTPUT_FILE}`);
}

runTests();

