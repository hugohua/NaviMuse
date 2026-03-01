import React, { useState, useEffect, useRef } from 'react';
import { Button } from './ui/button';
import { ModeSwitcher } from './ModeSwitcher';
import { ArrowRight, Loader2, Sparkles, Plus, ListPlus } from 'lucide-react';
import type { DiscoveryMode } from '../types';
import { api } from '../api';
import { useAudioPlayer } from '../contexts/AudioPlayerContext';
import { motion, AnimatePresence } from 'framer-motion';
import { useToast } from './ui/toast';
import './Omnibar.css';

interface OmnibarProps {
    mode: DiscoveryMode;
    onModeChange: (mode: DiscoveryMode) => void;
    onGenerate: (prompt: string, aiMode: boolean) => void;
    loading: boolean;
    value: string;
    onChange: (value: string) => void;
}

export const Omnibar: React.FC<OmnibarProps> = React.memo(({ mode, onModeChange, onGenerate, loading, value: prompt, onChange }) => {

    const [aiMode, setAiMode] = useState<boolean>(() => {
        const saved = localStorage.getItem('navimuse_ai_mode');
        // Default to true if not set
        return saved !== 'false';
    });

    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [showDropdown, setShowDropdown] = useState(false);

    // Use refs for debounce and click outside
    const debounceTimerRef = useRef<number | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const { addToQueue, addManyToQueue } = useAudioPlayer();
    const { toast } = useToast();

    // Persist AI Mode changes
    useEffect(() => {
        localStorage.setItem('navimuse_ai_mode', String(aiMode));
    }, [aiMode]);

    // Click outside handler
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setShowDropdown(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    // Debounce search effect
    // Dropdown ALWAYS uses ai_mode=false (vector-only) for instant results.
    // AI reranking only fires when user presses Enter/Send.
    useEffect(() => {
        if (!prompt.trim()) {
            setSearchResults([]);
            setShowDropdown(false);
            if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
            return;
        }

        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

        debounceTimerRef.current = window.setTimeout(async () => {
            setIsSearching(true);
            try {
                const results = await api.search(prompt, {
                    limit: 50,
                    ai_mode: false
                });
                setSearchResults(results);
                setShowDropdown(true);
            } catch (err) {
                console.error("Search failed:", err);
            } finally {
                setIsSearching(false);
            }
        }, 300);

        return () => {
            if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        };
    }, [prompt]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && prompt.trim()) {
            setShowDropdown(false);
            onGenerate(prompt, aiMode);
        }
    };

    const handleSend = () => {
        if (prompt.trim()) {
            setShowDropdown(false);
            onGenerate(prompt, aiMode);
        }
    };

    const handleAddSong = (songParam: any) => {
        // Map raw search result to Song object if necessary
        const songToQueue = {
            id: String(songParam.navidrome_id),
            title: songParam.title,
            artist: songParam.artist,
            album: songParam.album || 'Unknown Album',
            duration: songParam.duration || 0,
            path: songParam.file_path || '',
            type: '',
            genre: songParam.target_tags || ''
        };
        addToQueue(songToQueue as any);
        toast({ title: '已添加到播放列表', description: songToQueue.title, variant: 'success' as any });
    };

    const handleAddAll = () => {
        const songsToQueue = searchResults.map(s => ({
            id: String(s.navidrome_id),
            title: s.title,
            artist: s.artist,
            album: s.album || 'Unknown Album',
            duration: s.duration || 0,
            path: s.file_path || '',
            type: '',
            genre: s.target_tags || ''
        }));
        addManyToQueue(songsToQueue as any[]);
        toast({ title: '已添加全集', description: `共 ${songsToQueue.length} 首歌曲加入播放列表`, variant: 'success' as any });
        setShowDropdown(false);
    };

    return (
        <div className="omnibar-container relative" ref={containerRef}>
            <div className={`omnibar ${showDropdown && searchResults.length > 0 ? 'rounded-b-none border-b-0' : ''}`}>
                <div className="omnibar-left">
                    <ModeSwitcher current={mode} onChange={onModeChange} />
                </div>

                <div className="omnibar-divider" />

                <div className="omnibar-right flex items-center pr-2">
                    <input
                        type="text"
                        className="omnibar-input flex-1 min-w-0"
                        placeholder="搜索歌曲 或 描述当下的心情生成..."
                        value={prompt}
                        onChange={(e) => onChange(e.target.value)}
                        onKeyDown={handleKeyDown}
                        onFocus={() => { if (searchResults.length > 0) setShowDropdown(true); }}
                    />

                    {/* Loading Indicator for Search */}
                    {isSearching && (
                        <Loader2 className="w-4 h-4 text-muted-foreground animate-spin mr-2 flex-shrink-0" />
                    )}

                    {/* AI Toggle */}
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setAiMode(!aiMode)}
                        className={`ai-toggle-btn ${aiMode ? 'ai-toggle-active' : 'ai-toggle-inactive'}`}
                        title={aiMode ? "AI 深度理解已开启 (慢)" : "向量搜索模式 (快)"}
                    >
                        <Sparkles className="w-4 h-4" />
                    </Button>

                    <Button
                        size="icon"
                        className="omnibar-send-btn flex-shrink-0"
                        onClick={handleSend}
                        disabled={loading}
                        title="AI 生成歌单"
                    >
                        {loading ? (
                            <Loader2 className="send-icon animate-spin" />
                        ) : (
                            <ArrowRight className="send-icon" />
                        )}
                    </Button>
                </div>
            </div>

            {/* Dropdown Overlay */}
            <AnimatePresence>
                {showDropdown && (searchResults.length > 0) && (
                    <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.15, ease: 'easeOut' }}
                        className="search-dropdown"
                    >
                        <div className="search-dropdown-list">
                            {searchResults.map((song, idx) => (
                                <div key={song.navidrome_id + '-' + idx} className="search-dropdown-item group">
                                    <div className="flex flex-col min-w-0 flex-1">
                                        <span className="text-sm font-medium text-foreground truncate">{song.title}</span>
                                        <span className="text-xs text-muted-foreground truncate">{song.artist}</span>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => handleAddSong(song)}
                                        className="search-dropdown-add-btn"
                                    >
                                        <Plus className="w-4 h-4" />
                                    </Button>
                                </div>
                            ))}
                        </div>

                        <div className="search-dropdown-footer">
                            <span className="text-xs text-muted-foreground">找到 {searchResults.length} 首</span>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs text-muted-foreground hover:text-foreground hover:bg-white/10"
                                onClick={handleAddAll}
                            >
                                <ListPlus className="w-3.5 h-3.5 mr-1" />
                                全部添加
                            </Button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
});
