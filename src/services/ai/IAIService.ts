import { MetadataJSON } from '../../types';

export interface IAIService {
    generateMetadata(artist: string, title: string): Promise<MetadataJSON>;

    /**
     * Batch generate metadata for multiple songs.
     * @param songs Array of songs with {id, title, artist}
     */
    generateBatchMetadata(songs: { id: string | number, title: string, artist: string }[]): Promise<MetadataJSON[]>;
}
