/**
 * Navidrome 深度调试工具
 * 
 * 功能：
 * 1. 抓取并打印 Navidrome API 的原始响应数据
 * 2. 验证配置中的 API Key、URL 是否正确
 * 3. 排查同步过程中的字段解析问题
 * 
 * 用法：
 * npx ts-node --project tsconfig.server.json scripts/debug-navidrome.ts
 */
import { navidromeClient } from '../src/services/navidrome';
import { config } from '../src/config';

async function main() {
    console.log("=== Debugging Navidrome Client ===");
    console.log("URL:", config.navidrome.url);
    console.log("User:", config.navidrome.user);

    try {
        const ping = await navidromeClient.ping();
        console.log("Ping Result:", ping);

        if (!ping) {
            console.error("Ping failed! Check URL and credentials.");
            return;
        }

        console.log("Ping successful. Fetching Album List...");
        const albums = await navidromeClient.getAlbumList('frequent', 1);
        console.log(`Fetched ${albums.length} albums.`);

        if (albums.length > 0) {
            const albumId = albums[0].id;
            console.log(`Testing getAlbum with ID: ${albumId}`);
            const songs = await navidromeClient.getAlbum(albumId);
            console.log(`Fetched ${songs.length} songs from album.`);
        } else {
            console.log("No albums found.");
        }

    } catch (e: any) {
        console.error("Debug Error:", e.message);
        if (e.response) {
            console.error("Response Status:", e.response.status);
            console.error("Response Data:", e.response.data);
        }
    }
}

main();
