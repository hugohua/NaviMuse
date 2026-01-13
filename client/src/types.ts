export interface Song {
    id: string;
    title: string;
    artist: string;
    album?: string;
    genre?: string;
    duration: number;
    playCount: number;
    created: string;
    starred: boolean;
    type?: string;
    path: string;
}

export interface Playlist {
    id: string;
    name: string;
    songCount: number;
    duration: number;
    created: string;
}

export interface PlaylistDetail {
    playlist: Playlist;
    songs: Song[];
}

export interface NavidromeResponse {
    "subsonic-response": {
        status: 'ok' | 'failed';
        version: string;
        type?: string;
        serverVersion?: string;
        error?: {
            code: number;
            message: string;
        };
        [key: string]: any;
    };
}

// Discovery Modes
export type DiscoveryMode = 'default' | 'familiar' | 'fresh';

// AI Curation Response
export interface GeneratedTrack {
    songId: string;
    reason: string;
}

export interface CuratorResponse {
    scene: string;
    playlistName: string;
    description: string;
    tracks: GeneratedTrack[];
}

export interface ApiResponse {
    success: boolean;
    data?: CuratorResponse;
    error?: string;
}

export interface TagCategory {
    title: string;
    attributes: Record<string, string>;
}

export interface UserProfile {
    technical_profile: {
        summary_tags: string[];
        taste_anchors: string[]; // Top 3-5 iconic artists
        dimensions: {
            era_preference: string;
            energy_level: string;
            acoustic_environment: string;
        };
        blacklist_inference: string[];
    };
    display_card: {
        title: string;
        message: string;
        ui_theme?: {
            primary_color: string;
            visual_metaphor: string;
        };
    };
}
