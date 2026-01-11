import React from 'react';
import type { UserProfile } from '../types';
import { User, Activity, Music2 } from 'lucide-react';
import './UserProfileCard.css';

interface Props {
    profile: UserProfile;
}

export const UserProfileCard: React.FC<Props> = ({ profile }) => {
    const { technical_profile, display_card } = profile;

    return (
        <div className="profile-card">
            {/* Decorative background element */}
            <div className="profile-bg-icon">
                <User className="bg-user-icon" />
            </div>

            {/* Top: Persona Narrative */}
            <div className="profile-header">
                <h3 className="profile-title">
                    {display_card.title}
                </h3>
                <p className="profile-message">
                    {display_card.message}
                </p>
            </div>

            {/* Bottom: Technical DNA */}
            <div className="profile-details">
                <div className="summary-tags">
                    {technical_profile.summary_tags.map(tag => (
                        <span key={tag} className="summary-tag">
                            {tag}
                        </span>
                    ))}
                </div>

                {technical_profile.taste_anchors && technical_profile.taste_anchors.length > 0 && (
                    <div className="taste-anchors">
                        <Music2 className="anchor-icon" />
                        <span>常听: {technical_profile.taste_anchors.join(" · ")}</span>
                    </div>
                )}

                <div className="dimension-grid">
                    <div className="dimension-item">
                        <span className="dimension-label">偏好年代</span>
                        <span className="dimension-value">{technical_profile.dimensions.era_preference}</span>
                    </div>
                    <div className="dimension-item">
                        <span className="dimension-label">能量等级</span>
                        <div className="dimension-value-row">
                            <Activity className="dimension-icon" />
                            <span className="dimension-value">{technical_profile.dimensions.energy_level}</span>
                        </div>
                    </div>
                    <div className="dimension-item">
                        <span className="dimension-label">人声喜好</span>
                        <span className="dimension-value">{technical_profile.dimensions.vocal_style}</span>
                    </div>
                </div>
            </div>
        </div>
    );
};
