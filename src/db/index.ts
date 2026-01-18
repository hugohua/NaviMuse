import Database from 'better-sqlite3';
import path from 'path';
import * as sqliteVec from 'sqlite-vec';
import { config } from '../config';


// Ensure data directory exists
const dbPath = process.env.DB_PATH || path.join(process.cwd(), 'data', 'navimuse.db');
console.log(`[DB] Initializing Database at: ${dbPath} (CWD: ${process.cwd()})`);

export const db = new Database(dbPath);

// SQLite Performance Optimizations for large databases (1GB+)
db.pragma('journal_mode = WAL');       // 并发读写优化
db.pragma('cache_size = 20000');       // 约 20MB 缓存，大幅提升查询速度
db.pragma('synchronous = NORMAL');     // 性能与安全的平衡点

// Load sqlite-vec extension
try {
    sqliteVec.load(db);
    console.log('[DB] sqlite-vec extension loaded successfully.');
} catch (error: any) {
    console.error('[DB] Failed to load sqlite-vec extension:', error);
}

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

    /** [AI - New] 完整分析数据 (JSON) */
    analysis_json?: string;
    /** [AI - New] 能量值 (1-10) */
    energy_level?: number;
    /** [AI - New] 视觉/经典热度 (0.0-1.0) */
    visual_popularity?: number;
    /** [AI - New] 语言 (CN/EN/etc) */
    language?: string;
    /** [AI - New] 频谱特征 */
    spectrum?: string;
    /** [AI - New] 空间特征 */
    spatial?: string;
    /** [AI - New] 场景标签 */
    scene_tag?: string;
    /** [AI - New] 律动特征 */
    tempo_vibe?: string;
    /** [AI - New] 音色质感 */
    timbre_texture?: string;
    /** [AI - New] 生成该元数据的 AI 模型名称 */
    llm?: string;

    /** 最后一次 AI 分析时间 (ISO8601) */
    last_analyzed?: string;

    /** [System] 处理状态 (PENDING, PROCESSING, COMPLETED, FAILED) */
    processing_status?: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

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
    
    analysis_json TEXT,            -- [AI] 完整分析数据 (JSON)
    energy_level INTEGER,          -- [AI] 能量值 (1-10)
    visual_popularity REAL,        -- [AI] 视觉/经典热度 (0.0-1.0)
    language TEXT,                 -- [AI] 语言
    spectrum TEXT,                 -- [AI] 频谱特征
    spatial TEXT,                  -- [AI] 空间特征
    scene_tag TEXT,                -- [AI] 场景标签
    tempo_vibe TEXT,               -- [AI - New 2026.01] 律动特征
    timbre_texture TEXT,           -- [AI - New 2026.01] 音色质感
    llm TEXT,                      -- [AI] 生成该元数据的 AI 模型名称

    last_analyzed TEXT,            -- 最后一次 AI 分析时间 (ISO8601)
    last_updated TEXT,             -- 最后一次 Navidrome 同步时间
    hash TEXT,                     -- 变更检测 Hash
    processing_status TEXT DEFAULT 'PENDING' -- [System] 处理状态
);

