import { useState, useEffect } from 'react';
import { api } from '../../api';
import { Button } from '../ui/button';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription
} from '../ui/dialog';
import {
    ChevronLeft, ChevronRight, FileJson, Activity, Music, Mic2, Search
} from 'lucide-react';
import './MetadataPanel.css';

interface SongMetadata {
    navidrome_id: string;
    title: string;
    artist: string;
    album: string;
    processing_status: string;
    analysis_json?: string;
    tags?: string;
    description?: string;
    mood?: string;
    energy_level?: number;
    tempo_vibe?: string;
    timbre_texture?: string;
    llm?: string;
}

export function MetadataPanel() {
    const [songs, setSongs] = useState<SongMetadata[]>([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [pagination, setPagination] = useState({ total: 0, totalPages: 0, limit: 50 });
    const [selectedSong, setSelectedSong] = useState<SongMetadata | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    const fetchSongs = async (p: number) => {
        setLoading(true);
        try {
            const res = await api.getAdminSongs(p, 50);
            setSongs(res.data);
            setPagination(res.pagination);
            setPage(p);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSongs(1);
    }, []);

    const getStatusClass = (status: string) => {
        if (status === 'COMPLETED') return 'completed';
        if (status === 'PROCESSING') return 'processing';
        if (status === 'FAILED') return 'failed';
        return 'pending';
    };

    const getStatusLabel = (status: string) => {
        if (status === 'COMPLETED') return '已完成';
        if (status === 'PROCESSING') return '处理中';
        if (status === 'FAILED') return '失败';
        return '待处理';
    };

    // 过滤歌曲
    const filteredSongs = songs.filter(song =>
        song.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        song.artist.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="metadata-panel">
            {/* Header with Search and Pagination */}
            <div className="metadata-header">
                <div className="metadata-search">
                    <Search className="w-4 h-4" />
                    <input
                        type="text"
                        placeholder="搜索歌曲或艺术家..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                <div className="metadata-info">
                    <span className="metadata-count">{pagination.total.toLocaleString()} 首歌曲</span>
                </div>
            </div>

            {/* Table */}
            <div className="metadata-table-container">
                <table className="metadata-table">
                    <thead>
                        <tr>
                            <th style={{ width: '40px' }}></th>
                            <th>标题</th>
                            <th>艺术家</th>
                            <th>专辑</th>
                            <th style={{ width: '100px' }}>状态</th>
                            <th style={{ width: '80px' }}>标记</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan={6} className="loading-cell">读取中...</td>
                            </tr>
                        ) : filteredSongs.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="empty-cell">没有找到歌曲</td>
                            </tr>
                        ) : (
                            filteredSongs.map((song, idx) => {
                                const hasMetadata = !!song.analysis_json;
                                const statusClass = getStatusClass(song.processing_status);

                                return (
                                    <tr
                                        key={song.navidrome_id}
                                        className={`metadata-row ${hasMetadata ? 'has-data' : ''}`}
                                        onClick={() => setSelectedSong(song)}
                                    >
                                        <td className="cell-index">{(page - 1) * 50 + idx + 1}</td>
                                        <td className="cell-title">{song.title}</td>
                                        <td className="cell-artist">{song.artist}</td>
                                        <td className="cell-album">{song.album || '-'}</td>
                                        <td>
                                            <span className={`status-badge ${statusClass}`}>
                                                {getStatusLabel(song.processing_status)}
                                            </span>
                                        </td>
                                        <td className="cell-badges">
                                            {song.analysis_json && (
                                                <span className="data-badge json" title='有 AI 元数据'>
                                                    <FileJson className="w-3 h-3" /> AI
                                                </span>
                                            )}
                                            {song.tempo_vibe && (
                                                <span className="data-badge tempo" title='有节奏元数据'>
                                                    <Activity className="w-3 h-3" /> 节奏
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            <div className="metadata-pagination">
                <div className="pagination-controls">
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={page <= 1 || loading}
                        onClick={() => fetchSongs(1)}
                        title="首页"
                    >
                        首页
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={page <= 1 || loading}
                        onClick={() => fetchSongs(page - 1)}
                    >
                        <ChevronLeft className="w-4 h-4" />
                    </Button>

                    {/* Page Numbers */}
                    <div className="pagination-pages">
                        {generatePageNumbers(page, pagination.totalPages).map((p, idx) => (
                            p === '...' ? (
                                <span key={`ellipsis-${idx}`} className="pagination-ellipsis">...</span>
                            ) : (
                                <button
                                    key={p}
                                    className={`pagination-page ${p === page ? 'active' : ''}`}
                                    onClick={() => fetchSongs(p as number)}
                                    disabled={loading}
                                >
                                    {p}
                                </button>
                            )
                        ))}
                    </div>

                    <Button
                        variant="outline"
                        size="sm"
                        disabled={page >= pagination.totalPages || loading}
                        onClick={() => fetchSongs(page + 1)}
                    >
                        <ChevronRight className="w-4 h-4" />
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={page >= pagination.totalPages || loading}
                        onClick={() => fetchSongs(pagination.totalPages)}
                        title="末页"
                    >
                        末页
                    </Button>
                </div>

                {/* Jump to page */}
                <div className="pagination-jump">
                    <span>跳至</span>
                    <input
                        type="number"
                        min={1}
                        max={pagination.totalPages}
                        defaultValue={page}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                const target = e.target as HTMLInputElement;
                                const p = parseInt(target.value, 10);
                                if (p >= 1 && p <= pagination.totalPages) {
                                    fetchSongs(p);
                                }
                            }
                        }}
                    />
                    <span>页</span>
                </div>
            </div>

            {/* Detail Dialog */}
            <Dialog open={!!selectedSong} onOpenChange={(open) => !open && setSelectedSong(null)}>
                <DialogContent className="metadata-dialog">
                    {selectedSong && (
                        <>
                            <DialogHeader>
                                <DialogTitle>{selectedSong.title}</DialogTitle>
                                <DialogDescription className="dialog-meta">
                                    <span><Mic2 className="w-4 h-4" /> {selectedSong.artist}</span>
                                    <span><Music className="w-4 h-4" /> {selectedSong.album || '未知专辑'}</span>
                                </DialogDescription>
                            </DialogHeader>

                            <div className="dialog-body">
                                {/* AI 分析 */}
                                <section className="detail-section">
                                    <h4>AI 听感分析</h4>
                                    {selectedSong.description ? (
                                        <p className="description-text">"{selectedSong.description}"</p>
                                    ) : (
                                        <p className="empty-text">暂无 AI 元数据</p>
                                    )}
                                </section>

                                {/* 属性卡片 */}
                                <section className="detail-section">
                                    <h4>属性</h4>
                                    <div className="attr-grid">
                                        <AttrCard label="节奏/氛围" value={selectedSong.tempo_vibe} />
                                        <AttrCard label="音色/质感" value={selectedSong.timbre_texture} />
                                        <AttrCard label="能量等级" value={selectedSong.energy_level?.toString()} />
                                        <AttrCard label="AI 模型" value={selectedSong.llm} />
                                    </div>
                                </section>

                                {/* 标签 */}
                                {(selectedSong.tags || selectedSong.mood) && (
                                    <section className="detail-section">
                                        <h4>标签与情绪</h4>
                                        <div className="tags-container">
                                            {safeParse(selectedSong.tags).map((tag: any, i: number) => (
                                                <span key={i} className="tag">
                                                    {typeof tag === 'string' ? tag : JSON.stringify(tag)}
                                                </span>
                                            ))}
                                            {selectedSong.mood && <span className="tag mood">Mood: {selectedSong.mood}</span>}
                                        </div>
                                    </section>
                                )}

                                {/* 原始 JSON */}
                                <section className="detail-section">
                                    <h4><FileJson className="w-4 h-4" /> 原始 JSON</h4>
                                    <pre className="json-block">
                                        {selectedSong.analysis_json
                                            ? JSON.stringify(JSON.parse(selectedSong.analysis_json), null, 2)
                                            : '// 暂无详细分析数据'}
                                    </pre>
                                </section>
                            </div>
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}

// ==================== Helper Components ====================
function AttrCard({ label, value }: { label: string; value?: string }) {
    return (
        <div className={`attr-card ${!value ? 'empty' : ''}`}>
            <div className="attr-label">{label}</div>
            <div className="attr-value">{value || '–'}</div>
        </div>
    );
}

function safeParse(json?: string) {
    if (!json) return [];
    try {
        const parsed = JSON.parse(json);
        if (Array.isArray(parsed)) return parsed;
        if (parsed.embedding_tags?.mood_coord) return parsed.embedding_tags.mood_coord;
        return [];
    } catch {
        return [];
    }
}

// 生成页码数组，显示当前页附近的页码
function generatePageNumbers(current: number, total: number): (number | string)[] {
    if (total <= 7) {
        return Array.from({ length: total }, (_, i) => i + 1);
    }

    const pages: (number | string)[] = [];

    // 始终显示第一页
    pages.push(1);

    if (current > 4) {
        pages.push('...');
    }

    // 显示当前页附近的页码
    const start = Math.max(2, current - 2);
    const end = Math.min(total - 1, current + 2);

    for (let i = start; i <= end; i++) {
        if (!pages.includes(i)) {
            pages.push(i);
        }
    }

    if (current < total - 3) {
        pages.push('...');
    }

    // 始终显示最后一页
    if (!pages.includes(total)) {
        pages.push(total);
    }

    return pages;
}
