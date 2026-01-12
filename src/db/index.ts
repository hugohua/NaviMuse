import Database from 'better-sqlite3';
import path from 'path';
import * as sqliteVec from 'sqlite-vec';
import { config } from '../config';

// Ensure data directory exists
const dbPath = process.env.DB_PATH || path.join(process.cwd(), 'data', 'navimuse.db');
// You might need to ensure 'data' dir exists in main startup logic, 
// for now we assume it exists or use a simpler path if needed.
// Attempting to use existing setup if any. 'data' folder appeared in src? No, in root.

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// Load sqlite-vec extension
sqliteVec.load(db);

/**
 * 歌曲元数据接口
 * 对应数据库中的 smart_metadata 表
 */
export interface SongMetadata {
    /** Navidrome 原始 UUID (Primary Key) */
    navidrome_id: string;
    /** 歌名 */
    title: string;
    /** 歌手 */
    artist: string;
    /** 专辑名 */
    album?: string;
    /** 时长（秒） */
    duration?: number;
    /** 原始文件路径 */
    file_path: string;

    // --- AI Analysis Data ---
    /** [AI] 歌曲描述 (Deep Analysis) */
    description?: string;
    /** [AI] 风格标签 (存储为 JSON String) */
    tags?: string;
    /** [AI] 情绪/氛围 */
    mood?: string;
    /** [AI] 是否纯音乐 (1: 是, 0: 否) */
    is_instrumental: number;
    /** [AI] 原始向量数据备份 (Binary / Blob) */
    embedding?: Buffer;
    /** 最后一次 AI 分析时间 (ISO8601) */
    last_analyzed?: string;

    // --- Sync Metadata ---
    /** 最后一次 Navidrome 同步时间 */
    last_updated?: string;
    /** 变更检测 Hash */
    hash?: string | null;
}

// Initialize Schema immediately to insure prepared statements work
const createSmartMetadataTable = `
CREATE TABLE IF NOT EXISTS smart_metadata (
    navidrome_id TEXT PRIMARY KEY, -- Navidrome 原始 UUID
    title TEXT NOT NULL,           -- 歌名
    artist TEXT NOT NULL,          -- 歌手
    album TEXT,                    -- 专辑名
    duration INTEGER,              -- 时长（秒）
    file_path TEXT,                -- 原始文件路径
    description TEXT,              -- [AI] 歌曲描述 (Deep Analysis)
    tags TEXT,                     -- [AI] 风格标签 (JSON Array)
    mood TEXT,                     -- [AI] 情绪/氛围
    is_instrumental INTEGER DEFAULT 0, -- [AI] 是否纯音乐 (1:yes, 0:no)
    embedding BLOB,                -- [AI] 原始向量数据备份 (Binary)
    last_analyzed TEXT,            -- 最后一次 AI 分析时间 (ISO8601)
    last_updated TEXT,             -- 最后一次 Navidrome 同步时间
    hash TEXT                      -- 变更检测 Hash
);
`;

const createVecTable = `
CREATE VIRTUAL TABLE IF NOT EXISTS vec_songs USING vec0(
    song_id INTEGER PRIMARY KEY,   -- 对应 smart_metadata 的 rowid
    embedding float[768]           -- 768维向量数据
);
`;

// Schema creation logic moved to initDB to prevent side-effects on import

// Prepared Statements
let insertOrUpdateStmt: Database.Statement;
let getByIdStmt: Database.Statement;
let getAllIdsStmt: Database.Statement;
let updateAnalysisStmt: Database.Statement;
let getPendingSongsStmt: Database.Statement;
let getRowIdStmt: Database.Statement;
let insertVectorStmt: Database.Statement;

