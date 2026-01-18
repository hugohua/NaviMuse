import OpenAI from 'openai';
import { IAIService } from './IAIService';
import { METADATA_SYSTEM_PROMPT, parseAIResponse, buildCuratorSystemPrompt, USER_PROFILE_SYSTEM_PROMPT } from './systemPrompt';
import { repairJson, writeErrorLog, cleanMarkdown, logAIRequest, logAIResponse } from './aiUtils';
import { config } from '../../config';
import { systemRepo } from '../../db';
import { MetadataJSON, CuratorResponse } from '../../types';

export class QwenService implements IAIService {
    private client: OpenAI;
    private lastPrompts: { system: string; user: string } = { system: '', user: '' };

    constructor() {
        this.client = new OpenAI({
            apiKey: config.ai.apiKey,
            baseURL: config.ai.baseURL,
        });
    }

    private getModelName(): string {
        const dbModel = systemRepo.getSetting('ai_model');
        if (dbModel) return dbModel;
        return config.ai.model;
    }

    async generateMetadata(artist: string, title: string): Promise<MetadataJSON> {
        const inputPayload = [{ id: "req_1", title, artist }];
        const userPrompt = JSON.stringify(inputPayload);
        const currentModel = this.getModelName();

        try {
            const response = await this.client.chat.completions.create({
                model: currentModel,
                messages: [
                    { role: 'system', content: METADATA_SYSTEM_PROMPT },
                    { role: 'user', content: userPrompt }
                ],
                temperature: config.ai.temperature,
            });

            const content = response.choices[0]?.message?.content || "";
            return parseAIResponse(content);
        } catch (error) {
            console.error("[QwenService] Metadata Generation Failed:", error);
            throw error;
        }
    }

    async generateBatchMetadata(songs: { id: string | number, title: string, artist: string }[]): Promise<MetadataJSON[]> {
        const userPrompt = JSON.stringify(songs);
        const currentModel = this.getModelName();

        logAIRequest('QwenService', currentModel, METADATA_SYSTEM_PROMPT, userPrompt);

        let rawContent = '';

        try {
            const response = await this.client.chat.completions.create({
                model: currentModel,
                messages: [
                    { role: 'system', content: METADATA_SYSTEM_PROMPT },
                    { role: 'user', content: userPrompt }
                ],
                temperature: 0.3,
            });

            rawContent = response.choices[0]?.message?.content || "";
            logAIResponse('QwenService', rawContent);

            let cleaned = cleanMarkdown(rawContent);
            cleaned = repairJson(cleaned);

            const JSON5 = (await import('json5')).default;
            const json = JSON5.parse(cleaned);

            if (Array.isArray(json)) {
                return (json as MetadataJSON[]).map(item => ({
                    ...item,
                    llm_model: currentModel
                }));
            } else {
                return [{
                    ...(json as MetadataJSON),
                    llm_model: currentModel
                }];
            }

        } catch (error: any) {
            console.error("[QwenService] Batch Metadata Generation Failed:", error);

            await writeErrorLog({
                serviceName: 'QwenService',
                modelName: currentModel,
                error,
                userPrompt,
                rawResponse: rawContent
            });

            throw error;
        }
    }

    async rerankSongs(query: string, candidates: any[]): Promise<string[]> {
        return this.curatePlaylist(query, candidates).then(res => res.tracks.map(t => t.songId));
    }

    async curatePlaylist(scenePrompt: string, candidates: any[], limit: number = 20, userProfile?: any): Promise<CuratorResponse> {
        const candidatesCSV = candidates.map(c => {
            let tagsArray: string[] = [];
            try {
                if (Array.isArray(c.tags)) tagsArray = c.tags;
                else if (typeof c.tags === 'string') tagsArray = JSON.parse(c.tags);
            } catch (e) { /* ignore */ }
            return `ID:${c.navidrome_id}|T:${c.title}|A:${c.artist}|Mood:${c.mood || ''}|Tags:${(tagsArray || []).slice(0, 3).join(',')}`;
        }).join('\n');

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
            console.log(`[QwenService] Curating playlist using ${currentModel}...`);
            const response = await this.client.chat.completions.create({
                model: currentModel,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                temperature: 0.7
            });

            const text = response.choices[0]?.message?.content || "";
            console.log("[QwenService] Raw AI Response:", text.substring(0, 100) + "...");

            const JSON5 = (await import('json5')).default;
            const cleaned = cleanMarkdown(text);
            const json = JSON5.parse(cleaned);

            return json as CuratorResponse;
        } catch (error) {
            console.error("[QwenService] Curation Failed:", error);
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

    async analyzeUserProfile(songs: any[]): Promise<any> {
        const songsCSV = songs.map(s => {
            let dateStr = 'Unknown';
            const dateSource = s.starredAt || s.created;
            if (dateSource) {
                try { dateStr = new Date(dateSource).toISOString().split('T')[0]; } catch (e) { }
            }
            if (!s.starredAt && (s.playCount > 20)) {
                dateStr += " (HighPlays)";
            }
            return `Title:${s.title}|Artist:${s.artist}|Genre:${s.genre}|Plays:${s.playCount}|Date:${dateStr}`;
        }).join('\n');

        const userPrompt = `
### User Listening Session
**Context**: Recent Listening Behavior Analysis
**User Notes**: User typically listens late at night (23:00+).
**Reference Date**: ${new Date().toISOString().split('T')[0]}

**Time Decay & Weighting Instructions**:
1. **Recency Bias**: 请赋予'最近一周'(Date close to Reference Date) 的播放行为 2.0 的权重。
2. **Enduring Favorites**: 如果歌曲标记为 "(HighPlays)" 且日期较久，视为核心品味锚点，权重 1.5，不随时间衰减。
3. **Ghost Data**: 对于 '半年前' 且低播放量的行为，权重降为 0.5。
我们需要一个**进化的**音乐 DNA，而不是历史堆砌。

Candidate Songs:
${songsCSV}

### Prompt Objective:
请基于上述数据，为我生成一份具备高检索价值的 Technical Profile 以及一份极具共鸣感的 Display Card。
`;
        const currentModel = this.getModelName();
        console.log(`[QwenService] Generating User Profile with ${currentModel} (Songs: ${songs.length})`);

        try {
            const response = await this.client.chat.completions.create({
                model: currentModel,
                messages: [
                    { role: 'system', content: USER_PROFILE_SYSTEM_PROMPT },
                    { role: 'user', content: userPrompt }
                ],
                temperature: 0.8
            });

            const text = response.choices[0]?.message?.content || "";
            const cleaned = cleanMarkdown(text);
            const JSON5 = (await import('json5')).default;
            return JSON5.parse(cleaned);
        } catch (e) {
            console.error("[QwenService] User Profile Generation Failed:", e);
            throw new Error("AI User Profile Generation Failed");
        }
    }

    getLastPrompts() {
        return this.lastPrompts;
    }
}
