# 数据流水线使用指南 (Data Pipeline Guide)

NaviMuse 核心数据流水线负责将你的 Navidrome 音乐库转化为可被 AI 理解和搜索的向量数据库。该过程通过 `scripts/start-full-scan.ts` 脚本驱动。

## 1. 核心流程

整个处理流程为闭环设计，包含三个阶段：

1.  **同步 (Sync)**: 从 Navidrome API 拉取所有歌曲的基础元数据（歌名、歌手、路径等）到本地数据库。
2.  **调度 (Scheduling)**: 扫描本地数据库，找出尚未分析或需要更新的歌曲，将其打包推入任务队列。
3.  **处理 (Processing)**: 启动 Worker 消费队列，调用 AI 生成描述、情绪、风格标签，并生成向量嵌入 (Embedding)。

## 2. 环境准备

在运行脚本前，请确保：

1.  **Redis 服务已启动**: 脚本依赖 Redis 作为任务队列。
    *   默认地址: `127.0.0.1:6379`
2.  **环境变量配置**: 项目根目录 `.env` 文件需包含：
    ```env
    # Navidrome 连接
    ND_URL=http://localhost:4533
    ND_USER=admin
    ND_PASS=password
    
    # AI 配置 (Gemini for Embeddings)
    AI_PROVIDER=gemini
    OPENAI_API_KEY=your_gemini_key
    ```

## 3. 运行指南

建议使用 `npx ts-node` 直接运行 TypeScript 脚本。

### 3.1 完整运行 (推荐)

执行全量流程：同步 -> 调度 -> 分析。这是初始化通过或定期更新的标准方式。

```bash
npx ts-node --project tsconfig.server.json scripts/start-full-scan.ts
```

**预期输出**:
```text
=== Starting Metadata Pipeline ===
Mode: Full Pipeline
...
[Step 1/3] Syncing from Navidrome...
Sync Complete.
[Step 2/3] Scheduling Work...
Found 50 songs pending analysis.
[Step 3/3] Processing Queue...
[Queue Status] Waiting: 45, Active: 5, Completed: 0, Failed: 0
```

### 3.2 仅同步数据 (Skip Analysis)

如果只想快速拉取 Navidrome 的最新歌曲列表，而不消耗 AI Token 进行分析：

```bash
npx ts-node --project tsconfig.server.json scripts/start-full-scan.ts --only-sync
```

### 3.3 仅处理队列 (Skip Sync)

如果同步已完成（或意外中断），只想继续处理数据库中积压的“待分析”歌曲：

```bash
npx ts-node --project tsconfig.server.json scripts/start-full-scan.ts --only-process
```

### 3.4 限制同步数量 (Limit Sync)

首次运行或调试时，为了避免一次性拉取过多数据，可以使用 `--limit` 参数限制从 Navidrome 获取的歌曲数量：

```bash
# 仅同步前 100 首歌曲并进行处理
npx ts-node --project tsconfig.server.json scripts/start-full-scan.ts --limit 100
```

## 4. 常见问题

*   **Q: 速度很慢？**
    *   限制因素通常是 AI API 的速率限制 (Rate Limit)。脚本内部 Worker 默认配置了并发控制（如 Gemini 免费版每分钟请求限制）。
*   **Q: 报错 `AI_PROVIDER` missing?**
    *   请检查 `.env` 文件。脚本默认会读取 `AI_PROVIDER` 或回退到 gemini，但建议显式配置。
*   **Q: 内存占用过高？**
    *   调度阶段会分批次 `100k` 读取 ID，通常不会有问题。如果库非常大，请确保 Node.js 有足够的堆内存 (`--max-old-space-size`).
