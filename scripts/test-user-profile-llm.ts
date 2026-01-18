
/**
 * 用户画像生成 (LLM 驱动) 测试脚本
 * 
 * 功能：
 * 1. 根据用户的听歌历史（Top Artists/Genres），调用 AI 生成结构化的用户画像标签
 * 2. 验证用户画像对推荐权重的修正逻辑
 * 
 * 用法：
 * npx ts-node --project tsconfig.server.json scripts/test-user-profile-llm.ts
 */
import { recommendationService } from '../src/services/recommendation/RecommendationService';
import { Song } from '../src/types';
import 'dotenv/config';

async function main() {
    console.log("=== Testing User Profile LLM Generation ===");

    // Mock Listening History
    const mockSongs: Song[] = [
        { id: '1', title: '富士山下', artist: '陈奕迅', genre: 'Pop', playCount: 52, created: '2023-01-01', starred: true, duration: 200, album: 'Album A', path: '' },
        { id: '2', title: 'Last Christmas', artist: 'Wham!', genre: 'Pop', playCount: 12, created: '2023-01-01', starred: true, duration: 200, album: 'Album B', path: '' },
        { id: '3', title: '晴天', artist: '周杰伦', genre: 'Mandopop', playCount: 88, created: '2023-01-01', starred: true, duration: 200, album: 'Album C', path: '' },
        { id: '4', title: 'Hotel California', artist: 'Eagles', genre: 'Rock', playCount: 5, created: '2023-01-01', starred: false, duration: 200, album: 'Album D', path: '' },
        { id: '5', title: 'Creep', artist: 'Radiohead', genre: 'Alternative', playCount: 45, created: '2023-01-01', starred: true, duration: 200, album: 'Album E', path: '' },
        { id: '6', title: '七里香', artist: '周杰伦', genre: 'Mandopop', playCount: 60, created: '2023-01-01', starred: true, duration: 200, album: 'Album F', path: '' },
        { id: '7', title: 'K歌之王', artist: '陈奕迅', genre: 'Cantopop', playCount: 30, created: '2023-01-01', starred: true, duration: 200, album: 'Album G', path: '' },
    ];

    console.log(`Sending ${mockSongs.length} songs for analysis...`);

    try {
        const profile = await recommendationService.analyzeUserProfile(mockSongs);
        console.log("\n--- Generated Profile ---");
        console.log(JSON.stringify(profile, null, 2));
    } catch (err) {
        console.error("Profile Generation Failed:", err);
    }
}

main();
