# NaviMuse 队列系统 - 实现蓝图

> **De-Frameworked Core Logic** - 从 BullMQ/Express 中提取的纯业务逻辑

---

## Module: 任务队列核心系统

### 0. Node.js 依赖 (npm packages)

| Package | Version | Purpose |
|---------|---------|---------|
| `bullmq` | ^5.66.5 | 分布式任务队列 (基于 Redis) |
| `ioredis` | ^5.9.1 | Redis 客户端 |
| `@bull-board/api` | ^6.16.2 | 队列监控 Dashboard API |
| `@bull-board/express` | ^6.16.2 | 队列监控 Express 适配器 |

```bash
# 安装
npm install bullmq ioredis @bull-board/api @bull-board/express
```

**运行时依赖**:
- Redis Server >= 6.0 (推荐 7.x)

---

### 1. Context

本模块实现了一个**多管道批量任务处理系统**，核心用途：
- 控制 AI API 调用速率（Rate Limiting）
- 实现分布式任务队列（可横向扩展 Worker）
- 智能熔断器（Quota 耗尽时自动休眠）

**队列类型**:
| 队列名 | 职责 | API 调用数/Job |
|--------|------|----------------|
| `metadata-generation` | 完整流程 (元数据 + 向量) | 2 |
| `metadata-only` | 仅元数据生成 | 1 |
| `embedding-only` | 仅向量嵌入 | 1 |

---

### 2. Core Algorithms

#### A. 智能速率限制器 (Rate Limiter)

- **Goal**: 在外部 API 配额限制内最大化吞吐量
- **Inputs**:
  - `max_jobs_per_minute` (Int) - 每分钟最大任务数
  - `concurrency` (Int) - 并发 Worker 数
- **Data Structures**:
  ```pseudo
  RateLimiterConfig {
      max: Int          # 时间窗口内最大任务数
      duration_ms: Int  # 时间窗口大小 (默认 60000ms)
  }
  ```
- **Logic**:
  ```pseudo
  # 滑动窗口限流
  def should_allow_job(queue_state):
      jobs_in_window = count_jobs_started_since(now - duration_ms)
      return jobs_in_window < max
  ```
- **Current Config**:
  ```
  Metadata Queue: max=2/min (Gemini Free Tier: 5 RPM, 每 Job 2 API 调用)
  Embedding Queue: max=10/min (通常更宽松)
  ```

---

#### B. 熔断器 (Circuit Breaker)

- **Goal**: 检测到配额耗尽时自动暂停队列，防止持续报错
- **Inputs**:
  - `error_message` (String) - API 返回的错误信息
- **Logic Steps**:
  ```pseudo
  def handle_api_error(error_message):
      error_lower = error_message.lower()
      
      # 1. 检测错误类型
      is_rate_limit = any([
          "429" in error_lower,
          "rate limit" in error_lower,
          "quota" in error_lower
      ])
      
      is_daily_quota = any([
          "quota exceeded" in error_lower,
          "resource_exhausted" in error_lower
      ])
      
      if not is_rate_limit:
          return  # 非速率限制错误，正常重试
      
      # 2. 计算暂停时长
      if is_daily_quota:
          # Gemini 在 PT 午夜重置 ≈ UTC+8 16:00
          resume_time = next_occurrence_of(hour=16, minute=30)
          pause_duration = resume_time - now
          reason = "Daily Quota Exhausted"
      else:
          pause_duration = 2 * 60 * 1000  # 2分钟冷却
          reason = "Rate Limit (Transient)"
      
      # 3. 执行熔断
      pause_queue()
      store_in_redis("navimuse:queue:resume_at", now + pause_duration)
      log_warning(f"Circuit Breaker: {reason}, pausing for {pause_duration}ms")
  ```

- **Edge Cases**:
  - 如果暂停期间服务器重启，Watchdog 会在启动时检查 Redis 中的 `resume_at` 时间戳

---

#### C. 自动恢复看门狗 (Watchdog)

