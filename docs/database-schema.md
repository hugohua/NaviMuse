# 数据库结构说明 (Database Schema)

NaviMuse 使用 SQLite (`data/navimuse.db`) 作为本地数据存储。如果你使用数据库管理工具打开，可能会看到多个以 `vec_` 开头的表。

**结论**: 这些表**都不是**历史遗留表。它们由两部分组成：核心业务表 + 向量引擎内部表。

## 1. 核心业务表 (Core Tables)

### `smart_metadata`
**用途**: 核心数据表，存储从 Navidrome 同步过来的歌曲元数据以及 AI 分析结果。
**关键字段**:
*   `navidrome_id` (TEXT, PK): 对应 Navidrome 数据库中的歌曲 ID (UUID)。
*   `title`, `artist`, `album`: 基础歌曲信息。
*   `description`: **[AI]** 歌曲的深层语义描述 (如 "适合雨天听的悲伤钢琴曲")。
*   `tags`: **[AI]** 风格标签 (JSON 数组, 如 `["Jazz", "Relaxing"]`)。
*   `mood`: **[AI]** 情绪标签。
*   `embedding`: (BLOB) 原始向量数据的二进制存储（备份用）。
*   `last_analyzed`: 标记最后一次 AI 分析的时间。如果为 `NULL`，说明还在等待处理队列。

## 2. 向量搜索表 (Vector Search Tables)

NaviMuse 使用 `sqlite-vec` 扩展来实现本地向量搜索。当你创建一个 `VIRTUAL TABLE` 时，SQLite 会自动创建多个 "Shadow Tables"（影子表）来存储索引数据。

### `vec_songs` (Virtual Table)
**用途**: 虚拟表接口，用于执行向量相似度查询 (KNN Search)。
**结构**:
*   `song_id`: 对应 `smart_metadata` 表的内部 `rowid`。
*   `embedding`: 768维浮点数向量。

### `vec_songs_*` (Internal Shadow Tables)
**用途**: 这些是 `sqlite-vec` 自动生成的**内部存储表**，用户**不需要也不应该**手动修改它们。它们支撑了 `vec_songs` 的索引功能。
*   `vec_songs_rowids`: 存储行 ID 映射。
*   `vec_songs_chunks`: 存储向量数据的分片。
*   `vec_songs_info`: 存储索引的元数据。
*   `vec_songs_vector_chunks00`: 具体的向量索引数据块。

> **注意**: 如果删除了这些 `vec_` 开头的表，你的向量搜索功能将会失效，需要重新生成索引。
