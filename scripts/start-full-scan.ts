/**
 * 全量扫描与分析启动脚本
 * 
 * 功能：
 * 1. 启动 Navidrome 全量同步
 * 2. 自动将新发现的歌曲加入分析队列
 * 3. 启动后台 Worker 开始处理
 * 
 * 用法：
 * npx ts-node --project tsconfig.server.json scripts/start-full-scan.ts
 */
import { navidromeSyncService } from '../src/services/navidromeSync';
import { metadataRepo, initDB } from '../src/db';
import { addToQueue, startWorker, metadataQueue } from '../src/services/queue/metadataQueue';
import { config } from '../src/config';



async function main() {
    const args = process.argv.slice(2);
    const onlySync = args.includes('--only-sync');
    const onlyProcess = args.includes('--only-process');

    const limitArgIndex = args.indexOf('--limit');
    const limit = limitArgIndex !== -1 ? parseInt(args[limitArgIndex + 1], 10) : undefined;

    if (onlySync && onlyProcess) {
        console.error("Error: Cannot use --only-sync and --only-process together.");
        process.exit(1);
    }

    console.log("=== Starting Metadata Pipeline ===");
    console.log(`Mode: ${onlySync ? 'Sync Only' : onlyProcess ? 'Process Only' : 'Full Pipeline'}`);
    if (limit) console.log(`Limit: ${limit} songs`);
    console.log(`Time: ${new Date().toISOString()}`);
    console.log(`Model: ${process.env.GEMINI_MODEL || "gemini-3-flash-preview"}`);
    console.log(`Temperature: ${config.ai.temperature}`);

    // 1. Initialize DB
    initDB();

    // 2. Sync from Navidrome (Full Scan)
    if (!onlyProcess) {
        console.log("\n[Step 1/3] Syncing from Navidrome...");
        try {
            await navidromeSyncService.syncFromNavidrome(limit); // Pass limit if present
            console.log("Sync Complete.");
        } catch (err) {
            console.error("Sync Failed:", err);
            process.exit(1);
        }
    } else {
        console.log("\n[Step 1/3] Skipping Sync (--only-process active)");
    }

    if (onlySync) {
        console.log("Sync only mode completed. Exiting.");
        process.exit(0);
    }

    // 3. Identification of Pending Work
    console.log("\n[Step 2/3] Scheduling Work...");
    // Fetch ALL pending songs, or iterate.
    // metadataRepo.getPendingSongs currently takes a limit.
    // We should probably iterate in chunks to avoid blowing up memory if there are 100k songs.
    // But for <50k, it's fine. Let's do batch enqueuing.

    // We need to know how many pending total first.
    const pendingCount = metadataRepo.getPendingSongs(100000).length; // Temporary "all"
    console.log(`Found ${pendingCount} songs pending analysis.`);

    if (pendingCount === 0) {
        console.log("No pending work. Exiting.");
        process.exit(0);
    }

    // 4. Enqueue & Process
    console.log("\n[Step 3/3] Processing Queue...");
    const worker = startWorker();

    // Chunk size for Enqueuing (The Queue itself handles batching logic usually, 
    // but here our 'job' IS a batch of 5. So we create jobs of 5 songs.)
    // Optimized for True Batch: 10 songs -> 1 Meta + 1 Vec (Batch) = 2 reqs/job.
    const JOB_BATCH_SIZE = 10;

    // Get all pending again to iterate
    const allPending = metadataRepo.getPendingSongs(100000);

    let jobsCreated = 0;
    for (let i = 0; i < allPending.length; i += JOB_BATCH_SIZE) {
        const batch = allPending.slice(i, i + JOB_BATCH_SIZE);
        await addToQueue(batch);
        jobsCreated++;
    }
    console.log(`Enqueued ${jobsCreated} jobs (${allPending.length} songs).`);

    // 5. Keep alive until empty
    // Basic polling to wait for completion
    const checkInterval = setInterval(async () => {
        const counts = await metadataQueue.getJobCounts();
        const pending = counts.waiting + counts.active + counts.delayed;
        const processing = counts.active;

        process.stdout.write(`\r[Queue Status] Waiting: ${counts.waiting}, Active: ${processing}, Completed: ${counts.completed}, Failed: ${counts.failed}   `);

        if (pending === 0 && processing === 0) {
            clearInterval(checkInterval);
            console.log("\n\nAll jobs processed!");

            // Final DB Check
            const remaining = metadataRepo.getPendingSongs(10).length;
            if (remaining > 0) {
                console.warn(`Warning: ${remaining} songs still marked as pending (possible DB update failures).`);
            } else {
                console.log("Success: DB marked all songs as analyzed.");
            }

            await worker.close();
            await metadataQueue.close();
            process.exit(0);
        }
    }, 1000);
}

main().catch(err => {
    console.error("Fatal Error:", err);
    process.exit(1);
});
