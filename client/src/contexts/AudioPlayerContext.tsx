import React, { createContext, useContext, useEffect, useRef, useState, useCallback, useMemo, type ReactNode } from 'react';
import { Howl } from 'howler';
import type { Song } from '../types';
import { api } from '../api';


export type PlayMode = 'sequence' | 'loop' | 'one' | 'shuffle';

// Context for stable state (updates infrequently)
interface AudioPlayerContextType {
    currentSong: Song | null;
    isPlaying: boolean;
    queue: Song[];
    volume: number;
    currentPlaylistId: string | null;
    isStarring: boolean;
    playMode: PlayMode;
    play: () => void;
    pause: () => void;
    playSong: (song: Song) => void;
    playPlaylist: (songs: Song[], playlistId?: string, startIndex?: number) => void;
    next: () => void;
    prev: () => void;
    seek: (pos: number) => void;
    setVolume: (vol: number) => void;
    playAtIndex: (index: number) => void;
    toggleStar: () => Promise<void>;
    togglePlayMode: () => void;
}

// Context for volatile state (updates 60fps)
interface AudioProgressContextType {
    currentTime: number;
    duration: number;
}

const AudioPlayerContext = createContext<AudioPlayerContextType | undefined>(undefined);
const AudioProgressContext = createContext<AudioProgressContextType | undefined>(undefined);

// Helper to construct stream URL
const getStreamUrl = (id: string) => {
    return `/api/stream/${id}`;
};

