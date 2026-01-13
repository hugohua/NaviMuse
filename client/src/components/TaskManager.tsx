/**
 * 任务管理页面组件
 * 用于管理元数据生成队列的启动、暂停、停止操作
 */

import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import type { QueueStatus } from '../api';
import {
    Play,
    Pause,
    Square,
    RefreshCw,
    ExternalLink,
    Loader2,
    CheckCircle2,
    XCircle,
    Clock,
    Activity,
    Database,
    AlertTriangle
} from 'lucide-react';
import { Button } from './ui/button';
import './TaskManager.css';

interface TaskManagerProps {
    onClose?: () => void;
}

export function TaskManager({ onClose }: TaskManagerProps) {
    const [status, setStatus] = useState<QueueStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
    const [showConfirm, setShowConfirm] = useState<'start' | 'stop' | null>(null);

    // 获取队列状态
    const fetchStatus = useCallback(async () => {
        try {
            const data = await api.getQueueStatus();
            setStatus(data);
        } catch (error: any) {
            console.error('Failed to fetch queue status:', error);
            setMessage({ type: 'error', text: `获取状态失败: ${error.message}` });
        } finally {
            setLoading(false);
        }
    }, []);

    // 定时刷新状态
    useEffect(() => {
        fetchStatus();
        const interval = setInterval(fetchStatus, 3000); // 每3秒刷新
        return () => clearInterval(interval);
    }, [fetchStatus]);

    // 启动任务（带确认）
    const handleStart = async (confirmed = false) => {
        if (!confirmed) {
            // 先执行 dry-run 预览
            setActionLoading('preview');
            try {
                const result = await api.startQueue({ dryRun: true });
                if (result.pendingCount === 0) {
                    setMessage({ type: 'info', text: '没有待处理的歌曲' });
                    setActionLoading(null);
                    return;
                }
                setMessage({
                    type: 'info',
                    text: `将处理 ${result.pendingCount} 首歌曲，创建 ${result.jobsCreated} 个任务`
                });
                setShowConfirm('start');
            } catch (e: any) {
                setMessage({ type: 'error', text: e.message });
            } finally {
                setActionLoading(null);
            }
            return;
        }

        // 确认后执行
        setShowConfirm(null);
        setActionLoading('start');
        try {
            const result = await api.startQueue();
            setMessage({
                type: result.success ? 'success' : 'error',
                text: result.message
            });
            fetchStatus();
        } catch (e: any) {
            setMessage({ type: 'error', text: e.message });
        } finally {
            setActionLoading(null);
        }
    };

    // 暂停/恢复
    const handlePauseResume = async () => {
        if (!status) return;

        setActionLoading('pause');
        try {
            const result = status.isPaused
                ? await api.resumeQueue()
                : await api.pauseQueue();
            setMessage({
                type: result.success ? 'success' : 'error',
                text: result.message
            });
            fetchStatus();
        } catch (e: any) {
            setMessage({ type: 'error', text: e.message });
        } finally {
            setActionLoading(null);
        }
    };

    // 停止（带确认）
    const handleStop = async (confirmed = false) => {
        if (!confirmed) {
            setShowConfirm('stop');
            return;
        }

        setShowConfirm(null);
        setActionLoading('stop');
        try {
            const result = await api.stopQueue();
            setMessage({
                type: result.success ? 'success' : 'error',
                text: result.message
            });
            fetchStatus();
        } catch (e: any) {
            setMessage({ type: 'error', text: e.message });
        } finally {
            setActionLoading(null);
        }
    };

    // 计算进度
    const getProgress = () => {
        if (!status) return 0;
        const total = status.totalSongs;
        const analyzed = total - status.pendingSongs;
        return total > 0 ? Math.round((analyzed / total) * 100) : 0;
    };

    // 判断是否有活跃任务（包括后台流水线和队列任务）
    const isPipelineActive = status?.pipelineState === 'syncing' || status?.pipelineState === 'enqueuing';
    const hasActiveJobs = status && (status.activeJobs > 0 || status.waitingJobs > 0 || isPipelineActive);
    const pipelineText = status?.pipelineState === 'syncing' ? '同步数据中...' :
        status?.pipelineState === 'enqueuing' ? '创建任务中...' : '';

    return (
        <div className="task-manager">
            <div className="task-manager-header">
                <h2>任务管理</h2>
                {onClose && (
                    <Button variant="ghost" size="icon" onClick={onClose}>
                        <span className="text-xl">×</span>
                    </Button>
                )}
            </div>

            {/* Pipeline Status Banner */}
            {isPipelineActive && (
                <div className="task-message info">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{pipelineText}</span>
                </div>
            )}

            {/* 消息提示 */}
            {message && !isPipelineActive && (
                <div className={`task-message ${message.type}`}>
                    {message.type === 'success' && <CheckCircle2 className="w-4 h-4" />}
                    {message.type === 'error' && <XCircle className="w-4 h-4" />}
                    {message.type === 'info' && <AlertTriangle className="w-4 h-4" />}
                    <span>{message.text}</span>
                    <button onClick={() => setMessage(null)}>×</button>
                </div>
            )}

            {/* 确认对话框 */}
            {showConfirm && (
                <div className="task-confirm">
                    <p>
                        {showConfirm === 'start'
                            ? '确认开始元数据生成任务？这将调用 AI API 处理所有未分析的歌曲。'
                            : '确认停止并清空队列？所有待处理的任务将被删除。'}
                    </p>
                    <div className="confirm-buttons">
                        <Button
                            variant="outline"
                            onClick={() => setShowConfirm(null)}
                        >
                            取消
                        </Button>
                        <Button
                            variant={showConfirm === 'stop' ? 'destructive' : 'default'}
                            onClick={() => showConfirm === 'start' ? handleStart(true) : handleStop(true)}
                        >
                            确认
                        </Button>
                    </div>
                </div>
            )}

            {loading ? (
                <div className="task-loading">
                    <Loader2 className="animate-spin" />
                    <span>加载中...</span>
                </div>
            ) : status ? (
                <>
                    {/* 状态卡片 */}
                    <div className="status-grid">
                        <div className="status-card">
                            <Database className="status-icon" />
                            <div className="status-info">
                                <span className="status-label">数据库</span>
                                <span className="status-value">{status.totalSongs} 首歌曲</span>
                            </div>
                        </div>

                        <div className="status-card">
                            <Clock className="status-icon pending" />
                            <div className="status-info">
                                <span className="status-label">待分析</span>
                                <span className="status-value">{status.pendingSongs}</span>
                            </div>
                        </div>

                        <div className="status-card">
                            <Activity className={`status-icon ${hasActiveJobs ? 'active' : ''}`} />
                            <div className="status-info">
                                <span className="status-label">队列状态</span>
                                <span className="status-value">
                                    {status.isPaused ? '已暂停' :
                                        status.pipelineState !== 'idle' ? '初始化中' :
                                            hasActiveJobs ? '运行中' : '空闲'}
                                </span>
                            </div>
                        </div>

                        <div className="status-card">
                            <RefreshCw className="status-icon" />
                            <div className="status-info">
                                <span className="status-label">完成率</span>
                                <span className="status-value">{getProgress()}%</span>
                            </div>
                        </div>
                    </div>

                    {/* 进度条 */}
                    <div className="progress-section">
                        <div className="progress-bar">
                            <div
                                className="progress-fill"
                                style={{ width: `${getProgress()}%` }}
                            />
                        </div>
                        <div className="progress-stats">
                            <span>等待: {status.waitingJobs}</span>
                            <span>处理中: {status.activeJobs}</span>
                            <span>已完成: {status.completedJobs}</span>
                            <span className="failed">失败: {status.failedJobs}</span>
                        </div>
                    </div>

                    {/* 操作按钮 */}
                    <div className="action-buttons">
                        <Button
                            className="action-btn start"
                            onClick={() => handleStart()}
                            disabled={!!actionLoading || !!hasActiveJobs}
                        >
                            {actionLoading === 'start' || actionLoading === 'preview' || isPipelineActive ? (
                                <Loader2 className="animate-spin" />
                            ) : (
                                <Play />
                            )}
                            <span>启动任务</span>
                        </Button>

                        <Button
                            className="action-btn pause"
                            variant="outline"
                            onClick={handlePauseResume}
                            disabled={!!actionLoading || !hasActiveJobs}
                        >
                            {actionLoading === 'pause' ? (
                                <Loader2 className="animate-spin" />
                            ) : status.isPaused ? (
                                <Play />
                            ) : (
                                <Pause />
                            )}
                            <span>{status.isPaused ? '恢复' : '暂停'}</span>
                        </Button>

                        <Button
                            className="action-btn stop"
                            variant="destructive"
                            onClick={() => handleStop()}
                            disabled={!!actionLoading || !hasActiveJobs}
                        >
                            {actionLoading === 'stop' ? (
                                <Loader2 className="animate-spin" />
                            ) : (
                                <Square />
                            )}
                            <span>停止</span>
                        </Button>
                    </div>

                    {/* Bull Dashboard 链接 */}
                    <div className="dashboard-link">
                        <a href="/admin/queues" target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="w-4 h-4" />
                            <span>打开 Bull Dashboard 查看详细信息</span>
                        </a>
                    </div>
                </>
            ) : (
                <div className="task-error">
                    <XCircle />
                    <span>无法获取队列状态</span>
                </div>
            )}
        </div>
    );
}
