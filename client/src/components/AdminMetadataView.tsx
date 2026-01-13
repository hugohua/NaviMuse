import { useEffect, useState } from 'react';
import { api } from '../api';
import { Button } from './ui/button';
import { ChevronLeft, ChevronRight, X, FileJson, Activity, Music, Mic2 } from 'lucide-react';
import './AdminMetadataView.css';

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

interface AdminMetadataViewProps {
    onClose: () => void;
}

export function AdminMetadataView({ onClose }: AdminMetadataViewProps) {
    const [songs, setSongs] = useState<SongMetadata[]>([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [pagination, setPagination] = useState({ total: 0, totalPages: 0, limit: 100 });
    const [selectedSong, setSelectedSong] = useState<SongMetadata | null>(null);

    const fetchSongs = async (p: number) => {
        setLoading(true);
        try {
            const res = await api.getAdminSongs(p, 100);
            setSongs(res.data);
            setPagination(res.pagination);
            setPage(p);
        } catch (e) {
            console.error(e);
            alert("Failed to load songs");
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
        if (status === 'COMPLETED') return '✓';
        if (status === 'PROCESSING') return '⋯';
        if (status === 'FAILED') return '✗';
        return '–';
    };

    return (
        <div className="admin-view">
            {/* Header */}
            <div className="admin-header">
                <div className="admin-header-left">
                    <Button variant="ghost" size="icon" onClick={onClose}>
                        <ChevronLeft className="w-5 h-5" />
                    </Button>
                    <h2 className="admin-header-title">Metadata Inspector</h2>
                    <span className="admin-header-count">
                        {pagination.total.toLocaleString()} songs
                    </span>
                </div>

                <div className="admin-pagination">
                    <Button
                        variant="ghost"
                        size="sm"
                        disabled={page <= 1 || loading}
                        onClick={() => fetchSongs(page - 1)}
                    >
                        <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <span className="admin-pagination-text">
                        {page} / {pagination.totalPages || 1}
                    </span>
                    <Button
                        variant="ghost"
                        size="sm"
                        disabled={page >= pagination.totalPages || loading}
                        onClick={() => fetchSongs(page + 1)}
                    >
                        <ChevronRight className="w-4 h-4" />
                    </Button>
                </div>
            </div>

            {/* Content */}
            <div className="admin-content">
                {/* Song List */}
                <div className={`admin-list-panel ${selectedSong ? 'collapsed' : ''}`}>
                    <div className="admin-table-header">
                        <span></span>
                        <span>Title</span>
                        <span>Artist</span>
                        <span>Status</span>
                        <span></span>
                    </div>
                    <div className="admin-song-list">
                        {loading ? (
                            <div className="admin-loading">Loading...</div>
                        ) : (
                            songs.map(song => {
                                const hasMetadata = song.processing_status === 'COMPLETED' || !!song.analysis_json;
                                const isSelected = selectedSong?.navidrome_id === song.navidrome_id;
                                const statusClass = getStatusClass(song.processing_status);

                                return (
                                    <div
                                        key={song.navidrome_id}
                                        className={`admin-song-row ${isSelected ? 'selected' : ''} ${hasMetadata ? 'has-metadata' : ''}`}
                                        onClick={() => setSelectedSong(song)}
                                    >
                                        <div className="admin-cell admin-cell-indicator">
                                            <div className={`status-dot ${statusClass}`} />
                                        </div>
                                        <div className={`admin-cell admin-cell-title ${hasMetadata ? 'completed' : ''}`}>
                                            {song.title}
                                        </div>
                                        <div className="admin-cell admin-cell-artist">
                                            {song.artist}
                                        </div>
                                        <div className="admin-cell">
                                            <span className={`status-badge ${statusClass}`}>
                                                {getStatusLabel(song.processing_status)}
                                            </span>
                                        </div>
                                        <div className="admin-cell admin-cell-icons">
                                            {song.analysis_json && <FileJson style={{ color: 'rgb(96, 165, 250)' }} />}
                                            {song.tempo_vibe && <Activity style={{ color: 'rgb(251, 146, 60)' }} />}
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* Detail Panel */}
                <div className={`admin-detail-panel ${selectedSong ? 'open' : ''}`}>
                    {selectedSong && (
                        <>
                            <div className="admin-detail-header">
                                <div className="admin-detail-info">
                                    <h3 className="admin-detail-title">{selectedSong.title}</h3>
                                    <div className="admin-detail-meta">
                                        <span><Mic2 /> {selectedSong.artist}</span>
                                        <span><Music /> {selectedSong.album}</span>
                                    </div>
                                </div>
                                <Button variant="ghost" size="icon" onClick={() => setSelectedSong(null)}>
                                    <X className="w-5 h-5" />
                                </Button>
                            </div>

                            <div className="admin-detail-body">
                                {/* Description */}
                                <div className="admin-detail-section">
                                    <div className="admin-section-title">AI Sonic Analysis</div>
                                    {selectedSong.description ? (
                                        <p className="admin-description">"{selectedSong.description}"</p>
                                    ) : (
                                        <div className="admin-empty-state">No AI metadata generated yet.</div>
                                    )}
                                </div>

                                {/* Attributes */}
                                <div className="admin-detail-section">
                                    <div className="admin-section-title">Attributes</div>
                                    <div className="admin-attr-grid">
                                        <AttrCard label="Tempo / Vibe" value={selectedSong.tempo_vibe} />
                                        <AttrCard label="Timbre" value={selectedSong.timbre_texture} />
                                        <AttrCard label="Energy" value={selectedSong.energy_level?.toString()} />
                                        <AttrCard label="Model" value={selectedSong.llm} />
                                    </div>
                                </div>

                                {/* Tags */}
                                {(selectedSong.tags || selectedSong.mood) && (
                                    <div className="admin-detail-section">
                                        <div className="admin-section-title">Tags & Mood</div>
                                        <div className="admin-tags">
                                            {safeParse(selectedSong.tags).map((tag: any, i: number) => (
                                                <span key={i} className="admin-tag">
                                                    {typeof tag === 'string' ? tag : JSON.stringify(tag)}
                                                </span>
                                            ))}
                                            {selectedSong.mood && (
                                                <span className="admin-tag mood">Mood: {selectedSong.mood}</span>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* JSON */}
                                <div className="admin-detail-section">
                                    <div className="admin-section-title">
                                        <FileJson style={{ width: 12, height: 12 }} /> Raw JSON
                                    </div>
                                    <pre className="admin-json">
                                        {selectedSong.analysis_json
                                            ? JSON.stringify(JSON.parse(selectedSong.analysis_json), null, 2)
                                            : '// No detailed analysis available'}
                                    </pre>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

function AttrCard({ label, value }: { label: string; value?: string }) {
    return (
        <div className={`admin-attr-card ${!value ? 'empty' : ''}`}>
            <div className="admin-attr-label">{label}</div>
            <div className="admin-attr-value">{value || '–'}</div>
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
