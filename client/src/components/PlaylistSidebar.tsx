import React, { useEffect, useState, useMemo } from 'react';
import { Trash2, Play, Library, Sparkles, Music } from 'lucide-react';
import { api } from '../api';
import type { Playlist } from '../types';
import { usePopup } from '../contexts/PopupContext';
import { useAudioPlayer } from '../contexts/AudioPlayerContext';
import { ScrollArea } from './ui/scroll-area';
import { Button } from './ui/button';
import { cn } from '../utils/cn';
import './PlaylistSidebar.css';

interface PlaylistSidebarProps {
    refreshTrigger?: number;
    onRefresh?: () => void;
    className?: string;
}

type TabType = 'navimuse' | 'library';

export const PlaylistSidebar: React.FC<PlaylistSidebarProps> = ({ refreshTrigger, onRefresh, className }) => {
    const { showPopup } = usePopup();
    const { playPlaylist, currentPlaylistId } = useAudioPlayer();

    const [playlists, setPlaylists] = useState<Playlist[]>([]);
    const [loading, setLoading] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<TabType>('navimuse');

    // 分离歌单
    const { navimusePlaylists, libraryPlaylists } = useMemo(() => {
        const navimuse: Playlist[] = [];
        const library: Playlist[] = [];
        playlists.forEach(p => {
            if (p.name.startsWith('NaviMuse')) {
                navimuse.push(p);
            } else {
                library.push(p);
            }
        });
        return { navimusePlaylists: navimuse, libraryPlaylists: library };
    }, [playlists]);

    const displayPlaylists = activeTab === 'navimuse' ? navimusePlaylists : libraryPlaylists;

    const loadPlaylists = async () => {
        setLoading(true);
        try {
            const list = await api.getPlaylists();
            // Sort by created desc
            list.sort((a, b) => {
                if (!a.created || !b.created) return 0;
                return new Date(b.created).getTime() - new Date(a.created).getTime();
            });
            setPlaylists(list);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadPlaylists();
    }, [refreshTrigger]);

    const handlePlay = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            const { songs } = await api.getPlaylist(id);
            if (songs.length === 0) {
                showPopup({ title: 'Empty Playlist', message: 'This playlist has no songs.' });
                return;
            }
            playPlaylist(songs, id);
        } catch (err: any) {
            console.error('Failed to play playlist', err);
            showPopup({ title: 'Error', message: 'Failed to play playlist: ' + err.message });
        }
    };

    const handleDelete = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        showPopup({
            title: 'Delete Playlist',
            message: 'Are you sure you want to delete this playlist?',
            type: 'confirm',
            onConfirm: async () => {
                setDeletingId(id);
                try {
                    await api.deletePlaylist(id);
                    setPlaylists(prev => prev.filter(p => p.id !== id));
                    onRefresh?.();
                } catch (e: any) {
                    showPopup({ message: 'Failed to delete: ' + e.message, title: 'Error' });
                } finally {
                    setDeletingId(null);
                }
            }
        });
    };

    return (
        <div className={cn("playlist-sidebar", className)}>
            {/* Header */}
            <div className="sidebar-header">
                <Library className="sidebar-header-icon" />
                <h2 className="sidebar-title">我的歌单</h2>
            </div>

            {/* Tabs */}
            <div className="sidebar-tabs">
                <button
                    onClick={() => setActiveTab('navimuse')}
                    className={cn("sidebar-tab", activeTab === 'navimuse' && "sidebar-tab-active")}
                >
                    <Sparkles className="tab-icon" />
                    <span>AI 生成</span>
                    <span className="tab-count">({navimusePlaylists.length})</span>
                </button>
                <button
                    onClick={() => setActiveTab('library')}
                    className={cn("sidebar-tab", activeTab === 'library' && "sidebar-tab-active")}
                >
                    <Music className="tab-icon" />
                    <span>曲库</span>
                    <span className="tab-count">({libraryPlaylists.length})</span>
                </button>
            </div>

            {/* Playlist List */}
            <ScrollArea className="sidebar-scroll">
                <div className="playlist-list">
                    {loading && playlists.length === 0 ? (
                        <div className="playlist-loading">Loading...</div>
                    ) : (
                        <>
                            {displayPlaylists.map(p => {
                                const isActive = currentPlaylistId === p.id;
                                const isNaviMuse = p.name.startsWith('NaviMuse');
                                return (
                                    <div
                                        key={p.id}
                                        className={cn(
                                            "playlist-item",
                                            isActive && "playlist-item-active"
                                        )}
                                        onClick={(e) => handlePlay(p.id, e)}
                                    >
                                        <div className="playlist-info">
                                            <div className="playlist-name">
                                                {isNaviMuse ? p.name.replace(/^NaviMuse:?\s*/, '') : p.name}
                                            </div>
                                            <div className="playlist-meta">
                                                {p.songCount} songs • {formatDuration(p.duration)} • {formatDate(p.created)}
                                            </div>
                                        </div>
                                        <div className="playlist-actions">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="action-btn"
                                                onClick={(e) => handlePlay(p.id, e)}
                                            >
                                                <Play className="action-icon fill-current" />
                                            </Button>
                                            {isNaviMuse && (
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="action-btn action-btn-delete"
                                                    onClick={(e) => handleDelete(p.id, e)}
                                                    disabled={deletingId === p.id}
                                                >
                                                    {deletingId === p.id ? (
                                                        <span className="animate-spin">⟳</span>
                                                    ) : (
                                                        <Trash2 className="action-icon" />
                                                    )}
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
                            {!loading && displayPlaylists.length === 0 && (
                                <div className="playlist-empty">
                                    {activeTab === 'navimuse' ? '暂无 AI 生成的歌单' : '暂无曲库歌单'}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </ScrollArea>
        </div>
    );
};

function formatDuration(seconds?: number) {
    if (!seconds) return '0m';
    const m = Math.floor(seconds / 60);
    return `${m}m`;
}

function formatDate(dateStr?: string) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}
