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
}
