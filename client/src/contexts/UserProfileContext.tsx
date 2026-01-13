import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { api } from '../api';
import type { UserProfile } from '../types';
import { usePopup } from './PopupContext';

interface UserProfileContextType {
    userProfile: UserProfile | null;
    analyzingProfile: boolean;
    handleAnalyzeProfile: () => Promise<void>;
    setUserProfile: (profile: UserProfile | null) => void;
}

const UserProfileContext = createContext<UserProfileContextType | undefined>(undefined);

export function UserProfileProvider({ children }: { children: ReactNode }) {
    const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
    const [analyzingProfile, setAnalyzingProfile] = useState(false);
    const { showPopup } = usePopup();

    // Load User Profile on mount
    useEffect(() => {
        const savedProfile = localStorage.getItem('navi_user_profile');
        if (savedProfile) {
            try {
                setUserProfile(JSON.parse(savedProfile));
            } catch (e) {
                console.error("Failed to parse saved profile", e);
                localStorage.removeItem('navi_user_profile');
            }
        }
    }, []);

    const handleAnalyzeProfile = async () => {
        if (analyzingProfile) return;
        setAnalyzingProfile(true);

        try {
            const profile = await api.analyzeUserProfile();
            setUserProfile(profile);
            localStorage.setItem('navi_user_profile', JSON.stringify(profile));
            showPopup({ message: `画像分析完成: ${profile.display_card.title}`, title: 'Success' });
        } catch (e: any) {
            showPopup({ message: '画像分析失败: ' + e.message, title: 'Error' });
            console.error(e);
        } finally {
            setAnalyzingProfile(false);
        }
    };

    return (
        <UserProfileContext.Provider value={{
            userProfile,
            analyzingProfile,
            handleAnalyzeProfile,
            setUserProfile
        }}>
            {children}
        </UserProfileContext.Provider>
    );
}

export function useUserProfile() {
    const context = useContext(UserProfileContext);
    if (context === undefined) {
        throw new Error('useUserProfile must be used within a UserProfileProvider');
    }
    return context;
}
