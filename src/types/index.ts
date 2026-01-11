export interface Song {
    id: string;
    title: string;
    artist: string;
    album: string;
    genre: string;
    duration: number;
    playCount: number;
    created: string; // ISO date
    starred: boolean;
    type?: string;
    path?: string;
}

export interface Playlist {
    id: string;
    name: string;
    songCount: number;
    duration?: number;
    created?: string;
    comment?: string;
}

export interface NavidromeResponse<T> {
    "subsonic-response": {
        status: "ok" | "failed";
        version: string;
        error?: {
            code: number;
            message: string;
        };
        [key: string]: any;
    }
}

export interface CuratedSelection {
    songId: string;
    reason: string; // Why this song was chosen
}

export interface CuratorResponse {
    scene: string;
    tracks: CuratedSelection[];
    playlistName: string;
    description: string;
}


export type DiscoveryMode = 'default' | 'familiar' | 'fresh';

export interface UserProfile {
    technical_profile: {
        summary_tags: string[];
        taste_anchors: string[]; // Top 3-5 iconic artists
        dimensions: {
            era_preference: string;
            energy_level: string;
            vocal_style: string;
        };
        blacklist_inference: string[];
    };
    display_card: {
        title: string;
        message: string;
    };
}