- **Goal**: 定期检查队列是否应从暂停状态恢复
- **Inputs**: None (自动运行)
- **Logic**:
  ```pseudo
  # 每 60 秒执行一次
  def watchdog_tick():
      if not queue.is_paused():
          return
      
      resume_at = redis.get("navimuse:queue:resume_at")
      if resume_at is None:
          return
      
      if now > int(resume_at):
          queue.resume()
          redis.delete("navimuse:queue:resume_at")
          log("Queue auto-resumed")
  ```

---

#### D. 批量任务入队策略 (Batching Strategy)

- **Goal**: 将大量待处理项拆分为可控的批次任务
- **Inputs**:
  - `pending_songs` (Array) - 待处理歌曲列表
  - `batch_size` (Int) - 每批大小 (动态配置, 默认 10)
- **Logic**:
  ```pseudo
  def enqueue_pending_songs(pending_songs, batch_size):
      jobs_created = 0
      
      for i in range(0, len(pending_songs), batch_size):
          batch = pending_songs[i : i + batch_size]
          
          job_data = {
              "correlationId": f"batch_{timestamp()}",
              "songs": batch.map(s => {
                  "navidrome_id": s.id,
                  "title": s.title,
                  "artist": s.artist
              })
          }
          
          queue.add("batch-analyze", job_data)
          jobs_created += 1
      
      return jobs_created
  ```

- **Job Options (重试策略)**:
  ```pseudo
  JobOptions {
      attempts: 3              # 最多重试 3 次
      backoff: {
          type: "exponential"  # 指数退避
          delay: 5000          # 初始延迟 5 秒
      }
      removeOnComplete: True   # 完成后自动删除
      removeOnFail: 1000       # 失败 Job 保留 1000 个用于调试
  }
  ```

---

#### E. 任务处理流水线 (Full Analysis Pipeline)

- **Goal**: 对一批歌曲执行完整的元数据生成 + 向量嵌入
- **Inputs**:
  - `songs[]` - 批次歌曲数据
    - `navidrome_id` (String)
    - `title` (String)
    - `artist` (String)
- **Outputs**:
  - `count` (Int) - 成功处理数量
- **Logic Steps**:
  ```pseudo
  def process_full_analysis_batch(songs):
      # Phase 0: Mark as Processing
      transaction:
          for song in songs:
              db.update_status(song.id, "PROCESSING")
      
      # Phase 1: Metadata Generation (1 API Call)
      api_results = ai_service.generate_batch_metadata([
          {"id": s.id, "title": s.title, "artist": s.artist}
          for s in songs
      ])
      
      # Phase 2: Prepare Updates & Vector Texts
      updates = []
      for result in api_results:
          song_id = result.id
          
          # 构造描述文本
          acoustic = result.vector_anchor.acoustic_model or ""
          semantic = result.vector_anchor.semantic_push or ""
          description = f"{acoustic}\n\n[Imagery] {semantic}"
          
          # 合并标签
          tags = [
              *result.embedding_tags.mood_coord,
              *result.embedding_tags.objects
          ]
          if result.embedding_tags.scene_tag:
              tags.append(result.embedding_tags.scene_tag)
          if result.embedding_tags.spectrum:
              tags.append(f"#Spectrum:{result.embedding_tags.spectrum}")
          
          # 构造向量输入文本
          vector_text = construct_vector_text(result, {
              "title": song.title,
              "artist": song.artist,
              "genre": find_genre_tag(result.embedding_tags.objects)
          })
          
          updates.append({
              "song_id": song_id,
              "meta": {
                  "description": description,
                  "tags": tags,
                  "mood": result.embedding_tags.mood_coord[0] or "Unknown",
                  "is_instrumental": result.is_instrumental,
                  "analysis_json": json.dumps(result),
                  "energy_level": result.embedding_tags.energy,
                  # ... 其他字段
              },
              "vector_text": vector_text
          })
      
      # Phase 3: Batch Vector Embedding (1 API Call)
      vector_texts = [u.vector_text for u in updates if u.vector_text]
      vectors = embedding_service.embed_batch(vector_texts)
      
      # Phase 4: Commit to DB
      batch_data = []
      vec_index = 0
      for update in updates:
          vector = None
          if update.vector_text and vectors[vec_index]:
              vector = vectors[vec_index]
              vec_index += 1
          
          batch_data.append({
              "song_id": update.song_id,
              "meta": update.meta,
              "vector": vector
          })
      
      db.save_batch_analysis(batch_data)
      return {"count": len(batch_data)}
  ```

