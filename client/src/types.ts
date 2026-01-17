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
        acoustic_fingerprint: {
            preferred_spectrum: "High" | "Mid" | "Low" | "Full";
            preferred_spatiality: "Dry" | "Wet" | "Huge" | "Intimate";
            tempo_vibe_bias: "Static" | "Drifting" | "Driving" | "Explosive";
            timbre_preference: "Organic" | "Metallic" | "Electronic" | "Grainy";
        };
        vector_search_anchor: string; // 1024D optimized
        blacklist_inference: string[];
    };
    curation_logic?: {
        stage_2_instruction: string;
        energy_mapping: string;
    };
    display_card: {
        title: string;
        message: string;
        ui_theme: {
            primary_color: string;
            visual_metaphor: string;
        };
    };
}

// --- Queue Management Types ---

export interface QueueStatus {
    main: {
        isPaused: boolean;
        isWorkerRunning: boolean;
        activeJobs: number;
        waitingJobs: number;
        completedJobs: number;
        failedJobs: number;
        delayedJobs: number;
        pendingSongs: number;
        totalSongs: number;
        pipelineState: 'idle' | 'syncing' | 'enqueuing';
    };
    metadataOnly: {
        waiting: number;
        active: number;
        completed: number;
        failed: number;
    };
    embeddingOnly: {
        waiting: number;
        active: number;
        completed: number;
        failed: number;
    };
}

export interface QueueActionResult {
    success: boolean;
    message: string;
    pendingCount?: number;
    jobsCreated?: number;
    clearedJobs?: number;
    dryRun?: boolean;
    songsTotal?: number;
}

// --- Settings Types ---

export interface AISettings {
    [key: string]: string | undefined;
    ai_provider?: string;
    ai_model?: string;
    queue_concurrency?: string;
    queue_rate_limit_max?: string;
    queue_batch_size?: string;
}

export interface ModelInfo {
    id: string;
    name: string;
    pricing: any;
    context_length: number;
}
