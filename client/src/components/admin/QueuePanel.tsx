import { useState, useEffect, useCallback } from 'react';
import { api } from '../../api';
import type { QueueStatus, QueueActionResult } from '../../api';
import { Button } from '../ui/button';
import {
    Play, Pause, Square, RefreshCw, Zap, Database, FileJson,
    Loader2, CheckCircle2, XCircle, AlertTriangle
} from 'lucide-react';
import '../AdminMetadataView.css';

export function QueuePanel() {
    const [status, setStatus] = useState<QueueStatus | null>(null);
    const [loading, setLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info', text: string } | null>(null);
    const [showConfirm, setShowConfirm] = useState<'start' | 'stop' | null>(null);

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
        const interval = setInterval(fetchStatus, 3000); // Faster refresh for better feedback
        return () => clearInterval(interval);
    }, [fetchStatus]);

    // Handle Start with Dry Run
    const handleStart = async (confirmed = false) => {
        if (!confirmed) {
            setActionLoading('preview');
            setMessage(null);
            try {
                // Dry run first
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

        // Confirmed Start
        setShowConfirm(null);
        handleAction('start', () => api.startQueue());
    };

    // Generic Action Handler
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

    // Stop Handler
    const handleStop = (confirmed = false) => {
        if (!confirmed) {
            setShowConfirm('stop');
            return;
        }
        setShowConfirm(null);
        handleAction('stop', api.stopQueue);
    };

    const mainStatus = status?.main;
    // Pipeline active check for future use if API supports it explicitly
    const isPipelineActive = mainStatus?.pipelineState === 'syncing' || mainStatus?.pipelineState === 'enqueuing';

    return (
        <div className="queue-panel-content">
            {/* Messages */}
            {message && (
                <div className={`task-message ${message.type}`}>
                    {message.type === 'success' && <CheckCircle2 className="w-4 h-4" />}
                    {message.type === 'error' && <XCircle className="w-4 h-4" />}
                    {message.type === 'info' && <AlertTriangle className="w-4 h-4" />}
                    <span>{message.text}</span>
                    <button onClick={() => setMessage(null)}>×</button>
                </div>
            )}

            {/* Confirmation Dialog */}
            {showConfirm && (
                <div className="task-confirm">
                    <p>
                        {showConfirm === 'start'
                            ? '确定要开始处理吗？这将消耗 AI 配额。'
                            : '确定要停止并清空队列吗？所有待处理任务将被移除。'}
                    </p>
                    <div className="confirm-buttons">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowConfirm(null)}
                        >
                            取消
                        </Button>
                        <Button
                            variant={showConfirm === 'stop' ? 'destructive' : 'default'}
                            size="sm"
                            onClick={() => showConfirm === 'start' ? handleStart(true) : handleStop(true)}
                        >
                            确认
                        </Button>
                    </div>
                </div>
            )}

            {/* Status Cards */}
            <div className="queue-status-grid">
                {/* Main Queue */}
                <div className="queue-card">
                    <div className="queue-card-header">
                        <Zap className="w-5 h-5" />
                        <span>总队列 (Unified Queue)</span>
                        <span className={`queue-status-badge ${mainStatus?.isPaused ? 'paused' : 'running'}`}>
                            {mainStatus?.isPaused ? '已暂停' : isPipelineActive ? '初始化...' : '运行中'}
                        </span>
                    </div>
                    <div className="queue-stats">
                        <div className="queue-stat">
                            <span className="queue-stat-value">{mainStatus?.pendingSongs?.toLocaleString() || 0}</span>
                            <span className="queue-stat-label">待处理</span>
                        </div>
                        <div className="queue-stat">
                            <span className="queue-stat-value">{mainStatus?.activeJobs || 0}</span>
                            <span className="queue-stat-label">进行中</span>
                        </div>
                        <div className="queue-stat">
                            <span className="queue-stat-value">{mainStatus?.waitingJobs || 0}</span>
                            <span className="queue-stat-label">等待中</span>
                        </div>
                        <div className="queue-stat">
                            <span className="queue-stat-value">{mainStatus?.failedJobs || 0}</span>
                            <span className="queue-stat-label">已失败</span>
                        </div>
                    </div>
                    <div className="queue-actions">
                        <Button
                            size="sm"
                            onClick={() => handleStart()}
                            disabled={!!actionLoading || !!showConfirm}
                        >
                            {actionLoading === 'start' || actionLoading === 'preview' ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : <Play className="w-4 h-4" />}
                            开始
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleAction('pause', api.pauseQueue)}
                            disabled={!!actionLoading}
                        >
                            <Pause className="w-4 h-4" /> 暂停
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleAction('resume', api.resumeQueue)}
                            disabled={!!actionLoading}
                        >
                            <RefreshCw className="w-4 h-4" /> 恢复
                        </Button>
                        <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleStop()}
                            disabled={!!actionLoading}
                        >
                            <Square className="w-4 h-4" /> 停止
                        </Button>
                    </div>
                </div>

                {/* Metadata Only Queue */}
                <div className="queue-card">
                    <div className="queue-card-header">
                        <FileJson className="w-5 h-5" />
                        <span>仅元数据 (Metadata)</span>
                        <span className={`queue-status-badge ${status?.metadataOnly?.isPaused ? 'paused' : 'running'}`}>
                            {status?.metadataOnly?.isPaused ? '已暂停' : status?.metadataOnly?.isWorkerRunning ? '运行中' : '待机'}
                        </span>
                    </div>
                    <div className="queue-stats">
                        <div className="queue-stat">
                            <span className="queue-stat-value">{status?.metadataOnly?.pendingSongs?.toLocaleString() || 0}</span>
                            <span className="queue-stat-label">待处理</span>
                        </div>
                        <div className="queue-stat">
                            <span className="queue-stat-value">{status?.metadataOnly?.waitingJobs || 0}</span>
                            <span className="queue-stat-label">等待中</span>
                        </div>
                        <div className="queue-stat">
                            <span className="queue-stat-value">{status?.metadataOnly?.activeJobs || 0}</span>
                            <span className="queue-stat-label">运行中</span>
                        </div>
                        <div className="queue-stat">
                            <span className="queue-stat-value">{status?.metadataOnly?.failedJobs || 0}</span>
                            <span className="queue-stat-label">失败</span>
                        </div>
                    </div>
                    <div className="queue-actions">
                        <Button
                            size="sm"
                            onClick={() => handleAction('metaOnlyStart', () => api.startMetadataOnlyQueue(100))}
                            disabled={!!actionLoading}
                        >
                            <Play className="w-4 h-4" /> 开始
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleAction('metaOnlyPause', api.pauseMetadataOnlyQueue)}
                            disabled={!!actionLoading}
                        >
                            <Pause className="w-4 h-4" /> 暂停
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleAction('metaOnlyResume', api.resumeMetadataOnlyQueue)}
                            disabled={!!actionLoading}
                        >
                            <RefreshCw className="w-4 h-4" /> 恢复
                        </Button>
                        <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleAction('metaOnlyStop', api.stopMetadataOnlyQueue)}
                            disabled={!!actionLoading}
                        >
                            <Square className="w-4 h-4" /> 停止
                        </Button>
                    </div>
                </div>

                {/* Embedding Only Queue */}
                <div className="queue-card">
                    <div className="queue-card-header">
                        <Database className="w-5 h-5" />
                        <span>向量处理 (Vector)</span>
                        <span className={`queue-status-badge ${status?.embeddingOnly?.isPaused ? 'paused' : 'running'}`}>
                            {status?.embeddingOnly?.isPaused ? '已暂停' : status?.embeddingOnly?.isWorkerRunning ? '运行中' : '待机'}
                        </span>
                    </div>
                    <div className="queue-stats">
                        <div className="queue-stat">
                            <span className="queue-stat-value">{status?.embeddingOnly?.pendingSongs?.toLocaleString() || 0}</span>
                            <span className="queue-stat-label">待处理</span>
                        </div>
                        <div className="queue-stat">
                            <span className="queue-stat-value">{status?.embeddingOnly?.waitingJobs || 0}</span>
                            <span className="queue-stat-label">等待中</span>
                        </div>
                        <div className="queue-stat">
                            <span className="queue-stat-value">{status?.embeddingOnly?.activeJobs || 0}</span>
                            <span className="queue-stat-label">运行中</span>
                        </div>
                        <div className="queue-stat">
                            <span className="queue-stat-value">{status?.embeddingOnly?.failedJobs || 0}</span>
                            <span className="queue-stat-label">失败</span>
                        </div>
                    </div>
                    <div className="queue-actions">
                        <Button
                            size="sm"
                            onClick={() => handleAction('embedOnlyStart', () => api.startEmbeddingOnlyQueue(200))}
                            disabled={!!actionLoading}
                        >
                            <Play className="w-4 h-4" /> 开始
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleAction('embedOnlyPause', api.pauseEmbeddingOnlyQueue)}
                            disabled={!!actionLoading}
                        >
                            <Pause className="w-4 h-4" /> 暂停
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleAction('embedOnlyResume', api.resumeEmbeddingOnlyQueue)}
                            disabled={!!actionLoading}
                        >
                            <RefreshCw className="w-4 h-4" /> 恢复
                        </Button>
                        <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleAction('embedOnlyStop', api.stopEmbeddingOnlyQueue)}
                            disabled={!!actionLoading}
                        >
                            <Square className="w-4 h-4" /> 停止
                        </Button>
                    </div>
                </div>
            </div>

            {/* Refresh Button */}
            <div className="queue-footer">
                <Button variant="ghost" size="sm" onClick={fetchStatus} disabled={loading}>
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    {loading ? '刷新中...' : '刷新状态'}
                </Button>
                <span className="queue-footer-hint">每3秒自动刷新</span>
            </div>
        </div>
    );
}
