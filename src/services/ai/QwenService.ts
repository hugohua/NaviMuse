import OpenAI from 'openai';
import { IAIService } from './IAIService';
import { METADATA_SYSTEM_PROMPT, parseAIResponse, buildCuratorSystemPrompt } from './systemPrompt';
import { config } from '../../config';
import { systemRepo } from '../../db';
import { MetadataJSON, CuratorResponse } from '../../types';

export class QwenService implements IAIService {
    private client: OpenAI;
    private lastPrompts: { system: string; user: string } = { system: '', user: '' };

    constructor() {
        this.client = new OpenAI({
            apiKey: config.ai.apiKey, // Maps to OPENAI_API_KEY compatible Qwen Key
            baseURL: config.ai.baseURL,
        });
    }

    private getModelName(): string {
        const dbModel = systemRepo.getSetting('ai_model');
        if (dbModel) return dbModel;
        return config.ai.model;
    }

    async generateMetadata(artist: string, title: string): Promise<MetadataJSON> {
        // Construct JSON Array input as per new Prompt V5
        const inputPayload = [
            { id: "req_1", title, artist } // dummy ID for single request
        ];
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

        try {
            const response = await this.client.chat.completions.create({
                model: currentModel,
                messages: [
                    { role: 'system', content: METADATA_SYSTEM_PROMPT },
                    { role: 'user', content: userPrompt }
                ],
                temperature: 0.3,
            });

            const content = response.choices[0]?.message?.content || "";
            // const parsed = parseAIResponse(content as any);

            // parseAIResponse handles single object return by force, 
            // we might need to adjust it to return raw array if used internally,
            // or just cast it here because in V5 prompt we request ARRAY output.
            // But `parseAIResponse` signature returns MetadataJSON (single).
            // We need to fix `parseAIResponse` or handle array parsing here.

            // Let's look at parseAIResponse impl in systemPrompt.ts:
            // It returns MetadataJSON.
            // We need to update systemPrompt.ts to export a function that returns Array.
            // For now, let's just parse manually here to unblock, or update systemPrompt.ts first?
            // The prompt says "Output MUST be a raw JSON Array".
            // parseAIResponse returns "parsed[0]" if array.

            // To support batch, we should probably update `parseAIResponse` to be generic or create `parseAIBatchResponse`.
            // Let's implement local parsing for batch for now to minimize ripple.

            const cleaned = content.replace(/```json/g, '').replace(/```/g, '').trim();
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

        } catch (error) {
            console.error("[QwenService] Batch Metadata Generation Failed:", error);
            throw error;
        }
    }
    async rerankSongs(query: string, candidates: any[]): Promise<string[]> {
        // Not implemented for Qwen yet, return original order
        console.warn("[QwenService] Rerank not implemented, returning original order.");
        return candidates.map(c => String(c.navidrome_id));
    }

    async curatePlaylist(scenePrompt: string, candidates: any[], limit: number = 20, userProfile?: any): Promise<CuratorResponse> {
        // 1. 压缩候选歌曲信息
        const candidatesCSV = candidates.map(c => {
            let tagsArray: string[] = [];
            try {
                if (Array.isArray(c.tags)) tagsArray = c.tags;
                else if (typeof c.tags === 'string') tagsArray = JSON.parse(c.tags);
            } catch (e) { /* ignore parse error */ }

            return `ID:${c.navidrome_id}|T:${c.title}|A:${c.artist}|Mood:${c.mood || ''}|Tags:${(tagsArray || []).slice(0, 3).join(',')}`;
        }).join('\n');

        const systemPrompt = buildCuratorSystemPrompt(limit, userProfile);
        const userPrompt = `
Current Request: "${scenePrompt}"

Candidate Pool (Top 50 Vector Matches):
${candidatesCSV}

Instructions:
Filter and rank the best matches for this request.
Output ONLY valid JSON (no markdown blocks).
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
                temperature: 0.7,
            });

            const content = response.choices[0]?.message?.content || "";
            console.log("[QwenService] Raw AI Response:", content.substring(0, 100) + "...");

            // 解析 JSON
            const cleaned = content.replace(/```json/g, '').replace(/```/g, '').trim();
            const JSON5 = (await import('json5')).default;
            const json = JSON5.parse(cleaned);

            return json as CuratorResponse;
        } catch (error) {
            console.error("[QwenService] Curation Failed:", error);
            // Fallback: 返回向量相似度最高的 N 首
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
        console.warn("[QwenService] analyzeUserProfile not implemented.");
        return {};
    }

    getLastPrompts() {
        return this.lastPrompts;
    }
}
