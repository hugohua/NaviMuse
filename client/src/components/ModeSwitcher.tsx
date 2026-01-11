import React from 'react';
import type { DiscoveryMode } from '../types';
import { cn } from '../utils/cn';
import './ModeSwitcher.css';

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
        <div className="mode-switcher">
            {modes.map((m) => (
                <div
                    key={m.id}
                    className={cn("mode-option", current === m.id && "mode-option-active")}
                    onClick={() => onChange(m.id)}
                >
                    {m.label}
                </div>
            ))}
        </div>
    );
};
