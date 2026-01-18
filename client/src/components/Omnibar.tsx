import React from 'react';
import { Button } from './ui/button';
import { ModeSwitcher } from './ModeSwitcher';
import { ArrowRight, Loader2 } from 'lucide-react';
import type { DiscoveryMode } from '../types';
import './Omnibar.css';

interface OmnibarProps {
    mode: DiscoveryMode;
    onModeChange: (mode: DiscoveryMode) => void;
    onGenerate: (prompt: string) => void;
    loading: boolean;
    value: string;
    onChange: (value: string) => void;
}

export const Omnibar: React.FC<OmnibarProps> = React.memo(({ mode, onModeChange, onGenerate, loading, value: prompt, onChange }) => {

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && prompt.trim()) {
            onGenerate(prompt);
        }
    };

    const handleSend = () => {
        if (prompt.trim()) {
            onGenerate(prompt);
        }
    };

    return (
        <div className="omnibar-container">
            <div className="omnibar">
                <div className="omnibar-left">
                    <ModeSwitcher current={mode} onChange={onModeChange} />
                </div>

                <div className="omnibar-divider" />

                <div className="omnibar-right">
                    <input
                        type="text"
                        className="omnibar-input"
                        placeholder="描述当下的心情..."
                        value={prompt}
                        onChange={(e) => onChange(e.target.value)}
                        onKeyDown={handleKeyDown}
                    />
                    <Button
                        size="icon"
                        className="omnibar-send-btn"
                        onClick={handleSend}
                        disabled={loading}
                    >
                        {loading ? (
                            <Loader2 className="send-icon animate-spin" />
                        ) : (
                            <ArrowRight className="send-icon" />
                        )}
                    </Button>
                </div>
            </div>
        </div>
    );
});
