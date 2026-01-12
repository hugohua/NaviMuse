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
                return json as MetadataJSON[];
            }
            return [json as MetadataJSON];
        } catch (error) {
            console.error("[GeminiService] Batch Metadata Generation Failed:", error);
        }
    }

    async rerankSongs(query: string, candidates: any[]): Promise<string[]> {
        const model = this.genAI.getGenerativeModel({
            model: this.modelName,
            generationConfig: {
                temperature: 0.1,
                responseMimeType: "application/json"
            }
        });

        // Construct simplified candidate list for prompt to save tokens
        const simplifiedCandidates = candidates.map(c => ({
            id: c.navidrome_id,
            title: c.title,
            artist: c.artist,
            mood: c.mood,
            tags: c.tags,
            description: c.description ? c.description.substring(0, 100) + "..." : ""
        }));

        const prompt = `
You are a music search relevance expert. 
User Query: "${query}"

Rank the following candidate songs based on how well they match the user's intent, mood, and semantic meaning.
Return a JSON object with a single key "ranked_ids" containing an array of song IDs in descending order of relevance.

Candidates:
${JSON.stringify(simplifiedCandidates, null, 2)}
        `.trim();

        try {
            const result = await model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();

            // Clean markdown if present
            const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
            const JSON5 = (await import('json5')).default;
            const json = JSON5.parse(cleaned);

            if (json.ranked_ids && Array.isArray(json.ranked_ids)) {
                return json.ranked_ids.map(String);
            }
            console.warn("[GeminiService] Rerank returned unexpected format:", json);
            return candidates.map(c => String(c.navidrome_id));

        } catch (error) {
            console.error("[GeminiService] Rerank Failed:", error);
            return candidates.map(c => String(c.navidrome_id));
        }
    }
}
