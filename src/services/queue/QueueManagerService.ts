/**
 * 队列管理服务
 * 封装元数据生成队列的启动/暂停/停止逻辑
 * 核心逻辑复用自 scripts/start-full-scan.ts
 */

import { navidromeSyncService } from '../navidromeSync';
import { metadataRepo, systemRepo, initDB } from '../../db';
import {
    addToQueue,
    startWorker,
    metadataQueue,
    pauseQueue,
    resumeQueue,
    clearQueue,
    getQueueStatus,
    setWorkerInstance,
    getWorkerInstance,
    QueueStatus,
    redisConnection // Import Redis Connection
} from './metadataQueue';

export interface StartOptions {
    /** 是否跳过 Navidrome 同步 */
    skipSync?: boolean;
    /** 限制处理歌曲数量 */
    limit?: number;
    /** Dry-Run 模式：仅返回预览信息，不实际执行 */
    dryRun?: boolean;
}

export interface StartResult {
    success: boolean;
    message: string;
    /** 待处理歌曲数量 */
    pendingCount: number;
    /** 创建的任务数量 */
    jobsCreated: number;
    /** 是否为 Dry-Run */
    dryRun?: boolean;
}

export type PipelineState = 'idle' | 'syncing' | 'enqueuing';

export interface ExtendedQueueStatus extends QueueStatus {
    /** 数据库中待分析的歌曲数 */
    pendingSongs: number;
    /** 数据库中总歌曲数 */
    totalSongs: number;
    /** 当前流水线状态 */
    pipelineState: PipelineState;
}

import { config } from '../../config';

// JOB_BATCH_SIZE moved to dynamic retrieval

class QueueManagerService {
    private pipelineState: PipelineState = 'idle';
    private watchdogInterval: NodeJS.Timeout | null = null;

    constructor() {
        this.startWatchdog();
    }

    /**
     * Start the Auto-Resume Watchdog
     * Checks every minute if the queue should be resumed from a pause.
     */
    private startWatchdog() {
        if (this.watchdogInterval) return;

        console.log('[QueueManager] Starting Watchdog...');
        this.watchdogInterval = setInterval(async () => {
            try {
                const isPaused = await metadataQueue.isPaused();
                if (!isPaused) return;

                const resumeAtStr = await redisConnection.get('navimuse:queue:resume_at');
                if (!resumeAtStr) return;

                const resumeAt = parseInt(resumeAtStr, 10);
                if (Date.now() > resumeAt) {
                    console.log(`[Watchdog] ⏰ Auto-Resuming Queue (Pause expired at ${new Date(resumeAt).toLocaleString()})`);
                    await this.resume();
                    await redisConnection.del('navimuse:queue:resume_at');
                }
            } catch (error) {
                console.error('[Watchdog] Error checking queue status:', error);
            }
        }, 60 * 1000); // Check every minute
    }

    /**
     * 启动元数据生成流水线
     * 1. 检查状态
     * 2. Dry-Run 模式同步返回
     * 3. 正常模式异步后台执行，立即返回
     */
    async start(options: StartOptions = {}): Promise<StartResult> {
        console.log('[QueueManager] start() called with:', JSON.stringify(options));
        const { skipSync = false, limit, dryRun = false } = options;

        if (this.pipelineState !== 'idle') {
            return {
                success: false,
                message: this.pipelineState === 'syncing'
                    ? '正在同步 Navidrome 数据，请稍候...'
                    : '正在创建任务队列，请稍候...',
                pendingCount: 0,
                jobsCreated: 0
            };
        }

        // 检查是否已有 Worker 在运行且有积压
        if (getWorkerInstance()) {
            const status = await getQueueStatus();
            if (status.waitingJobs > 0 || status.activeJobs > 0) {
                // 如果已经在运行，就不重复启动了
                // 除非队列空闲，否则认为不用操作
            }
        }

        // Dry-Run 模式：仍需同步 DB 才能统计 pending
        if (dryRun) {
            console.log('[QueueManager] Dry-Run mode enabled.');

            if (!skipSync) {
                console.log('[QueueManager] Dry-Run: Syncing from Navidrome...');
                initDB();
                await navidromeSyncService.syncFromNavidrome(limit);
            }

            // Re-init DB just in case, though mostly needed if we didn't sync
            initDB();

            const pendingCount = metadataRepo.getPendingSongs(limit || 100000).length;
            console.log(`[QueueManager] Dry-Run Pending Count: ${pendingCount}`);

            // Calculate estimated jobs
            const batchSize = parseInt(systemRepo.getSetting('queue_batch_size') || String(config.queue.batchSize), 10);
            const estimatedJobs = Math.ceil(pendingCount / batchSize);

            return {
                success: true,
                message: `[Dry-Run Preview] 数据库中现有 ${pendingCount} 首待处理歌曲，预计创建 ${estimatedJobs} 个任务。`,
                pendingCount,
                jobsCreated: estimatedJobs,
                dryRun: true
            };
        }

        // 启动后台流程
        this._runPipeline(options).catch(err => {
            console.error('[QueueManager] Pipeline Error:', err);
        });

        return {
            success: true,
            message: '任务启动流程已开始（正在后台同步 Navidrome 数据...）',
            pendingCount: 0, // 异步模式下暂时无法知晓
            jobsCreated: 0
        };
    }

