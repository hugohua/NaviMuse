import React from 'react';
import type { CuratorResponse } from '../types';
import { Music, Sparkles } from 'lucide-react';
import './ResultCard.css';

interface Props {
    data: CuratorResponse | null;
    loading: boolean;
    statusText: string;
}

export const ResultCard: React.FC<Props> = ({ data, loading, statusText }) => {
    return (
        <>
            {loading && (
                <div className="result-loading">
                    <div className="spinner-container">
                        <div className="spinner"></div>
                    </div>
                    <div className="loading-text">{statusText}</div>
                </div>
            )}

            {data && !loading && (
                <div className="result-card">
                    <div className="result-header">
                        <div className="result-title-row">
                            <Sparkles className="result-icon" />
                            <h2 className="result-title">{data.playlistName}</h2>
                        </div>
                        <p className="result-description">{data.description}</p>
                    </div>
                    <ul className="track-list">
                        {data.tracks.map((t, idx) => (
                            <li key={idx} className="track-item">
                                <span className="track-icon-wrapper">
                                    <Music className="track-icon" />
                                </span>
                                <div className="track-info">
                                    <div className="track-reason">{t.reason}</div>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {!data && !loading && (
                <div className="result-empty">
                    <div className="empty-emoji">👋</div>
                    <div className="empty-text">
                        <h3 className="empty-title">Ready to Curate</h3>
                        <p className="empty-description">Select tags from the left or type your vibe below.</p>
                    </div>
                </div>
            )}
        </>
    );
};
