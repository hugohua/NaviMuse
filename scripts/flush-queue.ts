/**
 * 队列清理实用工具
 * 
 * 功能：
 * 1. 强制清空 BullMQ 队列中的所有任务（待处理、进行中、已完成等）
 * 2. 用于系统卡死或需要从头开始同步时的手动清理
 * 
 * 用法：
 * npx ts-node --project tsconfig.server.json scripts/flush-queue.ts
 */
import { metadataQueue } from '../src/services/queue/metadataQueue';
import { metadataRepo } from '../src/db'; // Ensure connection is established if needed, though queue is standalone

async function clean() {
    console.log("Flushing 'metadata-generation' queue...");

    // Obscure BullMQ API, but 'obliterate' is the nuclear option.
    // Or 'drain'
    await metadataQueue.obliterate({ force: true });

    console.log("Queue obliterated.");
    process.exit(0);
}

clean().catch(e => {
    console.error(e);
    process.exit(1);
});
