
import React from 'react';
import type { DiscoveryMode } from '../types';
import { cn } from '../utils/cn';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuPortal,
} from "@radix-ui/react-dropdown-menu";
import { ChevronDown, Sparkles, Compass, Lightbulb } from 'lucide-react';
import './ModeSwitcher.css';

interface Props {
    current: DiscoveryMode;
    onChange: (mode: DiscoveryMode) => void;
}

export const ModeSwitcher: React.FC<Props> = ({ current, onChange }) => {
    const modes: { id: DiscoveryMode; label: string; icon: React.ElementType }[] = [
        { id: 'familiar', label: '熟悉模式', icon: Compass },
        { id: 'default', label: '默认模式', icon: Sparkles },
        { id: 'fresh', label: '新鲜模式', icon: Lightbulb },
    ];

    const currentMode = modes.find(m => m.id === current) || modes[1];
    const Icon = currentMode.icon;

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button className="mode-trigger">
                    <Icon className="mode-icon" />
                    <span className="mode-label">{currentMode.label}</span>
                    <ChevronDown className="mode-chevron" />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuPortal>
                <DropdownMenuContent className="mode-dropdown-content" align="start" sideOffset={5}>
                    {modes.map((m) => {
                        const ModeIcon = m.icon;
                        return (
                            <DropdownMenuItem
                                key={m.id}
                                className={cn("mode-dropdown-item", current === m.id && "active")}
                                onSelect={() => onChange(m.id)}
                            >
                                <ModeIcon className="item-icon" />
                                <span>{m.label}</span>
                            </DropdownMenuItem>
                        );
                    })}
                </DropdownMenuContent>
            </DropdownMenuPortal>
        </DropdownMenu>
    );
};