`;

// 向量维度从 config 读取
const getCreateVecTableSQL = (dim: number) => `
CREATE VIRTUAL TABLE IF NOT EXISTS vec_songs USING vec0(
    song_id INTEGER PRIMARY KEY,
    embedding float[${dim}]
);
`;



const createUserProfilesTable = `
CREATE TABLE IF NOT EXISTS user_profiles (
    user_id TEXT PRIMARY KEY,
    json_profile TEXT,
    taste_vector BLOB,
    last_updated TEXT
);
`;

const createUserInteractionsTable = `
CREATE TABLE IF NOT EXISTS user_interactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    navidrome_id TEXT NOT NULL,
    action_type TEXT NOT NULL, -- 'star', 'play', 'skip', 'ban'
    timestamp TEXT NOT NULL
);
`;

const createFtsTable = `
CREATE VIRTUAL TABLE IF NOT EXISTS fts_metadata USING fts5(
    navidrome_id UNINDEXED,
    title, 
    artist, 
    album, 
    description, 
    scene_tag,
    tempo_vibe,
    timbre_texture,
    content='smart_metadata', 
    content_rowid='rowid'
);
`;

const MIGRATIONS = [
    `ALTER TABLE smart_metadata ADD COLUMN analysis_json TEXT;`,
    `ALTER TABLE smart_metadata ADD COLUMN energy_level INTEGER;`,
    `ALTER TABLE smart_metadata ADD COLUMN visual_popularity REAL;`,
    `ALTER TABLE smart_metadata ADD COLUMN language TEXT;`,
    `ALTER TABLE smart_metadata ADD COLUMN spectrum TEXT;`,
    `ALTER TABLE smart_metadata ADD COLUMN spatial TEXT;`,
    `ALTER TABLE smart_metadata ADD COLUMN scene_tag TEXT;`,
    `ALTER TABLE smart_metadata ADD COLUMN llm TEXT;`,
    `ALTER TABLE smart_metadata ADD COLUMN processing_status TEXT DEFAULT 'PENDING';`,
    `CREATE INDEX IF NOT EXISTS idx_smart_metadata_status ON smart_metadata(processing_status);`,
    `CREATE INDEX IF NOT EXISTS idx_smart_metadata_last_analyzed ON smart_metadata(last_analyzed);`,
    `CREATE INDEX IF NOT EXISTS idx_smart_metadata_title_artist ON smart_metadata(title, artist);`,
    `ALTER TABLE smart_metadata ADD COLUMN tempo_vibe TEXT;`,
    `ALTER TABLE smart_metadata ADD COLUMN timbre_texture TEXT;`,
    // 队列分离支持
    `ALTER TABLE smart_metadata ADD COLUMN embedding_status TEXT DEFAULT 'PENDING';`,
    `CREATE INDEX IF NOT EXISTS idx_smart_metadata_embedding_status ON smart_metadata(embedding_status);`,
    // 部分索引：专门为待处理任务优化，只索引符合条件的行，体积极小，查询极快
    `CREATE INDEX IF NOT EXISTS idx_pending_analysis ON smart_metadata(navidrome_id) WHERE last_analyzed IS NULL;`,
    `CREATE INDEX IF NOT EXISTS idx_missing_json ON smart_metadata(navidrome_id) WHERE analysis_json IS NULL;`
];

// Schema creation logic moved to initDB to prevent side-effects on import

// Prepared Statements
let insertOrUpdateStmt: Database.Statement;
let getByIdStmt: Database.Statement;
let getAllIdsStmt: Database.Statement;
let updateAnalysisStmt: Database.Statement;
let getPendingSongsStmt: Database.Statement;
let getPendingEmbeddingsStmt: Database.Statement;
let getRowIdStmt: Database.Statement;
let insertVectorStmt: Database.Statement;

// User Profile Stmts
let upsertProfileStmt: Database.Statement;
let getProfileStmt: Database.Statement;
let logInteractionStmt: Database.Statement;
let getInteractionsStmt: Database.Statement;
let getVectorByNavidromeIdStmt: Database.Statement;

export function initDB() {
    try {
        db.exec(createSmartMetadataTable);



        // 使用配置的维度创建向量表
        db.exec(getCreateVecTableSQL(config.embedding.dimensions));

        db.exec(createFtsTable);
        db.exec(createUserProfilesTable);
        db.exec(createUserInteractionsTable);

        // Simple Migration Logic
        for (const migration of MIGRATIONS) {
            try {
                db.exec(migration);
            } catch (e: any) {
                // Ignore "duplicate column name" error (Code 1) -> Column already exists
                if (!e.message.includes("duplicate column name")) {
                    console.warn("Migration warning:", e.message);
                }
            }
        }

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
                analysis_json = @analysis_json,
                energy_level = @energy_level,
                visual_popularity = @visual_popularity,
                language = @language,
                spectrum = @spectrum,
                spatial = @spatial,
                scene_tag = @scene_tag,
                tempo_vibe = @tempo_vibe,
                timbre_texture = @timbre_texture,
                llm = @llm,
                last_analyzed = @last_analyzed
            WHERE navidrome_id = @navidrome_id
        `);

        // Update just the status
        const updateStatusStmt = db.prepare(`UPDATE smart_metadata SET processing_status = ? WHERE navidrome_id = ?`);


        getPendingSongsStmt = db.prepare(`
            SELECT navidrome_id, title, artist 
            FROM smart_metadata 
            WHERE last_analyzed IS NULL
            LIMIT ?
        `);

        getPendingEmbeddingsStmt = db.prepare(`
            SELECT navidrome_id, title, artist, analysis_json 
            FROM smart_metadata 
            WHERE last_analyzed IS NOT NULL 
              AND (embedding_status IS NULL OR embedding_status = 'PENDING')
            LIMIT ?
        `);

        getRowIdStmt = db.prepare('SELECT rowid FROM smart_metadata WHERE navidrome_id = ?');

        insertVectorStmt = db.prepare(`
            INSERT OR REPLACE INTO vec_songs(song_id, embedding)
            VALUES (@song_id, @embedding) 
        `);

        // User Profile Statements
        upsertProfileStmt = db.prepare(`
            INSERT INTO user_profiles (user_id, json_profile, taste_vector, last_updated)
            VALUES (@user_id, @json_profile, @taste_vector, @last_updated)
            ON CONFLICT(user_id) DO UPDATE SET
                json_profile = @json_profile,
                taste_vector = @taste_vector,
                last_updated = @last_updated
        `);

        getProfileStmt = db.prepare('SELECT * FROM user_profiles WHERE user_id = ?');

        logInteractionStmt = db.prepare(`
            INSERT INTO user_interactions (user_id, navidrome_id, action_type, timestamp)
            VALUES (@user_id, @navidrome_id, @action_type, @timestamp)
        `);

        // Helper to get vector for a song ID (for calculating centroid)
        getVectorByNavidromeIdStmt = db.prepare(`
            SELECT v.embedding
            FROM vec_songs v
            JOIN smart_metadata s ON s.rowid = v.song_id
            WHERE s.navidrome_id = ?
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
    updateAnalysis: (id: string, result: { description: string, tags: string[], mood: string, is_instrumental: boolean, analysis_json?: string, energy_level?: number, visual_popularity?: number, language?: string, spectrum?: string, spatial?: string, scene_tag?: string, tempo_vibe?: string, timbre_texture?: string, llm?: string }) => {
        return updateAnalysisStmt.run({
            navidrome_id: id,
            description: result.description,
            tags: JSON.stringify(result.tags),
            mood: result.mood,
            is_instrumental: result.is_instrumental ? 1 : 0,
            analysis_json: result.analysis_json,
            energy_level: result.energy_level,
            visual_popularity: result.visual_popularity,
            language: result.language,
            spectrum: result.spectrum,
            spatial: result.spatial,
            scene_tag: result.scene_tag,
            tempo_vibe: result.tempo_vibe,
            timbre_texture: result.timbre_texture,
            llm: result.llm,
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
    /**
     * 获取已有元数据但向量未生成的歌曲
     */
    getPendingEmbeddings: (limit: number): { navidrome_id: string, title: string, artist: string, analysis_json: string }[] => {
        return getPendingEmbeddingsStmt.all(limit) as any[];
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
        try {
            db.prepare('DELETE FROM vec_songs WHERE song_id = ?').run(songId);
        } catch (e) {
            // Ignore if not found
        }
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
    },

    // Batch & Transaction Support
    runTransaction<T>(fn: () => T): T {
        try {
            return db.transaction(fn)() as T;
        } catch (error) {
            console.error('[DB] Transaction Failed:', error);
            throw error; // Re-throw to let worker handle it (and mark FAILED)
        }
    },

    updateStatus: (id: string, status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED') => {
        db.prepare(`UPDATE smart_metadata SET processing_status = ? WHERE navidrome_id = ?`).run(status, id);
    },

    updateEmbeddingStatus: (id: string, status: 'PENDING' | 'COMPLETED' | 'FAILED') => {
        db.prepare(`UPDATE smart_metadata SET embedding_status = ? WHERE navidrome_id = ?`).run(status, id);
    },

    /**
     * 重置所有 PROCESSING 状态的记录为 PENDING
     * 用于队列被强制清空时，防止产生脏数据
     */
    resetProcessingStatus: (): number => {
        const result = db.prepare(`
            UPDATE smart_metadata 
            SET processing_status = 'PENDING' 
            WHERE processing_status = 'PROCESSING'
        `).run();
        const count = result.changes;
        if (count > 0) {
            console.log(`[DB] Reset ${count} PROCESSING records back to PENDING`);
        }
        return count;
    },

    /**
     * 重置所有 PROCESSING 状态的 embedding_status 为 PENDING
     */
    resetEmbeddingStatus: (): number => {
        const result = db.prepare(`
            UPDATE smart_metadata 
            SET embedding_status = 'PENDING' 
            WHERE embedding_status = 'PROCESSING'
        `).run();
        const count = result.changes;
        if (count > 0) {
            console.log(`[DB] Reset ${count} embedding PROCESSING records back to PENDING`);
        }
        return count;
    },

    saveBatchAnalysis: (updates: { songId: string, metaUpdate: any, vector?: number[] }[]) => {
        const updateMeta = db.prepare(`
            UPDATE smart_metadata SET
                description = @description,
                tags = @tags,
                mood = @mood,
                is_instrumental = @is_instrumental,
                analysis_json = @analysis_json,
                energy_level = @energy_level,
                visual_popularity = @visual_popularity,
                language = @language,
                spectrum = @spectrum,
                spatial = @spatial,
                scene_tag = @scene_tag,
                tempo_vibe = @tempo_vibe,
                timbre_texture = @timbre_texture,
                llm = @llm,
                last_analyzed = @last_analyzed,
                processing_status = 'COMPLETED'
            WHERE navidrome_id = @navidrome_id
        `);

        // We reuse insertVectorStmt from closure if possible, but variables are block scoped in initDB?
        // Ah, variables were let defined at top level. We can access insertVectorStmt.

        const txn = db.transaction((items) => {
            for (const item of items) {
                // Update Metadata
                updateMeta.run({
                    navidrome_id: item.songId,
                    description: item.metaUpdate.description,
                    tags: JSON.stringify(item.metaUpdate.tags),
                    mood: item.metaUpdate.mood,
                    is_instrumental: item.metaUpdate.is_instrumental ? 1 : 0,
                    analysis_json: item.metaUpdate.analysis_json,
                    energy_level: item.metaUpdate.energy_level,
                    visual_popularity: item.metaUpdate.visual_popularity,
                    language: item.metaUpdate.language,
                    spectrum: item.metaUpdate.spectrum,
                    spatial: item.metaUpdate.spatial,
                    scene_tag: item.metaUpdate.scene_tag,
                    tempo_vibe: item.metaUpdate.tempo_vibe,
                    timbre_texture: item.metaUpdate.timbre_texture,
                    llm: item.metaUpdate.llm,
                    last_analyzed: new Date().toISOString()
                });

                // Update Vector
                if (item.vector) {
                    // We need song rowid
                    const rowIdRes = getRowIdStmt.get(item.songId) as { rowid: number } | undefined;
                    if (rowIdRes) {
                        const buffer = new Float32Array(item.vector);
                        insertVectorStmt.run({ song_id: BigInt(rowIdRes.rowid), embedding: buffer });

                        // Also mark embedding status as COMPLETED
                        db.prepare(`UPDATE smart_metadata SET embedding_status = 'COMPLETED' WHERE navidrome_id = ?`).run(item.songId);
                    }
                }
            }
        });

        txn(updates);
    },

    // Admin / Inspection
    getSongCount: (filter?: 'all' | 'no_metadata' | 'no_vector'): number => {
        let sql = 'SELECT COUNT(*) as count FROM smart_metadata';
        if (filter === 'no_metadata') {
            sql += " WHERE analysis_json IS NULL OR analysis_json = ''";
        } else if (filter === 'no_vector') {
            // Check missing embedding or pending embedding status
            sql += " WHERE (embedding_status IS NULL OR embedding_status = 'PENDING') AND analysis_json IS NOT NULL";
        }

        const result = db.prepare(sql).get() as { count: number };
        return result.count;
    },

    getPaginatedSongs: (limit: number, offset: number, filter?: 'all' | 'no_metadata' | 'no_vector'): SongMetadata[] => {
        let sql = 'SELECT * FROM smart_metadata';

        if (filter === 'no_metadata') {
            sql += " WHERE analysis_json IS NULL OR analysis_json = ''";
        } else if (filter === 'no_vector') {
            sql += " WHERE (embedding_status IS NULL OR embedding_status = 'PENDING') AND analysis_json IS NOT NULL";
        }

        sql += ' ORDER BY last_analyzed DESC LIMIT ? OFFSET ?';

        return db.prepare(sql).all(limit, offset) as SongMetadata[];
    },

    getSongsByIds: (ids: string[]): { navidrome_id: string, title: string, artist: string, analysis_json?: string }[] => {
        if (ids.length === 0) return [];
        const placeholders = ids.map(() => '?').join(',');
        const sql = `SELECT navidrome_id, title, artist, analysis_json FROM smart_metadata WHERE navidrome_id IN (${placeholders})`;
        return db.prepare(sql).all(...ids) as any[];
    }
};

export const userProfileRepo = {
    upsertProfile: (userId: string, profile: { json: string, vector: Float32Array }) => {
        return upsertProfileStmt.run({
            user_id: userId,
            json_profile: profile.json,
            taste_vector: Buffer.from(profile.vector.buffer, profile.vector.byteOffset, profile.vector.byteLength),
            last_updated: new Date().toISOString()
        });
    },
    getProfile: (userId: string) => {
        const row = getProfileStmt.get(userId) as any;
        if (!row) return null;
        return {
            userId: row.user_id,
            jsonProfile: row.json_profile,
            tasteVector: new Float32Array(row.taste_vector.buffer ? row.taste_vector.buffer : row.taste_vector), // Handle buffer
            lastUpdated: row.last_updated
        };
    },
    logInteraction: (userId: string, navidromeId: string, action: 'star' | 'play' | 'skip' | 'ban') => {
        return logInteractionStmt.run({
            user_id: userId,
            navidrome_id: navidromeId,
            action_type: action,
            timestamp: new Date().toISOString()
        });
    },
    getSongVector: (navidromeId: string): Float32Array | null => {
        const row = getVectorByNavidromeIdStmt.get(navidromeId) as any;
        if (!row || !row.embedding) return null;
        // sqlite-vec returns Float32Array usually, or Buffer depending on driver.
        // better-sqlite3 with sqlite-vec usually returns Float32Array if configured, or Buffer.
        // Let's assume Buffer and convert.
        return new Float32Array(row.embedding.buffer ? row.embedding.buffer : row.embedding);
    }
};

const createSystemSettingsTable = `
CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TEXT
);
`;

// Initialize settings table first
try {
    db.exec(createSystemSettingsTable);
} catch (e: any) {
    console.error("[DB] Failed to create system_settings table:", e);
}

const upsertSettingStmt = db.prepare(`
    INSERT INTO system_settings (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at
`);

const getSettingStmt = db.prepare('SELECT value FROM system_settings WHERE key = ?');

export const systemRepo = {
    getSetting: (key: string): string | null => {
        const result = getSettingStmt.get(key) as { value: string } | undefined;
        return result ? result.value : null;
    },
    setSetting: (key: string, value: string) => {
        return upsertSettingStmt.run(key, value, new Date().toISOString());
    },
    getAllSettings: (): Record<string, string> => {
        const rows = db.prepare('SELECT key, value FROM system_settings').all() as { key: string, value: string }[];
        return rows.reduce((acc, row) => ({ ...acc, [row.key]: row.value }), {});
    }
};
