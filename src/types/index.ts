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
    starredAt?: string; // [New] ISO date when starred
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
            energy_level: string; // 0.0-1.0 Scale with Description
            acoustic_environment: string; // [New] E.g., Dry/Wet, Studio/Live
        };
        blacklist_inference: string[];
    };
    display_card: {
        title: string;
        message: string; // 100-150 words
        ui_theme?: { // [New] UI Theme
            primary_color: string;
            visual_metaphor: string;
        };
    };
}

// New Strict Output Schema for Gemini 3 Flash
export interface MetadataJSON {
    id?: string | number;
    vector_anchor: {
        acoustic_model: string; // 物理层
        semantic_push: string;  // 意象层
        cultural_weight: string; // 地位层
        exclusion_logic?: string; // 负向约束 (New)
    };
    embedding_tags: {
        spectrum: "High" | "Mid" | "Low" | "Full";
        spatial: "Dry" | "Wet" | "Huge" | "Intimate";
        energy: number; // 1-10
        /** [New] 律动特征: Static(静止), Drifting(漂浮), Driving(推进), Explosive(爆发) */
        tempo_vibe: "Static" | "Drifting" | "Driving" | "Explosive";
        /** [New] 音色质感: Organic(原生), Metallic(金属/冷), Electronic(电), Grainy(颗粒/复古) */
        timbre_texture: "Organic" | "Metallic" | "Electronic" | "Grainy";
        mood_coord: string[];
        objects: string[];
        scene_tag?: string; // Derived or explicit
    };
    popularity_raw: number; // 0.0-1.0
    // Helpers for compatibility or easy access
    title?: string;
    artist?: string;
    language?: "CN" | "EN" | "JP" | "KR" | "Instrumental" | "Other"; // [中文注释] 语种枚举
    is_instrumental?: boolean; // [中文注释] 是否纯音乐
    llm_model?: string; // [AI] 生成模型的名称
}
