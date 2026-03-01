import React, { useState } from 'react';
import { motion, type Variants } from 'framer-motion';
import { useAudioPlayer } from '../contexts/AudioPlayerContext';
import { ScrollArea } from './ui/scroll-area';
import { cn } from '../utils/cn';
import { Trash2, Save, Loader2, X } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "./ui/dialog";
import { useToast } from './ui/toast';
import { api } from '../api';
import './QueueSidebar.css';

const listVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: {
            staggerChildren: 0.03,
        },
    },
};

const itemVariants: Variants = {
    hidden: { opacity: 0, x: 20 },
    visible: {
        opacity: 1,
        x: 0,
        transition: { type: "spring" as const, stiffness: 300, damping: 24 },
    },
};

export const QueueSidebar: React.FC = () => {
    const {
        currentSong, isPlaying, queue, playAtIndex, currentPlaylistId, clearQueue, removeFromQueue
    } = useAudioPlayer();
    const { toast } = useToast();
    const [isSaving, setIsSaving] = useState(false);
    const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
    const [playlistName, setPlaylistName] = useState('');

    const formatTime = (secs: number) => {
        if (!secs || isNaN(secs)) return '0:00';
        const m = Math.floor(secs / 60);
        const s = Math.floor(secs % 60);
        return `${m}:${s < 10 ? '0' + s : s}`;
    };

    const handleClear = () => {
        clearQueue();
        toast({ title: '播放列表已清空', variant: 'default' });
    };

    const handleSave = async () => {
        if (queue.length === 0 || isSaving || !playlistName.trim()) return;
        setIsSaving(true);
        try {
            const songIds = queue.map(s => s.id);
            const trimmedName = playlistName.trim();
            const finalName = trimmedName.startsWith('NaviMuse: ') ? trimmedName : `NaviMuse: ${trimmedName}`;

            await api.createPlaylist(finalName, songIds);

            toast({ title: '歌单已保存', description: finalName, variant: 'success' as any });
            setIsSaveModalOpen(false);
            setPlaylistName('');
        } catch (err: any) {
            toast({ title: '保存失败', description: err.message, variant: 'error' as any });
        } finally {
            setIsSaving(false);
        }
    };

    if (!currentSong || queue.length === 0) {
        return (
            <div className="queue-empty">
                No tracks in queue
            </div>
        );
    }

    return (
        <div className="queue-sidebar">
            <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="queue-header"
            >
                <span className="queue-title">播放列表 ({queue.length})</span>
                <div className="queue-header-actions">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                            setPlaylistName(`我的播放列表 ${new Date().toLocaleDateString()}`);
                            setIsSaveModalOpen(true);
                        }}
                        disabled={isSaving}
                        className="queue-header-btn"
                        title="保存为歌单"
                    >
                        {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleClear}
                        className="queue-header-btn hover:text-red-400"
                        title="清空播放列表"
                    >
                        <Trash2 className="w-4 h-4" />
                    </Button>
                </div>
            </motion.div>
            <ScrollArea className="queue-scroll">
                <motion.div
                    key={`${currentPlaylistId || 'default-queue'}-${queue.length}`}
                    className="queue-list"
                    initial="hidden"
                    animate="visible"
                    variants={listVariants}
                >
                    {queue.map((song, idx) => {
                        const isCurrent = currentSong.id === song.id;
                        return (
                            <motion.div
                                key={idx + '-' + song.id}
                                variants={itemVariants}
                                whileHover={{ scale: 1.02, x: 4 }}
                                whileTap={{ scale: 0.98 }}
                                className={cn(
                                    "queue-item",
                                    isCurrent && "queue-item-current"
                                )}
                                onClick={() => playAtIndex(idx)}
                            >
                                <div className="queue-item-index">
                                    {isCurrent && isPlaying ? (
                                        <div className="equalizer">
                                            <motion.span
                                                className="bar"
                                                animate={{ height: ["100%", "40%", "80%", "60%", "100%"] }}
                                                transition={{ duration: 0.8, repeat: Infinity, ease: "easeInOut" }}
                                            />
                                            <motion.span
                                                className="bar"
                                                animate={{ height: ["60%", "100%", "40%", "80%", "60%"] }}
                                                transition={{ duration: 1.0, repeat: Infinity, ease: "easeInOut" }}
                                            />
                                            <motion.span
                                                className="bar"
                                                animate={{ height: ["80%", "60%", "100%", "40%", "80%"] }}
                                                transition={{ duration: 0.9, repeat: Infinity, ease: "easeInOut" }}
                                            />
                                        </div>
                                    ) : (
                                        <span className={cn("index-number", isCurrent && "index-current")}>
                                            {idx + 1}
                                        </span>
                                    )}
                                </div>

                                <div className="queue-item-info">
                                    <div className={cn("song-title", isCurrent && "song-title-current")}>
                                        {song.title}
                                    </div>
                                    <div className="song-artist">
                                        {song.artist}
                                    </div>
                                </div>

                                <div className="queue-item-actions">
                                    <div className="song-duration">
                                        {formatTime(song.duration)}
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="queue-item-remove-btn"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            removeFromQueue(idx);
                                        }}
                                        title="从列表中移除"
                                    >
                                        <X className="w-4 h-4" />
                                    </Button>
                                </div>
                            </motion.div>
                        );
                    })}
                </motion.div>
            </ScrollArea>

            {/* Save Playlist Dialog */}
            <Dialog open={isSaveModalOpen} onOpenChange={setIsSaveModalOpen}>
                <DialogContent className="glass-panel text-foreground border-white/10 sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>保存播放列表</DialogTitle>
                        <DialogDescription className="text-muted-foreground">
                            将当前 {queue.length} 首歌曲保存为一个新歌单。
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="flex flex-col gap-2">
                            <label htmlFor="name" className="text-sm font-medium">
                                歌单名称
                            </label>
                            <Input
                                id="name"
                                value={playlistName}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPlaylistName(e.target.value)}
                                placeholder="输入歌单名称..."
                                className="col-span-3 bg-black/20 border-white/10"
                                autoFocus
                                onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        handleSave();
                                    }
                                }}
                            />
                        </div>
                    </div>
                    <DialogFooter className="flex sm:justify-center justify-center gap-4" style={{ marginTop: '1.5rem' }}>
                        <Button
                            variant="ghost"
                            onClick={() => setIsSaveModalOpen(false)}
                            disabled={isSaving}
                            className="hover:bg-white/10 w-24"
                        >
                            取消
                        </Button>
                        <Button
                            onClick={handleSave}
                            disabled={isSaving || !playlistName.trim()}
                            className="bg-primary text-primary-foreground hover:bg-primary/90 w-24"
                        >
                            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            保存
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};
