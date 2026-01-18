
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { AIFactory } from '../ai/AIFactory';
import { EmbeddingService } from '../ai/EmbeddingService';
import { metadataRepo, systemRepo } from '../../db';
import { config } from '../../config';

// --- Redis & Queue Configuration ---
const connection = new IORedis({
    host: config.redis.host,
    port: config.redis.port,
    maxRetriesPerRequest: null,
});

// Export connection for use in QueueManager
export const redisConnection = connection;

export const metadataQueue = new Queue('metadata-generation', {
    connection,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 5000,
        },
        removeOnComplete: true, // Keep clean
        removeOnFail: 1000, // Keep failed for debugging
    }
});

interface MetadataJobData {
    correlationId: string;
    songs: {
        navidrome_id: string;
        title: string;
        artist: string;
    }[];
}

// --- Worker Implementation ---
// Gemini Free Tier (2025.12 更新后): 5 RPM, 20-100 RPD
// 每个 Job 的 API 调用:
// 1. Generate Metadata Batch (1 API Call)
// 2. Generate Embedding Batch (1 API Call)
// Total: 2 Calls per Job.
// Limiter: 2 Jobs/min × 2 = 4 RPM (< 5 RPM 限制)
// 吞吐量: 每分钟 20 首歌, 每小时 1200 首

export const startWorker = () => {
    const worker = new Worker<MetadataJobData>('metadata-generation', async (job) => {
        const { songs, correlationId } = job.data;
        console.log(`[Worker] Processing Job ${job.id} (Correlation: ${correlationId}) - ${songs.length} songs`);

        try {
            // Import processor dynamically to avoid circular dependencies if any
            const { processFullAnalysisBatch } = await import('./processors');

            const result = await processFullAnalysisBatch(songs, (msg) => {
                console.log(`[Worker] ${msg}`);
            });

            console.log(`[Worker] Job ${job.id} Complete. Updated ${result.count}.`);
            return { success: true, count: result.count };

        } catch (error: any) {
            console.error(`[Worker] Job ${job.id} Failed:`, error);

            // --- Circuit Breaker Logic (Smart Quota Handling) ---
            const errorMsg = (error.message || '').toLowerCase();
            const isRateLimit = errorMsg.includes('429') || errorMsg.includes('rate limit') || errorMsg.includes('quota');
            const isDailyQuota = errorMsg.includes('quota exceeded') || errorMsg.includes('limit exceeded') || errorMsg.includes('resource_exhausted');

            if (isRateLimit) {
                // Determine Pause Duration
                let pauseDurationMs = 2 * 60 * 1000; // Default: 2 Minutes (Level 1: Cool Down)
                let pauseReason = "Rate Limit (Transient)";

                if (isDailyQuota) {
                    // Level 2: Daily Quota Exhausted -> Sleep until 16:30 (Gemini resets at PT midnight ≈ UTC+8 16:00)
                    const now = new Date();
                    const resumeTime = new Date(now);

                    // If before 16:30 today, resume at 16:30 today; otherwise resume at 16:30 tomorrow
                    resumeTime.setHours(16, 30, 0, 0);
                    if (now >= resumeTime) {
                        resumeTime.setDate(resumeTime.getDate() + 1);
                    }

                    pauseDurationMs = resumeTime.getTime() - now.getTime();
                    pauseReason = "Daily Quota Exhausted";
                }

                console.warn(`[Worker] ⚠️ Triggering Circuit Breaker: ${pauseReason}`);
                console.warn(`[Worker] Pausing Queue for ${(pauseDurationMs / 60000).toFixed(1)} minutes...`);

                try {
                    await metadataQueue.pause();

                    // Set Auto-Resume Time in Redis
                    const resumeTime = Date.now() + pauseDurationMs;
                    await connection.set('navimuse:queue:resume_at', String(resumeTime));

                } catch (e) {
                    console.error("[Worker] Failed to pause queue:", e);
                }
            }
            // ----------------------------------------------------

            // Mark as FAILED in DB
            try {
                metadataRepo.runTransaction(() => {
                    for (const song of songs) {
                        metadataRepo.updateStatus(song.navidrome_id, 'FAILED');
                    }
                });
            } catch (e) { /* ignore loop error */ }
            throw error;
        }
    }, {
        connection,
        concurrency: parseInt(systemRepo.getSetting('queue_concurrency') || String(config.queue.concurrency), 10),
        limiter: {
            max: parseInt(systemRepo.getSetting('queue_rate_limit_max') || String(config.queue.rateLimitMax), 10),
            duration: 60000
        },
        lockDuration: 120000,
        stalledInterval: 60000,
        maxStalledCount: 2,
    });

    worker.on('stalled', (jobId) => {
        console.warn(`[Worker] ⚠️ Job ${jobId} stalled - will be automatically retried.`);
    });

    worker.on('failed', (job, err) => {
        console.error(`[Worker] Job ${job?.id} failed with ${err.message}`);
    });

    console.log('[Worker] Metadata Worker Started (Batch Mode).');
    return worker;
};

