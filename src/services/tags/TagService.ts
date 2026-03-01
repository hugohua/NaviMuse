import path from 'path';
import fs from 'fs';
import OpenAI from 'openai';
import { db } from '../../db';
import { TagCategory, manualTagCategories } from '../../data/tags';
import { navidromeClient } from '../navidrome';
import { config } from '../../config';
import dotenv from 'dotenv'; // Ensure env is loaded if running standalone

// Import fallback static tags as initial seed
import generatedTags from '../../data/generated_tags.json';

const KV_KEY_BASE = 'vibe_tags_base';
const LLM_MODEL = 'google/gemini-3-pro-preview'; // Or flash-001

interface ClusterResult {
    clusters: {
        name_cn: string;
        name_en: string;
        keywords: string[];
        prompt_hint: string;
    }[];
}

export class TagService {
    private openai: OpenAI;

    constructor() {
        this.openai = new OpenAI({
            baseURL: 'https://openrouter.ai/api/v1',
            apiKey: process.env.OPENROUTER_API_KEY || '',
        });
    }

    /**
     * Get aggregated tags for frontend
     */
    async getTags(): Promise<TagCategory[]> {
        let systemTags: TagCategory[] = [];

        // 1. Get System Tags from DB
        try {
            const row = db.prepare('SELECT value FROM system_kv WHERE key = ?').get(KV_KEY_BASE) as { value: string };
            if (row) {
                systemTags = JSON.parse(row.value);
            } else {
                console.warn('[TagService] No DB tags found, using static fallback.');
                systemTags = generatedTags as unknown as TagCategory[];
                // Auto-seed DB asynchronously
                this.seedDatabase(systemTags);
            }
        } catch (e) {
            console.error('[TagService] Store read error:', e);
            systemTags = generatedTags as unknown as TagCategory[];
        }

        // 2. Prepend Manual Vibe Tags (场景/氛围 + 风格/流派)
        const allTags: TagCategory[] = [...manualTagCategories, ...systemTags];

        // 3. Get User Artist Tags (Dynamic)
        // Only if Navidrome is configured
        if (config.navidrome.url) {
            const userArtistTags = await this.getUserArtistTags();
            if (userArtistTags) {
                allTags.push(userArtistTags);
            }
        }

        return allTags;
    }

    private seedDatabase(tags: TagCategory[]) {
        try {
            const stmt = db.prepare('INSERT OR IGNORE INTO system_kv (key, value) VALUES (?, ?)');
            stmt.run(KV_KEY_BASE, JSON.stringify(tags));
        } catch (e) {
            console.error('[TagService] Failed to seed DB:', e);
        }
    }

    /**
     * Fetch User's Starred/Most Played Artists from Navidrome
     */
    private async getUserArtistTags(): Promise<TagCategory | null> {
        try {
            // Check connectivity
            // const alive = await navidromeClient.ping();
            // if (!alive) return null;

            const [starred, mostPlayed] = await Promise.all([
                navidromeClient.getStarred(),
                navidromeClient.getMostPlayed(5)
            ]);

            const attributes: Record<string, string> = {};
            const addedArtists = new Set<string>();

            const addArtist = (artist: string, type: 'Starred' | 'Most Played') => {
                if (!artist || artist === 'Various Artists' || artist === 'Unknown Artist' || addedArtists.has(artist)) return;

                // Simple Prompt Hint for user artists
                // Ideally we could lookup their style from DB if we had it, but for now generic.
                attributes[`${artist} (${type})`] = `Artist: ${artist}. Preferred by user (${type}).`;
                addedArtists.add(artist);
            };

            // Top 15 Starred
            [...new Set(starred.map(s => s.artist))].slice(0, 15).forEach(a => addArtist(a, 'Starred'));
            // Top 10 Most Played
            [...new Set(mostPlayed.map(s => s.artist))].slice(0, 10).forEach(a => addArtist(a, 'Most Played'));

            if (Object.keys(attributes).length === 0) return null;

            return {
                title: "我的收藏 / 常听 (My Artists)",
                attributes
            };

        } catch (e) {
            // Keep silent usually, navidrome might be down or not configured
            return null;
        }
    }

    /**
     * Trigger full refresh of System Tags
     */
    async refreshSystemTags(): Promise<TagCategory[]> {
        console.log('[TagService] Starting system tag refresh...');
        const categories: TagCategory[] = [];

        // --- 1. Acoustic / Energy / Type (Statistics) ---
        categories.push(this.statsAcoustic());
        categories.push(this.statsEnergy());
        categories.push(this.statsType());

        // --- 2. Mood (LLM) ---
        categories.push(await this.clusterWithLLM('mood (情绪)', 'mood'));

        // --- 3. Scene (LLM) ---
        categories.push(await this.clusterWithLLM('scene_tag (场景)', 'scene_tag'));

        // --- 4. Artist Global (LLM) ---
        categories.push(await this.clusterArtistsWithLLM());

        // Save to DB
        const stmt = db.prepare('INSERT OR REPLACE INTO system_kv (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)');
        stmt.run(KV_KEY_BASE, JSON.stringify(categories));

        console.log('[TagService] Refresh complete.');
        return categories;
    }

