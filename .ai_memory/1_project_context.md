# 项目核心知识库
## 项目目标
NaviMuse 是一个基于 Navidrome 的 AI 音乐策展人。

## 核心共识
- **用户画像 (UserProfile)**：
  - 这是一个结构化的 JSON 对象，包含 `technical_profile` (AI读取) 和 `display_card` (用户展示)。
  - **核心逻辑**：场景 (Scene) 优先，画像 (Profile) 润色。如果场景与画像冲突（如 Gym vs Ballads），必须优先满足场景。
  - 前端使用 `UserProfileCard` 进行可视化展示。
- **配置**：`profileSampleSize` 默认为 50。
- **注释**：代码注释优先使用中文。

## 接口规范
- `POST /api/profile/analyze`: 返回 `UserProfile` JSON。
- `POST /api/generate`: 接收 `{ prompt, mode, userProfile: UserProfile }`。

## 代码规范
- **测试**：服务端的核心代码逻辑必须编写单元测试，且所有测试文件需统一存放于项目根目录下的 `test` 文件夹中。
