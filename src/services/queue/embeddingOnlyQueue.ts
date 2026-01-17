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

export const startEmbeddingOnlyWorker = () => {
    const worker = new Worker<EmbeddingOnlyJobData>('embedding-only', async (job) => {
        const { songs, correlationId } = job.data;
        console.log(`[EmbeddingOnly] Processing Job ${job.id} (${correlationId}) - ${songs.length} songs`);

        const embeddingService = new EmbeddingService();
        let successCount = 0;

        for (const song of songs) {
            try {
                // 1. 解析已有的 analysis_json
                const analysisData = JSON.parse(song.analysis_json);

                // 2. 构建向量文本
                const vectorText = EmbeddingService.constructVectorText(analysisData, {
                    title: song.title,
                    artist: song.artist
                });

                // 3. 生成向量
                const vector = await embeddingService.embed(vectorText);

                // 4. 获取 rowid 并保存向量
                const rowId = metadataRepo.getSongRowId(song.navidrome_id);
                if (rowId) {
                    metadataRepo.saveVector(rowId, vector);
                    metadataRepo.updateEmbeddingStatus(song.navidrome_id, 'COMPLETED');
                    successCount++;
                }

            } catch (error: any) {
                console.error(`[EmbeddingOnly] Failed for ${song.title}: ${error.message}`);
                metadataRepo.updateEmbeddingStatus(song.navidrome_id, 'FAILED');
            }
        }

        console.log(`[EmbeddingOnly] Job ${job.id} Complete. ${successCount}/${songs.length} succeeded.`);
        return { success: true, count: successCount, total: songs.length };

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

export const addToEmbeddingOnlyQueue = async (songs: EmbeddingOnlyJobData['songs']) => {
    return await embeddingOnlyQueue.add('batch-embedding-only', {
        correlationId: `embed_only_${Date.now()}`,
        songs
    });
};