    // --- Statistics Helper Methods ---

    private statsAcoustic(): TagCategory {
        const attributes: Record<string, string> = {};

        const safeCount = (col: string, val: string) => {
            const res = db.prepare(`SELECT COUNT(*) as count FROM smart_metadata WHERE ${col} = ?`).get(val) as { count: number };
            return res.count;
        };

        // Simplified mapping for brevity (can be expanded)
        const specs = [
            { val: 'High', label: '高频明亮' }, { val: 'Mid', label: '中频饱满' },
            { val: 'Low', label: '低频深沉' }, { val: 'Full', label: '全频均衡' }
        ];
        specs.forEach(s => {
            const c = safeCount('spectrum', s.val);
            if (c > 0) attributes[`${s.label} (${s.val})`] = `Spectrum: ${s.val}, ${c} songs.`;
        });

        // Spatial
        const spatial = [
            { val: 'Dry', label: '干燥紧致' }, { val: 'Wet', label: '湿润混响' },
            { val: 'Huge', label: '宏大空间' }, { val: 'Intimate', label: '私密贴近' }
        ];
        spatial.forEach(s => {
            const c = safeCount('spatial', s.val);
            if (c > 0) attributes[`${s.label} (${s.val})`] = `Spatial: ${s.val}, ${c} songs.`;
        });

        // Tempo Vibe
        const tempos = [
            { val: 'Static', label: '静谧环境' }, { val: 'Drifting', label: '漂浮律动' },
            { val: 'Driving', label: '推进节奏' }, { val: 'Explosive', label: '爆裂冲击' }
        ];
        tempos.forEach(s => {
            const c = safeCount('tempo_vibe', s.val);
            if (c > 0) attributes[`${s.label} (${s.val})`] = `Tempo Vibe: ${s.val}, ${c} songs.`;
        });

        return { title: "声学特征 (Acoustic)", attributes };
    }

    private statsEnergy(): TagCategory {
        const attributes: Record<string, string> = {};
        const range = (min: number, max: number) => {
            const res = db.prepare(`SELECT COUNT(*) as count FROM smart_metadata WHERE energy_level >= ? AND energy_level <= ?`).get(min, max) as { count: number };
            return res.count;
        };

        const low = range(1, 3);
        const mid = range(4, 6);
        const high = range(7, 10);

        if (low > 0) attributes[`低能量 ☁️`] = "Energy Level: Low (1-3), Background, Relaxed.";
        if (mid > 0) attributes[`中能量 ⚡`] = "Energy Level: Mid (4-6), Balanced, Engaging.";
        if (high > 0) attributes[`高能量 🔥`] = "Energy Level: High (7-10), Intense, Party.";

        return { title: "能量强度 (Energy)", attributes };
    }

    private statsType(): TagCategory {
        const attributes: Record<string, string> = {};
        const inst = (db.prepare("SELECT COUNT(*) as c FROM smart_metadata WHERE is_instrumental = 1").get() as any).c;
        const vocal = (db.prepare("SELECT COUNT(*) as c FROM smart_metadata WHERE is_instrumental = 0").get() as any).c;

        if (inst > 0) attributes['纯音乐'] = "Type: Instrumental, no vocals.";
        if (vocal > 0) attributes['有人声'] = "Type: Vocal, with singing.";

        return { title: "类型 (Type)", attributes };
    }

    // --- LLM Helper Methods ---

    private async clusterWithLLM(label: string, col: string): Promise<TagCategory> {
        // 1. Get stats
        const rows = db.prepare(`SELECT ${col} as value, COUNT(*) as count FROM smart_metadata WHERE ${col} IS NOT NULL AND ${col} != '' GROUP BY ${col} ORDER BY count DESC LIMIT 300`).all() as { value: string, count: number }[];
        const valueList = rows.map(v => `${v.value} (${v.count})`).join('\n');

        // 2. Load Prompt
        const promptInfo = this.getPromptTemplate(col, valueList);

        // 3. Call LLM
        const clusters = await this.callOpenAI(promptInfo.system, promptInfo.user, label);

        // 4. Aggregate
        const attributes: Record<string, string> = {};
        if (clusters && clusters.clusters) {
            for (const c of clusters.clusters) {
                // Calculate total count for this cluster
                let total = 0;
                const keywords = c.keywords.map(k => k.toLowerCase());
                rows.forEach(r => {
                    if (keywords.some(k => r.value.toLowerCase().includes(k))) {
                        total += r.count;
                    }
                });

                if (total > 0) {
                    attributes[`${c.name_cn} (${total})`] = c.prompt_hint;
                }
            }
        }

        return { title: label, attributes };
    }

