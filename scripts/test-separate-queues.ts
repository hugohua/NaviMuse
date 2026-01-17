/**
 * 测试仅元数据队列和仅向量队列的新功能
 */

import { initDB, metadataRepo } from '../src/db';
import {
    addToMetadataOnlyQueue,
    ensureMetadataOnlyWorkerStarted,
    getMetadataOnlyQueueStatus,
    pauseMetadataOnlyQueue,
    resumeMetadataOnlyQueue,
    stopMetadataOnlyQueue,
    metadataOnlyQueue
} from '../src/services/queue/metadataOnlyQueue';
import {
    addToEmbeddingOnlyQueue,
    ensureEmbeddingOnlyWorkerStarted,
    getEmbeddingOnlyQueueStatus,
    stopEmbeddingOnlyQueue,
    embeddingOnlyQueue
} from '../src/services/queue/embeddingOnlyQueue';

async function main() {
    console.log("=== 测试独立队列系统 ===\n");

    // 初始化数据库
    initDB();

    // 1. 清理队列
    console.log("1. 清理现有队列...");
    await metadataOnlyQueue.obliterate({ force: true });
    await embeddingOnlyQueue.obliterate({ force: true });
    console.log("   ✓ 队列已清空\n");

    // 2. 测试元数据队列
    console.log("2. 测试仅元数据队列...");
    const pendingMeta = metadataRepo.getPendingSongs(5);
    console.log(`   找到 ${pendingMeta.length} 首待处理歌曲`);

    if (pendingMeta.length > 0) {
        // 启动 Worker
        console.log("   启动 Worker...");
        const worker = ensureMetadataOnlyWorkerStarted();
        console.log("   ✓ Worker 已启动");

        // 添加任务
        console.log("   添加任务到队列...");
        await addToMetadataOnlyQueue(pendingMeta);
        console.log("   ✓ 已添加 1 个任务包\n");

        // 获取状态
        const status = await getMetadataOnlyQueueStatus();
        console.log("   队列状态:", JSON.stringify(status, null, 2));

        // 测试暂停
        console.log("\n   测试暂停...");
        await pauseMetadataOnlyQueue();
        const pausedStatus = await getMetadataOnlyQueueStatus();
        console.log("   isPaused:", pausedStatus.isPaused);

        // 测试恢复
        console.log("   测试恢复...");
        await resumeMetadataOnlyQueue();
        const resumedStatus = await getMetadataOnlyQueueStatus();
        console.log("   isPaused:", resumedStatus.isPaused);

        // 停止并清空
        console.log("   测试停止...");
        const stopResult = await stopMetadataOnlyQueue();
        console.log("   清除任务数:", stopResult.clearedJobs);
    } else {
        console.log("   ⚠ 没有待处理的歌曲，跳过元数据队列测试\n");
    }

    // 3. 测试向量队列
    console.log("\n3. 测试仅向量队列...");
    const pendingEmbed = metadataRepo.getPendingEmbeddings(5);
    console.log(`   找到 ${pendingEmbed.length} 首待生成向量的歌曲`);

    if (pendingEmbed.length > 0) {
        const embedWorker = ensureEmbeddingOnlyWorkerStarted();
        console.log("   ✓ Worker 已启动");

        await addToEmbeddingOnlyQueue(pendingEmbed);
        console.log("   ✓ 已添加 1 个任务包");

        const embedStatus = await getEmbeddingOnlyQueueStatus();
        console.log("   队列状态:", JSON.stringify(embedStatus, null, 2));

        // 清理
        await stopEmbeddingOnlyQueue();
        console.log("   ✓ 已停止");
    } else {
        console.log("   ⚠ 没有待生成向量的歌曲，跳过向量队列测试\n");
    }

    console.log("\n=== 测试完成 ===");
    process.exit(0);
}

main().catch(err => {
    console.error("测试失败:", err);
    process.exit(1);
});
