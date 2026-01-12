import { Queue, Worker, Job } from 'bullmq';
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
// Gemini Free Tier: 15 RPM
// We set strict limiter here.
/**
 * 启动元数据生成 Worker
 * 负责消费 'metadata-generation' 队列，包含三个主要阶段：
 * 1. AI Analysis: 调用 LLM 生成描述和标签
 * 2. Database Update: 更新 smart_metadata
 * 3. Vector Embedding: 生成向量并存入 vec_songs
 */
export const startWorker = () => {
    const worker = new Worker<MetadataJobData>('metadata-generation', async (job) => {
        const { songs, correlationId } = job.data;
        console.log(`[Worker] Processing Job ${job.id} (Correlation: ${correlationId}) - ${songs.length} songs`);

        try {
            // 1. Get AI Service
            const aiService = AIFactory.getService();

            // 2. Generate Metadata (Batch)
            console.log(`[Worker] Sending request to AI...`);
            const results = await aiService.generateBatchMetadata(songs.map(s => ({
                id: s.navidrome_id,
                title: s.title,
                artist: s.artist
            })));

            console.log(`[Worker] AI Request Complete. Received ${results.length} results.`);

            // 3. Update Database
            let successCount = 0;
            // Initialize Embedding Service once per batch (or per item if lightweight, but class has state)
            const embeddingService = new EmbeddingService();

            for (const result of results) {
                // Match result to song ID
                const songId = result.id ? String(result.id) : null;

                if (songId) {
                    try {
                        // --- Stage 2: Database Update (Metadata) ---
                        // A. Update Metadata
                        metadataRepo.updateAnalysis(songId, {
                            description: result.vector_description,
                            tags: result.tags,
                            mood: result.mood,
                            is_instrumental: result.is_instrumental
                        });

                        // --- Stage 3: Vector Embedding ---
                        // B. Generate & Save Vector
                        // We use the 'vector_description' or combined text for embedding
                        if (result.vector_description) {
                            try {
                                // Construct structured embedding string
                                const inputSong = songs.find(s => s.navidrome_id === result.id);
                                const songTitle = inputSong ? inputSong.title : 'Unknown Title';
                                const songArtist = inputSong ? inputSong.artist : 'Unknown Artist';
                                const tagsString = (result.tags || []).join(' ');
                                const moodString = result.mood || '';

                                // Template: Song: [Title] | Artist: [Artist] | Mood: [Mood] | Tags: [Tag1] [Tag2] | Description: [Vector Description]
                                const embeddingText = `Song: ${songTitle} | Artist: ${songArtist} | Mood: ${moodString} | Tags: ${tagsString} | Description: ${result.vector_description}`;

                                const vector = await embeddingService.embed(embeddingText);
                                const rowId = metadataRepo.getSongRowId(songId);
                                if (rowId) {
                                    metadataRepo.saveVector(rowId, vector);
                                } else {
                                    console.warn(`[Worker] Could not find rowid for ${songId} to save vector.`);
                                }
                            } catch (vecErr) {
                                console.error(`[Worker] Vector Generation Failed for ${songId}:`, vecErr);
                                // We don't fail the whole job if vector fails, but we log it.
                            }
                        }

                        successCount++;
                    } catch (dbErr) {
                        console.error(`[Worker] DB Update Failed for ${songId}:`, dbErr);
                    }
                } else {
                    console.warn("[Worker] Result missing ID:", result);
                }
            }

            console.log(`[Worker] Job ${job.id} Complete. Updated ${successCount}/${songs.length} songs.`);
            return { success: true, count: successCount };

        } catch (error) {
            console.error(`[Worker] Job ${job.id} Failed:`, error);
            throw error; // Trigger retry
        }
    }, {
        connection,
        concurrency: 1, // Sequential processing
        limiter: {
            max: 15,
            duration: 60000 // 1 Minute
        }
    });

    worker.on('failed', (job, err) => {
        console.error(`[Worker] Job ${job?.id} failed with ${err.message}`);
    });

    console.log('[Worker] Metadata Worker Started.');
    return worker;
};

// --- Producer Helper ---
export const addToQueue = async (songs: MetadataJobData['songs']) => {
    return await metadataQueue.add('batch-analyze', {
        correlationId: `batch_${Date.now()}`,
        songs
    });
};
