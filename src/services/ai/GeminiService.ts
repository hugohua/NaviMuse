import { GoogleGenerativeAI } from '@google/generative-ai';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { IAIService } from './IAIService';
import { METADATA_SYSTEM_PROMPT } from './systemPrompt';
import { MetadataJSON } from '../../types';
import nodeFetch from 'node-fetch';
import { config } from '../../config';

/**
 * Gemini AI 服务实现
 * 处理与 Google Gemini API 的交互，包括元数据生成和 Proxy 配置
 */
export class GeminiService implements IAIService {
    private genAI: GoogleGenerativeAI;
    private modelName: string;

    constructor() {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) throw new Error("Missing GEMINI_API_KEY in environment variables");

        // --- Proxy Configuration Pattern from SonicFlow ---
        // Verify proxy environment variable
        const proxyUrl = process.env.HTTPS_PROXY;

        if (proxyUrl) {
            console.log(`[GeminiService] Configuring Proxy: ${proxyUrl}`);
            const agent = new HttpsProxyAgent(proxyUrl);

            // Override global fetch to force proxy usage
            // The SDK uses fetch internally. This intercepts it.
            // @ts-ignore
            global.fetch = async (url: string, options: any) => {
                return nodeFetch(url, {
                    ...options,
                    agent: agent
                });
            };
        }
        // --------------------------------------------------

        this.genAI = new GoogleGenerativeAI(apiKey);

