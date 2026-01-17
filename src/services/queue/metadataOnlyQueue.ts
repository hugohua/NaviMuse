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

        try {
            // 1. 标记处理中
            metadataRepo.runTransaction(() => {
                for (const song of songs) {
                    metadataRepo.updateStatus(song.navidrome_id, 'PROCESSING');
                }
            });

            // 2. 调用 AI 服务生成元数据
            const aiService = AIFactory.getService();
            const results = await aiService.generateBatchMetadata(songs.map(s => ({
                id: s.navidrome_id,
                title: s.title,
                artist: s.artist
            })));

            console.log(`[MetadataOnly] Received ${results.length} results.`);

            // 3. 保存元数据 (不生成向量)
            for (const result of results) {
                const songId = result.id ? String(result.id) : null;
                if (!songId) continue;

                const analysisJson = JSON.stringify(result);
                const acoustic = result.vector_anchor?.acoustic_model || "";
                const semantic = result.vector_anchor?.semantic_push || "";
                const description = `${acoustic}\n\n[Imagery] ${semantic}`;

                const tags = [
                    ...(result.embedding_tags?.mood_coord || []),
                    ...(result.embedding_tags?.objects || [])
                ];
                if (result.embedding_tags?.scene_tag) tags.push(result.embedding_tags.scene_tag);

                metadataRepo.updateAnalysis(songId, {
                    description,
                    tags,
                    mood: (result.embedding_tags?.mood_coord || [])[0] || "Unknown",
                    is_instrumental: result.is_instrumental === true,
                    analysis_json: analysisJson,
                    energy_level: result.embedding_tags?.energy,
                    visual_popularity: result.popularity_raw,
                    language: result.language,
                    spectrum: result.embedding_tags?.spectrum,
                    spatial: result.embedding_tags?.spatial,
                    scene_tag: result.embedding_tags?.scene_tag,
                    tempo_vibe: result.embedding_tags?.tempo_vibe,
                    timbre_texture: result.embedding_tags?.timbre_texture,
                    llm: result.llm_model
                });

                // 标记向量待生成
                metadataRepo.updateEmbeddingStatus(songId, 'PENDING');
                metadataRepo.updateStatus(songId, 'COMPLETED');
            }

            console.log(`[MetadataOnly] Job ${job.id} Complete.`);
            return { success: true, count: results.length };

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
