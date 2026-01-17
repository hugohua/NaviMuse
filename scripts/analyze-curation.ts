
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
