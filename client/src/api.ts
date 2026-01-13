import type { DiscoveryMode, CuratorResponse, ApiResponse, TagCategory } from './types';

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
    generatePlaylist: async (prompt: string, mode: DiscoveryMode, userProfile?: import('./types').UserProfile): Promise<CuratorResponse> => {
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
    analyzeUserProfile: async (): Promise<import('./types').UserProfile> => {
        const res = await fetch('/api/profile/analyze', {
            method: 'POST'
        });
        const json: ApiResponse = await res.json();

        if (!json.success || !json.data) {
            throw new Error(json.error || 'Unknown error for profile analysis');
        }

        return json.data as unknown as import('./types').UserProfile;
    },

    /**
     * Get Playlists
     */
    getPlaylists: async (): Promise<import('./types').Playlist[]> => {
        const res = await fetch('/api/playlists');
        if (!res.ok) {
            throw new Error(`Failed to fetch playlists: ${res.statusText}`);
        }
        return res.json();
    },

    /**
     * Get Playlist Details
     */
    getPlaylist: async (id: string): Promise<import('./types').PlaylistDetail> => {
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

    getAdminSongs: async (page: number = 1, limit: number = 50): Promise<{
        data: any[], // detailed metadata
        pagination: { total: number, page: number, limit: number, totalPages: number }
    }> => {
        const res = await fetch(`/api/admin/songs?page=${page}&limit=${limit}`);
        if (!res.ok) {
            throw new Error(`Failed to fetch songs: ${res.statusText}`);
        }
        return res.json();
    }
};

// --- Queue Types ---
export interface QueueStatus {
    isPaused: boolean;
    isWorkerRunning: boolean;
    activeJobs: number;
    waitingJobs: number;
    completedJobs: number;
    failedJobs: number;
    delayedJobs: number;
    pendingSongs: number;
    totalSongs: number;
    pipelineState?: 'idle' | 'syncing' | 'enqueuing';
}

export interface QueueActionResult {
    success: boolean;
    message: string;
    pendingCount?: number;
    jobsCreated?: number;
    dryRun?: boolean;
}
