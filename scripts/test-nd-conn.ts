
/**
 * Navidrome 连接与配置验证脚本
 * 
 * 功能：
 * 1. 验证配置文件中的 Navidrome URL 和 Credentials
 * 
 * 用法：
 * npx ts-node --project tsconfig.server.json scripts/test-nd-conn.ts
 */
import { navidromeClient } from '../src/services/navidrome';
import { config } from '../src/config';

async function test() {
    console.log('--- Navidrome Connection Test ---');
    console.log(`URL:  ${config.navidrome.url}`);
    console.log(`User: ${config.navidrome.user}`);

    try {
        console.log('\nPinging Server...');
        const alive = await navidromeClient.ping();
        if (alive) {
            console.log('✅ Ping Success! Server is reachable.');
        } else {
            console.error('❌ Ping Failed. Server reachable but returned error?');
        }

        console.log('\nTesting Auth (getRandomSongs)...');
        const songs = await navidromeClient.getRandomSongs(1);
        console.log(`✅ Auth Success! Retrieved song: ${songs[0]?.title}`);

    } catch (error: any) {
        console.error('\n❌ Connection Failed:');
        if (error.code === 'EHOSTUNREACH') {
            console.error('   -> Host Unreachable. Check IP address and Network.');
        } else if (error.code === 'ECONNREFUSED') {
            console.error('   -> Connection Refused. Check Port (4533) and if service is running.');
        } else {
            console.error('   -> ' + error.message);
        }
    }
}

test();
