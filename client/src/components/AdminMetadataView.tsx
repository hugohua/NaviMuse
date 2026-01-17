import { useState } from 'react';
import {
    ListMusic, Database
} from 'lucide-react';
import './AdminMetadataView.css';
import { QueuePanel } from './admin/QueuePanel';
import { MetadataPanel } from './admin/MetadataPanel';

type ViewType = 'queue' | 'metadata';

export function AdminMetadataView() {
    const [activeView, setActiveView] = useState<ViewType>('queue');

    return (
        <div className="content-container max-w-6xl mx-auto">
            <div className="settings-page-header mb-8">
                <div className="flex flex-col">
                    <h1 className="settings-title">系统管理 (Global Admin)</h1>
                    <p className="settings-subtitle">NaviMuse 控制中心</p>
                </div>
            </div>

            {/* Tabs / Navigation */}
            <div className="flex gap-4 mb-6 border-b border-white/10 pb-1">
                <button
                    className={`admin-tab-item ${activeView === 'queue' ? 'active' : ''}`}
                    onClick={() => setActiveView('queue')}
                >
                    <ListMusic className="w-4 h-4" />
                    <span>队列管理</span>
                </button>

                <button
                    className={`admin-tab-item ${activeView === 'metadata' ? 'active' : ''}`}
                    onClick={() => setActiveView('metadata')}
                >
                    <Database className="w-4 h-4" />
                    <span>元数据资料库</span>
                </button>
            </div>

            <div className="admin-page-body">
                {activeView === 'queue' ? <QueuePanel /> : <MetadataPanel />}
            </div>
        </div>
    );
}
