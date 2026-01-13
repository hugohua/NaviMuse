
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { AIFactory } from '../ai/AIFactory';
import { EmbeddingService } from '../ai/EmbeddingService';
import { metadataRepo } from '../../db';
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
            // 0. Mark as Processing
            metadataRepo.runTransaction(() => {
                for (const song of songs) {
                    metadataRepo.updateStatus(song.navidrome_id, 'PROCESSING');
                }
            });

            // 1. Get AI Service
            const aiService = AIFactory.getService();
            const embeddingService = new EmbeddingService();

            // --- Phase 1: Metadata Generation (1 Call) ---
            console.log(`[Worker] Sending Metadata Request...`);
            const results = await aiService.generateBatchMetadata(songs.map(s => ({
                id: s.navidrome_id,
                title: s.title,
                artist: s.artist
            })));
            console.log(`[Worker] Metadata Complete. Received ${results.length} results.`);

            // --- Phase 2: Prepare Updates & Vector Texts ---
            const updates: {
                songId: string,
                metaUpdate: any,
                vectorText?: string
            }[] = [];

            for (const result of results) {
                const songId = result.id ? String(result.id) : null;
                if (!songId) continue;

                const inputSong = songs.find(s => s.navidrome_id === songId);
                const analysisJson = JSON.stringify(result);

                // Extract Fields
                const acoustic = result.vector_anchor?.acoustic_model || "";
                const semantic = result.vector_anchor?.semantic_push || "";
                const description = `${acoustic}\n\n[Imagery] ${semantic}`;

                const tags = [
                    ...(result.embedding_tags?.mood_coord || []),
                    ...(result.embedding_tags?.objects || [])
                ];
                if (result.embedding_tags?.scene_tag) tags.push(result.embedding_tags.scene_tag);
                if (result.embedding_tags?.spectrum) tags.push(`#Spectrum:${result.embedding_tags.spectrum}`);

                const metaUpdate = {
                    description: description,
                    tags: tags,
                    mood: (result.embedding_tags?.mood_coord || [])[0] || "Unknown",
                    is_instrumental: result.is_instrumental ? 1 : 0, // [中文注释] 使用 AI 显式返回的纯音乐标记 (1=是, 0=否)
                    analysis_json: analysisJson,
                    energy_level: result.embedding_tags?.energy,
                    visual_popularity: result.popularity_raw,
                    language: result.language, // [中文注释] 存储检测到的语种 (CN/EN/etc)
                    spectrum: result.embedding_tags?.spectrum,
                    spatial: result.embedding_tags?.spatial,
                    scene_tag: result.embedding_tags?.scene_tag,
                    tempo_vibe: result.embedding_tags?.tempo_vibe,
                    timbre_texture: result.embedding_tags?.timbre_texture,
                    llm: result.llm_model // [AI] Model Name
                };

                // Prepare Vector Text
                let vectorText = undefined;
                if (inputSong) {
                    vectorText = EmbeddingService.constructVectorText(result, {
                        title: inputSong.title,
                        artist: inputSong.artist,
                        genre: (result.embedding_tags?.objects || []).find(t => t.includes('Genre') || t.includes('Style')) || ""
                    });
                }

                updates.push({ songId, metaUpdate, vectorText });
            }

            // --- Phase 3: Batch Vector Embedding (1 Call) ---
            const validVectorTexts = updates.filter(u => u.vectorText).map(u => u.vectorText!);
            let vectors: number[][] = [];

            if (validVectorTexts.length > 0) {
                console.log(`[Worker] Generating Batch Embeddings for ${validVectorTexts.length} items...`);
                try {
                    vectors = await embeddingService.embedBatch(validVectorTexts);
                } catch (err) {
                    console.error("Batch Embedding Failed, skipping vector save:", err);
                    // Can continue to save metadata even if vector fails
                }
            }

            // --- Phase 4: Commit to DB (Batch & Transaction) ---
            let vecIndex = 0;
            const batchData = updates.map(u => {
                let vector: number[] | undefined = undefined;
                if (u.vectorText && vectors[vecIndex]) {
                    vector = vectors[vecIndex];
                    vecIndex++;
                }
                return {
                    songId: u.songId,
                    metaUpdate: u.metaUpdate,
                    vector: vector
                };
            });

            if (batchData.length > 0) {
                metadataRepo.saveBatchAnalysis(batchData);
            }

            console.log(`[Worker] Job ${job.id} Complete. Updated ${batchData.length}/${songs.length}.`);
            return { success: true, count: batchData.length };

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
                    // Level 2: Daily Quota Exhausted -> Sleep until tomorrow 08:00
                    const now = new Date();
                    const tomorrow = new Date(now);
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    tomorrow.setHours(8, 0, 0, 0); // 08:00 AM next day
                    pauseDurationMs = tomorrow.getTime() - now.getTime();
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

            // Mark as FAILED in DB (so we know it didn't finish)
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
        concurrency: 1, // Sequential
        limiter: {
            max: 4, // 2 Jobs × 2 Calls = 8 RPM (< 15 RPM 免费层限制)
            duration: 60000 // 1 Minute
        }
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
 * 包括等待中、延迟中的任务
 */
export const clearQueue = async (): Promise<{ clearedJobs: number }> => {
    // 获取当前任务数量
    const counts = await metadataQueue.getJobCounts();
    const totalBefore = counts.waiting + counts.delayed + counts.active;

    // 清空不同状态的任务
    await metadataQueue.drain(); // 清空等待中的任务
    await metadataQueue.clean(0, 1000, 'delayed'); // 清空延迟任务
    await metadataQueue.clean(0, 1000, 'failed');  // 清空失败任务

    console.log(`[Queue] Cleared ${totalBefore} jobs.`);
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
