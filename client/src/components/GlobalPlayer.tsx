import React from 'react';
import { motion } from 'framer-motion';
import { useAudioPlayer } from '../contexts/AudioPlayerContext';
import { useQueuePanel } from '../contexts/QueuePanelContext';
import {
    Play, Pause, SkipBack, SkipForward, Volume2, ListMusic, Heart
} from 'lucide-react';
import { Slider } from './ui/slider';
import { Button } from './ui/button';

export const GlobalPlayer: React.FC = () => {
    const {
        currentSong, isPlaying, play, pause, next, prev,
        currentTime, duration, seek, volume, setVolume,
        isStarring, toggleStar
    } = useAudioPlayer();

    const { isQueueOpen, toggleQueue } = useQueuePanel();

    if (!currentSong) return null;

    const formatTime = (secs: number) => {
        if (!secs || isNaN(secs)) return '0:00';
        const m = Math.floor(secs / 60);
        const s = Math.floor(secs % 60);
        return `${m}:${s < 10 ? '0' + s : s}`;
    };

    return (
        <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 25 }}
            className="h-20 glass-panel rounded-full flex items-center px-8 justify-between relative z-50 transition-all hover:bg-white/10 text-foreground"
        >
            {/* Track Info */}
            <div className="w-1/3 min-w-[180px] flex items-center gap-3 overflow-hidden">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={toggleStar}
                    disabled={isStarring}
                    className={`shrink-0 rounded-full transition-all ${currentSong.starred ? 'text-red-500 hover:text-red-400' : 'text-muted-foreground hover:text-red-500'} ${isStarring ? 'opacity-50' : ''}`}
                >
                    <Heart className={`w-5 h-5 ${currentSong.starred ? 'fill-current' : ''}`} />
                </Button>
                <div className="flex flex-col justify-center overflow-hidden">
                    <div className="font-semibold truncate text-foreground">{currentSong.title}</div>
                    <div className="text-sm text-muted-foreground truncate">{currentSong.artist}</div>
                </div>
            </div>

            {/* Controls Center */}
            <div className="flex-1 flex flex-col items-center max-w-xl gap-2">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={prev} className="hover:text-primary hover:bg-white/10 rounded-full transition-colors">
                        <SkipBack className="w-5 h-5 fill-current" />
                    </Button>
                    <Button
                        size="icon"
                        onClick={isPlaying ? pause : play}
                        className="h-12 w-12 rounded-full shadow-[0_0_20px_rgba(99,102,241,0.4)] bg-primary hover:bg-primary/90 hover:scale-105 transition-all text-primary-foreground border border-white/10"
                    >
                        {isPlaying ? (
                            <Pause className="w-5 h-5 fill-current text-primary-foreground" />
                        ) : (
                            <Play className="w-5 h-5 fill-current text-primary-foreground ml-0.5" />
                        )}
                    </Button>
                    <Button variant="ghost" size="icon" onClick={next} className="hover:text-primary hover:bg-white/10 rounded-full transition-colors">
                        <SkipForward className="w-5 h-5 fill-current" />
                    </Button>
                </div>

                <div className="w-full flex items-center gap-3 text-xs text-muted-foreground font-medium">
                    <span className="w-10 text-right tabular-nums">{formatTime(currentTime)}</span>
                    <Slider
                        value={[currentTime]}
                        max={duration || 100}
                        step={1}
                        onValueChange={(val) => seek(val[0])}
                        className="flex-1 cursor-pointer py-1 hover:scale-y-110 transition-transform"
                    />
                    <span className="w-10 text-left tabular-nums">{formatTime(duration)}</span>
                </div>
            </div>

            {/* Volume & Queue Toggle */}
            <div className="w-1/3 min-w-[180px] flex items-center justify-end gap-2 md:gap-4">
                <div className="flex items-center gap-2 w-32 hidden md:flex group">
                    <Volume2 className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                    <Slider
                        value={[volume]}
                        max={1}
                        step={0.01}
                        onValueChange={(val) => setVolume(val[0])}
                    />
                </div>

                <Button
                    variant={isQueueOpen ? "secondary" : "ghost"}
                    size="icon"
                    className="btn-queue relative"
                    onClick={toggleQueue}
                >
                    <ListMusic className="w-5 h-5" />
                </Button>
            </div>
        </motion.div>
    );
};
