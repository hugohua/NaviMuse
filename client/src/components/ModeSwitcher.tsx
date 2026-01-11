import React from 'react';
import type { DiscoveryMode } from '../types';
import { cn } from '../utils/cn';
// import './ModeSwitcher.css';

interface Props {
    current: DiscoveryMode;
    onChange: (mode: DiscoveryMode) => void;
}

export const ModeSwitcher: React.FC<Props> = ({ current, onChange }) => {
    const modes: { id: DiscoveryMode; label: string }[] = [
        { id: 'familiar', label: '熟悉模式' },
        { id: 'default', label: '默认模式' },
        { id: 'fresh', label: '新鲜模式' },
    ];

    return (
        <div className="inline-flex h-10 items-center justify-center rounded-lg glass-panel p-1 text-muted-foreground border border-white/5">
            {modes.map((m) => (
                <div
                    key={m.id}
                    className={cn(
                        "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-bold ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer relative z-10",
                        current === m.id
                            ? "bg-primary text-primary-foreground shadow-[0_0_15px_rgba(99,102,241,0.6)] scale-105 border border-primary/50"
                            : "hover:bg-white/10 hover:text-foreground text-muted-foreground font-medium"
                    )}
                    onClick={() => onChange(m.id)}
                >
                    {m.label}
                </div>
            ))}
        </div>
    );
};
