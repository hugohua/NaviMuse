import React from 'react';
import { motion, type Variants } from 'framer-motion';
import { useAudioPlayer } from '../contexts/AudioPlayerContext';
import { ScrollArea } from './ui/scroll-area';
import { cn } from '../utils/cn';
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
                <span className="queue-title">Play Queue ({queue.length})</span>
            </motion.div>
            <ScrollArea className="queue-scroll">
                <motion.div
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

                                <div className="song-duration">
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
