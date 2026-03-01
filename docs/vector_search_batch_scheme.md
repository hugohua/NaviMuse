# 向量搜索 Batch 提交方案技术文档
> **Target Audience**: AI Engineers, Backend Developers, & LLM Agents
> **Purpose**: Standardize the process of batch AI analysis and vector generation for large-scale datasets.

## 1. 概述 (Overview)

本方案定义了一套基于 **Batch API** 的异步处理流水线，用于解决大规模数据（如数万首歌曲元数据）的 AI 语义增强与向量化问题。
相比实时 (Real-time) API 调用，Batch 模式具有以下优势：
- **高吞吐**: 支持百万级 Token 的批量提交。
- **低成本**: 通常提供 50% 的价格折扣。
- **稳定性**: 避免触发 "Too Many Requests" (429) 限流错误。
- **原子性**: 只有当任务完成时才下载结果，简化了状态管理。

---

## 2. 架构流程 (Architecture)

本方案采用 **ETL (Extract-Transform-Load)** 模式，分为四个独立阶段：

```mermaid
graph TD
    DB[(SQLite/DB)]
    
    subgraph Phase 1: Export
    DB -->|Read Pending Items| Script_Export[batch-export.ts]
    Script_Export -->|Generate| File_Input[batch_xxx.jsonl]
    end
    
    subgraph Phase 2: Submit
    File_Input -->|Upload & Create Batch| Cloud_API[Cloud Batch API]
    Cloud_API -->|Processing (24h Window)| Cloud_Queue
    end
    
    subgraph Phase 3: Import
    Cloud_Queue -->|Status Check| Script_Import[batch-import.ts]
    Script_Import -->|Download Result| File_Output[batch_xxx_output.jsonl]
    File_Output -->|Parse & Validate| Script_Import
    Script_Import -->|Update Metadata| DB
    end
    
    subgraph Phase 4: Vectorize
    DB -->|Read Analyzed Meta| Script_Embed[batch-embeddings.ts]
    Script_Embed -->|Text to Vector| Embedding_Model[Text Embedding API]
    Embedding_Model -->|Write Vector| Vector_DB[(Vector Table)]
    end
```

---

## 3. 协议规范 (Protocol Specification)

### 3.1 Batch 文件格式 (JSONL)

符合 OpenAI / DashScope Batch API 标准。每行是一个完整的 JSON 对象。

**File Structure**: `data/batch/batch_{id}.jsonl`

**Line Schema (TypeScript)**:
```typescript
interface BatchRequestLine {
  custom_id: string;      // 唯一标识符，建议格式 "batch_{global_index}"
  method: "POST";         // 固定
  url: "/v1/chat/completions"; // 固定
  body: {
    model: string;        // e.g., "qwen-plus"
    messages: [
      { role: "system", content: string }, // 定义输出 JSON 结构的 Prompt
      { role: "user", content: string }    // 包含多条数据的 JSON 字符串
    ];
    temperature: number;  // 建议 0.5
  };
}
```

**Payload Example**:
Request Body 的 `user` content 实际上是一个**数组**，将 10-20 条记录打包在一个 Request 中，以减少 Overhead。

```json
{"custom_id": "batch_101", "method": "POST", "url": "/v1/chat/completions", "body": {"model": "qwen-plus", "messages": [{"role": "system", "content": "..."}, {"role": "user", "content": "[{\"id\":\"uuid-1\",\"title\":\"Song A\"},{\"id\":\"uuid-2\",\"title\":\"Song B\"}]"}]}}
```

### 3.2 核心数据结构 (Core Data Structures)

LLM（大模型）解析的核心是 `System Prompt` 定义的输出 Schema。
为了支持精细的向量搜索，我们定义了以下结构：

#### 输入 (Request Payload)
传递给 LLM 的轻量级数据：
```typescript
interface SongInput {
  id: string;    // 原始 ID
  title: string; // 标题
  artist: string;// 艺术家
  // 可选: album, lyrics_snippet 等
}
```

#### 输出 (Response Schema)
LLM 必须输出符合以下定义的 **JSON Array**：

```typescript
interface SongAnalysisResult {
  id: string | number; // 必须回传 ID 以便匹配

  // [关键] 用于生成向量的锚点描述 (Vector Anchor)
  // 必须是嵌套对象，禁止扁平化字符串
  vector_anchor: {
    acoustic_model: string;   // 物理声学特征 (e.g. "Analog warmth, mid-range saturation")
    semantic_push: string;    // 意境推力 (e.g. "Urban isolation, late night neon")
    cultural_weight: string;  // 文化权重 (e.g. "90s Mandopop classic")
  };

  // [关键] 用于过滤的结构化标签 (Filtering Tags)
  embedding_tags: {
    spectrum: "High" | "Mid" | "Low" | "Full";
    spatial: "Dry" | "Wet" | "Huge" | "Intimate";
    energy: number;           // 1-10
    tempo_vibe: string;       // e.g. "Driving", "Static"
    timbre_texture: string;   // e.g. "Organic", "Electronic"
    mood_coord: string[];     // e.g. ["Melancholic", "Nostalgic"]
    objects: string[];        // e.g. ["Piano", "Rain"]
    scene_tag: string;        // e.g. "Night Focus"
  };

  // 辅助元数据
  is_instrumental: boolean;
  language: "CN" | "EN" | "JP" | "KR" | "Other";
  popularity_raw: number;     // 0.0 - 1.0 (用于排序加权)
}
```