---

### 3. State Machine: 队列生命周期

```
           ┌─────────────────────────────────┐
           │                                 │
           ▼                                 │
      ┌─────────┐   start()            ┌──────────┐
      │  IDLE   │─────────────────────►│ SYNCING  │
      └─────────┘                       └──────────┘
           ▲                                 │
           │                     sync_complete
           │                                 │
           │                                 ▼
      ┌─────────┐                      ┌───────────┐
      │ PAUSED  │◄─── pause() ───────  │ ENQUEUING │
      └─────────┘                       └───────────┘
           │                                 │
           │                        enqueue_complete
    resume() / watchdog                      │
           │                                 ▼
           │                           ┌──────────┐
           └───────────────────────────│ RUNNING  │
                                       └──────────┘
                                             │
                                  ┌──────────┼──────────┐
                                  │          │          │
                               error      complete   stop()
                                  │          │          │
                                  ▼          │          ▼
                           ┌─────────┐       │    ┌─────────┐
                           │ BREAKER │       │    │  IDLE   │
                           └─────────┘       │    └─────────┘
                                  │          │
                            watchdog_resume  │
                                  │          │
                                  └──────────┘
```

---

### 4. Redis 数据结构 (Abstract)

| Key Pattern | Type | Purpose |
|-------------|------|---------|
| `bull:metadata-generation:*` | BullMQ 内部 | 任务队列数据 |
| `bull:embedding-only:*` | BullMQ 内部 | 向量队列数据 |
| `navimuse:queue:resume_at` | String (Timestamp) | 熔断器恢复时间 |

---

### 5. 配置参数 (Dynamic Settings)

从数据库 `system_settings` 表动态读取：

| Setting Key | Default | Description |
|-------------|---------|-------------|
| `queue_concurrency` | 1 | Worker 并发数 |
| `queue_rate_limit_max` | 2 | 每分钟最大任务 |
| `queue_batch_size` | 10 | 每批歌曲数 |

---

### 6. 接口抽象 (API Contract)

```typescript
// 队列状态查询
interface QueueStatus {
    isPaused: boolean
    isWorkerRunning: boolean
    activeJobs: number
    waitingJobs: number
    completedJobs: number
    failedJobs: number
    delayedJobs: number
}

// 扩展状态 (含数据库统计)
interface ExtendedQueueStatus extends QueueStatus {
    pendingSongs: number    // DB 中待处理数
    totalSongs: number      // DB 总数
    pipelineState: 'idle' | 'syncing' | 'enqueuing'
}

// 启动选项
interface StartOptions {
    skipSync?: boolean   // 跳过同步
    limit?: number       // 限制数量
    dryRun?: boolean     // 预览模式
}
```

---

### 7. 错误处理策略

| 错误类型 | 处理方式 |
|----------|----------|
| 429 Rate Limit | 触发熔断器，暂停 2 分钟 |
| Quota Exhausted | 暂停至 16:30 (GMT+8) |
| 网络错误 | 指数退避重试 (最多 3 次) |
| AI 解析失败 | 标记 FAILED，保留用于调试 |
| Stalled Job | 自动重试 (最多 2 次) |

---

## 迁移建议

1. **队列框架替换**: BullMQ → 任意支持 delay/retry 的队列 (Celery, Temporal, etc.)
2. **Redis 替换**: 可使用任何支持 TTL 的 KV 存储存放 `resume_at`
3. **熔断器**: 可考虑使用 Resilience4j / opossum 等成熟库
4. **批处理逻辑**: 纯函数，可直接复用
