import React, { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import { Howl } from 'howler';
import type { Song } from '../types';
import { api } from '../api';

interface AudioPlayerContextType {
    currentSong: Song | null;
    isPlaying: boolean;
    queue: Song[];
    volume: number;
    currentTime: number;
    duration: number;
    currentPlaylistId: string | null;
    isStarring: boolean;
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
}

const AudioPlayerContext = createContext<AudioPlayerContextType | undefined>(undefined);

// Helper to construct stream URL (Subsonic getStream)
const getStreamUrl = (id: string) => {
    // In real Navidrome/Subsonic, we need auth params.
    // However, our backend doesn't currently proxy stream (it proxies JSON).
    // Strategy: We can configure a proxy endpoint in server.ts OR use direct Navidrome URL if we expose credentials (BAD).
    // Better Strategy: Backend proxies stream -> /api/stream/:id
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

    const howlRef = useRef<Howl | null>(null);
    const rafRef = useRef<number | null>(null);
    // 使用 ref 存储音量，避免 loadAndPlay 依赖 volume state
    const volumeRef = useRef(volume);
    // 追踪当前播放的歌曲 ID，避免 starred 属性变化导致重播
    const currentSongIdRef = useRef<string | null>(null);

    const currentSong = currentIndex >= 0 && currentIndex < queue.length ? queue[currentIndex] : null;

    // 同步 volumeRef
    useEffect(() => {
        volumeRef.current = volume;
    }, [volume]);

    // Cleanup on unmount
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

    // Timer loop for progress
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

    const next = useCallback(() => {
        setCurrentIndex(prev => {
            if (prev + 1 < queue.length) return prev + 1;
            return prev; // Or loop? For now stop at end
        });
    }, [queue.length]);

    const loadAndPlay = useCallback((song: Song, autoplay = true) => {
        if (howlRef.current) {
            howlRef.current.unload();
        }

        const src = getStreamUrl(song.id);

        const sound = new Howl({
            src: [src],
            html5: false, // Force Web Audio API for better control (crossfade potential)
            format: ['mp3', 'flac', 'm4a'], // Hints
            volume: volumeRef.current, // 使用 ref 避免依赖 volume state
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
                // Auto next
                next();
            },
            onloaderror: (_id, err) => {
                console.error('Audio Load Error', err);
            }
        });

        howlRef.current = sound;
    }, [next, startTimer]); // 移除 volume 依赖

    const play = () => {
        howlRef.current?.play();
    };

    const pause = () => {
        howlRef.current?.pause();
    };

    const playSong = (song: Song) => {
        setQueue([song]);
        setCurrentIndex(0);
        // Effect will trigger load
    };

    const playPlaylist = (songs: Song[], playlistId?: string, startIndex = 0) => {
        setQueue(songs);
        setCurrentIndex(startIndex);
        setCurrentPlaylistId(playlistId ?? null);
        // Effect will trigger load
    };

    const prev = useCallback(() => {
        setCurrentIndex(prev => {
            if (prev - 1 >= 0) return prev - 1;
            return 0;
        });
    }, []);

    const seek = (pos: number) => {
        if (howlRef.current) {
            howlRef.current.seek(pos);
            setCurrentTime(pos);
        }
    };

    const setVolume = (vol: number) => {
        setVolumeState(vol);
        howlRef.current?.volume(vol);
    };

    const playAtIndex = (index: number) => {
        if (index >= 0 && index < queue.length) {
            setCurrentIndex(index);
        }
    };

    const toggleStar = useCallback(async () => {
        if (!currentSong || isStarring) return;
        setIsStarring(true);
        try {
            if (currentSong.starred) {
                await api.unstarSong(currentSong.id);
            } else {
                await api.starSong(currentSong.id);
            }
            // Update the song in queue
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

    // React to index change to play new song
    // 只在歌曲 ID 变化时重新加载，避免 starred 属性变化导致重播
    useEffect(() => {
        if (currentIndex >= 0 && currentIndex < queue.length) {
            const song = queue[currentIndex];
            // 只有歌曲 ID 变化才重新加载
            if (song.id !== currentSongIdRef.current) {
                currentSongIdRef.current = song.id;
                loadAndPlay(song, true);
            }
        }
    }, [currentIndex, queue, loadAndPlay]);

    return (
        <AudioPlayerContext.Provider value={{
            currentSong,
            isPlaying,
            queue,
            volume,
            currentTime,
            duration,
            currentPlaylistId,
            isStarring,
            play,
            pause,
            playSong,
            playPlaylist,
            next,
            prev,
            seek,
            setVolume,
            playAtIndex,
            toggleStar
        }}>
            {children}
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
