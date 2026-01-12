process.env.AI_PROVIDER = 'gemini'; // Force Gemini for this test
process.env.GEMINI_MODEL = 'gemini-3-flash-preview'; // Force User Requested Model
import { addToQueue, startWorker, metadataQueue } from '../src/services/queue/metadataQueue';
import { metadataRepo, db } from '../src/db';

async function main() {
    console.log("=== Testing Metadata Queue System ===");

    // 1. Reset Queue
    console.log("Cleaning queue...");
    await metadataQueue.obliterate({ force: true });

    // 2. Start Worker
    const worker = startWorker();

    // 3. Create Dummy Data in DB if needed, or query existing pending
    // We already have 100 songs from sync test.
    const pending = metadataRepo.getPendingSongs(10);
    console.log(`Found ${pending.length} pending songs.`);

    if (pending.length === 0) {
        console.warn("No pending songs found. Run sync first.");
        await worker.close();
        return;
    }

    // 4. Batch and Enqueue
    const batchSize = 5;
    for (let i = 0; i < pending.length; i += batchSize) {
        const batch = pending.slice(i, i + batchSize);
        console.log(`Enqueueing Batch ${i / batchSize + 1} (${batch.length} songs)...`);
        await addToQueue(batch);
    }

    // 5. Monitor (Simple polling for demo)
    console.log("Waiting for processing...");

    // Let it run for 60 seconds then exit
    setTimeout(async () => {
        console.log("Timeout reached. Closing worker.");
        await worker.close();
        await metadataQueue.close();

        // Final Check
        const remaining = metadataRepo.getPendingSongs(100);
        console.log(`Remaining pending songs: ${remaining.length}`);
        process.exit(0);
    }, 60000);
}

main().catch(err => console.error(err));
