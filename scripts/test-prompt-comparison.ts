
import { GoogleGenerativeAI } from '@google/generative-ai';
import { HttpsProxyAgent } from 'https-proxy-agent';
import nodeFetch from 'node-fetch';
import { db, initDB } from '../src/db';
import * as fs from 'fs';
import * as path from 'path';
import 'dotenv/config';

// 导入统一的 System Prompt (单一来源，方便维护)
import { METADATA_SYSTEM_PROMPT } from '../src/services/ai/systemPrompt';

// 1. Configuration
const TEST_LIMIT = 15; // Number of songs to process
const MODEL_NAME = process.env.GEMINI_MODEL || "gemini-3-flash-preview";

// 注意: 原 NEW_SYSTEM_PROMPT 已移除，现在使用从 systemPrompt.ts 导入的 METADATA_SYSTEM_PROMPT

async function main() {
  console.log("=== Starting Prompt Comparison Test ===");

  // 2. Init DB & Fetch Data
  initDB();
  const rows = db.prepare(`
        SELECT navidrome_id, title, artist, album, description, tags, mood 
        FROM smart_metadata 
        WHERE last_analyzed IS NOT NULL 
        LIMIT 20
    `).all() as any[];

  if (rows.length < TEST_LIMIT) {
    console.warn(`Warning: Only found ${rows.length} analyzed songs. Using all suitable rows.`);
  }

  const testSet = rows.slice(0, TEST_LIMIT);
  console.log(`Fetched ${testSet.length} songs for testing.`);

  // 3. Configure AI Client (Copied from GeminiService to ensure standalone isolation)
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY");

  const proxyUrl = process.env.HTTPS_PROXY;
  if (proxyUrl) {
    console.log(`Configuring Proxy: ${proxyUrl}`);
    const agent = new HttpsProxyAgent(proxyUrl);
    // @ts-ignore
    global.fetch = async (url: string, options: any) => {
      return nodeFetch(url, { ...options, agent });
    };
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: MODEL_NAME,
    systemInstruction: METADATA_SYSTEM_PROMPT,
    generationConfig: {
      temperature: 0.3 // Deterministic output
    }
  });

  // 4. Build Input
  const inputPayload = testSet.map(s => ({
    id: s.navidrome_id,
    title: s.title,
    artist: s.artist,
    album: s.album
  }));

  console.log("Sending request to Gemini...");
  const prompt = JSON.stringify(inputPayload);

  let newResults: any[] = [];
  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    console.log("Received response. Length:", text.length);

    const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const JSON5 = (await import('json5')).default;
    newResults = JSON5.parse(cleaned);

    if (!Array.isArray(newResults)) {
      newResults = [newResults];
    }
  } catch (err) {
    console.error("AI Generation Failed:", err);
    process.exit(1);
  }

  // 5. Generate Report
  let reportMarkdown = `# Prompt Comparison Report\n\nGenerated at: ${new Date().toISOString()}\n\n`;

  // Header
  reportMarkdown += `| ID | Song | Old Description | New Acoustic | New Semantic | New Tags |\n`;
  reportMarkdown += `|---|---|---|---|---|---|\n`;

  const resultMap = new Map(newResults.map(r => [String(r.id), r]));

  for (const original of testSet) {
    const newVal = resultMap.get(String(original.navidrome_id));

    const title = `${original.title} - ${original.artist}`;

    // Format Old (Truncate for readability in table if needed)
    const oldDesc = (original.description || "N/A").replace(/\n/g, ' ');

    if (newVal) {
      const acoustic = (newVal.vector_anchor?.acoustic_model || "N/A").replace(/\n/g, ' ');
      const semantic = (newVal.vector_anchor?.semantic_push || "N/A").replace(/\n/g, ' ');

      // Combine tags from embedding_tags
      const tagsObj = newVal.embedding_tags || {};
      const mood = tagsObj.mood_coord ? tagsObj.mood_coord.join(' ') : '';
      const objects = tagsObj.objects ? tagsObj.objects.join(' ') : '';
      const combinedTags = `${mood} ${objects}`;

      reportMarkdown += `| ${original.navidrome_id.substring(0, 6)}.. | **${title}** | ${oldDesc} | ${acoustic} | ${semantic} | \`${combinedTags}\` |\n`;
    } else {
      reportMarkdown += `| ${original.navidrome_id.substring(0, 6)}.. | **${title}** | ${oldDesc} | *Generation Failed* | - | - |\n`;
    }
  }

  // Write to file
  const outputPath = path.join(process.cwd(), 'prompt_comparison.md');
  fs.writeFileSync(outputPath, reportMarkdown);
  console.log(`\nReport written to: ${outputPath}`);

  // Also write raw JSON for detailed inspection
  const rawPath = path.join(process.cwd(), 'prompt_comparison_raw.json');
  fs.writeFileSync(rawPath, JSON.stringify({
    original: testSet,
    new: newResults
  }, null, 2));
  console.log(`Raw data written to: ${rawPath}`);
}

main().catch(console.error);
