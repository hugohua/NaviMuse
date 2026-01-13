
import { GoogleGenerativeAI } from '@google/generative-ai';
import { HttpsProxyAgent } from 'https-proxy-agent';
import nodeFetch from 'node-fetch';
import { db, initDB } from '../src/db';
import * as fs from 'fs';
import * as path from 'path';
import 'dotenv/config';

// 1. Configuration
const TEST_LIMIT = 15; // Number of songs to process
const MODEL_NAME = process.env.GEMINI_MODEL || "gemini-3-flash-preview";

// 2. New Prompt Definition
const NEW_SYSTEM_PROMPT = `
<system_config>
  <role>Ultra-Precision Music Embedding Architect</role>
  <specialization>768D Vector Space Optimization & Acoustic Modeling</specialization>
  <engine_tuning>
    - Model: Gemini 3 Flash
    - Output: Minified JSON Array (No markdown tags)
    - Temp: 0.3 (Ensuring deterministic structural output)
  </engine_tuning>
</system_config>

<vector_strategy>
  <goal>最大化向量空间中的余弦距离，通过“正向特征+物理属性+负向约束”三位一体建模</goal>
  <acoustic_precision>
    使用[瞬态响应/谐波密度/动态范围/空间混响/频谱质感]定义物理特征。
  </acoustic_precision>
  <contrast_logic>
    每一个描述必须包含一个“语义对立面”，例如：“具备温暖的磁带饱和感，彻底排除了数字冷峻的削波感”。
  </contrast_logic>
</vector_strategy>

<output_schema>
  [
    {
      "id": "string",
      "vector_anchor": {
        "acoustic_model": "物理层：分析音色、空间、动态（50字）",
        "semantic_push": "意象层：分析情绪、场景、负向排除特征（80字）",
        "cultural_weight": "地位层：经典度评价 + 时代特征"
      },
      "embedding_tags": {
        "spectrum": "High/Mid/Low/Full",
        "spatial": "Dry/Wet/Huge/Intimate",
        "energy": 1-10,
        "mood_coord": ["#标准情绪", "#微情绪"],
        "objects": ["#代表乐器", "#核心质感"]
      },
      "popularity_raw": 0.0-1.0
    }
  ]
</output_schema>

<execution_instruction>
  处理以下歌曲数据。请确保 vector_anchor 中的描述不含任何虚词，每一句话都必须为向量空间提供明确的方向推力。
</execution_instruction>
`;

async function main() {
  console.log("=== Starting Prompt Comparison Test ===");

  // 3. Init DB & Fetch Data
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

  // 4. Configure AI Client (Copied from GeminiService to ensure standalone isolation)
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
    systemInstruction: NEW_SYSTEM_PROMPT,
    generationConfig: {
      temperature: 0.3 // Deterministic output
    }
  });

  // 5. Build Input
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

  // 6. Generate Report
  let reportMarkdown = `# Prompt Comparison Report\n\nGenerated at: ${new Date().toISOString()}\n\n`;

  // Header
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
