import { OpenRouter } from '@openrouter/sdk';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { IAIService } from './IAIService';
import { METADATA_SYSTEM_PROMPT, buildCuratorSystemPrompt, USER_PROFILE_SYSTEM_PROMPT } from './systemPrompt';
import { MetadataJSON } from '../../types';
import nodeFetch from 'node-fetch';
import { config } from '../../config';
import { systemRepo } from '../../db';

/**
 * Gemini Service (via OpenRouter)
 * Replaces official Google SDK with OpenRouter SDK to access Gemini and other models.
 */
export class GeminiService implements IAIService {
    private openRouter: OpenRouter;
    private defaultModel: string;
    private lastPrompts: { system: string; user: string } = { system: '', user: '' };

    constructor() {
        // Use OpenRouter API Key
        const apiKey = process.env.OPENROUTER_API_KEY;
        if (!apiKey) throw new Error("Missing OPENROUTER_API_KEY in environment variables");

        // --- Proxy Configuration (Enhanced for OpenRouter SDK) ---
        const proxyUrl = process.env.HTTPS_PROXY;

        if (proxyUrl) {
            console.log(`[GeminiService] Configuring Proxy: ${proxyUrl}`);
            const agent = new HttpsProxyAgent(proxyUrl);

            // Override global fetch to force proxy usage and handle Request objects from SDK
            // @ts-ignore
            global.fetch = async (input: RequestInfo, init?: RequestInit) => {
                let url = '';
                let options: any = {
                    agent: agent,
                    ...init
                };

                if (typeof input === 'string') {
                    url = input;
                } else if (input && typeof input === 'object' && 'url' in input) {
                    // Convert Native Request to compatible options for node-fetch
                    const req = input as any;
                    url = req.url;
                    options.method = options.method || req.method;
                    options.headers = options.headers || req.headers;

                    // Handle body if present in Request and not in init (e.g. JSON payload)
                    if (!options.body && req.body) {
                        try {
                            // Assuming JSON text body for SDK usage
                            options.body = await req.text();
                        } catch (e) { /* ignore if body is not readable */ }
                    }
                }

                return nodeFetch(url, options);
            };
        }
        // --------------------------------------------------

        this.openRouter = new OpenRouter({
            apiKey: apiKey
            // defaultHeaders removed as it is not supported in SDKOptions
        });

        // Default to OpenRouter's ID for Gemini 2.0 Flash (Free)
        // Users can override via GEMINI_MODEL
        this.defaultModel = process.env.GEMINI_MODEL || "google/gemini-2.0-flash-exp:free";
        console.log(`[GeminiService] Initialized. Default Model: ${this.defaultModel}`);
    }

    private getModelName(): string {
        const dbModel = systemRepo.getSetting('ai_model');
        if (dbModel) return dbModel;
        return this.defaultModel;
    }

    // Helper to safely extract text content from OpenRouter response
    private extractContent(content: string | undefined | null | any[]): string {
        if (!content) return "";
        if (typeof content === 'string') return content;
        if (Array.isArray(content)) {
            return content
                .filter(c => c.type === 'text')
                .map(c => c.text || '')
                .join('');
        }
        return "";
    }

    async generateMetadata(artist: string, title: string): Promise<MetadataJSON> {
        const result = await this.generateBatchMetadata([{ id: "req_1", title, artist }]);
        return result[0];
    }

    async generateBatchMetadata(songs: { id: string | number, title: string, artist: string }[]): Promise<MetadataJSON[]> {
        const userPrompt = JSON.stringify(songs);
        const currentModel = this.getModelName();

        try {
            // @ts-ignore
            const result = await this.openRouter.chat.send({
                model: currentModel,
                messages: [
                    { role: 'system', content: METADATA_SYSTEM_PROMPT },
                    { role: 'user', content: userPrompt }
                ],
                temperature: config.ai.temperature, // OpenRouter supports this
            });

            const text = this.extractContent(result.choices[0]?.message?.content);

            // Clean Markdown
            const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();

            console.log(`[GeminiService Debug] Raw Response Length: ${text.length}`);
            if (text.length < 500) console.log(`[GeminiService Debug] Raw Response Preview: ${text}`);

            const JSON5 = (await import('json5')).default;
            const json = JSON5.parse(cleaned);

            if (Array.isArray(json)) {
                return (json as MetadataJSON[]).map(item => ({
                    ...item,
                    llm_model: currentModel
                }));
            }
            return [{
                ...(json as MetadataJSON),
                llm_model: currentModel
            }];
        } catch (error: any) {
            console.error("[GeminiService] Batch Metadata Generation Failed:", error);
            // OpenRouter error handling (look for 429)
            if (error?.code === 429 || error?.message?.includes('429')) {
                console.log("[Quota] Rate Limit Hit (429)");
            }
            throw error;
        }
    }

