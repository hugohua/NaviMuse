/**
 * Vibe Tags 静态生成脚本 (含 LLM 归类)
 * 
 * 方案 A+B: 直接从数据库提取声学/能量/类型字段
 * 方案 C: 调用 LLM 对 mood/scene_tag 进行智能归类
 * 
 * 运行方式: npx ts-node scripts/generate-tags.ts
 */

import Database from 'better-sqlite3';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import OpenAI from 'openai';
import { config } from '../src/config';

// Load .env
dotenv.config({ path: path.join(__dirname, '../.env') });

// ============================================================================
// 1. 数据库连接
// ============================================================================
const dbPath = process.env.DB_PATH || path.join(process.cwd(), 'data', 'navimuse.db');
const db = new Database(dbPath, { readonly: true });

console.log(`[TagGen] 读取数据库: ${dbPath}`);

// ============================================================================
// 2. 类型定义
// ============================================================================
interface TagCategory {
    title: string;
    attributes: Record<string, string>;
}

interface ClusterResult {
    clusters: {
        name_cn: string;
        name_en: string;
        keywords: string[];
        prompt_hint: string;
    }[];
}

// ============================================================================
// 3. LLM 客户端初始化 (使用 OpenRouter)
// ============================================================================
const openai = new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPENROUTER_API_KEY || '',
});

const LLM_MODEL = 'google/gemini-3-pro-preview';

// ============================================================================
// 4. 辅助函数
// ============================================================================
function getCount(column: string, value: string): number {
    const stmt = db.prepare(`SELECT COUNT(*) as count FROM smart_metadata WHERE ${column} = ?`);
    const res = stmt.get(value) as { count: number };
    return res.count;
}

function getRangeCount(column: string, min: number, max: number): number {
    const stmt = db.prepare(`SELECT COUNT(*) as count FROM smart_metadata WHERE ${column} >= ? AND ${column} <= ?`);
    const res = stmt.get(min, max) as { count: number };
    return res.count;
}

function getDistinctValues(column: string, limit: number = 500): { value: string, count: number }[] {
    const stmt = db.prepare(`SELECT ${column} as value, COUNT(*) as count FROM smart_metadata WHERE ${column} IS NOT NULL AND ${column} != '' GROUP BY ${column} ORDER BY count DESC LIMIT ?`);
    return stmt.all(limit) as { value: string, count: number }[];
}

// ============================================================================
// 5. LLM 归类函数
// ============================================================================
async function clusterWithLLM(fieldName: string, values: { value: string, count: number }[]): Promise<ClusterResult> {
    const valueList = values.map(v => `${v.value} (${v.count})`).join('\n');

    // 读取外部 Prompt 模板
    const promptPath = path.join(__dirname, 'tag-clustering-prompt.txt');
    let promptTemplate = '';

    try {
        promptTemplate = fs.readFileSync(promptPath, 'utf-8');
    } catch (e) {
        console.error(`[TagGen] 无法读取 Prompt 模板: ${promptPath}`);
        // Fallback default
        promptTemplate = `[SYSTEM]
你是一个音乐标签分类专家。你的任务是将离散的 {{fieldName}} 标签归类为 6-10 个有意义的大类。
... (fallback content) ...
[USER]
以下是数据库中 {{fieldName}} 字段的所有唯一值及其出现次数：
{{valueList}}
请将这些值归类为 6-10 个语义相近的大类。`;
    }

    const [sysTemplate, userTemplate] = promptTemplate.split('[USER]');
    const systemPrompt = sysTemplate.replace('[SYSTEM]', '').trim()
        .replace(/{{fieldName}}/g, fieldName);

    const userPrompt = userTemplate.trim()
        .replace(/{{fieldName}}/g, fieldName)
        .replace('{{valueList}}', valueList);

    console.log(`[TagGen] 调用 LLM 归类 ${fieldName}...`);

    const response = await openai.chat.completions.create({
        model: LLM_MODEL,
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' }
    });

    const content = response.choices[0]?.message?.content || '{}';
    console.log(`[TagGen] LLM 响应 (前100字符): ${content.substring(0, 100)}...`);

    try {
        const cleaned = content.replace(/```json/g, '').replace(/```/g, '').trim();
        // 尝试找到第一个 { 和最后一个 }
        const start = cleaned.indexOf('{');
        const end = cleaned.lastIndexOf('}');
        const jsonStr = (start !== -1 && end !== -1) ? cleaned.substring(start, end + 1) : cleaned;

        return JSON.parse(jsonStr) as ClusterResult;
    } catch (e) {
        console.error(`[TagGen] JSON 解析失败:`, e);
        console.error(`[TagGen] 原始内容:`, content);
        return { clusters: [] };
    }
}

