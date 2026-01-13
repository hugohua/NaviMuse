
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
// Optimizing for Batch:
// 1. Generate Metadata Batch (1 API Call)
// 2. Generate Embedding Batch (1 API Call)
// Total: 2 Calls per Job.
// Limiter: With 3 songs/job, max 15 RPM => 7 Jobs/min => 21 songs/min.
// Let's constrain to 5 Jobs/min for safety (10 calls/min).

export const startWorker = () => {
    const worker = new Worker<MetadataJobData>('metadata-generation', async (job) => {
        const { songs, correlationId } = job.data;
        console.log(`[Worker] Processing Job ${job.id} (Correlation: ${correlationId}) - ${songs.length} songs`);

        try {
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

            // --- Phase 4: Commit to DB ---
            let successCount = 0;
            let vecIndex = 0;

            for (const update of updates) {
                try {
                    // Update Metadata
                    metadataRepo.updateAnalysis(update.songId, update.metaUpdate);

                    // Update Vector if available
                    if (update.vectorText && vectors[vecIndex]) {
                        const vector = vectors[vecIndex];
                        const rowId = metadataRepo.getSongRowId(update.songId);
                        if (rowId) {
                            metadataRepo.saveVector(rowId, vector);
                        }
                        vecIndex++;
                    }
                    successCount++;
                } catch (e) {
                    console.error(`DB Update Failed for ${update.songId}`, e);
                }
            }

            console.log(`[Worker] Job ${job.id} Complete. Updated ${successCount}/${songs.length}.`);
            return { success: true, count: successCount };

        } catch (error) {
            console.error(`[Worker] Job ${job.id} Failed:`, error);
            throw error;
        }
    }, {
        connection,
        concurrency: 1, // Sequential
        limiter: {
            max: 6, // 6 Jobs * 2 Calls = 12 Req/Min (< 15 Limit)
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
