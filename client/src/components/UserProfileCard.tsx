import React from 'react';
import type { UserProfile } from '../types';
import { User, Music2, History, Zap, Waves, ShieldBan } from 'lucide-react';
import './UserProfileCard.css';

interface Props {
    profile: UserProfile;
}

export const UserProfileCard: React.FC<Props> = ({ profile }) => {
    const { technical_profile, display_card } = profile;
    if (!display_card) return null;

    const themeColor = display_card.ui_theme?.primary_color || '#646cff';
    const cardStyle = {
        '--profile-accent': themeColor,
        background: `linear-gradient(135deg, ${themeColor}10, var(--card-bg) 60%)`,
        borderColor: `${themeColor}40`,
        boxShadow: `0 8px 32px -4px ${themeColor}20`,
    } as React.CSSProperties;

    return (
        <div className="profile-card" style={cardStyle}>
            {/* Background Icon */}
            <div className="profile-bg-icon">
                <User className="bg-user-icon" style={{ color: themeColor, opacity: 0.08 }} />
            </div>

            {/* Header */}
            <div className="profile-header">
                <h3 className="profile-title" style={{ color: themeColor }}>
                    {display_card.title}
                </h3>
                <p className="profile-message">
                    {display_card.message}
                </p>
                {display_card.ui_theme?.visual_metaphor && (
                    <div className="visual-metaphor">
                        <span className="metaphor-icon">🖼️</span>
                        <span className="metaphor-text">{display_card.ui_theme.visual_metaphor}</span>
                    </div>
                )}
            </div>

            {/* Technical Details */}
            <div className="profile-details">
                {/* Visual Tags */}
                <div className="summary-tags">
                    {technical_profile.summary_tags.map(tag => (
                        <span key={tag} className="summary-tag" style={{
                            borderColor: `${themeColor}30`,
                            color: themeColor,
                            backgroundColor: `${themeColor}08`
                        }}>
                            {tag}
                        </span>
                    ))}
                </div>

                {/* Taste Anchors */}
                {technical_profile.taste_anchors?.length > 0 && (
                    <div className="taste-anchors">
                        <Music2 className="anchor-icon" />
                        <span>DNA: {technical_profile.taste_anchors.join(" · ")}</span>
                    </div>
                )}

                {/* Dimensions Grid */}
                <div className="dimension-grid">
                    <div className="dimension-item">
                        <div className="dimension-label-row">
                            <History className="dimension-icon" />
                            <span className="dimension-label">偏好年代</span>
                        </div>
                        <span className="dimension-value" title={technical_profile.dimensions.era_preference}>
                            {technical_profile.dimensions.era_preference}
                        </span>
                    </div>

                    <div className="dimension-item">
                        <div className="dimension-label-row">
                            <Zap className="dimension-icon" />
                            <span className="dimension-label">能量等级</span>
                        </div>
                        <span className="dimension-value" title={technical_profile.dimensions.energy_level}>
                            {technical_profile.dimensions.energy_level}
                        </span>
                    </div>

                    <div className="dimension-item">
                        <div className="dimension-label-row">
                            <Waves className="dimension-icon" />
                            <span className="dimension-label">听感空间</span>
                        </div>
                        <span className="dimension-value" title={technical_profile.dimensions.acoustic_environment}>
                            {technical_profile.dimensions.acoustic_environment}
                        </span>
                    </div>
                </div>

                {/* Blacklist */}
                {technical_profile.blacklist_inference?.length > 0 && (
                    <div className="blacklist-section">
                        <ShieldBan className="blacklist-icon" />
                        <div className="blacklist-content">
                            <span className="blacklist-label">审美排斥:</span>
                            <span className="blacklist-value">
                                {technical_profile.blacklist_inference.join(" / ")}
                            </span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