    /**
     * 后台执行流水线
     */
    private async _runPipeline(options: StartOptions) {
        const { skipSync = false, limit } = options;

        try {
            console.log('[QueueManager] Starting pipeline...');

            // 1. Sync
            if (!skipSync) {
                this.pipelineState = 'syncing';
                console.log('[QueueManager] Syncing from Navidrome...');
                initDB();
                await navidromeSyncService.syncFromNavidrome(limit);
                console.log('[QueueManager] Sync complete.');
            }

            // 2. Enqueue
            this.pipelineState = 'enqueuing';
            initDB();

            const allPending = metadataRepo.getPendingSongs(limit || 100000);
            const pendingCount = allPending.length;

            console.log(`[QueueManager] Found ${pendingCount} songs pending analysis.`);

            if (pendingCount > 0) {
                // Ensure Worker Started
                if (!getWorkerInstance()) {
                    const worker = startWorker();
                    setWorkerInstance(worker);
                }

                // Ensure Queue is not paused
                await resumeQueue();

                const batchSize = parseInt(systemRepo.getSetting('queue_batch_size') || String(config.queue.batchSize), 10);
                let jobsCreated = 0;
                for (let i = 0; i < allPending.length; i += batchSize) {
                    const batch = allPending.slice(i, i + batchSize);
                    await addToQueue(batch);
                    jobsCreated++;
                }
                console.log(`[QueueManager] Enqueued ${jobsCreated} jobs.`);
            }

        } catch (error) {
            console.error('[QueueManager] Pipeline failed:', error);
        } finally {
            this.pipelineState = 'idle';
        }
    }

    /**
     * 暂停队列
     */
    async pause(): Promise<{ success: boolean; message: string }> {
        try {
            await pauseQueue();
            return { success: true, message: '队列已暂停' };
        } catch (error: any) {
            return { success: false, message: `暂停失败: ${error.message}` };
        }
    }

    /**
     * 恢复队列
     */
    async resume(): Promise<{ success: boolean; message: string }> {
        try {
            await resumeQueue();
            return { success: true, message: '队列已恢复' };
        } catch (error: any) {
            return { success: false, message: `恢复失败: ${error.message}` };
        }
    }

    /**
     * 停止并清空队列
     */
    async stop(): Promise<{ success: boolean; message: string; clearedJobs: number }> {
        try {
            // 先暂停
            await pauseQueue();

            // 清空队列
            const { clearedJobs } = await clearQueue();

            // 关闭 Worker
            const worker = getWorkerInstance();
            if (worker) {
                await worker.close();
                setWorkerInstance(null);
            }

            // 重置数据库中被中断的任务状态（PROCESSING -> PENDING）
            // 防止产生脏数据
            const { metadataRepo, initDB } = await import('../../db');
            initDB();
            const resetMetadata = metadataRepo.resetProcessingStatus();
            const resetEmbedding = metadataRepo.resetEmbeddingStatus();

            this.pipelineState = 'idle';

            return {
                success: true,
                message: `已停止队列并清除 ${clearedJobs} 个任务，重置 ${resetMetadata + resetEmbedding} 条数据库记录`,
                clearedJobs
            };
        } catch (error: any) {
            return {
                success: false,
                message: `停止失败: ${error.message}`,
                clearedJobs: 0
            };
        }
    }

    /**
     * 获取队列状态（包含数据库统计）
     */
    async getStatus(): Promise<ExtendedQueueStatus> {
        const queueStatus = await getQueueStatus();

        // 获取数据库统计
        let pendingSongs = 0;
        let totalSongs = 0;

        try {
            initDB();
            pendingSongs = metadataRepo.getPendingSongs(100000).length;
            totalSongs = metadataRepo.getAllIds().length;
        } catch (e) {
            console.warn('[QueueManager] Failed to get DB stats:', e);
        }

        return {
            ...queueStatus,
            pendingSongs,
            totalSongs,
            pipelineState: this.pipelineState
        };
    }
}

export const queueManagerService = new QueueManagerService();
