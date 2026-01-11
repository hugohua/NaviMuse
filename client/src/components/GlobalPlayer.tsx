import React from 'react';
import { motion } from 'framer-motion';
import { useAudioPlayer } from '../contexts/AudioPlayerContext';
import { useQueuePanel } from '../contexts/QueuePanelContext';
import {
    Play, Pause, SkipBack, SkipForward, Volume2, ListMusic, Heart
} from 'lucide-react';
import { Slider } from './ui/slider';
import { Button } from './ui/button';
import { cn } from '../utils/cn';
import './GlobalPlayer.css';

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
            className="global-player"
        >
            {/* Track Info */}
            <div className="player-track-info">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={toggleStar}
                    disabled={isStarring}
                    className={cn(
                        "star-btn",
                        currentSong.starred && "star-btn-active",
                        isStarring && "star-btn-loading"
                    )}
                >
                    <Heart className={cn("star-icon", currentSong.starred && "star-icon-filled")} />
                </Button>
                <div className="track-details">
                    <div className="track-title">{currentSong.title}</div>
                    <div className="track-artist">{currentSong.artist}</div>
                </div>
            </div>

            {/* Controls Center */}
            <div className="player-controls">
                <div className="control-buttons">
                    <Button variant="ghost" size="icon" onClick={prev} className="control-btn">
                        <SkipBack className="control-icon fill-current" />
                    </Button>
                    <Button
                        size="icon"
                        onClick={isPlaying ? pause : play}
                        className="play-pause-btn"
                    >
                        {isPlaying ? (
                            <Pause className="play-icon fill-current" />
                        ) : (
                            <Play className="play-icon fill-current play-offset" />
                        )}
                    </Button>
                    <Button variant="ghost" size="icon" onClick={next} className="control-btn">
                        <SkipForward className="control-icon fill-current" />
                    </Button>
                </div>

                <div className="progress-bar">
                    <span className="time-display">{formatTime(currentTime)}</span>
                    <Slider
                        value={[currentTime]}
                        max={duration || 100}
                        step={1}
                        onValueChange={(val) => seek(val[0])}
                        className="progress-slider"
                    />
                    <span className="time-display">{formatTime(duration)}</span>
                </div>
            </div>

            {/* Volume & Queue Toggle */}
            <div className="player-extras">
                <div className="volume-control">
                    <Volume2 className="volume-icon" />
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
                    className="queue-toggle-btn"
                    onClick={toggleQueue}
                >
                    <ListMusic className="queue-icon" />
                </Button>
            </div>
        </motion.div>
    );
};
