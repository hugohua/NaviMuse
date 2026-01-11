import React from 'react';
import type { CuratorResponse } from '../types';
import { Music, Sparkles } from 'lucide-react';
// import { cn } from '../utils/cn';
// import './ResultCard.css';

interface Props {
    data: CuratorResponse | null;
    loading: boolean;
    statusText: string;
}

export const ResultCard: React.FC<Props> = ({ data, loading, statusText }) => {
    return (
        <>
            {loading && (
                <div className="flex flex-col items-center justify-center p-12 space-y-4">
                    <div className="relative">
                        <div className="w-12 h-12 rounded-full border-4 border-primary/30 border-t-primary animate-spin"></div>
                    </div>
                    <div className="text-muted-foreground animate-pulse text-sm font-medium">{statusText}</div>
                </div>
            )}

            {data && !loading && (
                <div className="glass-panel rounded-xl p-6 space-y-6 animate-in fade-in zoom-in-95 duration-300">
                    <div className="space-y-2 border-b pb-4">
                        <div className="flex items-center gap-2 text-primary">
                            <Sparkles className="w-5 h-5" />
                            <h2 className="text-2xl font-bold tracking-tight">{data.playlistName}</h2>
                        </div>
                        <p className="text-muted-foreground leading-relaxed">{data.description}</p>
                    </div>
                    <ul className="space-y-3">
                        {data.tracks.map((t, idx) => (
                            <li key={idx} className="flex items-start gap-3 p-3 rounded-lg hover:bg-white/5 transition-colors group border border-transparent hover:border-white/10">
                                <span className="flex-shrink-0 mt-1 p-2 rounded-full bg-primary/20 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-all shadow-glow-sm">
                                    <Music className="w-4 h-4" />
                                </span>
                                <div className="space-y-1">
                                    <div className="font-medium text-foreground">{t.reason}</div>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {!data && !loading && (
                <div className="flex flex-col items-center justify-center p-12 text-center space-y-4 border border-dashed border-white/10 rounded-xl bg-white/5 backdrop-blur-sm">
                    <div className="text-4xl">👋</div>
                    <div className="space-y-1">
                        <h3 className="text-xl font-semibold">Ready to Curate</h3>
                        <p className="text-muted-foreground">Select tags from the left or type your vibe below.</p>
                    </div>
                </div>
            )}
        </>
    );
};