    async rerankSongs(query: string, candidates: any[]): Promise<string[]> {
        return this.curatePlaylist(query, candidates).then(res => res.tracks.map(t => t.songId));
    }

    async curatePlaylist(scenePrompt: string, candidates: any[], limit: number = 20, userProfile?: any): Promise<import('../../types').CuratorResponse> {
        // 1. Compress Candidates
        const candidatesCSV = candidates.map(c => {
            let tagsArray: string[] = [];
            try {
                if (Array.isArray(c.tags)) tagsArray = c.tags;
                else if (typeof c.tags === 'string') tagsArray = JSON.parse(c.tags);
            } catch (e) { /* ignore parse error */ }

            return `ID:${c.navidrome_id}|T:${c.title}|A:${c.artist}|Mood:${c.mood || ''}|Tags:${(tagsArray || []).slice(0, 3).join(',')}`;
        }).join('\n');

        // 2. Build Prompt
        const systemPrompt = buildCuratorSystemPrompt(limit, userProfile);
        const userPrompt = `
Current Request: "${scenePrompt}"

Candidate Pool (Top 50 Vector Matches):
${candidatesCSV}

Instructions:
Filter and rank the best matches for this request.
`;
        this.lastPrompts = { system: systemPrompt, user: userPrompt };
        const currentModel = this.getModelName();

        try {
            console.log(`[GeminiService] Curating playlist using ${currentModel}...`);
            // @ts-ignore
            const result = await this.openRouter.chat.send({
                model: currentModel,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                temperature: 0.7
            });

            const text = this.extractContent(result.choices[0]?.message?.content);
            console.log("[GeminiService] Raw AI Response:", text.substring(0, 100) + "...");

            const JSON5 = (await import('json5')).default;
            const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
            const json = JSON5.parse(cleaned);

            return json as import('../../types').CuratorResponse;
        } catch (error) {
            console.error("[GeminiService] Curation Failed:", error);
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
        // 1. Compress Song Data
        const songsCSV = songs.map(s => {
            let dateStr = 'Unknown';
            const dateSource = s.starredAt || s.created;
            if (dateSource) {
                try {
                    dateStr = new Date(dateSource).toISOString().split('T')[0];
                } catch (e) { }
            }
            if (!s.starredAt && (s.playCount > 20)) {
                dateStr += " (HighPlays)";
            }
            return `Title:${s.title}|Artist:${s.artist}|Genre:${s.genre}|Plays:${s.playCount}|Date:${dateStr}`;
        }).join('\n');

        // 2. Build User Prompt
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
        const currentModel = this.getModelName();
        console.log(`[GeminiService] Generating User Profile with ${currentModel} (Songs: ${songs.length})`);

        try {
            // @ts-ignore
            const result = await this.openRouter.chat.send({
                model: currentModel,
                messages: [
                    { role: 'system', content: USER_PROFILE_SYSTEM_PROMPT },
                    { role: 'user', content: userPrompt }
                ],
                temperature: 0.8
            });

            const text = this.extractContent(result.choices[0]?.message?.content);
            const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
            const JSON5 = (await import('json5')).default;
            return JSON5.parse(cleaned) as import('../../types').UserProfile;
        } catch (e) {
            console.error("Failed to generate/parse User Profile:", e);
            throw new Error("AI User Profile Generation Failed");
        }
    }

    getLastPrompts() {
        return this.lastPrompts;
    }
}

