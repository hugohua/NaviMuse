import { GoogleGenerativeAI, TaskType } from '@google/generative-ai';
import { HttpsProxyAgent } from 'https-proxy-agent';
import nodeFetch from 'node-fetch';
import OpenAI from 'openai';
import { config } from '../../config';

/**
 * 向量嵌入服务 (Embedding Service)
 * 支持多服务商：DashScope (阿里云) / Gemini (Google)
 */
export class EmbeddingService {
    private provider: 'dashscope' | 'gemini';
    private genAI?: GoogleGenerativeAI;
    private openaiClient?: OpenAI;
    private modelName: string;
    private dimensions: number;

    constructor() {
        this.provider = config.embedding.provider;
        this.modelName = config.embedding.model;
        this.dimensions = config.embedding.dimensions;

        if (this.provider === 'gemini') {
            this.initGemini();
        } else {
            this.initDashScope();
        }

        console.log(`[EmbeddingService] Initialized with provider: ${this.provider}, model: ${this.modelName}, dimensions: ${this.dimensions}`);
    }

    private initGemini() {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) throw new Error("Missing GEMINI_API_KEY for Gemini Embedding");

        const proxyUrl = process.env.HTTPS_PROXY;
        if (proxyUrl) {
            const agent = new HttpsProxyAgent(proxyUrl);
            // @ts-ignore
            if (!global.fetch || !global.fetch.toString().includes('nodeFetch')) {
                // @ts-ignore
                global.fetch = async (url: string, options: any) => {
                    return nodeFetch(url, { ...options, agent });
                };
            }
        }

        this.genAI = new GoogleGenerativeAI(apiKey);
        this.modelName = 'gemini-embedding-001'; // Gemini Embedding 固定模型
    }

    private initDashScope() {
        this.openaiClient = new OpenAI({
            apiKey: config.ai.apiKey,
            baseURL: config.ai.baseURL,
        });
    }

    /**
     * 生成单个文本的向量嵌入
     */
    async embed(text: string): Promise<number[]> {
        if (this.provider === 'gemini') {
            return this.embedWithGemini(text);
        }
        return this.embedWithDashScope(text);
    }

    /**
     * 批量生成向量
     */
    async embedBatch(texts: string[]): Promise<number[][]> {
        if (this.provider === 'gemini') {
            return this.embedBatchWithGemini(texts);
        }
        return this.embedBatchWithDashScope(texts);
    }

    // ============ DashScope (阿里云) 实现 ============

    private async embedWithDashScope(text: string): Promise<number[]> {
        if (!this.openaiClient) throw new Error("DashScope client not initialized");

        const response = await this.openaiClient.embeddings.create({
            model: this.modelName,
            input: text,
            dimensions: this.dimensions,
        });

        return response.data[0].embedding;
    }

    private async embedBatchWithDashScope(texts: string[]): Promise<number[][]> {
        if (!this.openaiClient) throw new Error("DashScope client not initialized");

        const response = await this.openaiClient.embeddings.create({
            model: this.modelName,
            input: texts,
            dimensions: this.dimensions,
        });

        return response.data.map(item => item.embedding);
    }

    // ============ Gemini 实现 ============

    private async embedWithGemini(text: string): Promise<number[]> {
        if (!this.genAI) throw new Error("Gemini client not initialized");

        const model = this.genAI.getGenerativeModel({ model: this.modelName });
        const result = await model.embedContent({
            content: { role: 'user', parts: [{ text }] },
            taskType: TaskType.RETRIEVAL_DOCUMENT,
            // @ts-ignore
            outputDimensionality: this.dimensions
        });

        if (!result.embedding?.values) {
            throw new Error("Failed to generate Gemini embedding");
        }
        return result.embedding.values;
    }

    private async embedBatchWithGemini(texts: string[]): Promise<number[][]> {
        if (!this.genAI) throw new Error("Gemini client not initialized");

        const model = this.genAI.getGenerativeModel({ model: this.modelName });
        const result = await model.batchEmbedContents({
            requests: texts.map(t => ({
                content: { role: 'user', parts: [{ text: t }] },
                taskType: TaskType.RETRIEVAL_DOCUMENT,
                // @ts-ignore
                outputDimensionality: this.dimensions
            }))
        });

        if (!result.embeddings) return [];
        return result.embeddings.map(e => e.values || []);
    }

    // ============ 向量文本构建 (与服务商无关) ============

    /**
     * 构建符合向量模型偏好的结构化文本模板
     * 兼容两种格式：
     * 1. 正确格式: vector_anchor: { acoustic_model, semantic_push, cultural_weight }
     * 2. 扁平格式: vector_anchor: string, semantic_push: string, cultural_weight: string (顶层)
     */
    static constructVectorText(data: import('../../types').MetadataJSON, trackInfo: { title: string, artist: string, genre?: string }): string {
        const anchor = data.vector_anchor;
        const tags = data.embedding_tags;

        // 兼容扁平化格式：判断 vector_anchor 是字符串还是对象
        const isFlattened = typeof anchor === 'string';

        // 从正确位置或 fallback 位置读取字段
        const acousticModel = isFlattened ? anchor : (anchor?.acoustic_model || '');
        const semanticPush = isFlattened ? (data as any).semantic_push : (anchor?.semantic_push || '');
        const culturalWeight = isFlattened ? (data as any).cultural_weight : (anchor?.cultural_weight || '');
        const exclusion = isFlattened ? 'None' : (anchor?.exclusion_logic || 'None');

        const moodTags = (tags.mood_coord || []).join(', ');
        const objectTags = (tags.objects || []).join(', ');
        const genre = trackInfo.genre || "Unknown Genre";

        return `[Category: Music Retrieval]
[Entity: ${trackInfo.title} by ${trackInfo.artist}]

[Acoustics & Soundstage]
${acousticModel}.
Spectrum Profile: ${tags.spectrum}; Spatial Signature: ${tags.spatial}; Energy Density: ${tags.energy}/10.
Rhythmic Structure: ${tags.tempo_vibe}; Timbre Texture: ${tags.timbre_texture}.

[Subjective Experience]
Mood: ${moodTags}.
Narrative: ${semanticPush}.
Key Elements: ${objectTags}.

[Boundary Constraints]
Exclusion: ${exclusion}.

[Metadata Fingerprint]
Genre: ${genre} | Era/Culture: ${culturalWeight} | Popularity Index: ${data.popularity_raw.toFixed(2)}.`;
    }
}
