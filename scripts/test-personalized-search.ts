
/**
 * 个性化搜索测试脚本
 * 
 * 功能：
 * 1. 测试结合用户偏好（UserProfile）的搜索排序效果
 * 2. 模拟真实用户的搜索流程，检查结果的相关性
 * 
 * 用法：
 * npx ts-node --project tsconfig.server.json scripts/test-personalized-search.ts
 */
import { hybridSearchService } from '../src/services/recommendation/HybridSearchService';
import { initDB } from '../src/db';
import 'dotenv/config';

initDB();

async function runTest() {
    console.log("=== Personalized Search Verification ===");

    const query = "Recommend";
    // "Recommend" is vague. Alpha should be 0.6 (len=9). 

    // 1. Anonymous Search
    console.log("\n--- Anonymous Search ---");
    const resultsAnon = await hybridSearchService.search(query, {
        candidateLimit: 5,
        finalLimit: 5,
        useAI: false // Focus on vector only
    });
    const anonIds = (resultsAnon as any[]).map(r => r.id).sort();
    console.log("Anon IDs:", anonIds.join(', '));

    // 2. Personalized Search (admin)
    console.log("\n--- Personalized Search (User: admin) ---");
    const resultsUser = await hybridSearchService.search(query, {
        candidateLimit: 5,
        finalLimit: 5,
        useAI: true, // Enable AI to test Persona Injection
        userId: 'admin'
    });

    // Check if it's CuratorResponse or Array
    if ('playlistName' in (resultsUser as any)) {
        console.log("AI Response Vibe:", (resultsUser as any).description);
    } else {
        console.log("Fallback (Array) returned.");
    }

    const userIds = ((resultsUser as any).tracks || resultsUser as any[]).map((r: any) => r.songId || r.id).sort();
    console.log("User IDs:", userIds.join(', '));

    // 3. Compare
    const overlap = anonIds.filter(id => userIds.includes(id));
    console.log(`\nOverlap Count: ${overlap.length} / 5`);

    if (overlap.length < 5) {
        console.log("[SUCCESS] Results are different due to personalization!");
    } else {
        console.warn("[WARNING] Results are identical. Personalization might be weak or alpha too high.");
    }
}

runTest().catch(console.error);
