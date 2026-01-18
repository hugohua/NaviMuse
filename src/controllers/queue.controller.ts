/**
 * 队列管理控制器
 * 提供 API 接口用于控制元数据生成队列
 */

import { Request, Response } from 'express';
import { queueManagerService, StartOptions } from '../services/queue/QueueManagerService';
import { metadataRepo, initDB } from '../db';
import {
    addToMetadataOnlyQueue,
    ensureMetadataOnlyWorkerStarted,
    pauseMetadataOnlyQueue,
    resumeMetadataOnlyQueue,
    stopMetadataOnlyQueue,
    getMetadataOnlyQueueStatus
} from '../services/queue/metadataOnlyQueue';
import {
    addToEmbeddingOnlyQueue,
    ensureEmbeddingOnlyWorkerStarted,
    pauseEmbeddingOnlyQueue,
    resumeEmbeddingOnlyQueue,
    stopEmbeddingOnlyQueue,
    getEmbeddingOnlyQueueStatus
} from '../services/queue/embeddingOnlyQueue';

export const QueueController = {
    /**
     * POST /api/queue/start
     * 启动元数据生成任务 (一体化)
     */
    start: async (req: Request, res: Response) => {
        try {
            const options: StartOptions = {
                skipSync: req.query.skipSync === 'true',
                limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
                dryRun: req.query.dryRun === 'true'
            };

            console.log('[QueueController] Received start request:', JSON.stringify(options));
            const result = await queueManagerService.start(options);
            console.log('[QueueController] Start result:', JSON.stringify(result));

            res.json(result);
        } catch (error: any) {
            console.error('[QueueController] Start error:', error);
            res.status(500).json({
                success: false,
                message: `服务器错误: ${error.message}`
            });
        }
    },

    /**
     * POST /api/queue/pause
     * 暂停队列处理
     */
    pause: async (_req: Request, res: Response) => {
        try {
            const result = await queueManagerService.pause();
            res.json(result);
        } catch (error: any) {
            res.status(500).json({
                success: false,
                message: `服务器错误: ${error.message}`
            });
        }
    },

    /**
     * POST /api/queue/resume
     * 恢复队列处理
     */
    resume: async (_req: Request, res: Response) => {
        try {
            const result = await queueManagerService.resume();
            res.json(result);
        } catch (error: any) {
            res.status(500).json({
                success: false,
                message: `服务器错误: ${error.message}`
            });
        }
    },

    /**
     * POST /api/queue/stop
     * 停止并清空队列
     */
    stop: async (_req: Request, res: Response) => {
        try {
            const result = await queueManagerService.stop();
            res.json(result);
        } catch (error: any) {
            res.status(500).json({
                success: false,
                message: `服务器错误: ${error.message}`
            });
        }
    },

    /**
     * GET /api/queue/status
     * 获取所有队列状态（包含待处理数据统计）
     */
    status: async (_req: Request, res: Response) => {
        try {
            const mainStatus = await queueManagerService.getStatus();
            const metadataOnlyStatus = await getMetadataOnlyQueueStatus();
            const embeddingOnlyStatus = await getEmbeddingOnlyQueueStatus();

            // 获取数据库中的待处理统计
            initDB();
            const pendingMetadataSongs = metadataRepo.getPendingSongs(100000).length;
            const pendingEmbeddingSongs = metadataRepo.getPendingEmbeddings(100000).length;

            res.json({
                main: mainStatus,
                metadataOnly: {
                    ...metadataOnlyStatus,
                    pendingSongs: pendingMetadataSongs
                },
                embeddingOnly: {
                    ...embeddingOnlyStatus,
                    pendingSongs: pendingEmbeddingSongs
                }
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                message: `服务器错误: ${error.message}`
            });
        }
    },

    // ========== 仅元数据队列 ==========

    /**
     * POST /api/queue/metadata-only/start
     * 启动仅元数据生成任务
     */
    startMetadataOnly: async (req: Request, res: Response) => {
        try {
            const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
            initDB();
            const songs = metadataRepo.getPendingSongs(limit);

            if (songs.length === 0) {
                return res.json({ success: true, message: '没有待处理的歌曲', jobsCreated: 0 });
            }

            // 确保 Worker 已启动
            ensureMetadataOnlyWorkerStarted();

            // 分批添加到队列 (每批 10 首)
            const batchSize = 10;
            let jobsCreated = 0;
            for (let i = 0; i < songs.length; i += batchSize) {
                const batch = songs.slice(i, i + batchSize);
                await addToMetadataOnlyQueue(batch);
                jobsCreated++;
            }

            res.json({
                success: true,
                message: `已添加 ${songs.length} 首歌曲到元数据队列`,
                songsTotal: songs.length,
                jobsCreated
            });
        } catch (error: any) {
            res.status(500).json({ success: false, message: error.message });
        }
    },

    /**
     * POST /api/queue/metadata-only/pause
     */
    pauseMetadataOnly: async (_req: Request, res: Response) => {
        try {
            await pauseMetadataOnlyQueue();
            res.json({ success: true, message: '元数据队列已暂停' });
        } catch (error: any) {
            res.status(500).json({ success: false, message: error.message });
        }
    },

    /**
     * POST /api/queue/metadata-only/resume
     */
    resumeMetadataOnly: async (_req: Request, res: Response) => {
        try {
            ensureMetadataOnlyWorkerStarted();
            await resumeMetadataOnlyQueue();
            res.json({ success: true, message: '元数据队列已恢复' });
        } catch (error: any) {
            res.status(500).json({ success: false, message: error.message });
        }
    },

    /**
     * POST /api/queue/metadata-only/stop
     */
    stopMetadataOnly: async (_req: Request, res: Response) => {
        try {
            const result = await stopMetadataOnlyQueue();
            res.json({ success: true, message: `已停止元数据队列并清除 ${result.clearedJobs} 个任务`, clearedJobs: result.clearedJobs });
        } catch (error: any) {
            res.status(500).json({ success: false, message: error.message });
        }
    },

    // ========== 仅向量队列 ==========

    /**
     * POST /api/queue/embedding-only/start
     * 启动仅向量生成任务
     */
    startEmbeddingOnly: async (req: Request, res: Response) => {
        try {
            const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
            initDB();
            const songs = metadataRepo.getPendingEmbeddings(limit);

            if (songs.length === 0) {
                return res.json({ success: true, message: '没有待生成向量的歌曲', jobsCreated: 0 });
            }

            // 确保 Worker 已启动
            ensureEmbeddingOnlyWorkerStarted();

            // 分批添加到队列 (每批 20 首，向量生成更快)
            const batchSize = 20;
            let jobsCreated = 0;
            for (let i = 0; i < songs.length; i += batchSize) {
                const batch = songs.slice(i, i + batchSize);
                await addToEmbeddingOnlyQueue(batch);
                jobsCreated++;
            }

            res.json({
                success: true,
                message: `已添加 ${songs.length} 首歌曲到向量队列`,
                songsTotal: songs.length,
                jobsCreated
            });
        } catch (error: any) {
            res.status(500).json({ success: false, message: error.message });
        }
    },

    /**
     * POST /api/queue/embedding-only/pause
     */
    pauseEmbeddingOnly: async (_req: Request, res: Response) => {
        try {
            await pauseEmbeddingOnlyQueue();
            res.json({ success: true, message: '向量队列已暂停' });
        } catch (error: any) {
            res.status(500).json({ success: false, message: error.message });
        }
    },

    /**
     * POST /api/queue/embedding-only/resume
     */
    resumeEmbeddingOnly: async (_req: Request, res: Response) => {
        try {
            ensureEmbeddingOnlyWorkerStarted();
            await resumeEmbeddingOnlyQueue();
            res.json({ success: true, message: '向量队列已恢复' });
        } catch (error: any) {
            res.status(500).json({ success: false, message: error.message });
        }
    },

    /**
     * POST /api/queue/embedding-only/stop
     */
    stopEmbeddingOnly: async (_req: Request, res: Response) => {
        try {
            const result = await stopEmbeddingOnlyQueue();
            res.json({ success: true, message: `已停止向量队列并清除 ${result.clearedJobs} 个任务`, clearedJobs: result.clearedJobs });
        } catch (error: any) {
            res.status(500).json({ success: false, message: error.message });
        }
    },

    // ========== 即时处理 (Immediate) ==========

    /**
     * POST /api/queue/immediate
     * 立即处理选中的歌曲（不通过 BullMQ 队列）
     */
    immediate: async (req: Request, res: Response) => {
        try {
            const { ids, type } = req.body; // type: 'full' | 'metadata' | 'embedding'

            if (!ids || !Array.isArray(ids) || ids.length === 0) {
                return res.status(400).json({ success: false, message: 'Invalid IDs provided' });
            }

            if (ids.length > 20) {
                return res.status(400).json({ success: false, message: 'Too many items selected (max 20)' });
            }

            initDB();
            const songs = metadataRepo.getSongsByIds(ids);

            if (songs.length === 0) {
                return res.json({ success: true, message: 'No songs found for provided IDs', count: 0 });
            }

            // Dynamic Import to avoid earlier load issues if any
            const { processFullAnalysisBatch, processMetadataOnlyBatch, processEmbeddingOnlyBatch } = await import('../services/queue/processors');

            let result;
            if (type === 'metadata') {
                result = await processMetadataOnlyBatch(songs, (msg) => console.log(`[Immediate] ${msg}`));
            } else if (type === 'embedding') {
                result = await processEmbeddingOnlyBatch(songs, (msg) => console.log(`[Immediate] ${msg}`));
            } else {
                // Default 'full'
                result = await processFullAnalysisBatch(songs, (msg) => console.log(`[Immediate] ${msg}`));
            }

            res.json({ success: true, count: result.count, message: 'Processed successfully' });

        } catch (error: any) {
            console.error('[QueueController] Immediate processing error:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }
};
