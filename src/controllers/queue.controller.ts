/**
 * 队列管理控制器
 * 提供 API 接口用于控制元数据生成队列
 */

import { Request, Response } from 'express';
import { queueManagerService, StartOptions } from '../services/queue/QueueManagerService';
import { metadataRepo } from '../db';
import { addToMetadataOnlyQueue, metadataOnlyQueue } from '../services/queue/metadataOnlyQueue';
import { addToEmbeddingOnlyQueue, embeddingOnlyQueue } from '../services/queue/embeddingOnlyQueue';

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
     * 获取所有队列状态
     */
    status: async (_req: Request, res: Response) => {
        try {
            const mainStatus = await queueManagerService.getStatus();
            const metadataOnlyCounts = await metadataOnlyQueue.getJobCounts();
            const embeddingOnlyCounts = await embeddingOnlyQueue.getJobCounts();

            res.json({
                main: mainStatus,
                metadataOnly: {
                    waiting: metadataOnlyCounts.waiting,
                    active: metadataOnlyCounts.active,
                    completed: metadataOnlyCounts.completed || 0,
                    failed: metadataOnlyCounts.failed
                },
                embeddingOnly: {
                    waiting: embeddingOnlyCounts.waiting,
                    active: embeddingOnlyCounts.active,
                    completed: embeddingOnlyCounts.completed || 0,
                    failed: embeddingOnlyCounts.failed
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
            const songs = metadataRepo.getPendingSongs(limit);

            if (songs.length === 0) {
                return res.json({ success: true, message: '没有待处理的歌曲', jobsCreated: 0 });
            }

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

    // ========== 仅向量队列 ==========

    /**
     * POST /api/queue/embedding-only/start
     * 启动仅向量生成任务
     */
    startEmbeddingOnly: async (req: Request, res: Response) => {
        try {
            const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
            const songs = metadataRepo.getPendingEmbeddings(limit);

            if (songs.length === 0) {
                return res.json({ success: true, message: '没有待生成向量的歌曲', jobsCreated: 0 });
            }

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
    }
};