// --- Producer Helper ---
export const addToQueue = async (songs: MetadataJobData['songs']) => {
    return await metadataQueue.add('batch-analyze', {
        correlationId: `batch_${Date.now()}`,
        songs
    });
};

// --- Queue Control Methods ---
// 用于 API 接口控制队列运行状态

/** 当前 Worker 实例引用 */
let workerInstance: ReturnType<typeof startWorker> | null = null;

/**
 * 暂停队列处理
 * 注意：暂停后队列中的任务不会被清除，只是暂停消费
 */
export const pauseQueue = async (): Promise<void> => {
    await metadataQueue.pause();
    console.log('[Queue] Queue paused.');
};

/**
 * 恢复队列处理
 */
export const resumeQueue = async (): Promise<void> => {
    await metadataQueue.resume();
    console.log('[Queue] Queue resumed.');
};

/**
 * 清空队列中的所有任务
 * 包括等待中、延迟中、失败的任务
 */
export const clearQueue = async (): Promise<{ clearedJobs: number }> => {
    // 获取当前任务数量
    const counts = await metadataQueue.getJobCounts();
    const totalBefore = counts.waiting + counts.delayed + counts.active + counts.failed;

    console.log(`[Queue] Current job counts:`, counts);

    // 1. 暂停队列（确保没有新任务被处理）
    await metadataQueue.pause();

    // 2. 清空等待中的任务
    await metadataQueue.drain();

    // 3. 清空延迟任务
    await metadataQueue.clean(0, 1000, 'delayed');

    // 4. 清空失败任务
    await metadataQueue.clean(0, 1000, 'failed');

    // 5. 清空已完成任务（释放 Redis 内存）
    await metadataQueue.clean(0, 1000, 'completed');

    // 6. 强制移除正在活动的任务（如果有）
    const activeJobs = await metadataQueue.getJobs(['active']);
    for (const job of activeJobs) {
        try {
            await job.remove();
            console.log(`[Queue] Force removed active job ${job.id}`);
        } catch (e) {
            // Job may have already completed
        }
    }

    // 7. 再次检查并清理残留的等待任务
    const waitingJobs = await metadataQueue.getJobs(['waiting']);
    for (const job of waitingJobs) {
        try {
            await job.remove();
        } catch (e) {
            // Ignore
        }
    }

    const countsAfter = await metadataQueue.getJobCounts();
    console.log(`[Queue] Cleared ${totalBefore} jobs. Remaining:`, countsAfter);

    return { clearedJobs: totalBefore };
};

/**
 * 获取队列详细状态
 */
export interface QueueStatus {
    isPaused: boolean;
    isWorkerRunning: boolean;
    activeJobs: number;
    waitingJobs: number;
    completedJobs: number;
    failedJobs: number;
    delayedJobs: number;
}

export const getQueueStatus = async (): Promise<QueueStatus> => {
    const [counts, isPaused] = await Promise.all([
        metadataQueue.getJobCounts(),
        metadataQueue.isPaused()
    ]);

    return {
        isPaused,
        isWorkerRunning: workerInstance !== null,
        activeJobs: counts.active,
        waitingJobs: counts.waiting,
        completedJobs: counts.completed || 0,
        failedJobs: counts.failed,
        delayedJobs: counts.delayed
    };
};

/**
 * 获取/设置 Worker 实例引用
 */
export const setWorkerInstance = (worker: ReturnType<typeof startWorker> | null) => {
    workerInstance = worker;
};

export const getWorkerInstance = () => workerInstance;
