
import 'dotenv/config'; // Load .env
import { navidromeClient } from '../src/services/navidrome';

async function testNavidrome() {
    console.log('--- Testing Navidrome Service ---\n');

    // 1. Test Ping
    console.log('1. Testing Connection (Ping)...');
    const alive = await navidromeClient.ping();
    console.log(`   Ping Result: ${alive ? 'SUCCESS ✅' : 'FAILED ❌'}\n`);
    if (!alive) process.exit(1);

    // 2. Test Get Starred
    console.log('2. Fetching Starred Songs...');
    try {
        const starred = await navidromeClient.getStarred();
        console.log(`   Fetched ${starred.length} starred songs.`);
        if (starred.length > 0) {
            console.log('   Sample (Top 3):');
            starred.slice(0, 3).forEach(s => console.log(`   - [${s.title}] by ${s.artist} (Hearts: ${s.starred})`));
        }
    } catch (e: any) {
        console.error('   ❌ Error fetching starred:', e.message);
    }
    console.log('\n');

    // 3. Test Get Most Played (New Feature)
    console.log('3. Fetching Most Played Songs (via Frequent Albums)...');
    try {
        const albumLimit = 20;
        const mostPlayed = await navidromeClient.getMostPlayed(albumLimit);
        console.log(`   Fetched ${mostPlayed.length} songs from top ${albumLimit} frequent albums.`);

        if (mostPlayed.length > 0) {
            console.log('   Top 10 Most Played Songs in this batch:');
            // Ensure they are sorted
            const top10 = mostPlayed.slice(0, 10);
            top10.forEach((s, i) => {
                console.log(`   ${i + 1}. [${s.title}] - ${s.artist} (Plays: ${s.playCount}, Album: ${s.album})`);
            });
        } else {
            console.log('   ⚠️ No songs found. Check if you have play history or frequent albums.');
        }
    } catch (e: any) {
        console.error('   ❌ Error fetching most played:', e.message);
    }

    console.log('\n--- Test Complete ---');
}

testNavidrome();
