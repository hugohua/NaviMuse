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
     * 批量生成向量 (串行处理以规避速率限制)
     * @param texts 文本数组
     */
    async embedBatch(texts: string[]): Promise<number[][]> {
        // Gemini doesn't have a direct batch embed API in the Node SDK that is clearly documented for "embedContent" 
        // in same way as generateContent, but we can iterate. 
        // Or check if there's batchEmbedContents (it exists in REST, maybe in SDK).
        // For safety and simplicity given 15 RPM limit, we might need to be careful.
        // But embed requests might have different rate limits? 
        // Embedding is usually cheaper/faster.
        // Let's implement serial or parallel limit.

        const results: number[][] = [];
        for (const text of texts) {
            results.push(await this.embed(text));
        }
        return results;
    }
}
