
/**
 * 混合搜索功能测试脚本
 * 
 * 功能：
 * 1. 验证 Vibe Tags + 向量嵌入的混合搜索效果
 * 2. 测试不同搜索条件下的召回率和相关度
 * 
 * 用法：
 * npx ts-node --project tsconfig.server.json scripts/test-hybrid-search.ts
 */
import { hybridSearchService } from '../src/services/recommendation/HybridSearchService';
import { initDB } from '../src/db';
import 'dotenv/config';

initDB();

const SCENARIOS = [
    "周杰伦最经典的10首歌",
    "午夜想听经典怀旧粤语歌"
];

async function runTests() {
    console.log("=== Hybrid Search Verification ===");

    for (const scenario of SCENARIOS) {
        console.log(`\n\n------------------------------------------------`);
        console.log(`🔎 Testing Scenario: "${scenario}"`);
        console.log(`------------------------------------------------`);

        try {
            const result = await hybridSearchService.search(scenario, {
                candidateLimit: 50, // Broad vector search
                finalLimit: 10,     // Tight AI selection
                useAI: true
            });

            if (Array.isArray(result)) {
                // This shouldn't happen if useAI=true and proper interface, 
                // but hybridSearchService returns 'CuratorResponse' | 'any[]'.
                // Wait, my implementation of search returns CuratorResponse OR fallback array.
                // Let's handle both.
            }

            console.log("\n[Result]");
            if ('playlistName' in (result as any)) {
                const playlist = result as any;
                console.log(`Title: ${playlist.playlistName}`);
                console.log(`Desc:  ${playlist.description}`);
                console.log(`Scene: ${playlist.scene}`);
                console.log(`Tracks: ${playlist.tracks.length}`);

                playlist.tracks.forEach((t: any, idx: number) => {
                    console.log(`  ${idx + 1}. [${t.songId}] ${t.reason}`);
                });
            } else {
                console.log("Returned raw array (Fallback?)");
                console.log(JSON.stringify(result, null, 2));
            }

        } catch (error) {
            console.error(`Status: FAILED for "${scenario}"`, error);
        }
    }
}

runTests().catch(console.error);
