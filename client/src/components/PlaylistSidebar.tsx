import React, { useEffect, useState, useMemo } from 'react';
import { Trash2, Play, Library, Sparkles, Music } from 'lucide-react';
import { api } from '../api';
import type { Playlist } from '../types';
import { usePopup } from '../contexts/PopupContext';
import { useAudioPlayer } from '../contexts/AudioPlayerContext';
import { ScrollArea } from './ui/scroll-area';
import { Button } from './ui/button';
import { cn } from '../utils/cn';

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
        <div className={cn("flex flex-col h-full", className)}>
            {/* Header */}
            <div className="p-4 border-b border-white/10 flex items-center gap-2 bg-white/5">
                <Library className="w-5 h-5 text-primary" />
                <h2 className="font-bold text-lg tracking-tight text-foreground/90">我的歌单</h2>
            </div>

            {/* Tabs */}
            <div className="px-2 pt-2 flex gap-1">
                <button
                    onClick={() => setActiveTab('navimuse')}
                    className={cn(
                        "flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all",
                        activeTab === 'navimuse'
                            ? "bg-primary text-primary-foreground shadow-md"
                            : "bg-white/5 text-muted-foreground hover:bg-white/15 border border-transparent"
                    )}
                >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>AI 生成</span>
                    <span className="text-xs opacity-80">({navimusePlaylists.length})</span>
                </button>
                <button
                    onClick={() => setActiveTab('library')}
                    className={cn(
                        "flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all",
                        activeTab === 'library'
                            ? "bg-primary text-primary-foreground shadow-md"
                            : "bg-white/5 text-muted-foreground hover:bg-white/15 border border-transparent"
                    )}
                >
                    <Music className="w-3.5 h-3.5" />
                    <span>曲库</span>
                    <span className="text-xs opacity-80">({libraryPlaylists.length})</span>
                </button>
            </div>

            {/* Playlist List */}
            <ScrollArea className="flex-1">
                <div className="p-2 space-y-1">
                    {loading && playlists.length === 0 ? (
                        <div className="p-4 text-center text-sm text-muted-foreground animate-pulse">Loading...</div>
                    ) : (
                        <>
                            {displayPlaylists.map(p => {
                                const isActive = currentPlaylistId === p.id;
                                const isNaviMuse = p.name.startsWith('NaviMuse');
                                return (
                                    <div
                                        key={p.id}
                                        className={cn(
                                            "group flex items-center justify-between p-3 rounded-xl transition-all cursor-pointer border mb-1",
                                            isActive
                                                ? "bg-white/10 border-white/10 shadow-lg"
                                                : "border-transparent hover:bg-white/10 hover:border-white/10 hover:shadow-lg"
                                        )}
                                        onClick={(e) => handlePlay(p.id, e)}
                                    >
                                        <div className="flex-1 min-w-0 pr-2">
                                            <div className="font-medium text-sm truncate text-foreground group-hover:text-accent-foreground">
                                                {isNaviMuse ? p.name.replace(/^NaviMuse:?\s*/, '') : p.name}
                                            </div>
                                            <div className="text-xs text-muted-foreground truncate">
                                                {p.songCount} songs • {formatDuration(p.duration)} • {formatDate(p.created)}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7"
                                                onClick={(e) => handlePlay(p.id, e)}
                                            >
                                                <Play className="w-3.5 h-3.5 fill-current" />
                                            </Button>
                                            {isNaviMuse && (
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                                    onClick={(e) => handleDelete(p.id, e)}
                                                    disabled={deletingId === p.id}
                                                >
                                                    {deletingId === p.id ? (
                                                        <span className="animate-spin">⟳</span>
                                                    ) : (
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    )}
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
                            {!loading && displayPlaylists.length === 0 && (
                                <div className="p-8 text-center text-sm text-muted-foreground">
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
