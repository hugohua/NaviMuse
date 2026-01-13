
import { metadataRepo, initDB } from '../src/db';

async function main() {
    try {
        console.log("Initializing DB...");
        initDB();

        console.log("Testing getSongCount...");
        const count = metadataRepo.getSongCount();
        console.log(`Total songs: ${count}`);

        console.log("Testing getPaginatedSongs (limit 5)...");
        const songs = metadataRepo.getPaginatedSongs(5, 0);
        console.log(`Retrieved ${songs.length} songs.`);

        if (songs.length > 0) {
            console.log("First song sample:");
            console.log(`ID: ${songs[0].navidrome_id}`);
            console.log(`Title: ${songs[0].title}`);
            console.log(`AI Status: ${songs[0].processing_status}`);
            console.log(`Has Analysis: ${!!songs[0].analysis_json}`);
        }

    } catch (e) {
        console.error("Test failed:", e);
    }
}

main();