    private async clusterArtistsWithLLM(): Promise<TagCategory> {
        // 1. Get stats (Top 100 Artists)
        const rows = db.prepare(`SELECT artist as value, COUNT(*) as count FROM smart_metadata WHERE artist IS NOT NULL AND artist != '' AND artist != 'Unknown Artist' GROUP BY artist ORDER BY count DESC LIMIT 100`).all() as { value: string, count: number }[];
        const valueList = rows.map(v => `${v.value} (${v.count})`).join('\n');

        // 2. Custom Prompt for Artist
        const systemPrompt = `Role: Senior Music Critic. Task: Cluster these artists into 6-8 stylistic groups (e.g., "Mandopop Kings", "Indie Folk", "Rock Pioneers").
        
Rules:
1. Output PURE JSON.
2. No Markdown.
3. Interface:
{
  "clusters": [
    {
      "name_cn": "深情男声 / 经典",
      "name_en": "Classic Emotional Male Vocals",
      "keywords": ["ArtistName1", "ArtistName2"], // The artists belonging to this group
      "prompt_hint": "Artist style: Emotional, classic Mandopop male vocals, balladic."
    }
  ]
}`;
        const userPrompt = `List of top artists:\n${valueList}\n\nGroup them by style/era/vibe.`;

        // 3. Call LLM
        const clusters = await this.callOpenAI(systemPrompt, userPrompt, "Artist");

        // 4. Aggregate
        const attributes: Record<string, string> = {};
        if (clusters && clusters.clusters) {
            for (const c of clusters.clusters) {
                // Format: "风格 (歌手1, 歌手2...)"
                // We limit to showing top 3 representative artists in the label/hint
                // But for Vibe Tags, maybe just show the Category Name?
                // User wants to click on it.
                // Let's format the key like: "深情男声 (张学友, 陈奕迅)"

                // Intersect cluster keywords with our top rows to get the heavy hitters in this cluster
                const kws = c.keywords.map(k => k.toLowerCase());
                const inGroup = rows.filter(r => kws.some(k => r.value.toLowerCase().includes(k)));
                const top3 = inGroup.slice(0, 3).map(r => r.value).join(', ');
                const total = inGroup.reduce((sum, r) => sum + r.count, 0);

                if (total > 0) {
                    attributes[`${c.name_cn} (${top3})`] = c.prompt_hint;
                }
            }
        }

        return { title: "全球歌手 (Global Artists)", attributes };
    }

    private async callOpenAI(sys: string, user: string, context: string): Promise<ClusterResult | null> {
        console.log(`[TagService] Calling LLM for ${context}...`);
        try {
            const response = await this.openai.chat.completions.create({
                model: LLM_MODEL,
                messages: [
                    { role: 'system', content: sys },
                    { role: 'user', content: user }
                ],
                temperature: 0.3,
                response_format: { type: 'json_object' }
            });
            const content = response.choices[0]?.message?.content || '{}';
            const cleaned = content.replace(/```json/g, '').replace(/```/g, '').trim();
            const start = cleaned.indexOf('{');
            const end = cleaned.lastIndexOf('}');
            const jsonStr = (start !== -1 && end !== -1) ? cleaned.substring(start, end + 1) : cleaned;
            return JSON.parse(jsonStr) as ClusterResult;
        } catch (e) {
            console.error(`[TagService] LLM Error for ${context}:`, e);
            return null;
        }
    }

    private getPromptTemplate(fieldName: string, valueList: string): { system: string, user: string } {
        // Try reading external file, else use default logic
        const promptPath = path.join(process.cwd(), 'scripts', 'tag-clustering-prompt.txt');
        try {
            const tpl = fs.readFileSync(promptPath, 'utf-8');
            const [s, u] = tpl.split('[USER]');
            return {
                system: s.replace('[SYSTEM]', '').replace(/{{fieldName}}/g, fieldName).trim(),
                user: u.replace(/{{fieldName}}/g, fieldName).replace('{{valueList}}', valueList).trim()
            };
        } catch (e) {
            // Fallback default
            return {
                system: `You are a music expert. Cluster valid ${fieldName} tags into 6-10 meaningful categories. Output JSON only. Format: {clusters: [{name_cn, name_en, keywords, prompt_hint}]}`,
                user: `Values:\n${valueList}`
            };
        }
    }
}

export const tagService = new TagService();
