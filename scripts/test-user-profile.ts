
/**
 * 用户画像基础服务测试脚本
 * 
 * 功能：
 * 1. 验证用户画像数据的存储、读取和更新
 * 
 * 用法：
 * npx ts-node --project tsconfig.server.json scripts/test-user-profile.ts
 */
import { userProfileService } from '../src/services/recommendation/UserProfileService';
import { userProfileRepo, metadataRepo, initDB } from '../src/db';
import 'dotenv/config';

import { navidromeClient } from '../src/services/navidrome';

initDB();

async function runTest() {
    console.log("=== User Profile Phase 1 Test ===");

    // 0. Mock Data Preparation
    // Get some real IDs from local DB to ensure vector match
    const localIds = metadataRepo.getAllIds().slice(0, 5).map((x: any) => x.navidrome_id);
    console.log(`[Test] Using ${localIds.length} local IDs for mock starred list.`);

    // Monkey Patch navidromeClient.getStarred
    navidromeClient.getStarred = async () => {
        return localIds.map(id => ({
            id: id,
            title: "Mock Title",
            artist: "Mock Artist", // Service only needs ID for vector lookup
            genre: "Test Genre",
            // ... other fields irrelevant for vector extraction
        } as any));
    };

    // 1. Sync
    await userProfileService.syncUserProfile('admin');

    // 2. Verify
    const profile = userProfileRepo.getProfile('admin');

    if (profile) {
        console.log("\n[SUCCESS] Profile retrieved!");
        console.log("User ID:", profile.userId);
        console.log("Last Updated:", profile.lastUpdated);
        console.log("Taste Vector Length:", profile.tasteVector.length);
        console.log("JSON Profile:", profile.jsonProfile);

        // Basic check on vector
        const magnitude = profile.tasteVector.reduce((acc, val) => acc + val * val, 0);
        console.log("Vector Magnitude (Energy):", magnitude);

        if (magnitude === 0) {
            console.warn("WARNING: Vector is empty (All Zeros). User might not have starred songs with embedded matches.");
        }
    } else {
        console.error("\n[FAILED] Profile not found in DB.");
    }
}

runTest().catch(console.error);
