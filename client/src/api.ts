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
    }
};
