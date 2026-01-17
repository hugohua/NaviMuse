
import 'dotenv/config';
import { hybridSearchService } from './src/services/recommendation/HybridSearchService';
import { initDB } from './src/db';

async function analyze() {
    console.log('--- Analyze Search Quality: 符合我口味的经典粤语歌曲 ---');
    initDB();

    const query = '符合我口味的经典粤语歌曲';
    // Use 'default' mode which executes heuristic alpha (0.6 for length < 15) and should assume userId 'admin' if passed
    // We pass userId 'admin' to trigger starred songs injection
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
