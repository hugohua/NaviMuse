import { GoogleGenerativeAI, TaskType } from '@google/generative-ai';
import { HttpsProxyAgent } from 'https-proxy-agent';
import nodeFetch from 'node-fetch';
import { config } from '../../config';

/**
 * 向量嵌入服务 (Embedding Service)
 * 负责调用 Gemini Embedding API 生成文本向量
 */
export class EmbeddingService {
    private genAI: GoogleGenerativeAI;
    private modelName: string = "gemini-embedding-001";

    constructor() {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) throw new Error("Missing GEMINI_API_KEY in environment variables");

        // Ensure Proxy is configured (Idempotent-ish check not easy, but re-assigning is okay for now)
        // In a perfect world, this is a shared utility.
        const proxyUrl = process.env.HTTPS_PROXY;
        if (proxyUrl) {
            // Basic check to see if we need to patch
            // We'll just patch it to be sure this service works standalone
            const agent = new HttpsProxyAgent(proxyUrl);
            // @ts-ignore
            if (!global.fetch || !global.fetch.toString().includes('nodeFetch')) {
                // @ts-ignore
                global.fetch = async (url: string, options: any) => {
                    return nodeFetch(url, {
                        ...options,
                        agent: agent
                    });
                };
            }
        }

        this.genAI = new GoogleGenerativeAI(apiKey);
    }

    /**
     * 生成单个文本的向量嵌入
     * @param text 输入文本
     * @returns 768维浮点数向量
     */
    async embed(text: string): Promise<number[]> {
        const model = this.genAI.getGenerativeModel({ model: this.modelName });

        const result = await model.embedContent({
            content: { role: 'user', parts: [{ text }] },
            taskType: TaskType.RETRIEVAL_DOCUMENT,
            // @ts-ignore - Type definition might be missing in current SDK version
            outputDimensionality: 768
        });

        const embedding = result.embedding;
        if (!embedding || !embedding.values) {
            throw new Error("Failed to generate embedding");
        }
        return embedding.values;
    }

    /**
     * 批量生成向量 (并行处理，单次API调用)
     * @param texts 文本数组
     */
    async embedBatch(texts: string[]): Promise<number[][]> {
        const model = this.genAI.getGenerativeModel({ model: this.modelName });

        try {
            const result = await model.batchEmbedContents({
                requests: texts.map(t => ({
                    content: { role: 'user', parts: [{ text: t }] },
                    taskType: TaskType.RETRIEVAL_DOCUMENT,
                    // @ts-ignore
                    outputDimensionality: 768
                }))
            });

            if (!result.embeddings) return [];
            return result.embeddings.map(e => e.values || []);
        } catch (error) {
            console.error("Batch Embedding Failed:", error);
            throw error;
        }
    }

    /**
     * 构建符合向量模型偏好的结构化文本模板
     */
    static constructVectorText(data: import('../../types').MetadataJSON, trackInfo: { title: string, artist: string, genre?: string }): string {
        const anchor = data.vector_anchor;
        const tags = data.embedding_tags;

        // Template:
        // [Category: Music Retrieval]
        // [Entity: {title} by {artist}]
        // [Acoustics & Soundstage]
        // {acoustic_model}. 
        // Spectrum Profile: {spectrum}; Spatial Signature: {spatial}; Energy Density: {energy}/10.
        // [Subjective Experience]
        // Mood: {mood_tags}. 
        // Narrative: {semantic_push}. 
        // Key Elements: {objects}.
        // [Boundary Constraints]
        // Exclusion: {exclusion_logic}.
        // [Metadata Fingerprint]
        // Genre: {genre} | Era: {cultural_weight} | Cultural Context: ...

        const moodTags = (tags.mood_coord || []).join(', ');
        const objectTags = (tags.objects || []).join(', ');
        const exclusion = anchor.exclusion_logic || "None";
        const genre = trackInfo.genre || "Unknown Genre";

        return `[Category: Music Retrieval]
[Entity: ${trackInfo.title} by ${trackInfo.artist}]

[Acoustics & Soundstage]
${anchor.acoustic_model}.
Spectrum Profile: ${tags.spectrum}; Spatial Signature: ${tags.spatial}; Energy Density: ${tags.energy}/10.
Rhythmic Structure: ${tags.tempo_vibe}; Timbre Texture: ${tags.timbre_texture}.

[Subjective Experience]
Mood: ${moodTags}.
Narrative: ${anchor.semantic_push}.
Key Elements: ${objectTags}.

[Boundary Constraints]
Exclusion: ${exclusion}.

[Metadata Fingerprint]
Genre: ${genre} | Era/Culture: ${anchor.cultural_weight} | Popularity Index: ${data.popularity_raw.toFixed(2)}.`; // [中文注释] 将流行度 (Visual Popularity) 编入向量文本，支持搜"热门歌曲"
    }
}
