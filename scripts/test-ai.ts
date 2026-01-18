/**
 * AI 连接测试脚本
 * 
 * 功能：
 * 1. 验证配置文件中的 AI Provider 连接性
 * 2. 测试简单的文本生成任务
 * 3. 验证网络代理（如果配置）是否生效
 * 
 * 用法：
 * npx ts-node --project tsconfig.server.json scripts/test-ai.ts
 */

import { AIFactory } from '../src/services/ai';
import path from 'path';
import dotenv from 'dotenv';

// Load .env from root
dotenv.config({ path: path.join(__dirname, '../.env') });

async function main() {
    console.log("=== Testing AI Factory & Service ===");
    console.log("Provider:", process.env.AI_PROVIDER || 'Default (Qwen)');
    console.log("Gemini Model:", process.env.GEMINI_MODEL || 'Default');
    console.log("Proxy:", process.env.HTTPS_PROXY ? 'Set' : 'Not Set');

    try {
        const service = AIFactory.getService();
        console.log("Service created successfully.");

        // Test with a sample song
        // Using a song that definitely requires inference to test V4 prompt logic if possible, 
        // or a well known one to check accuracy.
        const artist = "周杰伦";
        const title = "以父之名";

        console.log(`\nGenerating metadata for: ${artist} - ${title}`);
        console.log("Waiting for AI response...");

        const metadata = await service.generateMetadata(artist, title);

        console.log("\n>>> AI Response Result:");
        console.log(JSON.stringify(metadata, null, 2));

        if (!metadata.vector_anchor) throw new Error("Missing Vector Anchor");
        if (!metadata.embedding_tags) throw new Error("Missing Embedding Tags");
        if (!metadata.embedding_tags.mood_coord || metadata.embedding_tags.mood_coord.length === 0) console.warn("Mood Coords missing");

        console.log("\nValidation Passed!");
    } catch (e: any) {
        console.error("\n!!! Error Occurred !!!");
        console.error(e);
        // Print cause if available
        if (e.cause) console.error("Cause:", e.cause);
    }
}

main();
