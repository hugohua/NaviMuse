import React from 'react';
import { motion, type Variants } from 'framer-motion';
import { useAudioPlayer } from '../contexts/AudioPlayerContext';
import { ScrollArea } from './ui/scroll-area';
import { cn } from '../utils/cn';

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
        currentSong, isPlaying, queue, playAtIndex
    } = useAudioPlayer();

    const formatTime = (secs: number) => {
        if (!secs || isNaN(secs)) return '0:00';
        const m = Math.floor(secs / 60);
        const s = Math.floor(secs % 60);
        return `${m}:${s < 10 ? '0' + s : s}`;
    };

    if (!currentSong || queue.length === 0) {
        return (
            <div className="h-full w-full flex items-center justify-center text-muted-foreground text-sm">
                No tracks in queue
            </div>
        );
    }

    return (
        <div className="h-full w-full flex flex-col bg-[#0a0a0a]/95 backdrop-blur-xl">
            <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="flex items-center justify-between p-4 border-b border-white/10 bg-white/5"
            >
                <span className="font-semibold text-sm text-foreground">Play Queue ({queue.length})</span>
            </motion.div>
            <ScrollArea className="flex-1 w-full min-h-0">
                <motion.div
                    className="p-2"
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
                                    "group flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors duration-200 border border-transparent mb-1",
                                    isCurrent
                                        ? "bg-primary/20 text-primary border-primary/30 shadow-[0_0_15px_rgba(99,102,241,0.15)]"
                                        : "hover:bg-white/10 hover:border-white/10"
                                )}
                                onClick={() => playAtIndex(idx)}
                            >
                                <div className="w-6 flex justify-center flex-shrink-0">
                                    {isCurrent && isPlaying ? (
                                        <div className="flex gap-0.5 items-end justify-center h-4">
                                            <motion.span
                                                className="w-1 bg-current rounded-full"
                                                animate={{ height: ["100%", "40%", "80%", "60%", "100%"] }}
                                                transition={{ duration: 0.8, repeat: Infinity, ease: "easeInOut" }}
                                            />
                                            <motion.span
                                                className="w-1 bg-current rounded-full"
                                                animate={{ height: ["60%", "100%", "40%", "80%", "60%"] }}
                                                transition={{ duration: 1.0, repeat: Infinity, ease: "easeInOut" }}
                                            />
                                            <motion.span
                                                className="w-1 bg-current rounded-full"
                                                animate={{ height: ["80%", "60%", "100%", "40%", "80%"] }}
                                                transition={{ duration: 0.9, repeat: Infinity, ease: "easeInOut" }}
                                            />
                                        </div>
                                    ) : (
                                        <span className={cn("text-xs font-mono opacity-50 group-hover:opacity-100 transition-opacity", isCurrent ? "text-primary" : "text-muted-foreground")}>
                                            {idx + 1}
                                        </span>
                                    )}
                                </div>

                                <div className="flex-1 overflow-hidden min-w-0">
                                    <div className={cn("truncate font-medium text-sm", isCurrent ? "text-foreground" : "text-foreground/90")}>
                                        {song.title}
                                    </div>
                                    <div className="truncate text-xs text-muted-foreground group-hover:text-muted-foreground/80 transition-colors">
                                        {song.artist}
                                    </div>
                                </div>

                                <div className="text-xs font-mono text-muted-foreground opacity-60 group-hover:opacity-100 transition-opacity min-w-[32px] text-right">
                                    {formatTime(song.duration)}
                                </div>
                            </motion.div>
                        );
                    })}
                </motion.div>
            </ScrollArea>
        </div>
    );
};
