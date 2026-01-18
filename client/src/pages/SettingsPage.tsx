import React, { useEffect, useState } from 'react';
import { Button } from '../components/ui/button';
import { ArrowLeft, Save, CheckCircle, AlertCircle, Server, Cpu } from 'lucide-react';
import { api } from '../api';
import type { ModelInfo } from '../types';
import './SettingsPage.css';

export const SettingsPage: React.FC = () => {
    const [provider, setProvider] = useState<string>('openrouter');
    const [model, setModel] = useState<string>('');
    const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    // Queue Settings State
    const [concurrency, setConcurrency] = useState<string>('5');
    const [rateLimit, setRateLimit] = useState<string>('50');
    const [batchSize, setBatchSize] = useState<string>('15');

    // Fetch current settings and available models
    useEffect(() => {
        const fetchInitialData = async () => {
            setLoading(true);
            try {
                // 1. Fetch Current Settings
                const settings = await api.getSettings();

                if (settings.ai_provider) setProvider(settings.ai_provider);
                if (settings.ai_model) setModel(settings.ai_model);
                if (settings.queue_concurrency) setConcurrency(settings.queue_concurrency);
                if (settings.queue_rate_limit_max) setRateLimit(settings.queue_rate_limit_max);
                if (settings.queue_batch_size) setBatchSize(settings.queue_batch_size);

                // 2. Fetch OpenRouter Models
                const models = await api.getOpenRouterModels();
                setAvailableModels(models);

            } catch (err: any) {
                console.error("Failed to load settings:", err);
                setMessage({ type: 'error', text: '加载配置失败。' });
            } finally {
                setLoading(false);
            }
        };

        fetchInitialData();
    }, []);

    const handleSave = async () => {
        setSaving(true);
        setMessage(null);
        try {
            await api.saveSettings({
                ai_provider: provider,
                ai_model: model,
                queue_concurrency: concurrency,
                queue_rate_limit_max: rateLimit,
                queue_batch_size: batchSize
            });

            setMessage({ type: 'success', text: '配置保存成功，新任务将即刻生效。' });
        } catch (err) {
            setMessage({ type: 'error', text: '保存失败，请检查网络或日志。' });
        } finally {
            setSaving(false);
        }
    };

    const handleProviderChange = (newProvider: string) => {
        setProvider(newProvider);
        // Reset model when switching providers to avoid ghost labels
        if (newProvider === 'aliyun') {
            setModel('qwen-plus');
        } else {
            setModel('');
        }
    };

    // Filter Popular Models
    const POPULAR_MODELS = [
        "google/gemini-3-pro-preview",
        "google/gemini-3-flash-preview",
        "openai/gpt-4o",
        "openai/gpt-5.2",
        "anthropic/claude-3.5-sonnet"
    ];

    const sortedModels = [...availableModels].sort((a, b) => {
        const aPop = POPULAR_MODELS.includes(a.id);
        const bPop = POPULAR_MODELS.includes(b.id);
        if (aPop && !bPop) return -1;
        if (!aPop && bPop) return 1;
        return a.name.localeCompare(b.name);
    });

    return (
        <div className="content-container">
            <div className="settings-page-header">
                <Button variant="ghost" size="icon" onClick={() => window.location.hash = ''}>
                    <ArrowLeft className="w-6 h-6" />
                </Button>
                <div className="flex flex-col">
                    <h1 className="settings-title">AI 配置</h1>
                    <p className="settings-subtitle">管理 AI 服务商与模型设置</p>
                </div>
            </div>

            {message && (
                <div className={`settings-message ${message.type}`}>
                    {message.type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
                    {message.text}
                </div>
            )}

            <div className="settings-card">

                {/* Provider Selection */}
                <div className="settings-section">
                    <label className="settings-label">AI 服务商</label>
                    <div className="provider-grid">
                        <label className={`provider-option ${provider === 'openrouter' ? 'active' : ''}`}>
                            <input
                                type="radio"
                                name="provider"
                                value="openrouter"
                                checked={provider === 'openrouter'}
                                onChange={(e) => handleProviderChange(e.target.value)}
                                className="hidden"
                            />
                            <div className="provider-icon">
                                <Server size={24} />
                            </div>
                            <div className="provider-info">
                                <div className="provider-name">OpenRouter</div>
                                <div className="provider-desc">访问顶级模型 (Gemini, Claude, GPT)</div>
                            </div>
                            <div className="provider-check"><CheckCircle size={20} /></div>
                        </label>

                        <label className={`provider-option ${provider === 'aliyun' ? 'active' : ''}`}>
                            <input
                                type="radio"
                                name="provider"
                                value="aliyun"
                                checked={provider === 'aliyun'}
                                onChange={(e) => handleProviderChange(e.target.value)}
                                className="hidden"
                            />
                            <div className="provider-icon">
                                <Cpu size={24} />
                            </div>
                            <div className="provider-info">
                                <div className="provider-name">阿里云 (Qwen)</div>
                                <div className="provider-desc">直接使用 Qwen-Plus / Qwen-Max</div>
                            </div>
                            <div className="provider-check"><CheckCircle size={20} /></div>
                        </label>
                    </div>
                </div>

                {/* Model Selection */}
                <div className="settings-section">
                    <label className="settings-label">模型选择</label>

                    {provider === 'openrouter' ? (
                        <select
                            value={model}
                            onChange={(e) => setModel(e.target.value)}
                            className="settings-select"
                            disabled={loading || availableModels.length === 0}
                        >
                            <option value="">选择模型...</option>
                            {availableModels.length === 0 && <option>加载模型中...</option>}

                            {sortedModels.map(m => (
                                <option key={m.id} value={m.id}>
                                    {POPULAR_MODELS.includes(m.id) ? "★ " : ""}{m.name} ({m.id})
                                </option>
                            ))}
                        </select>
                    ) : (
                        <select
                            value={model}
                            onChange={(e) => setModel(e.target.value)}
                            className="settings-select"
                        >
                            <option value="qwen-plus">Qwen Plus (Default)</option>
                            <option value="qwen-max">Qwen Max</option>
                            <option value="qwen-turbo">Qwen Turbo</option>
                            <option value="deepseek-v3.2">deepseek-v3.2</option>
                        </select>
                    )}

                    <div className="mt-2 text-xs text-[var(--muted-foreground)] flex justify-between items-center px-1">
                        <span>当前选择: <span className="text-blue-400 font-mono ml-1">{model || '无'}</span></span>
                        {provider === 'openrouter' && (
                            <a href="https://openrouter.ai/models" target="_blank" className="hover:text-blue-400 underline transition-colors">浏览所有模型 ↗</a>
                        )}
                    </div>
                </div>

                {/* Queue Configuration */}
                <div className="settings-section">
                    <label className="settings-label">队列配置</label>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        <div className="flex flex-col gap-2 setting-item">
                            <label className="text-sm font-medium text-[var(--muted-foreground)]">并发数 (Concurrency)</label>
                            <input
                                type="number"
                                value={concurrency}
                                onChange={(e) => setConcurrency(e.target.value)}
                                className="settings-input"
                                placeholder="5"
                                min="1"
                                max="20"
                            />
                            <p className="text-xs text-[var(--muted-foreground)]">并行处理任务数</p>
                        </div>
                        <div className="flex flex-col gap-2 setting-item">
                            <label className="text-sm font-medium text-[var(--muted-foreground)]">速率限制 (Jobs/Min)</label>
                            <input
                                type="number"
                                value={rateLimit}
                                onChange={(e) => setRateLimit(e.target.value)}
                                className="settings-input"
                                placeholder="50"
                                min="1"
                            />
                            <p className="text-xs text-[var(--muted-foreground)]">每分钟最大 API 调用数</p>
                        </div>
                        <div className="flex flex-col gap-2 setting-item">
                            <label className="text-sm font-medium text-[var(--muted-foreground)]">批处理大小 (Batch Size)</label>
                            <input
                                type="number"
                                value={batchSize}
                                onChange={(e) => setBatchSize(e.target.value)}
                                className="settings-input"
                                placeholder="20"
                                min="5"
                                max="100"
                            />
                            <p className="text-xs text-[var(--muted-foreground)]">单次任务处理歌曲数</p>
                        </div>
                    </div>
                    <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-md text-sm text-yellow-200/80">
                        注意：队列配置更改需要重启服务器或重启队列才能完全生效。
                    </div>
                </div>

                <div className="settings-actions">
                    <Button
                        onClick={handleSave}
                        disabled={saving || loading}
                        className="bg-blue-600 hover:bg-blue-500 text-white min-w-[140px]"
                    >
                        {saving ? (
                            <>
                                <div className="animate-spin mr-2 h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
                                保存中...
                            </>
                        ) : (
                            <>
                                <Save className="w-4 h-4 mr-2" />
                                保存更改
                            </>
                        )}
                    </Button>
                </div>

            </div>
        </div>
    );
};
