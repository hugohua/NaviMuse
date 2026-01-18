/**
 * 仅元数据生成队列
 * 只调用 AI 生成元数据，不生成向量嵌入
 */

import { Queue, Worker } from 'bullmq';
import { AIFactory } from '../ai/AIFactory';
import { metadataRepo } from '../../db';
import { redisConnection } from './metadataQueue';

export const metadataOnlyQueue = new Queue('metadata-only', {
    connection: redisConnection,
    defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: true,
        removeOnFail: 1000,
    }
});

interface MetadataOnlyJobData {
    correlationId: string;
    songs: { navidrome_id: string; title: string; artist: string }[];
}

// --- Worker 实例管理 ---
let workerInstance: ReturnType<typeof startMetadataOnlyWorker> | null = null;

export const startMetadataOnlyWorker = () => {
    const worker = new Worker<MetadataOnlyJobData>('metadata-only', async (job) => {
        const { songs, correlationId } = job.data;
        console.log(`[MetadataOnly] Processing Job ${job.id} (${correlationId}) - ${songs.length} songs`);

        const { processMetadataOnlyBatch } = await import('./processors');

        try {
            const result = await processMetadataOnlyBatch(songs, (msg) => {
                console.log(`[MetadataOnly] ${msg}`);
            });
            console.log(`[MetadataOnly] Job ${job.id} Complete.`);
            return { success: true, count: result.count };

        } catch (error: any) {
            console.error(`[MetadataOnly] Job ${job.id} Failed:`, error);
            metadataRepo.runTransaction(() => {
                for (const song of songs) {
                    metadataRepo.updateStatus(song.navidrome_id, 'FAILED');
                }
            });
            throw error;
        }
    }, {
        connection: redisConnection,
        concurrency: 1,
        limiter: { max: 4, duration: 60000 }
    });

    worker.on('failed', (job, err) => {
        console.error(`[MetadataOnly] Job ${job?.id} failed: ${err.message}`);
    });

    console.log('[MetadataOnly] Worker Started.');
    return worker;
};

/**
 * 确保 Worker 已启动（按需启动）
 */
export const ensureMetadataOnlyWorkerStarted = () => {
    if (!workerInstance) {
        workerInstance = startMetadataOnlyWorker();
    }
    return workerInstance;
};

export const getMetadataOnlyWorkerInstance = () => workerInstance;
export const setMetadataOnlyWorkerInstance = (w: typeof workerInstance) => { workerInstance = w; };

// --- 队列控制方法 ---

export const pauseMetadataOnlyQueue = async (): Promise<void> => {
    await metadataOnlyQueue.pause();
    console.log('[MetadataOnly] Queue paused.');
};

export const resumeMetadataOnlyQueue = async (): Promise<void> => {
    await metadataOnlyQueue.resume();
    console.log('[MetadataOnly] Queue resumed.');
};

export const clearMetadataOnlyQueue = async (): Promise<{ clearedJobs: number }> => {
    const counts = await metadataOnlyQueue.getJobCounts();
    const totalBefore = counts.waiting + counts.delayed + counts.active;

    await metadataOnlyQueue.drain();
    await metadataOnlyQueue.clean(0, 1000, 'delayed');
    await metadataOnlyQueue.clean(0, 1000, 'failed');

    console.log(`[MetadataOnly] Cleared ${totalBefore} jobs.`);
    return { clearedJobs: totalBefore };
};

export const stopMetadataOnlyQueue = async (): Promise<{ clearedJobs: number }> => {
    await pauseMetadataOnlyQueue();
    const result = await clearMetadataOnlyQueue();

    if (workerInstance) {
        await workerInstance.close();
        workerInstance = null;
    }

    return result;
};

export interface MetadataOnlyQueueStatus {
    isPaused: boolean;
    isWorkerRunning: boolean;
    activeJobs: number;
    waitingJobs: number;
    completedJobs: number;
    failedJobs: number;
    delayedJobs: number;
}

export const getMetadataOnlyQueueStatus = async (): Promise<MetadataOnlyQueueStatus> => {
    const [counts, isPaused] = await Promise.all([
        metadataOnlyQueue.getJobCounts(),
        metadataOnlyQueue.isPaused()
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

export const addToMetadataOnlyQueue = async (songs: MetadataOnlyJobData['songs']) => {
    return await metadataOnlyQueue.add('batch-metadata-only', {
        correlationId: `meta_only_${Date.now()}`,
        songs
    });
};