function aggregateByCluster(
    rawData: { value: string, count: number }[],
    clusters: ClusterResult['clusters']
): Record<string, { count: number, prompt: string }> {
    const result: Record<string, { count: number, prompt: string }> = {};

    for (const cluster of clusters) {
        result[cluster.name_cn] = { count: 0, prompt: cluster.prompt_hint };
    }

    for (const item of rawData) {
        const rawValue = item.value.toLowerCase();
        for (const cluster of clusters) {
            if (cluster.keywords.some(k => rawValue.includes(k.toLowerCase()))) {
                result[cluster.name_cn].count += item.count;
                break;
            }
        }
    }

    return result;
}

// ============================================================================
// 6. 主流程
// ============================================================================
async function main() {
    const categories: TagCategory[] = [];

    // --- A. 声学特征 (Acoustic) - 直接提取 ---
    console.log('[TagGen] 生成声学特征...');

    const acousticAttributes: Record<string, string> = {};

    // Spectrum
    const spectrumValues = ['High', 'Mid', 'Low', 'Full'];
    const spectrumLabels: Record<string, string> = {
        'High': '高频明亮',
        'Mid': '中频饱满',
        'Low': '低频深沉',
        'Full': '全频均衡'
    };
    for (const val of spectrumValues) {
        const count = getCount('spectrum', val);
        if (count > 0) {
            acousticAttributes[`${spectrumLabels[val]} (${val})`] = `Spectrum: ${val}, ${count} songs.`;
        }
    }

    // Spatial
    const spatialValues = ['Dry', 'Wet', 'Huge', 'Intimate'];
    const spatialLabels: Record<string, string> = {
        'Dry': '干燥紧致',
        'Wet': '湿润混响',
        'Huge': '宏大空间',
        'Intimate': '私密贴近'
    };
    for (const val of spatialValues) {
        const count = getCount('spatial', val);
        if (count > 0) {
            acousticAttributes[`${spatialLabels[val]} (${val})`] = `Spatial: ${val}, ${count} songs.`;
        }
    }

    // Tempo Vibe
    const tempoValues = ['Static', 'Drifting', 'Driving', 'Explosive'];
    const tempoLabels: Record<string, string> = {
        'Static': '静谧环境',
        'Drifting': '漂浮律动',
        'Driving': '推进节奏',
        'Explosive': '爆裂冲击'
    };
    for (const val of tempoValues) {
        const count = getCount('tempo_vibe', val);
        if (count > 0) {
            acousticAttributes[`${tempoLabels[val]} (${val})`] = `Tempo Vibe: ${val}, ${count} songs.`;
        }
    }

    // Timbre Texture
    const timbreValues = ['Organic', 'Electronic', 'Grainy', 'Metallic'];
    const timbreLabels: Record<string, string> = {
        'Organic': '原声质感',
        'Electronic': '电子合成',
        'Grainy': '颗粒复古',
        'Metallic': '金属冷峻'
    };
    for (const val of timbreValues) {
        const count = getCount('timbre_texture', val);
        if (count > 0) {
            acousticAttributes[`${timbreLabels[val]} (${val})`] = `Timbre Texture: ${val}, ${count} songs.`;
        }
    }

    categories.push({
        title: "声学特征 (Acoustic)",
        attributes: acousticAttributes
    });

    // --- B. 能量强度 (Energy) ---
    console.log('[TagGen] 生成能量档位...');

    const energyAttributes: Record<string, string> = {};
    const lowCount = getRangeCount('energy_level', 1, 3);
    const midCount = getRangeCount('energy_level', 4, 6);
    const highCount = getRangeCount('energy_level', 7, 10);

    if (lowCount > 0) energyAttributes[`低能量 ☁️ (${lowCount})`] = "Energy Level: Low (1-3), Background, Relaxed, Ambient.";
    if (midCount > 0) energyAttributes[`中能量 ⚡ (${midCount})`] = "Energy Level: Mid (4-6), Balanced, Engaging, Standard Pop/Rock.";
    if (highCount > 0) energyAttributes[`高能量 🔥 (${highCount})`] = "Energy Level: High (7-10), Intense, Party, Workout, Aggressive.";

    categories.push({
        title: "能量强度 (Energy)",
        attributes: energyAttributes
    });

    // --- C. 情绪氛围 (Mood) - LLM 归类 ---
    console.log('[TagGen] 获取 mood 数据...');
    const moodRaw = getDistinctValues('mood', 300);
    console.log(`[TagGen] 发现 ${moodRaw.length} 个不同的 mood 值`);

    const moodClusters = await clusterWithLLM('mood (情绪)', moodRaw);
    const moodAggregated = aggregateByCluster(moodRaw, moodClusters.clusters);

    const moodAttributes: Record<string, string> = {};
    for (const [label, data] of Object.entries(moodAggregated)) {
        if (data.count > 50) {
            moodAttributes[`${label} (${data.count})`] = data.prompt;
        }
    }

    categories.push({
        title: "情绪氛围 (Mood)",
        attributes: moodAttributes
    });

    // --- D. 场景 (Scene) - LLM 归类 ---
    console.log('[TagGen] 获取 scene_tag 数据...');
    const sceneRaw = getDistinctValues('scene_tag', 300);
    console.log(`[TagGen] 发现 ${sceneRaw.length} 个不同的 scene_tag 值`);

    const sceneClusters = await clusterWithLLM('scene_tag (场景)', sceneRaw);
    const sceneAggregated = aggregateByCluster(sceneRaw, sceneClusters.clusters);

    const sceneAttributes: Record<string, string> = {};
    for (const [label, data] of Object.entries(sceneAggregated)) {
        if (data.count > 30) {
            sceneAttributes[`${label} (${data.count})`] = data.prompt;
        }
    }

    categories.push({
        title: "场景 (Scene)",
        attributes: sceneAttributes
    });

    // --- E. 类型 (Type) ---
    console.log('[TagGen] 生成类型标签...');

    const instrumentalCount = getCount('is_instrumental', '1');
    const vocalCount = getCount('is_instrumental', '0');

    const typeAttributes: Record<string, string> = {};
    if (instrumentalCount > 0) typeAttributes[`纯音乐 (${instrumentalCount})`] = "Type: Instrumental, no vocals.";
    if (vocalCount > 0) typeAttributes[`有人声 (${vocalCount})`] = "Type: Vocal, with singing.";

    categories.push({
        title: "类型 (Type)",
        attributes: typeAttributes
    });

    // ============================================================================
    // 7. 输出最终 JSON
    // ============================================================================
    const outputPath = path.join(process.cwd(), 'src', 'data', 'generated_tags.json');
    fs.writeFileSync(outputPath, JSON.stringify(categories, null, 2), 'utf-8');

    console.log(`\n[TagGen] ✅ 成功生成: ${outputPath}`);
    console.log(`[TagGen] 分类数: ${categories.length}`);
    categories.forEach(c => {
        console.log(`  - ${c.title}: ${Object.keys(c.attributes).length} 个标签`);
    });

    db.close();
}

main().catch(err => {
    console.error('[TagGen] 执行失败:', err);
    process.exit(1);
});
