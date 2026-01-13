import { MetadataJSON } from '../../types';

export interface IAIService {
    generateMetadata(artist: string, title: string): Promise<MetadataJSON>;

    /**
     * Batch generate metadata for multiple songs.
     * @param songs Array of songs with {id, title, artist}
     */
    generateBatchMetadata(songs: { id: string | number, title: string, artist: string }[]): Promise<MetadataJSON[]>;

    /**
     * Rerank a list of songs based on user query
     * @param query User search query
     * @param candidates List of candidate songs
     * @returns Array of song IDs in ranked order
     */
    rerankSongs(query: string, candidates: any[]): Promise<string[]>;

    /**
     * Curate a playlist from candidates based on scene/vibe.
     * @param scenePrompt User instructions
     * @param candidates Candidate songs
     * @param limit Target number of songs
     * @param userProfile Optional user persona context
     */
    curatePlaylist(scenePrompt: string, candidates: any[], limit?: number, userProfile?: any): Promise<import('../../types').CuratorResponse>;
}
