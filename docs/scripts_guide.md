
# 脚本使用指南 (Scripts Guide)

`scripts` 目录下包含了用于系统运行、维护、测试和调试的各类工具脚本。本文档旨在帮助您快速了解和使用这些脚本。

**注意**: 所有 TS 脚本建议使用 `npx ts-node --project tsconfig.server.json [脚本路径]` 运行，以避免环境兼容性问题。

## 1. 核心流程 (Core Workflow)

这些脚本是系统日常运行的主要入口。

| 脚本文件 | 描述 | 常用参数 |
| :--- | :--- | :--- |
| `start-full-scan.ts` | **全流程主脚本**。负责从 Navidrome 同步数据、识别待处理文件、推入队列并启动 Worker 处理。 | `--only-sync`: 仅同步不分析<br>`--only-process`: 跳过同步仅处理队列<br>`--limit [N]`: 限制同步/处理数量 |
| `export-report.ts` | **导出 AI 报告**。将已分析的元数据导出为 `ai_report.json`，包含生成的描述、标签和情绪等。 | 无 |

### 使用示例
```bash
# 完整运行（同步 + 分析）
npx ts-node --project tsconfig.server.json scripts/start-full-scan.ts

# 仅处理数据库中现有的待处理任务
npx ts-node --project tsconfig.server.json scripts/start-full-scan.ts --only-process
```

---

## 2. 维护与管理 (Maintenance)

用于数据库维护、状态重置和系统检查。

| 脚本文件 | 描述 | 用途 |
| :--- | :--- | :--- |
| `check-db-status.ts` | **状态检查**。显示总歌曲数、已分析数、已生成向量数及新 Schema 覆盖率。 | 快速查看系统健康度。 |
| `sync-embedding-status.ts` | **向量状态同步**。校对元数据表与向量库，同步向量状态。 | 环境迁移或向量丢失后数据恢复。 |
| `flush-queue.ts` | **强制清零队列**。物理移除 BullMQ 中的所有待办和正在处理任务。 | 系统卡死或任务堆积时的“核武器”。 |
| `check-schema-verify.ts` | **Schema 校验**。验证数据库字段是否符合最新 AI 模型要求。 | 版本更新后的数据库升级检查。 |
| `simple-check.js` | **简易检查 (JS)**。不带向量扩展的纯状态检查，用于排查环境问题。 | 环境调试。 |
| `count-pending.js` | **待处理计数 (JS)**。快速统计 `last_analyzed IS NULL` 的记录数。 | 确认还有多少任务未完成。 |

---

## 3. 测试与验证 (Testing & Verification)

用于验证开发中的新功能或组件。

| 脚本文件 | 描述 | 备注 |
| :--- | :--- | :--- |
| `test-vector-flow.ts` | **向量流程验证**。模拟单曲处理流程：Prompt生成 -> 模板构建 -> 向量生成。 | 开发 "Ultra-Precision" 系统时使用。 |
| `test-prompt-comparison.ts` | **Prompt 效果对比**。对比不同 System Prompt 的输出效果。 | 提示词工程调试。 |
| `verify-openrouter.ts` | **OpenRouter 验证**。专门验证 OpenRouter 的连通性与模型可用性。 | 接口切换或 API 故障排查。 |
| `test-ai.ts` | **AI 连接测试**。简单的 Gemini API 连通性测试。 | 排查网络/API Key 问题。 |
| `test-navidrome.ts` | **Navidrome 连接测试**。测试与 Navidrome 服务器的 API 通信。 | 排查同步问题。 |
| `test-queue.ts` | **队列测试**。验证 BullMQ 和 Redis 连接。 | 排查任务调度问题。 |

---

## 4. 调试工具 (Debugging)

用于深度调试特定组件，通常涉及破坏性操作或详细日志。

| 脚本文件 | 描述 | 警告 |
| :--- | :--- | :--- |
| `debug-vec.ts` | **向量表调试** | 尝试加载 sqlite-vec 扩展并创建向量表。 | **可能会删除并重建表**，慎用。 |
| `debug-navidrome.ts` | **Navidrome 调试** | 打印详细的 Navidrome API 响应，排查连接和认证问题。 | 输出详尽日志。 |
| `debug-proxy.ts` | **代理调试** | 验证 HTTP 代理设置是否生效，用于排查 AI API 连接问题。 | 网络排查。 |

---

## 5. 批量处理 (Batch Processing)

针对海量数据的高效处理方案，通常配合阿里云百炼或 OpenAI Batch API 使用。

| 脚本文件 | 描述 | 流程步骤 |
| :--- | :--- | :--- |
| `batch-export.ts` | **批量元数据导出** | 扫描缺失元数据的歌曲并导出为 JSONL。 | 1. 导出需求 |
| `batch-submit.ts` | **批量提交** | 将 JSONL 上传至 AI 平台并启动 Batch 任务。 | 2. 提交任务 |
| `batch-import.ts` | **批量结果导入** | 下载 Batch 完结后的结果并回写数据库。 | 3. 结果入库 |
| `prepare-retry.ts` | **重试准备** | 提取处理失败的数据，准备重新导出的 JSONL。 | 故障恢复 |
| `embedding-export.ts` | **向量批量导出** | 导出已包含元数据但缺失向量的数据。 | 1. 向量需求 |
| `embedding-submit.ts` | **向量批量提交** | 创建阿里云百炼 Batch Embedding 任务。 | 2. 提交向量任务 |
| `embedding-import.ts` | **向量批量导入** | 下载向量结果并更新 `smart_metadata` 的向量轴。 | 3. 向量入库 |

---

## 6. 搜索与推荐 (Search & Recommendation)

用于测试和调整系统的核心 RAG 和推荐逻辑。

| `generate-tags.ts` | **Vibe Tags 生成** | 依据 AI 分析结果，静态生成汇总的氛围标签。 |
| `test-hybrid-search.ts` | **混合搜索测试** | 测试关键词 + 向量相似度混合搜索的效果。 |
| `test-personalized-search.ts` | **个性化搜索测试** | 结合用户画像 (UserProfile) 的搜索效果验证。 |
| `test-user-profile.ts` | **画像逻辑测试** | 验证用户偏好数据的存储与更新。 |
| `test-user-profile-llm.ts` | **AI 画像生成测试** | 验证通过 LLM 自动生成用户标签的准确性。 |
| `test-recommendation.ts` | **推荐引擎测试** | 验证单曲/列表推荐逻辑的准确性。 |

---

## 常见问题处理

### "Module 'xxx' can only be default-imported..." 错误
这是由于 `ts-node` 环境配置导致的。请务必添加 `--project tsconfig.server.json` 参数：
```powershell
npx ts-node --project tsconfig.server.json scripts/[script-name].ts
```

### 数据库被锁定 (Database Locked)
确保没有其他进程（如 Web Server 或其他脚本）正在写入数据库。SQLite 只能同时允许一个写入者。如果卡住，请关闭所有相关终端并重启。