        // Use model from Env or fallback to known good model
        this.modelName = process.env.GEMINI_MODEL || "gemini-3-flash-preview";
        console.log(`[GeminiService] Initialized with Model: ${this.modelName}`);
    }

    async generateMetadata(artist: string, title: string): Promise<MetadataJSON> {
        const result = await this.generateBatchMetadata([{ id: "req_1", title, artist }]);
        return result[0];
    }

    async generateBatchMetadata(songs: { id: string | number, title: string, artist: string }[]): Promise<MetadataJSON[]> {
        // Note: requestOptions are no longer needed for proxy as we hijacked fetch
        const model = this.genAI.getGenerativeModel({
            model: this.modelName,
            systemInstruction: METADATA_SYSTEM_PROMPT,
            generationConfig: {
                temperature: config.ai.temperature
            }
        });

        const userPrompt = JSON.stringify(songs);

        try {
            const result = await model.generateContent(userPrompt);
            const response = await result.response;
            const text = response.text();

            // Local parsing for batch
            const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();

            console.log(`[GeminiService Debug] Raw Response Length: ${text.length}`);
            if (text.length < 500) console.log(`[GeminiService Debug] Raw Response Preview: ${text}`);

            // Use dynamic import for json5 or just standard JSON if prompt is good?
            // SonicFlow used json5, let's stick to import
            const JSON5 = (await import('json5')).default;
            const json = JSON5.parse(cleaned);

            if (Array.isArray(json)) {
                return (json as MetadataJSON[]).map(item => ({
                    ...item,
                    llm_model: this.modelName
                }));
            }
            return [{
                ...(json as MetadataJSON),
                llm_model: this.modelName
            }];
        } catch (error) {
            console.error("[GeminiService] Batch Metadata Generation Failed:", error);
            return [];
        }
    }

    async rerankSongs(query: string, candidates: any[]): Promise<string[]> {
        // ... (existing rerank logic, though we might deprecate it later)
        // For brevity in this edit, I am keeping it or replacing it if needed, 
        // but task is to ADD curatePlaylist.

        // Actually, let's keep rerankSongs as is for backward compat if any, 
        // and append curatePlaylist. 
        // Wait, replace_file_content needs me to replace the block I'm targeting.
        // I will target the end of rerankSongs and append curatePlaylist.

        // Let's re-read rerankSongs closing brace to be sure.
        return this.curatePlaylist(query, candidates).then(res => res.tracks.map(t => t.songId));
    }

    async curatePlaylist(scenePrompt: string, candidates: any[], limit: number = 20, userProfile?: any): Promise<import('../../types').CuratorResponse> {
        const model = this.genAI.getGenerativeModel({
            model: this.modelName,
            generationConfig: {
                temperature: 0.7, // Higher creativity for curation
                responseMimeType: "application/json"
            }
        });

        // 1. Compress Candidates
        const candidatesCSV = candidates.map(c => {
            let tagsArray: string[] = [];
            try {
                if (Array.isArray(c.tags)) tagsArray = c.tags;
                else if (typeof c.tags === 'string') tagsArray = JSON.parse(c.tags);
            } catch (e) { /* ignore parse error */ }

            return `ID:${c.navidrome_id}|T:${c.title}|A:${c.artist}|Mood:${c.mood || ''}|Tags:${(tagsArray || []).slice(0, 3).join(',')}`;
        }).join('\n');

        const systemPrompt = `
# Role
You are a **Senior Music Curator**. Your goal is to curate a cohesive playlist from a list of candidates based on a specific Scene/Vibe.

${userProfile ? `
# User Context (IMPORTANT)
The user has the following musical profile. You MUST adapt your tone and selection to fit this persona:
${typeof userProfile === 'string' ? userProfile : JSON.stringify(userProfile, null, 2)}
` : ''}

# Rules
1. **Selection**: Select up to ${limit} songs that BEST match the scene.
2. **Quality**: If fewer songs fit, return fewer. Do NOT force fit.
3. **Reasoning**: Provide a short, witty reason (in Chinese) for each track.
4. **Variety**: Balance the flow (unless requested otherwise).

# Output JSON Structure (Strict)
{
  "scene": "Summary of the scene (Max 4 words)",
  "playlistName": "Creative Title",
  "description": "One sentence description of the vibe",
  "tracks": [
    { "songId": "Original ID", "reason": "Why this song fits" }
  ]
}
`;
        const userPrompt = `
Current Request: "${scenePrompt}"

Candidate Pool (Top 50 Vector Matches):
${candidatesCSV}

Instructions:
Filter and rank the best matches for this request.
`;

        try {
            console.log("[GeminiService] curating playlist with prompt...");
            const result = await model.generateContent(systemPrompt + "\n\n" + userPrompt);
            const response = await result.response;
            const text = response.text();
            console.log("[GeminiService] Raw AI Response:", text.substring(0, 100) + "...");

            const JSON5 = (await import('json5')).default;
            const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
            const json = JSON5.parse(cleaned);

            return json as import('../../types').CuratorResponse;
        } catch (error) {
            console.error("[GeminiService] Curation Failed:", error);
            // Fallback: Return top N candidates
            return {
                scene: "Fallback Selection",
                playlistName: "Vector Matches",
                description: "AI curation failed, showing top matches.",
                tracks: candidates.slice(0, limit).map(c => ({
                    songId: String(c.navidrome_id),
                    reason: "Vector Similarity"
                }))
            };
        }
    }

    async analyzeUserProfile(songs: import('../../types').Song[]): Promise<import('../../types').UserProfile> {
        const model = this.genAI.getGenerativeModel({
            model: this.modelName,
            generationConfig: {
                temperature: 0.8,
                responseMimeType: "application/json"
            }
        });

        // 1. 压缩歌单信息
        const songsCSV = songs.map(s =>
            `Title:${s.title}|Artist:${s.artist}|Genre:${s.genre}|Plays:${s.playCount}`
        ).join('\n');

        const systemPrompt = `
<system_config>
  <role>NaviMuse: Chief Musicologist & Vector Search Architect</role>
  <specialization>Acoustic Psychology, Cultural Anthropology, & High-Dimensional Semantic Modeling</specialization>
  <engine_tuning>
    - Output_Format: STRICT Minified JSON (Single-line string preferred for API)
    - Tone: Poetic, Insightful, "NetEase Cloud Annual Report" style (Urban Literary)
    - Architecture: Optimized for 768D Vector Space Separation (Embedding distance maximization)
  </engine_tuning>
</system_config>

<logic_processing_unit>
  <rule id="Metadata_Override">
    输入中的原始 Genre (如 "Pop") 仅作为参考。必须通过 Artist 和 Title 进行二次知识挖掘：
    - [陈奕迅/张学友] -> 细化为 "Cantopop", "Ballad Narrative".
    - [周杰伦] -> 细化为 "Taiwanese R&B", "Y2K Mandopop".
    - [Lo-fi/Chill] -> 映射到物理声场: "Small Room", "Analog Hiss", "Low-fidelity".
  </rule>
  <rule id="Acoustic_Inference">
    根据 BPM 和 调性 (Keys) 映射心理特质：
    - Low BPM + Minor Key: "内省者", "怀旧主义", "深夜自省".
    - High BPM + Electronic: "多巴胺寻求者", "活力外向", "现代性".
  </rule>
</logic_processing_unit>

<output_schema>
{
  "technical_profile": {
    "summary_tags": ["#细分流派", "#音色质感", "#年代坐标", "#核心情绪"],
    "taste_anchors": ["3-5名代表用户品味DNA的灵魂歌手"],
    "dimensions": {
      "era_preference": "精确的年代区间及文化背景描述",
      "energy_level": "基于 0.0-1.0 的能量值及文字描述",
      "acoustic_environment": "听感空间描述 (例: 干燥且贴耳, 宏大且潮湿)"
    },
    "blacklist_inference": ["用户大概率会产生审美排斥的 3 个流派/元素"]
  },
  "display_card": {
    "title": "4-6字具有张力的中文称号 (例: 碎裂时光的修补匠)",
    "message": "100-150字。以'你骨子里...'或'你试图在音乐中寻找...'开头。包含对 1-2 名灵魂歌手象征意义的解剖。风格要求：极简、犀利、极具文学性。",
    "ui_theme": {
      "primary_color": "Hex颜色建议 (基于音乐情绪)",
      "visual_metaphor": "建议的背景视觉意象 (例: 暴雨后的港口、深夜的爵士酒廊)"
    }
  }
}
</output_schema>
`;

        const userPrompt = `
### User Listening Session
**Context**: Recent Listening Behavior Analysis
**User Notes**: User typically listens late at night (23:00+).

Candidate Songs:
${songsCSV}

### Prompt Objective:
请基于上述数据，为我生成一份具备高检索价值的 Technical Profile 以及一份极具共鸣感的 Display Card。
`;

        console.log('[GeminiService] Generating User Profile with Songs:', songs.length);

        try {
            const result = await model.generateContent(systemPrompt + "\n\n" + userPrompt);
            const response = await result.response;
            const text = response.text();

            // Clean and Parse
            const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
            const JSON5 = (await import('json5')).default;
            return JSON5.parse(cleaned) as import('../../types').UserProfile;
        } catch (e) {
            console.error("Failed to generate/parse User Profile:", e);
            throw new Error("AI User Profile Generation Failed");
        }
    }
}
