import type {
    DiscoveryMode,
    CuratorResponse,
    ApiResponse,
    TagCategory,
    QueueStatus,
    QueueActionResult,
    UserProfile,
    Playlist,
    PlaylistDetail,
    AISettings,
    ModelInfo
} from './types';

export type {
    QueueStatus,
    QueueActionResult,
    AISettings,
    ModelInfo,
    DiscoveryMode,
    CuratorResponse,
    ApiResponse,
    TagCategory,
    UserProfile,
    Playlist,
    PlaylistDetail
};

export const api = {
    /**
     * Fetch Tag Categories from Backend Configuration
     */
    getTags: async (): Promise<TagCategory[]> => {
        const res = await fetch('/api/config/tags');
        if (!res.ok) {
            throw new Error(`Failed to fetch tags: ${res.statusText}`);
        }
        return res.json();
    },

    /**
     * Generate Playlist
     */
    generatePlaylist: async (prompt: string, mode: DiscoveryMode, userProfile?: UserProfile): Promise<CuratorResponse> => {
        const res = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt, mode, userProfile })
        });

        const json: ApiResponse = await res.json();

        if (!json.success || !json.data) {
            throw new Error(json.error || 'Unknown error');
        }

        return json.data;
    },

    /**
     * Analyze User Profile
     */
    analyzeUserProfile: async (): Promise<UserProfile> => {
        const res = await fetch('/api/profile/analyze', {
            method: 'POST'
        });
        const json: ApiResponse = await res.json();

        if (!json.success || !json.data) {
            throw new Error(json.error || 'Unknown error for profile analysis');
        }

        return json.data as unknown as UserProfile;
    },

    /**
     * Get Playlists
     */
    getPlaylists: async (): Promise<Playlist[]> => {
        const res = await fetch('/api/playlists');
        if (!res.ok) {
            throw new Error(`Failed to fetch playlists: ${res.statusText}`);
        }
        return res.json();
    },

    /**
     * Get Playlist Details
     */
    getPlaylist: async (id: string): Promise<PlaylistDetail> => {
        const res = await fetch(`/api/playlists/${id}`);
        if (!res.ok) {
            throw new Error(`Failed to fetch playlist details: ${res.statusText}`);
        }
        return res.json();
    },

    /**
     * Delete Playlist
     */
    deletePlaylist: async (id: string): Promise<void> => {
        const res = await fetch(`/api/playlists/${id}`, {
            method: 'DELETE'
        });
        const json = await res.json();
        if (!json.success) {
            throw new Error(json.error || 'Failed to delete playlist');
        }
    },

    /**
     * Star a Song
     */
    starSong: async (id: string): Promise<void> => {
        const res = await fetch(`/api/songs/${id}/star`, {
            method: 'POST'
        });
        const json = await res.json();
        if (!json.success) {
            throw new Error(json.error || 'Failed to star song');
        }
    },

    /**
     * Unstar a Song
     */
    unstarSong: async (id: string): Promise<void> => {
        const res = await fetch(`/api/songs/${id}/star`, {
            method: 'DELETE'
        });
        const json = await res.json();
        if (!json.success) {
            throw new Error(json.error || 'Failed to unstar song');
        }
    },

    // --- Settings ---

    getSettings: async (): Promise<AISettings> => {
        const res = await fetch('/api/settings');
        if (!res.ok) throw new Error(`Failed to fetch settings: ${res.statusText}`);
        return res.json();
    },

    getOpenRouterModels: async (): Promise<ModelInfo[]> => {
        const res = await fetch('/api/settings/models/openrouter');
        const json = await res.json();
        return json.models || [];
    },

    saveSettings: async (settings: AISettings): Promise<void> => {
        const res = await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ settings })
        });
        if (!res.ok) throw new Error(`Failed to save settings: ${res.statusText}`);
    },

    // --- Queue Management ---

    /**
     * 队列状态接口
     */
    getQueueStatus: async (): Promise<QueueStatus> => {
        const res = await fetch('/api/queue/status');
        if (!res.ok) {
            throw new Error(`Failed to fetch queue status: ${res.statusText}`);
        }
        return res.json();
    },

    /**
     * 启动元数据生成任务
     */
    startQueue: async (options?: { skipSync?: boolean; limit?: number; dryRun?: boolean }): Promise<QueueActionResult> => {
        const params = new URLSearchParams();
        if (options?.skipSync) params.set('skipSync', 'true');
        if (options?.limit) params.set('limit', String(options.limit));
        if (options?.dryRun) params.set('dryRun', 'true');

        const url = `/api/queue/start${params.toString() ? '?' + params.toString() : ''}`;
        const res = await fetch(url, { method: 'POST' });
        return res.json();
    },

    /**
     * 暂停队列
     */
    pauseQueue: async (): Promise<QueueActionResult> => {
        const res = await fetch('/api/queue/pause', { method: 'POST' });
        return res.json();
    },

    /**
     * 恢复队列
     */
    resumeQueue: async (): Promise<QueueActionResult> => {
        const res = await fetch('/api/queue/resume', { method: 'POST' });
        return res.json();
    },

    /**
     * 停止并清空队列
     */
    stopQueue: async (): Promise<QueueActionResult & { clearedJobs?: number }> => {
        const res = await fetch('/api/queue/stop', { method: 'POST' });
        return res.json();
    },

    getAdminSongs: async (page: number = 1, limit: number = 50, filter?: 'all' | 'no_metadata' | 'no_vector'): Promise<{
        data: any[],
        pagination: { total: number, page: number, limit: number, totalPages: number }
    }> => {
        const filterQuery = filter ? `&filter=${filter}` : '';
        const res = await fetch(`/api/admin/songs?page=${page}&limit=${limit}${filterQuery}`);
        if (!res.ok) {
            throw new Error(`Failed to fetch songs: ${res.statusText}`);
        }
        return res.json();
    },

    /**
     * 立即处理选中的歌曲 (Batch Immediate)
     */
    processImmediate: async (ids: string[], type: 'full' | 'metadata' | 'embedding'): Promise<{ success: boolean, count: number, message: string }> => {
        const res = await fetch('/api/queue/immediate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids, type })
        });
        return res.json();
    },

    // --- 分离队列操作 ---

    /**
     * 启动仅元数据生成任务
     */
    startMetadataOnlyQueue: async (limit?: number): Promise<QueueActionResult> => {
        const url = limit ? `/api/queue/metadata-only/start?limit=${limit}` : '/api/queue/metadata-only/start';
        const res = await fetch(url, { method: 'POST' });
        return res.json();
    },

    pauseMetadataOnlyQueue: async (): Promise<QueueActionResult> => {
        const res = await fetch('/api/queue/metadata-only/pause', { method: 'POST' });
        return res.json();
    },

    resumeMetadataOnlyQueue: async (): Promise<QueueActionResult> => {
        const res = await fetch('/api/queue/metadata-only/resume', { method: 'POST' });
        return res.json();
    },

    stopMetadataOnlyQueue: async (): Promise<QueueActionResult> => {
        const res = await fetch('/api/queue/metadata-only/stop', { method: 'POST' });
        return res.json();
    },

    /**
     * 启动仅向量生成任务
     */
    startEmbeddingOnlyQueue: async (limit?: number): Promise<QueueActionResult> => {
        const url = limit ? `/api/queue/embedding-only/start?limit=${limit}` : '/api/queue/embedding-only/start';
        const res = await fetch(url, { method: 'POST' });
        return res.json();
    },

    pauseEmbeddingOnlyQueue: async (): Promise<QueueActionResult> => {
        const res = await fetch('/api/queue/embedding-only/pause', { method: 'POST' });
        return res.json();
    },

    resumeEmbeddingOnlyQueue: async (): Promise<QueueActionResult> => {
        const res = await fetch('/api/queue/embedding-only/resume', { method: 'POST' });
        return res.json();
    },

    stopEmbeddingOnlyQueue: async (): Promise<QueueActionResult> => {
        const res = await fetch('/api/queue/embedding-only/stop', { method: 'POST' });
        return res.json();
    }
};