export function initDB() {
    try {
        db.exec(createSmartMetadataTable);
        db.exec(createVecTable);

        // Initialize Prepared Statements
        insertOrUpdateStmt = db.prepare(`
            INSERT INTO smart_metadata (
                navidrome_id, title, artist, album, duration, file_path, 
                last_updated, hash
            ) VALUES (
                @navidrome_id, @title, @artist, @album, @duration, @file_path, 
                @last_updated, @hash
            )
            ON CONFLICT(navidrome_id) DO UPDATE SET
                title = @title,
                artist = @artist,
                album = @album,
                duration = @duration,
                file_path = @file_path,
                last_updated = @last_updated,
                hash = @hash
        `);

        getByIdStmt = db.prepare('SELECT * FROM smart_metadata WHERE navidrome_id = ?');
        getAllIdsStmt = db.prepare('SELECT navidrome_id, hash, last_updated FROM smart_metadata');

        updateAnalysisStmt = db.prepare(`
            UPDATE smart_metadata SET
                description = @description,
                tags = @tags,
                mood = @mood,
                is_instrumental = @is_instrumental,
                last_analyzed = @last_analyzed
            WHERE navidrome_id = @navidrome_id
        `);

        getPendingSongsStmt = db.prepare(`
            SELECT navidrome_id, title, artist 
            FROM smart_metadata 
            WHERE last_analyzed IS NULL
            LIMIT ?
        `);

        getRowIdStmt = db.prepare('SELECT rowid FROM smart_metadata WHERE navidrome_id = ?');

        insertVectorStmt = db.prepare(`
            INSERT OR REPLACE INTO vec_songs(song_id, embedding)
            VALUES (@song_id, @embedding) 
        `);

    } catch (err: any) {
        console.error("Failed to initialize database schema.");
        console.error("Error Message:", err.message);
        console.error("Error Code:", err.code);
        throw err;
    }
}

/**
 * 元数据仓库 (Repository)
 * 封装所有对 smart_metadata 和 vec_songs 的数据库操作
 */
export const metadataRepo = {
    saveBasicInfo: (info: SongMetadata) => {
        return insertOrUpdateStmt.run(info);
    },
    updateAnalysis: (id: string, result: { description: string, tags: string[], mood: string, is_instrumental: boolean }) => {
        return updateAnalysisStmt.run({
            navidrome_id: id,
            description: result.description,
            tags: JSON.stringify(result.tags),
            mood: result.mood,
            is_instrumental: result.is_instrumental ? 1 : 0,
            last_analyzed: new Date().toISOString()
        });
    },
    get: (id: string): SongMetadata | undefined => {
        return getByIdStmt.get(id) as SongMetadata;
    },
    getAllIds: (): { navidrome_id: string, hash: string, last_updated: string }[] => {
        return getAllIdsStmt.all() as any[];
    },
    getPendingSongs: (limit: number): { navidrome_id: string, title: string, artist: string }[] => {
        return getPendingSongsStmt.all(limit) as any[];
    },
    // Vector search support
    getSongRowId: (navidromeId: string): number | undefined => {
        const result = getRowIdStmt.get(navidromeId) as { rowid: number } | undefined;
        return result?.rowid;
    },
    /**
     * 保存向量数据到 vec_songs 虚拟表
     * @param songId 歌曲的 numeric rowid (必须与 smart_metadata 的 rowid 一致)
     * @param embedding 768维向量数组
     */
    saveVector: (songId: number, embedding: number[]) => {
        // Ensure input is Float32Array for better-sqlite3 + sqlite-vec serialization
        const buffer = new Float32Array(embedding);
        return insertVectorStmt.run({ song_id: BigInt(songId), embedding: buffer });
    },
    // New Search Method
    searchVectors: (embedding: number[], options: { limit?: number, is_instrumental?: boolean }): (SongMetadata & { distance: number })[] => {
        const limit = options.limit || 50;
        // Over-fetch if filtering to ensure we get enough results
        const k = options.is_instrumental !== undefined ? limit * 5 : limit;
        const buffer = new Float32Array(embedding);

        const stmt = db.prepare(`
            SELECT s.*, v.distance
            FROM vec_songs v
            JOIN smart_metadata s ON v.song_id = s.rowid
            WHERE v.embedding MATCH @embedding
              AND k = @k
              AND (@filter_inst IS NULL OR s.is_instrumental = @filter_inst)
            ORDER BY v.distance ASC
            LIMIT @limit
        `);

        return stmt.all({
            embedding: buffer,
            k: k,
            filter_inst: options.is_instrumental === undefined ? null : (options.is_instrumental ? 1 : 0),
            limit: limit
        }) as (SongMetadata & { distance: number })[];
    }
};
