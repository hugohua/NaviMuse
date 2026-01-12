import Database from 'better-sqlite3';
import path from 'path';
import * as sqliteVec from 'sqlite-vec';
import { config } from '../config';

// Ensure data directory exists
const dbPath = path.join(process.cwd(), 'data', 'navimuse.db');
// You might need to ensure 'data' dir exists in main startup logic, 
// for now we assume it exists or use a simpler path if needed.
// Attempting to use existing setup if any. 'data' folder appeared in src? No, in root.

export const db = new Database(dbPath, { verbose: console.log });
db.pragma('journal_mode = WAL');

// Load sqlite-vec extension
sqliteVec.load(db);

/**
 * 歌曲元数据接口
 * 对应数据库中的 smart_metadata 表
 */
export interface SongMetadata {
    /** Navidrome 中的唯一 ID (通常是 uuid) */
    navidrome_id: string;
    title: string;
    artist: string;
    album?: string;
    duration?: number;
    file_path: string;
    /** AI 生成的歌曲描述 */
    description?: string;
    /** JSON 字符串格式的标签数组 */
    tags?: string;
    /** AI 分析的情绪/氛围 */
    mood?: string;
    /** 是否为纯音乐 (1: 是, 0: 否) */
    is_instrumental: number;
    /** 768维向量数据的 Buffer */
    embedding?: Buffer;
    /** 最后一次分析的时间 (ISO String) */
    last_analyzed?: string;
    /** 最后一次同步更新的时间 (ISO String) */
    last_updated?: string;
    /** 文件哈希用于检测变更 */
    hash?: string | null;
}

// Initialize Schema immediately to insure prepared statements work
const createSmartMetadataTable = `
CREATE TABLE IF NOT EXISTS smart_metadata (
    navidrome_id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    artist TEXT NOT NULL,
    album TEXT,
    duration INTEGER,
    file_path TEXT,
    description TEXT,
    tags TEXT,
    mood TEXT,
    is_instrumental INTEGER DEFAULT 0,
    embedding BLOB,
    last_analyzed TEXT,
    last_updated TEXT,
    hash TEXT
);
`;

const createVecTable = `
CREATE VIRTUAL TABLE IF NOT EXISTS vec_songs USING vec0(
    song_id INTEGER PRIMARY KEY,
    embedding float[768]
);
`;

// Schema creation logic moved to initDB to prevent side-effects on import

export function initDB() {
    try {
        console.log("Initializing database schema...");

        console.log("Creating smart_metadata table...");
        db.exec(`
        CREATE TABLE IF NOT EXISTS smart_metadata (
            navidrome_id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            artist TEXT NOT NULL,
            album TEXT,
            duration INTEGER,
            file_path TEXT,
            description TEXT,
            tags TEXT, 
            mood TEXT,
            is_instrumental INTEGER DEFAULT 0,
            embedding BLOB,
            last_analyzed TEXT,
            last_updated TEXT,
            hash TEXT
        );
        `);
        console.log("smart_metadata table created/verified.");

        console.log("Creating vec_songs virtual table...");
        db.exec("DROP TABLE IF EXISTS vec_songs;");
        db.exec(createVecTable);
        console.log("vec_songs virtual table created (force recreated).");

    } catch (err: any) {
        console.error("Failed to initialize database schema.");
        console.error("Error Message:", err.message);
        console.error("Error Code:", err.code);
        throw err;
    }
}

// Prepare statements for performance
// Now this is safe because table exists
console.log("Preparing insertOrUpdateStmt...");
const insertOrUpdateStmt = db.prepare(`
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

console.log("Preparing getByIdStmt...");
const getByIdStmt = db.prepare('SELECT * FROM smart_metadata WHERE navidrome_id = ?');
const getAllIdsStmt = db.prepare('SELECT navidrome_id, hash, last_updated FROM smart_metadata');

console.log("Preparing updateAnalysisStmt...");
console.log("Preparing updateAnalysisStmt...");
const updateAnalysisStmt = db.prepare(`
    UPDATE smart_metadata SET
        description = @description,
        tags = @tags,
        mood = @mood,
        is_instrumental = @is_instrumental,
        last_analyzed = @last_analyzed
    WHERE navidrome_id = @navidrome_id
`);

const getPendingSongsStmt = db.prepare(`
    SELECT navidrome_id, title, artist 
    FROM smart_metadata 
    WHERE last_analyzed IS NULL
LIMIT ?
    `);

const getRowIdStmt = db.prepare('SELECT rowid FROM smart_metadata WHERE navidrome_id = ?');
// Vector Table Insert
const insertVectorStmt = db.prepare(`
    INSERT OR REPLACE INTO vec_songs(song_id, embedding)
    VALUES (@song_id, @embedding) 
`);

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
        return insertVectorStmt.run({ song_id: songId, embedding: buffer });
    }
};
