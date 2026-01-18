import { useState, useEffect, useCallback } from 'react';
import { api } from '../../api';
import type { QueueStatus, QueueActionResult } from '../../api';
import { Button } from '../ui/button';
import {
    Play, Square, RefreshCw, Database, FileJson, Clock,
    Loader2, CheckCircle2, XCircle, AlertTriangle, Activity, ExternalLink, Layers
} from 'lucide-react';
import './QueuePanel.css';

interface QueuePanelProps {
    onClose?: () => void;
}

export function QueuePanel({ onClose }: QueuePanelProps) {
    const [status, setStatus] = useState<QueueStatus | null>(null);
    const [loading, setLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info', text: string } | null>(null);
    const [showConfirm, setShowConfirm] = useState<'start' | 'stop' | null>(null);
    const [activeTab, setActiveTab] = useState<'main' | 'metadata' | 'embedding'>('main');

    const fetchStatus = useCallback(async () => {
        setLoading(true);
        try {
            const data = await api.getQueueStatus();
            setStatus(data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchStatus();
        const interval = setInterval(fetchStatus, 3000);
        return () => clearInterval(interval);
    }, [fetchStatus]);

    // Handle Start with Dry Run
    const handleStart = async (confirmed = false) => {
        if (!confirmed) {
            setActionLoading('preview');
            setMessage(null);
            try {
                const result = await api.startQueue({ dryRun: true });
                if (result.pendingCount === 0) {
                    setMessage({ type: 'info', text: '没有待处理的歌曲。' });
                    setActionLoading(null);
                    return;
                }
                setMessage({
                    type: 'info',
                    text: `发现 ${result.pendingCount} 首待处理歌曲。预计创建任务数: ${result.jobsCreated}`
                });
                setShowConfirm('start');
            } catch (e: any) {
                setMessage({ type: 'error', text: e.message });
            } finally {
                setActionLoading(null);
            }
            return;
        }
        setShowConfirm(null);
        handleAction('start', () => api.startQueue());
    };

    const handleAction = async (action: string, fn: () => Promise<QueueActionResult>) => {
        setActionLoading(action);
        setMessage(null);
        try {
            const result = await fn();
            setMessage({ type: result.success ? 'success' : 'error', text: result.message });
            fetchStatus();
        } catch (e: any) {
            setMessage({ type: 'error', text: e.message });
        } finally {
            setActionLoading(null);
        }
    };

    const handleStop = (confirmed = false) => {
        if (!confirmed) {
            setShowConfirm('stop');
            return;
        }
        setShowConfirm(null);
        handleAction('stop', api.stopQueue);
    };

    const mainStatus = status?.main;
    const isPipelineActive = mainStatus?.pipelineState === 'syncing' || mainStatus?.pipelineState === 'enqueuing';
    const hasActiveJobs = (mainStatus?.activeJobs || 0) > 0 || (mainStatus?.waitingJobs || 0) > 0;

    const getProgress = () => {
        if (!mainStatus) return 0;
        const total = mainStatus.totalSongs || 1;
        const completed = total - mainStatus.pendingSongs;
        return Math.round((completed / total) * 100);
    };

    // 渲染主队列面板
    const renderMainPanel = () => (
        <>
            {/* 状态卡片 */}
            <div className="status-grid">
                <div className="status-card">
                    <Database className="status-icon" />
                    <div className="status-info">
                        <span className="status-label">数据库</span>
                        <span className="status-value">{mainStatus?.totalSongs?.toLocaleString() || 0} 首歌曲</span>
                    </div>
                </div>

                <div className="status-card">
                    <Clock className="status-icon pending" />
                    <div className="status-info">
                        <span className="status-label">待分析</span>
                        <span className="status-value">{mainStatus?.pendingSongs?.toLocaleString() || 0}</span>
                    </div>
                </div>

                <div className="status-card">
                    <Activity className={`status-icon ${hasActiveJobs ? 'active' : ''}`} />
                    <div className="status-info">
                        <span className="status-label">队列状态</span>
                        <span className="status-value">
                            {mainStatus?.isPaused ? '已暂停' :
                                mainStatus?.pipelineState !== 'idle' ? '初始化中' :
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
                    <div className="progress-fill" style={{ width: `${getProgress()}%` }} />
                </div>
                <div className="progress-stats">
                    <span>等待: {mainStatus?.waitingJobs || 0}</span>
                    <span>处理中: {mainStatus?.activeJobs || 0}</span>
                    <span>已完成: {mainStatus?.completedJobs || 0}</span>
                    <span className="failed">失败: {mainStatus?.failedJobs || 0}</span>
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

                {/* Pause / Resume Toggle */}
                {mainStatus?.isPaused ? (
                    <Button
                        className="action-btn"
                        variant="outline"
                        onClick={() => handleAction('resume', api.resumeQueue)}
                        disabled={!!actionLoading}
                    >
                        {actionLoading === 'resume' ? <Loader2 className="animate-spin" /> : <Play />}
                        <span>恢复</span>
                    </Button>
                ) : (
                    <Button
                        className="action-btn"
                        variant="outline"
                        onClick={() => handleAction('pause', api.pauseQueue)}
                        disabled={!!actionLoading || !hasActiveJobs}
                    >
                        {actionLoading === 'pause' ? <Loader2 className="animate-spin" /> : <Square />}
                        <span>暂停</span>
                    </Button>
                )}

                <Button
                    className="action-btn stop"
                    variant="destructive"
                    onClick={() => handleStop()}
                    disabled={!!actionLoading || !hasActiveJobs}
                >
                    {actionLoading === 'stop' ? <Loader2 className="animate-spin" /> : <Square />}
                    <span>停止</span>
                </Button>
            </div>
        </>
    );

    // 渲染子队列面板
    const renderSubQueuePanel = (
        queueType: 'metadata' | 'embedding',
        queueStatus: QueueStatus['metadataOnly'] | QueueStatus['embeddingOnly'] | undefined,
        startFn: () => Promise<QueueActionResult>,
        pauseFn: () => Promise<QueueActionResult>,
        resumeFn: () => Promise<QueueActionResult>,
        stopFn: () => Promise<QueueActionResult>
    ) => {
        const hasActive = (queueStatus?.activeJobs || 0) > 0 || (queueStatus?.waitingJobs || 0) > 0;
        const prefix = queueType === 'metadata' ? 'meta' : 'embed';

        return (
            <>
                <div className="status-grid">
                    <div className="status-card">
                        <Clock className="status-icon pending" />
                        <div className="status-info">
                            <span className="status-label">待处理</span>
                            <span className="status-value">{queueStatus?.pendingSongs?.toLocaleString() || 0}</span>
                        </div>
                    </div>

                    <div className="status-card">
                        <Activity className={`status-icon ${hasActive ? 'active' : ''}`} />
                        <div className="status-info">
                            <span className="status-label">队列状态</span>
                            <span className="status-value">
                                {queueStatus?.isPaused ? '已暂停' :
                                    queueStatus?.isWorkerRunning ? '运行中' : '待机'}
                            </span>
                        </div>
                    </div>

                    <div className="status-card">
                        <Layers className="status-icon" />
                        <div className="status-info">
                            <span className="status-label">等待任务</span>
                            <span className="status-value">{queueStatus?.waitingJobs || 0}</span>
                        </div>
                    </div>

                    <div className="status-card">
                        <RefreshCw className="status-icon" />
                        <div className="status-info">
                            <span className="status-label">运行中</span>
                            <span className="status-value">{queueStatus?.activeJobs || 0}</span>
                        </div>
                    </div>
                </div>

                <div className="progress-section">
                    <div className="progress-stats">
                        <span>等待: {queueStatus?.waitingJobs || 0}</span>
                        <span>运行中: {queueStatus?.activeJobs || 0}</span>
                        <span>已完成: {queueStatus?.completedJobs || 0}</span>
                        <span className="failed">失败: {queueStatus?.failedJobs || 0}</span>
                    </div>
                </div>

                <div className="action-buttons">
                    <Button
                        className="action-btn start"
                        onClick={() => handleAction(`${prefix}Start`, startFn)}
                        disabled={!!actionLoading}
                    >
                        {actionLoading === `${prefix}Start` ? <Loader2 className="animate-spin" /> : <Play />}
                        <span>启动任务</span>
                    </Button>

                    {/* Pause / Resume Toggle */}
                    {queueStatus?.isPaused ? (
                        <Button
                            className="action-btn"
                            variant="outline"
                            onClick={() => handleAction(`${prefix}Resume`, resumeFn)}
                            disabled={!!actionLoading}
                        >
                            {actionLoading === `${prefix}Resume` ? <Loader2 className="animate-spin" /> : <Play />}
                            <span>恢复</span>
                        </Button>
                    ) : (
                        <Button
                            className="action-btn"
                            variant="outline"
                            onClick={() => handleAction(`${prefix}Pause`, pauseFn)}
                            disabled={!!actionLoading || !hasActive}
                        >
                            {actionLoading === `${prefix}Pause` ? <Loader2 className="animate-spin" /> : <Square />}
                            <span>暂停</span>
                        </Button>
                    )}

                    <Button
                        className="action-btn stop"
                        variant="destructive"
                        onClick={() => handleAction(`${prefix}Stop`, stopFn)}
                        disabled={!!actionLoading || !hasActive}
                    >
                        {actionLoading === `${prefix}Stop` ? <Loader2 className="animate-spin" /> : <Square />}
                        <span>停止</span>
                    </Button>
                </div>
            </>
        );
    };

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

            {/* Tab 切换 */}
            <div className="queue-tabs">
                <button
                    className={`queue-tab ${activeTab === 'main' ? 'active' : ''}`}
                    onClick={() => setActiveTab('main')}
                >
                    <Database className="w-4 h-4" />
                    <span>总队列</span>
                </button>
                <button
                    className={`queue-tab ${activeTab === 'metadata' ? 'active' : ''}`}
                    onClick={() => setActiveTab('metadata')}
                >
                    <FileJson className="w-4 h-4" />
                    <span>仅元数据</span>
                </button>
                <button
                    className={`queue-tab ${activeTab === 'embedding' ? 'active' : ''}`}
                    onClick={() => setActiveTab('embedding')}
                >
                    <Layers className="w-4 h-4" />
                    <span>向量处理</span>
                </button>
            </div>

            {/* Pipeline Status Banner */}
            {isPipelineActive && (
                <div className="task-message info">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{mainStatus?.pipelineState === 'syncing' ? '正在同步 Navidrome 数据...' : '正在创建任务队列...'}</span>
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
                        <Button variant="outline" onClick={() => setShowConfirm(null)}>
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

            {loading && !status ? (
                <div className="task-loading">
                    <Loader2 className="animate-spin" />
                    <span>加载中...</span>
                </div>
            ) : status ? (
                <>
                    {activeTab === 'main' && renderMainPanel()}
                    {activeTab === 'metadata' && renderSubQueuePanel(
                        'metadata',
                        status.metadataOnly,
                        () => api.startMetadataOnlyQueue(100),
                        api.pauseMetadataOnlyQueue,
                        api.resumeMetadataOnlyQueue,
                        api.stopMetadataOnlyQueue
                    )}
                    {activeTab === 'embedding' && renderSubQueuePanel(
                        'embedding',
                        status.embeddingOnly,
                        () => api.startEmbeddingOnlyQueue(200),
                        api.pauseEmbeddingOnlyQueue,
                        api.resumeEmbeddingOnlyQueue,
                        api.stopEmbeddingOnlyQueue
                    )}

                    {/* Bull Dashboard 链接 */}
                    <div className="dashboard-link">
                        <a href="http://localhost:5173/admin/queues" target="_blank" rel="noopener noreferrer">
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
