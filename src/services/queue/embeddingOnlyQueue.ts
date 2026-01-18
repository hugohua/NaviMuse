/**
 * 仅向量生成队列
 * 为已有元数据的歌曲生成向量嵌入
 */

import { Queue, Worker } from 'bullmq';
import { EmbeddingService } from '../ai/EmbeddingService';
import { metadataRepo } from '../../db';
import { redisConnection } from './metadataQueue';

export const embeddingOnlyQueue = new Queue('embedding-only', {
    connection: redisConnection,
    defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: true,
        removeOnFail: 1000,
    }
});

interface EmbeddingOnlyJobData {
    correlationId: string;
    songs: {
        navidrome_id: string;
        title: string;
        artist: string;
        analysis_json: string;
    }[];
}

// --- Worker 实例管理 ---
let workerInstance: ReturnType<typeof startEmbeddingOnlyWorker> | null = null;

export const startEmbeddingOnlyWorker = () => {
    const worker = new Worker<EmbeddingOnlyJobData>('embedding-only', async (job) => {
        const { songs, correlationId } = job.data;
        console.log(`[EmbeddingOnly] Processing Job ${job.id} (${correlationId}) - ${songs.length} songs`);

        const { processEmbeddingOnlyBatch } = await import('./processors');

        try {
            const result = await processEmbeddingOnlyBatch(songs, (msg) => {
                console.log(`[EmbeddingOnly] ${msg}`);
            });

            console.log(`[EmbeddingOnly] Job ${job.id} Complete. ${result.count}/${songs.length} succeeded.`);
            return { success: true, count: result.count, total: songs.length };
        } catch (error: any) {
            console.error(`[EmbeddingOnly] Job ${job.id} Failed:`, error);
            throw error;
        }


    }, {
        connection: redisConnection,
        concurrency: 1,
        limiter: { max: 10, duration: 60000 } // Embedding API 通常限制更宽松
    });

    worker.on('failed', (job, err) => {
        console.error(`[EmbeddingOnly] Job ${job?.id} failed: ${err.message}`);
    });

    console.log('[EmbeddingOnly] Worker Started.');
    return worker;
};

/**
 * 确保 Worker 已启动（按需启动）
 */
export const ensureEmbeddingOnlyWorkerStarted = () => {
    if (!workerInstance) {
        workerInstance = startEmbeddingOnlyWorker();
    }
    return workerInstance;
};

export const getEmbeddingOnlyWorkerInstance = () => workerInstance;
export const setEmbeddingOnlyWorkerInstance = (w: typeof workerInstance) => { workerInstance = w; };

// --- 队列控制方法 ---

export const pauseEmbeddingOnlyQueue = async (): Promise<void> => {
    await embeddingOnlyQueue.pause();
    console.log('[EmbeddingOnly] Queue paused.');
};

export const resumeEmbeddingOnlyQueue = async (): Promise<void> => {
    await embeddingOnlyQueue.resume();
    console.log('[EmbeddingOnly] Queue resumed.');
};

export const clearEmbeddingOnlyQueue = async (): Promise<{ clearedJobs: number }> => {
    const counts = await embeddingOnlyQueue.getJobCounts();
    const totalBefore = counts.waiting + counts.delayed + counts.active;

    await embeddingOnlyQueue.drain();
    await embeddingOnlyQueue.clean(0, 1000, 'delayed');
    await embeddingOnlyQueue.clean(0, 1000, 'failed');

    console.log(`[EmbeddingOnly] Cleared ${totalBefore} jobs.`);
    return { clearedJobs: totalBefore };
};

export const stopEmbeddingOnlyQueue = async (): Promise<{ clearedJobs: number }> => {
    await pauseEmbeddingOnlyQueue();
    const result = await clearEmbeddingOnlyQueue();

    if (workerInstance) {
        await workerInstance.close();
        workerInstance = null;
    }

    return result;
};

export interface EmbeddingOnlyQueueStatus {
    isPaused: boolean;
    isWorkerRunning: boolean;
    activeJobs: number;
    waitingJobs: number;
    completedJobs: number;
    failedJobs: number;
    delayedJobs: number;
}

export const getEmbeddingOnlyQueueStatus = async (): Promise<EmbeddingOnlyQueueStatus> => {
    const [counts, isPaused] = await Promise.all([
        embeddingOnlyQueue.getJobCounts(),
        embeddingOnlyQueue.isPaused()
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

export const addToEmbeddingOnlyQueue = async (songs: EmbeddingOnlyJobData['songs']) => {
    return await embeddingOnlyQueue.add('batch-embedding-only', {
        correlationId: `embed_only_${Date.now()}`,
        songs
    });
};
