
/**
 * LLM 字段解析测试脚本
 * 
 * 功能：
 * 1. 验证从 AI 响应中提取 tempo_vibe 和 timbre_texture 字段的准确性
 * 
 * 用法：
 * npx ts-node --project tsconfig.server.json scripts/test-llm-field.ts
 */
import { db, metadataRepo, initDB } from '../src/db';

async function testLLMField() {
    try {
        console.log("Initializing DB for Verification...");
        initDB();

        const testId = "test_llm_" + Date.now();

        // 1. Insert dummy song
        console.log(`Inserting dummy song: ${testId}`);
        metadataRepo.saveBasicInfo({
            navidrome_id: testId,
            title: "Test Song",
            artist: "Test Artist",
            album: "Test Album",
            duration: 180,
            file_path: "/tmp/test.mp3",
            is_instrumental: 0,
            last_updated: new Date().toISOString(),
            hash: "dummy_hash"
        });

        // 2. Update with LLM field
        console.log("Updating with LLM field...");
        const mockAnalysis = {
            description: "Test Description",
            tags: ["Pop"],
            mood: "Happy",
            is_instrumental: false,
            llm: "gemini-test-model"
        };

        metadataRepo.updateAnalysis(testId, mockAnalysis);

        // 3. Verify
        console.log("Verifying...");
        const song = metadataRepo.get(testId);

        if (song?.llm === "gemini-test-model") {
            console.log("✅ SUCCESS: LLM field saved and retrieved correctly.");
        } else {
            console.error("❌ FAILURE: LLM field mismatch.");
            console.error("Expected: gemini-test-model");
            console.error("Actual:", song?.llm);
            // Clean up even on failure
            const delStmt = db.prepare("DELETE FROM smart_metadata WHERE navidrome_id = ?");
            delStmt.run(testId);
            process.exit(1);
        }

        // Cleanup
        const delStmt = db.prepare("DELETE FROM smart_metadata WHERE navidrome_id = ?");
        delStmt.run(testId);
        console.log("Cleanup complete.");
    } catch (error) {
        console.error("CRITICAL TEST FAILURE:", error);
        process.exit(1);
    }
}

testLLMField();
