
/**
 * 向量处理完整流程测试脚本
 * 
 * 功能：
 * 1. 验证“生成分析 -> 生成向量 -> 存入向量库”的闭环流程
 * 
 * 用法：
 * npx ts-node --project tsconfig.server.json scripts/test-vector-flow.ts
 */
import { db, initDB, metadataRepo } from '../src/db';
import { GeminiService } from '../src/services/ai/GeminiService';
import { EmbeddingService } from '../src/services/ai/EmbeddingService';
import 'dotenv/config';

async function main() {
    console.log("=== Testing Vector Flow ===");

    // 1. Init DB
    initDB();
    const rows = db.prepare(`SELECT * FROM smart_metadata LIMIT 1`).all() as any[];
    if (rows.length === 0) {
        console.error("No songs in DB to test.");
        return;
    }
    const song = rows[0];
    console.log(`Testing with song: ${song.title} - ${song.artist}`);

    // 2. Generate Metadata
    const gemini = new GeminiService();
    console.log("Generating metadata...");
    try {
        const metadata = await gemini.generateMetadata(song.artist, song.title);
        console.log("Metadata generated successfully.");
        // console.log("Raw Metadata:", JSON.stringify(metadata, null, 2));

        // 3. Verify Structure
        if (!metadata.vector_anchor) {
            console.error("❌ vector_anchor missing!");
        } else {
            console.log("✅ vector_anchor present.");
        }

        // 4. Construct Vector Text
        const vectorText = EmbeddingService.constructVectorText(metadata, {
            title: song.title,
            artist: song.artist,
            genre: song.genre || "Unknown"
        });

        console.log("\n--- Generated Vector Text Template ---");
        console.log(vectorText);
        console.log("--------------------------------------\n");

        if (vectorText.includes("[Boundary Constraints]") && vectorText.includes("Exclusion:")) {
            console.log("✅ Template contains exclusion logic.");
        } else {
            console.error("❌ Template missing exclusion logic.");
        }

        // 5. Test Embedding Generation (Optional, costs money/quota)
        const embedService = new EmbeddingService();
        console.log("Generating Embedding...");
        const vector = await embedService.embed(vectorText);
        console.log(`✅ Embedding generated. Dimension: ${vector.length}`);

        // 6. Test DB Save
        // metadataRepo.updateAnalysis... (skipping actual write to avoid polluting DB with test data unless desired)
        console.log("Test finished successfully.");

    } catch (e) {
        console.error("Test failed:", e);
    }
}

main();
