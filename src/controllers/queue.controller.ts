/**
 * 队列管理控制器
 * 提供 API 接口用于控制元数据生成队列
 */

import { Request, Response } from 'express';
import { queueManagerService, StartOptions } from '../services/queue/QueueManagerService';

export const QueueController = {
    /**
     * POST /api/queue/start
     * 启动元数据生成任务
     * Query Parameters:
     *   - skipSync: 跳过 Navidrome 同步 (default: false)
     *   - limit: 限制处理歌曲数量
     *   - dryRun: 仅预览，不实际执行 (default: false)
     */
    start: async (req: Request, res: Response) => {
        try {
            const options: StartOptions = {
                skipSync: req.query.skipSync === 'true',
                limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
                dryRun: req.query.dryRun === 'true'
            };

            const result = await queueManagerService.start(options);

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
     * 获取队列状态
     */
    status: async (_req: Request, res: Response) => {
        try {
            const status = await queueManagerService.getStatus();
            res.json(status);
        } catch (error: any) {
            res.status(500).json({
                success: false,
                message: `服务器错误: ${error.message}`
            });
        }
    }
};
