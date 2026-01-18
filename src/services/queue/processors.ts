import { AIFactory } from '../ai/AIFactory';
import { EmbeddingService } from '../ai/EmbeddingService';
import { metadataRepo } from '../../db';

export interface SongData {
    navidrome_id: string;
    title: string;
    artist: string;
    analysis_json?: string; // For Embedding Only
}

/**
 * 完整流程：元数据生成 + 向量化
 */
export const processFullAnalysisBatch = async (songs: SongData[], onProgress?: (msg: string) => void) => {
    // 0. Mark as Processing
    metadataRepo.runTransaction(() => {
        for (const song of songs) {
            metadataRepo.updateStatus(song.navidrome_id, 'PROCESSING');
        }
    });

    const aiService = AIFactory.getService();
    const embeddingService = new EmbeddingService();

    // --- Phase 1: Metadata Generation ---
    if (onProgress) onProgress('Generating Metadata...');
    const results = await aiService.generateBatchMetadata(songs.map(s => ({
        id: s.navidrome_id,
        title: s.title,
        artist: s.artist
    })));

    // --- Phase 2: Prepare Updates & Vector Texts ---
    const updates: {
        songId: string,
        metaUpdate: any,
        vectorText?: string
    }[] = [];

    for (const result of results) {
        const songId = result.id ? String(result.id) : null;
        if (!songId) continue;

        const inputSong = songs.find(s => s.navidrome_id === songId);
        const analysisJson = JSON.stringify(result);

        const acoustic = result.vector_anchor?.acoustic_model || "";
        const semantic = result.vector_anchor?.semantic_push || "";
        const description = `${acoustic}\n\n[Imagery] ${semantic}`;

        const tags = [
            ...(result.embedding_tags?.mood_coord || []),
            ...(result.embedding_tags?.objects || [])
        ];
        if (result.embedding_tags?.scene_tag) tags.push(result.embedding_tags.scene_tag);
        if (result.embedding_tags?.spectrum) tags.push(`#Spectrum:${result.embedding_tags.spectrum}`);

        const metaUpdate = {
            description: description,
            tags: tags,
            mood: (result.embedding_tags?.mood_coord || [])[0] || "Unknown",
            is_instrumental: result.is_instrumental ? 1 : 0,
            analysis_json: analysisJson,
            energy_level: result.embedding_tags?.energy,
            visual_popularity: result.popularity_raw,
            language: result.language,
            spectrum: result.embedding_tags?.spectrum,
            spatial: result.embedding_tags?.spatial,
            scene_tag: result.embedding_tags?.scene_tag,
            tempo_vibe: result.embedding_tags?.tempo_vibe,
            timbre_texture: result.embedding_tags?.timbre_texture,
            llm: result.llm_model
        };

        let vectorText = undefined;
        if (inputSong) {
            vectorText = EmbeddingService.constructVectorText(result, {
                title: inputSong.title,
                artist: inputSong.artist,
                genre: (result.embedding_tags?.objects || []).find(t => t.includes('Genre') || t.includes('Style')) || ""
            });
        }

        updates.push({ songId, metaUpdate, vectorText });
    }

    // --- Phase 3: Batch Vector Embedding ---
    const validVectorTexts = updates.filter(u => u.vectorText).map(u => u.vectorText!);
    let vectors: number[][] = [];

    if (validVectorTexts.length > 0) {
        if (onProgress) onProgress(`Generating Embeddings for ${validVectorTexts.length} items...`);
        try {
            vectors = await embeddingService.embedBatch(validVectorTexts);
        } catch (err) {
            console.error("Batch Embedding Failed, skipping vector save:", err);
        }
    }

    // --- Phase 4: Commit to DB ---
    let vecIndex = 0;
    const batchData = updates.map(u => {
        let vector: number[] | undefined = undefined;
        if (u.vectorText && vectors[vecIndex]) {
            vector = vectors[vecIndex];
            vecIndex++;
        }
        return {
            songId: u.songId,
            metaUpdate: u.metaUpdate,
            vector: vector
        };
    });

    if (batchData.length > 0) {
        metadataRepo.saveBatchAnalysis(batchData);
    }

    return { count: batchData.length };
};

/**
 * 仅元数据生成
 */
export const processMetadataOnlyBatch = async (songs: SongData[], onProgress?: (msg: string) => void) => {
    // 1. Mark as Processing
    metadataRepo.runTransaction(() => {
        for (const song of songs) {
            metadataRepo.updateStatus(song.navidrome_id, 'PROCESSING');
        }
    });

    // 2. AI Generation
    const aiService = AIFactory.getService();
    if (onProgress) onProgress('Generating Metadata...');

    const results = await aiService.generateBatchMetadata(songs.map(s => ({
        id: s.navidrome_id,
        title: s.title,
        artist: s.artist
    })));

    // 3. Save (No Vector)
    for (const result of results) {
        const songId = result.id ? String(result.id) : null;
        if (!songId) continue;

        const analysisJson = JSON.stringify(result);
        const acoustic = result.vector_anchor?.acoustic_model || "";
        const semantic = result.vector_anchor?.semantic_push || "";
        const description = `${acoustic}\n\n[Imagery] ${semantic}`;

        const tags = [
            ...(result.embedding_tags?.mood_coord || []),
            ...(result.embedding_tags?.objects || [])
        ];
        if (result.embedding_tags?.scene_tag) tags.push(result.embedding_tags.scene_tag);

        metadataRepo.updateAnalysis(songId, {
            description,
            tags,
            mood: (result.embedding_tags?.mood_coord || [])[0] || "Unknown",
            is_instrumental: result.is_instrumental === true,
            analysis_json: analysisJson,
            energy_level: result.embedding_tags?.energy,
            visual_popularity: result.popularity_raw,
            language: result.language,
            spectrum: result.embedding_tags?.spectrum,
            spatial: result.embedding_tags?.spatial,
            scene_tag: result.embedding_tags?.scene_tag,
            tempo_vibe: result.embedding_tags?.tempo_vibe,
            timbre_texture: result.embedding_tags?.timbre_texture,
            llm: result.llm_model
        });

        metadataRepo.updateEmbeddingStatus(songId, 'PENDING');
        metadataRepo.updateStatus(songId, 'COMPLETED');
    }

    return { count: results.length };
};

/**
 * 仅向量生成
 */
export const processEmbeddingOnlyBatch = async (songs: SongData[], onProgress?: (msg: string) => void) => {
    const embeddingService = new EmbeddingService();
    let successCount = 0;

    if (onProgress) onProgress('Generating Embeddings...');

    for (const song of songs) {
        try {
            if (!song.analysis_json) {
                console.warn(`[Processor] No analysis_json for ${song.title}, skipping embedding.`);
                continue;
            }

            const analysisData = JSON.parse(song.analysis_json);
            const vectorText = EmbeddingService.constructVectorText(analysisData, {
                title: song.title,
                artist: song.artist
            });

            const vector = await embeddingService.embed(vectorText);

            const rowId = metadataRepo.getSongRowId(song.navidrome_id);
            if (rowId) {
                metadataRepo.saveVector(rowId, vector);
                metadataRepo.updateEmbeddingStatus(song.navidrome_id, 'COMPLETED');
                successCount++;
            }
        } catch (error: any) {
            console.error(`[Processor] Embedding Failed for ${song.title}: ${error.message}`);
            metadataRepo.updateEmbeddingStatus(song.navidrome_id, 'FAILED');
        }
    }

    return { count: successCount, total: songs.length };
};
