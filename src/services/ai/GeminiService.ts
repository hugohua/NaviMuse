import { GoogleGenerativeAI } from '@google/generative-ai';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { IAIService } from './IAIService';
import { METADATA_SYSTEM_PROMPT, buildCuratorSystemPrompt, USER_PROFILE_SYSTEM_PROMPT } from './systemPrompt';
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

        // 2. 使用统一的 Prompt (从 systemPrompt.ts 导入)
        const systemPrompt = buildCuratorSystemPrompt(limit, userProfile);
        const userPrompt = `
Current Request: "${scenePrompt}"

Candidate Pool (Top 50 Vector Matches):
${candidatesCSV}

Instructions:
Filter and rank the best matches for this request.
`;
        console.log(systemPrompt, '<--')
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

        // 1. 压缩歌单信息 (Enhanced with Time & Play Count)
        const songsCSV = songs.map(s => {
            // Determine "Action Date" for Time Decay
            // Priority: starredAt -> created -> 'Unknown'
            // Format: YYYY-MM-DD
            let dateStr = 'Unknown';
            const dateSource = s.starredAt || s.created;
            if (dateSource) {
                try {
                    dateStr = new Date(dateSource).toISOString().split('T')[0];
                } catch (e) { }
            }

            // Special Marker for Top Played but not recently starred
            if (!s.starredAt && (s.playCount > 20)) {
                dateStr += " (HighPlays)";
            }

            return `Title:${s.title}|Artist:${s.artist}|Genre:${s.genre}|Plays:${s.playCount}|Date:${dateStr}`;
        }).join('\n');

        // 2. 使用统一的 Prompt (从 systemPrompt.ts 导入)
        const userPrompt = `
### User Listening Session
**Context**: Recent Listening Behavior Analysis
**User Notes**: User typically listens late at night (23:00+).
**Reference Date**: ${new Date().toISOString().split('T')[0]}

**Time Decay & Weighting Instructions**:
1. **Recency Bias**: 请赋予‘最近一周’(Date close to Reference Date) 的播放行为 2.0 的权重。
2. **Enduring Favorites**: 如果歌曲标记为 "(HighPlays)" 且日期较久，视为核心品味锚点，权重 1.5，不随时间衰减。
3. **Ghost Data**: 对于 '半年前' 且低播放量的行为，权重降为 0.5。
我们需要一个**进化的**音乐 DNA，而不是历史堆砌。

Candidate Songs:
${songsCSV}

### Prompt Objective:
请基于上述数据，为我生成一份具备高检索价值的 Technical Profile 以及一份极具共鸣感的 Display Card。
`;

        console.log('[GeminiService] Generating User Profile with Songs:', songs.length);

        try {
            const result = await model.generateContent(USER_PROFILE_SYSTEM_PROMPT + "\n\n" + userPrompt);
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
