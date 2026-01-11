import React from 'react';
import type { UserProfile } from '../types';
import { User, Activity, Music2 } from 'lucide-react';
// import './UserProfileCard.css';

interface Props {
    profile: UserProfile;
}

export const UserProfileCard: React.FC<Props> = ({ profile }) => {
    const { technical_profile, display_card } = profile;

    return (
        <div className="glass-panel text-card-foreground rounded-xl p-6 space-y-6 relative overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Decorative background element */}
            <div className="absolute top-0 right-0 p-8 opacity-5">
                <User className="w-32 h-32" />
            </div>

            {/* Top: Persona Narrative */}
            <div className="space-y-2 relative z-10">
                <h3 className="text-xl font-bold tracking-tight text-primary flex items-center gap-2">
                    {display_card.title}
                </h3>
                <p className="text-muted-foreground leading-relaxed">
                    {display_card.message}
                </p>
            </div>

            {/* Bottom: Technical DNA */}
            <div className="space-y-4 pt-4 border-t relative z-10">
                <div className="flex flex-wrap gap-2">
                    {technical_profile.summary_tags.map(tag => (
                        <span key={tag} className="inline-flex items-center rounded-full bg-secondary/20 border border-secondary/30 px-2.5 py-0.5 text-xs font-semibold text-secondary-foreground transition-all hover:bg-secondary/40 hover:scale-105 cursor-default">
                            {tag}
                        </span>
                    ))}
                </div>

                {technical_profile.taste_anchors && technical_profile.taste_anchors.length > 0 && (
                    <div className="text-xs text-muted-foreground flex items-center gap-2">
                        <Music2 className="w-3.5 h-3.5" />
                        <span>常听: {technical_profile.taste_anchors.join(" · ")}</span>
                    </div>
                )}

                <div className="grid grid-cols-3 gap-4 text-sm mt-2">
                    <div className="flex flex-col gap-1 p-2 rounded-lg bg-white/5 border border-white/5">
                        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">偏好年代</span>
                        <span className="font-semibold text-foreground">{technical_profile.dimensions.era_preference}</span>
                    </div>
                    <div className="flex flex-col gap-1 p-2 rounded-lg bg-white/5 border border-white/5">
                        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">能量等级</span>
                        <div className="flex items-center gap-1">
                            <Activity className="w-3.5 h-3.5 text-primary" />
                            <span className="font-semibold text-foreground">{technical_profile.dimensions.energy_level}</span>
                        </div>
                    </div>
                    <div className="flex flex-col gap-1 p-2 rounded-lg bg-white/5 border border-white/5">
                        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">人声喜好</span>
                        <span className="font-semibold text-foreground">{technical_profile.dimensions.vocal_style}</span>
                    </div>
                </div>
            </div>
        </div>
    );
};
