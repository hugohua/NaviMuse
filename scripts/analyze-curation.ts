
/**
 * 歌曲策展分析测试脚本
 * 
 * 功能：
 * 1. 验证 Vibe Tags 推荐与特定“策展（Curation）”逻辑的匹配度
 * 
 * 用法：
 * npx ts-node --project tsconfig.server.json scripts/analyze-curation.ts
 */
import 'dotenv/config';
import { hybridSearchService } from '../src/services/recommendation/HybridSearchService';
import { initDB } from '../src/db';

async function analyze() {
    console.log('--- Analyze Search Quality: 符合我口味的经典粤语歌曲 ---');
    initDB();

    const query = '符合我口味的经典粤语歌曲';
    const result = await hybridSearchService.search(query, {
        candidateLimit: 150,
        finalLimit: 20,
        userId: 'admin',
        mode: 'default'
    });

    console.log('\nAI Response (Curation Result):');
    console.log(JSON.stringify(result, null, 2));
}

analyze().catch(console.error);
