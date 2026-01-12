import OpenAI from 'openai';
import { IAIService } from './IAIService';
import { METADATA_SYSTEM_PROMPT, parseAIResponse } from './systemPrompt';
import { config } from '../../config';
import { MetadataJSON } from '../../types';

export class QwenService implements IAIService {
    private client: OpenAI;

    constructor() {
        this.client = new OpenAI({
            apiKey: config.ai.apiKey, // Maps to OPENAI_API_KEY compatible Qwen Key
            baseURL: config.ai.baseURL,
        });
    }

    async generateMetadata(artist: string, title: string): Promise<MetadataJSON> {
        // Construct JSON Array input as per new Prompt V5
        const inputPayload = [
            { id: "req_1", title, artist } // dummy ID for single request
        ];
        const userPrompt = JSON.stringify(inputPayload);

        try {
            const response = await this.client.chat.completions.create({
                model: config.ai.model,
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

        try {
            const response = await this.client.chat.completions.create({
                model: config.ai.model,
                messages: [
                    { role: 'system', content: METADATA_SYSTEM_PROMPT },
                    { role: 'user', content: userPrompt }
                ],
                temperature: 0.3,
            });

            const content = response.choices[0]?.message?.content || "";
            const parsed = parseAIResponse(content as any);

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
            const json = (await import('json5')).default.parse(cleaned);

            if (Array.isArray(json)) {
                return json as MetadataJSON[];
            } else {
                return [json as MetadataJSON];
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
}