---

## 4. 详细实施步骤 (Implementation Steps)

### Phase 1: 批量导出 (Export)
**Script**: `scripts/batch-export.ts`

1.  **Select**: 从数据库查询 `last_analyzed IS NULL` 的记录。
2.  **Pack**: 每 `10` 条记录打包为一个 `user_message`。
3.  **Format**: 封装为 Batch JSONL 格式。
4.  **Save**: 每 `10,000` 个请求保存为一个 `.jsonl` 文件 (安全边界)。
5.  **Mapping**: 创建/更新 `batch_mapping.json`，维护 `batch_id` -> `[song_ids]` 的映射关系，防止 LLM 没有按顺序返回 ID。

### Phase 2: 任务提交 (Submit)
**Script**: `scripts/batch-submit.ts`

1.  **Agent Logic**: 遍历 `data/batch/` 目录下的 `.jsonl` 文件。
2.  **Upload**: 调用 `client.files.create({ file, purpose: 'batch' })`。
3.  **Create Job**: 调用 `client.batches.create({ input_file_id, endpoint, completion_window: '24h' })`。
4.  **Track**: 将 `job_id`, `file_name`, `status` 记录在 `batch_jobs.json`。

### Phase 3: 结果回落 (Import)
**Script**: `scripts/batch-import.ts`

1.  **Poll Status**: 定期检查任务状态 (`client.batches.retrieve`).
2.  **Download**: 当状态为 `completed`，获取 `output_file_id` 并下载内容 (`client.files.content`).
3.  **Parsers (Robustness)**:
    *   **Strip Markdown**: 移除 ` ```json ` 标记。
    *   **JSON Repair**: 如果 LLM 返回无效 JSON（如截断），尝试使用正则修复或 `json5` 解析。
    *   **ID Recovery**: 优先使用 JSON 中的 ID。如果缺失，回退使用 `batch_mapping.json` 中的顺序索引。
4.  **Update DB**: 将 `vector_anchor`, `embedding_tags` 等存入 `analysis_json` 字段。设置 `processing_status = 'COMPLETED'`，`embedding_status = 'PENDING'`。

### Phase 4: 向量生成 (Vectorization)
**Script**: `scripts/batch-embeddings.ts`

此阶段将结构化的文本描述转换为数学向量。

1.  **Fetch**: 查询 `embedding_status = 'PENDING'` 的记录。
2.  **Construct Prompt**:
    将 `analysis_json` 扁平化为一段富文本：
    ```text
    Title: {title}
    Artist: {artist}
    Acoustic: {vector_anchor.acoustic_model}
    Imagery: {vector_anchor.semantic_push}
    ...
    ```
3.  **Embed**: 调用文本嵌入模型 (e.g., `text-embedding-v3` 或 `uvte-large`) 生成 `768/1024` 维向量。
4.  **Store**: 写入向量数据库 (如 `sqlite-vec`, `pgvector`)。

---

## 5. 云厂商 API 参考 (Cloud API Reference)

### OpenAI / DashScope (Aliyun)

本方案代码兼容 OpenAI SDK。

**Endpoint**: `https://dashscope.aliyuncs.com/compatible-mode/v1` (or `https://api.openai.com/v1`)

| Action | SDK Method | Note |
| :--- | :--- | :--- |
| **Upload** | `client.files.create` | `purpose: "batch"` is required |
| **Create** | `client.batches.create` | `completion_window` usually "24h" |
| **Check** | `client.batches.retrieve` | Check `status` ("completed", "failed") |
| **Download** | `client.files.content` | Returns the output JSONL string |

### 代码示例 (Requirements)

其他项目在实现时，需确保环境包含以下依赖：
```json
{
  "dependencies": {
    "openai": "^4.0.0",
    "json5": "^2.0.0",
    "dotenv": "^16.0.0"
  }
}
```

## 6. 常见问题 (FAQ)

### Q1: 为什么不每首歌一个请求？
A: Batch API 对每个文件及每个请求有 Overhead。将 10 首歌打包为一个 Prompt 可以显著减少 Token 开销（共享 System Prompt）并提高并发处理效率。

### Q2: 如何处理 LLM JSON 格式错误？
A: 在 Phase 3 中必须实现容错逻辑。建议：
1. 使用 `json5` 库（支持更宽松的 JSON 格式）。
2. 使用正则表达式提取 `{...}` 块。
3. 如果解析失败，标记该记录为 `FAILED` 并在下次 Export 时利用 `--reprocess` 模式重试。

### Q3: 向量生成的文本为什么要重组？
A: LLM 生成的 JSON 是为了**结构化存储**和**前端展示**。生成向量时，应该根据 Embedding 模型的敏感度，去除 JSON 符号，仅保留强语义的自然语言描述（Positive Construct）。
