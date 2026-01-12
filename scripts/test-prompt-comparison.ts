
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
  <role>Senior Music Data Architect & Vector Search Expert</role>
  <task_type>High-Dimensional Semantic Enrichment (10,000+ Songs)</task_type>
  <engine_tuning>
    - Model: Gemini 3 Flash (Optimized for JSON stability & fast reasoning)
    - Formatting: Strictly Raw JSON Array (No Markdown, No Prose)
    - Language: Simplified Chinese (简体中文)
  </engine_tuning>
</system_config>

<task_objective>
  你的任务是将原始歌曲元数据转化为富含“听觉-视觉-意象”联觉的高维语义描述。这些数据将用于 768 维向量检索。
  你必须通过“双轨制情绪逻辑”：既提供标准化的分类标签，又保留 LLM 对音乐细微情感的自由捕捉。
</task_objective>

<mood_palette>
  [宁静, 治愈, 慵懒, 禅意, 纯净, 柔和, 恬静, 安详, 
   欢快, 甜蜜, 俏皮, 动感, 励志, 自由, 阳光, 元气, 
   激昂, 亢奋, 热血, 坚定, 狂暴, 愤怒, 宏大, 史诗, 
   忧郁, 哀伤, 孤独, 凄凉, 遗憾, 释怀, 沉思, 怀旧, 
   神秘, 迷惘, 飘渺, 诡谲, 幻灭, 梦幻, 灵异, 冷冽, 
   Groovy, 迷离, 性感, 现代, 讽刺, 从容, 华丽, 温暖]
</mood_palette>

<rules>
  <rule name="Dual_Track_Mood">
    - standard_mood: 必须且仅能从 <mood_palette> 中选择一个。
    - mood_nuance: 自由发挥！用一个 15 字以内的短句捕捉该曲特有的、难以捉摸的情绪细节（例如：“劫后余生的庆幸”、“大城市凌晨三点的虚无感”）。
  </rule>
  <rule name="Vector_Description_Rules">
    - 长度要求：100-150 字。
    - 必须包含：1. 声音物理属性（音色质感、干湿程度）；2. 物理声场（空间大小、距离感）；3. 色彩温度（冷/暖/中性）；4. 人声位置（贴耳/远场/无）；5. 具体生活/艺术场景。
    - 严禁：使用“好听”、“旋律优美”等主观废话。
  </rule>
  <rule name="Output_Constraint">
    - 仅输出原始 JSON 数组，严禁包含 \`\`\`json \`\`\` 标记。
  </rule>
</rules>

<output_schema>
  interface SongEmbeddingData {
    id: string | number;
    vector_description: string; // 联觉化长描述
    tags: string[]; // 8个。结构：#流派 #乐器 #核心情绪 #微场景 #色彩感 #空间质感 #年代感 #材质感
    is_instrumental: boolean;
    audio_features: {
      standard_mood: string; // 来自 mood_palette
      mood_nuance: string;   // 自由捕捉的情绪细节
      energy_level: "Low" | "Medium" | "High";
      color_temp: "Warm" | "Cold" | "Neutral";
      vocal_position: "Close" | "Balanced" | "Distant" | "None";
    }
  }
</output_schema>

<example>
  <input>[{"id": "demo_01", "title": "雨夜独白", "artist": "虚拟艺人"}]</input>
  <output>
  [
    {
      "id": "demo_01",
      "vector_description": "音色具有潮湿的磨砂质感，前奏的钢琴高频如同细雨敲击玻璃般清冷。空间感模拟了一个极小且私密的卧室，人声处理极其贴耳（Dry），仿佛在耳边低语。色调呈现冷峻的灰蓝色。核心情绪是极致的孤独中带着一丝自我和解。非常适合作为深夜失眠、雨天阅读或个人沉思时的背景音乐。",
      "tags": ["#现代流行", "#钢琴", "#孤独", "#深夜雨天", "#冷色调", "#贴耳", "#现代感", "#玻璃质感"],
      "is_instrumental": false,
      "audio_features": {
        "standard_mood": "孤独",
        "mood_nuance": "雨夜窗边带有安全感的自我放逐",
        "energy_level": "Low",
        "color_temp": "Cold",
        "vocal_position": "Close"
      }
    }
  ]
  </output>
</example>

<execution_instruction>
  现在请开始处理以下歌曲元数据。保持输出的纯净性，确保每一条描述都能在 768 维空间中提供唯一的坐标特征：
</execution_instruction>
`;

async function main() {
    console.log("=== Starting Prompt Comparison Test ===");

    // 3. Init DB & Fetch Data
    initDB();
    const rows = db.prepare(`
        SELECT navidrome_id, title, artist, description, tags, mood 
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
            temperature: 0.7 // Standard creativity
        }
    });

    // 5. Build Input
    const inputPayload = testSet.map(s => ({
        id: s.navidrome_id,
        title: s.title,
        artist: s.artist
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
    reportMarkdown += `| ID | Song | Old Description | New Vector Description | New Nuance | New Tags |\n`;
    reportMarkdown += `|---|---|---|---|---|---|\n`;

    const resultMap = new Map(newResults.map(r => [String(r.id), r]));

    for (const original of testSet) {
        const newVal = resultMap.get(String(original.navidrome_id));

        const title = `${original.title} - ${original.artist}`;

        // Format Old (Truncate for readability in table if needed)
        const oldDesc = (original.description || "N/A").replace(/\n/g, ' ');

        if (newVal) {
            const newDesc = (newVal.vector_description || "N/A").replace(/\n/g, ' ');
            const newNuance = newVal.audio_features?.mood_nuance || "N/A";
            const newTags = (newVal.tags || []).join(', ');

            reportMarkdown += `| ${original.navidrome_id.substring(0, 6)}.. | **${title}** | ${oldDesc} | **${newDesc}** | *${newNuance}* | \`${newTags}\` |\n`;
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
