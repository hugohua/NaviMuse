import { GoogleGenerativeAI } from '@google/generative-ai';
import { HttpsProxyAgent } from 'https-proxy-agent';
import nodeFetch from 'node-fetch';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// --- Proxy Configuration (Copied from GeminiService.ts) ---
const proxyUrl = process.env.HTTPS_PROXY;
if (proxyUrl) {
    console.log(`[Test] Configuring Proxy: ${proxyUrl}`);
    const agent = new HttpsProxyAgent(proxyUrl);
    // @ts-ignore
    global.fetch = async (url: string, options: any) => {
        return nodeFetch(url, {
            ...options,
            agent: agent
        });
    };
}
// --------------------------------------------------------

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
    console.error("Error: GEMINI_API_KEY not found in .env");
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(apiKey);
const modelName = process.env.GEMINI_MODEL || "gemini-3-flash-preview";

// --- Configuration ---
const OUTPUT_FILE = 'prompt_test_results.txt';

// --- Database Integration ---
import { db } from '../src/db';
import { METADATA_SYSTEM_PROMPT } from '../src/services/ai/systemPrompt';

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

// *** DEFINE PROMPTS HERE ***
const PROMPT_VARIANTS: Record<string, string> = {
    "Live_System_Prompt": METADATA_SYSTEM_PROMPT
};


// --- Main Execution ---

async function runTests() {
    console.log(`Starting Prompt Tests using model: ${modelName}`);
    console.log(`Target Output File: ${OUTPUT_FILE} `);

    // Clear existing file
    fs.writeFileSync(OUTPUT_FILE, `-- - Prompt Test Results(${new Date().toLocaleString()})-- -\n\n`);

    for (const [name, systemPrompt] of Object.entries(PROMPT_VARIANTS)) {
        console.log(`\nTesting: ${name}...`);

        try {
            const model = genAI.getGenerativeModel({
                model: modelName,
                systemInstruction: systemPrompt,
                generationConfig: {
                    temperature: 0.7,
                }
            });

            const result = await model.generateContent(TEST_DATA_JSON);
            const response = await result.response;
            const text = response.text();

            console.log(`  -> Success.Length: ${text.length} `);

            // Format Output
            const outputBlock = `
==================================================
提示词 (${name})：
${systemPrompt.trim()}

生成结果 (${name})：
${text.trim()}
==================================================
\n`;

            fs.appendFileSync(OUTPUT_FILE, outputBlock);

        } catch (error) {
            console.error(`  -> Failed: ${error}`);
            fs.appendFileSync(OUTPUT_FILE, `\n=== ERROR (${name}) ===\n${error}\n\n`);
        }
    }

    console.log(`\nAll tests completed. Results saved to ${OUTPUT_FILE}`);
}

runTests();
