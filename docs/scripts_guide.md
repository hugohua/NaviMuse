
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
| `reset-analysis.ts` | **重置分析状态**。将 `last_analyzed` 字段置空，强制系统重新生成元数据和向量。用于 Prompt 更新后的数据刷新。 | 配合 `start-full-scan.ts` 重新生成数据。 |
| `simple-check.js` | **简易检查 (JS)**。不带向量扩展的纯状态检查，用于排查环境问题。 | 环境调试。 |
| `count-pending.js` | **待处理计数 (JS)**。快速统计 `last_analyzed IS NULL` 的记录数。 | 确认还有多少任务未完成。 |

---

## 3. 测试与验证 (Testing & Verification)

用于验证开发中的新功能或组件。

| 脚本文件 | 描述 | 备注 |
| :--- | :--- | :--- |
| `test-vector-flow.ts` | **向量流程验证**。模拟单曲处理流程：Prompt生成 -> 模板构建 -> 向量生成。 | 开发 "Ultra-Precision" 系统时使用。 |
| `test-prompt-comparison.ts` | **Prompt 效果对比**。对比不同 System Prompt 的输出效果。 | 提示词工程调试。 |
| `test-ai.ts` | **AI 连接测试**。简单的 Gemini API 连通性测试。 | 排查网络/API Key 问题。 |
| `test-navidrome.ts` | **Navidrome 连接测试**。测试与 Navidrome 服务器的 API 通信。 | 排查同步问题。 |
| `test-queue.ts` | **队列测试**。验证 BullMQ 和 Redis 连接。 | 排查任务调度问题。 |

---

## 4. 调试工具 (Debugging)

用于深度调试特定组件，通常涉及破坏性操作或详细日志。

| 脚本文件 | 描述 | 警告 |
| :--- | :--- | :--- |
| `debug-vec.ts` | **向量表调试**。尝试加载 sqlite-vec 扩展并创建向量表。 | **可能会删除并重建表**，慎用。 |
| `debug-navidrome.ts` | **Navidrome 深度调试**。抓取并打印详细的 Navidrome API 响应。 | 输出可能包含大量数据。 |
| `debug-proxy.ts` | **代理调试**。验证 HTTP 代理配置是否生效。 | 用于排查网络连接问题。 |

---

## 常见问题处理

### "Module 'xxx' can only be default-imported..." 错误
这是由于 `ts-node` 环境配置导致的。请务必添加 `--project tsconfig.server.json` 参数：
```powershell
npx ts-node --project tsconfig.server.json scripts/[script-name].ts
```

### 数据库被锁定 (Database Locked)
确保没有其他进程（如 Web Server 或其他脚本）正在写入数据库。SQLite 只能同时允许一个写入者。如果卡住，请关闭所有相关终端并重启。