export const AudioPlayerProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [queue, setQueue] = useState<Song[]>([]);
    const [currentIndex, setCurrentIndex] = useState(-1);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolumeState] = useState(1.0);
    const [currentPlaylistId, setCurrentPlaylistId] = useState<string | null>(null);
    const [isStarring, setIsStarring] = useState(false);
    const [playMode, setPlayMode] = useState<PlayMode>('loop');

    const howlRef = useRef<Howl | null>(null);
    const rafRef = useRef<number | null>(null);
    const volumeRef = useRef(volume);
    const currentSongIdRef = useRef<string | null>(null);
    const playModeRef = useRef(playMode);

    const currentSong = currentIndex >= 0 && currentIndex < queue.length ? queue[currentIndex] : null;

    useEffect(() => {
        volumeRef.current = volume;
    }, [volume]);

    useEffect(() => {
        playModeRef.current = playMode;
    }, [playMode]);

    useEffect(() => {
        return () => {
            if (howlRef.current) {
                howlRef.current.unload();
            }
            if (rafRef.current) {
                cancelAnimationFrame(rafRef.current);
            }
        };
    }, []);

    const startTimer = useCallback(() => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        const loop = () => {
            if (howlRef.current && howlRef.current.playing()) {
                setCurrentTime(howlRef.current.seek());
                rafRef.current = requestAnimationFrame(loop);
            }
        };
        loop();
    }, []);

    const stopTimer = () => {
        if (rafRef.current) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }
    };

    const next = useCallback((isAuto = false) => {
        setCurrentIndex(prev => {
            const queueLen = queue.length;
            if (queueLen === 0) return -1;
            const mode = playModeRef.current;

            if (isAuto && mode === 'one') {
                if (howlRef.current) {
                    howlRef.current.seek(0);
                    howlRef.current.play();
                }
                return prev;
            }

            if (mode === 'shuffle') {
                const nextIdx = Math.floor(Math.random() * queueLen);
                return nextIdx;
            }

            if (prev + 1 < queueLen) {
                return prev + 1;
            } else {
                if (mode === 'loop') {
                    return 0;
                }
                return prev;
            }
        });
    }, [queue.length]);

    const loadAndPlay = useCallback((song: Song, autoplay = true) => {
        if (howlRef.current) {
            howlRef.current.unload();
        }

        const src = getStreamUrl(song.id);

        const sound = new Howl({
            src: [src],
            html5: false,
            format: ['mp3', 'flac', 'm4a'],
            volume: volumeRef.current,
            autoplay: autoplay,
            onplay: () => {
                setIsPlaying(true);
                setDuration(sound.duration());
                startTimer();
            },
            onpause: () => {
                setIsPlaying(false);
                stopTimer();
            },
            onstop: () => {
                setIsPlaying(false);
                setCurrentTime(0);
                stopTimer();
            },
            onend: () => {
                next(true);
            },
            onloaderror: (_id, err) => {
                console.error('Audio Load Error', err);
            }
        });

        howlRef.current = sound;
    }, [next, startTimer]);

    const play = useCallback(() => {
        howlRef.current?.play();
    }, []);

    const pause = useCallback(() => {
        howlRef.current?.pause();
    }, []);

    const playSong = useCallback((song: Song) => {
        setQueue([song]);
        setCurrentIndex(0);
    }, []);

    const playPlaylist = useCallback((songs: Song[], playlistId?: string, startIndex = 0) => {
        setQueue(songs);
        setCurrentIndex(startIndex);
        setCurrentPlaylistId(playlistId ?? null);
    }, []);

    const prev = useCallback(() => {
        setCurrentIndex(prev => {
            if (howlRef.current && howlRef.current.seek() > 3) {
                howlRef.current.seek(0);
                return prev;
            }

            if (prev - 1 >= 0) return prev - 1;

            if (playModeRef.current === 'loop' && queue.length > 0) {
                return queue.length - 1;
            }

            return 0;
        });
    }, [queue.length]);

    const seek = useCallback((pos: number) => {
        if (howlRef.current) {
            howlRef.current.seek(pos);
            setCurrentTime(pos);
        }
    }, []);

    const setVolume = useCallback((vol: number) => {
        setVolumeState(vol);
        howlRef.current?.volume(vol);
    }, []);

    const playAtIndex = useCallback((index: number) => {
        if (index >= 0 && index < queue.length) {
            setCurrentIndex(index);
        }
    }, [queue.length]);

    const toggleStar = useCallback(async () => {
        if (!currentSong || isStarring) return;
        setIsStarring(true);
        try {
            if (currentSong.starred) {
                await api.unstarSong(currentSong.id);
            } else {
                await api.starSong(currentSong.id);
            }
            setQueue(prev => prev.map(song =>
                song.id === currentSong.id
                    ? { ...song, starred: !song.starred }
                    : song
            ));
        } catch (err) {
            console.error('Toggle star failed:', err);
        } finally {
            setIsStarring(false);
        }
    }, [currentSong, isStarring]);

    const togglePlayMode = useCallback(() => {
        setPlayMode(prev => {
            if (prev === 'loop') return 'shuffle';
            if (prev === 'shuffle') return 'one';
            if (prev === 'one') return 'sequence';
            return 'loop';
        });
    }, []);

    const handleNext = useCallback(() => next(false), [next]);

    useEffect(() => {
        if (currentIndex >= 0 && currentIndex < queue.length) {
            const song = queue[currentIndex];
            if (song.id !== currentSongIdRef.current) {
                currentSongIdRef.current = song.id;
                loadAndPlay(song, true);
            }
        }
    }, [currentIndex, queue, loadAndPlay]);

    // Memoize stable state to prevent re-renders when currentTime changes
    const playerState = useMemo<AudioPlayerContextType>(() => ({
        currentSong,
        isPlaying,
        queue,
        volume,
        currentPlaylistId,
        isStarring,
        playMode,
        play,
        pause,
        playSong,
        playPlaylist,
        next: handleNext,
        prev,
        seek,
        setVolume,
        playAtIndex,
        toggleStar,
        togglePlayMode
    }), [
        currentSong, isPlaying, queue, volume, currentPlaylistId,
        isStarring, playMode, play, pause, playSong, playPlaylist,
        handleNext, prev, seek, setVolume, playAtIndex, toggleStar, togglePlayMode
    ]);

    // Memoize progress state (updates frequently)
    const progressState = useMemo<AudioProgressContextType>(() => ({
        currentTime,
        duration
    }), [currentTime, duration]);

    return (
        <AudioPlayerContext.Provider value={playerState}>
            <AudioProgressContext.Provider value={progressState}>
                {children}
            </AudioProgressContext.Provider>
        </AudioPlayerContext.Provider>
    );
};

export const useAudioPlayer = () => {
    const context = useContext(AudioPlayerContext);
    if (!context) {
        throw new Error('useAudioPlayer must be used within AudioPlayerProvider');
    }
    return context;
};

export const useAudioProgress = () => {
    const context = useContext(AudioProgressContext);
    if (!context) {
        throw new Error('useAudioProgress must be used within AudioPlayerProvider');
    }
    return context;
};

