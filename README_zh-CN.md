# NaviMuse
[English](./README.md) | [中文说明](./README_zh-CN.md)

**NaviMuse** 是一个专为 [Navidrome](https://www.navidrome.org/) 设计的 AI 驱动的个人音乐策展人。它利用阿里云通义千问 (Qwen) 大模型，根据你的本地音乐库创建基于场景的智能歌单。

## 功能特性
- **项目目标**: 利用 AI 策展让你的音乐库重获新生。
- **混合上下文**: 结合随机探索 + 你的收藏 + 近期习惯，生成更懂你的歌单。
- **隐私优先**: 你的音频文件永远不会离开你的服务器，仅处理元数据。
- **移动端控制器**: 提供极简的手机网页 UI，方便随时触发歌单生成。

## 技术栈
- **前端**: React 19, TypeScript, Vite, Framer Motion, Radix UI, Lucide React
- **后端**: Node.js, Express, OpenAI SDK
- **样式**: Vanilla CSS (CSS Modules), PostCSS
- **部署**: Docker, Docker Compose

## 快速开始

### 1. 配置
将 `.env.example` 复制为 `.env` 并填写你的凭证：

```bash
cp .env.example .env
```

编辑 `.env` 文件填写配置：

```bash
# Navidrome 凭证 (必填)
ND_URL=http://<你Navidrome的IP>:4533
ND_USER=<你的用户名>
ND_PASS=<你的密码或Token>  # 如果使用LDAP/Token，请使用十六进制编码的Token

# AI 提供商 (必填)
# 任何兼容 OpenAI 接口的服务商 (阿里云 Qwen, DeepSeek, OpenAI 等)
OPENAI_API_KEY=<你的API Key>
OPENAI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1 # 可选，默认为阿里云
OPENAI_MODEL=qwen3-max # 可选，默认为 qwen3-max
```

### 2. 运行
```bash
# 安装依赖 (如果尚未安装)
npm install

# 启动服务器
npm start
```

### 3. 使用
- 在手机上打开打印出的 URL (例如 `http://localhost:3000`)。
- 点击预设场景 (例如 "周五爵士夜") 或输入你想要的心情。
- 打开你的 Navidrome App，下拉刷新，即可看到新生成的歌单并开始享受！

## Docker 部署 (推荐)

NaviMuse 提供了完整的 Docker 支持，方便在你的服务器 (如群晖 NAS、远程 VPS) 上部署。

### 1. 构建镜像
我们提供了一个辅助脚本，用于构建并导出适用于 Linux/AMD64 平台的镜像：

```bash
# 构建 baofen14787/navimuse:latest 并导出到 dockers/ 目录
./build-and-export.sh
```

### 2. 配置与运行
你可以使用 `docker-compose` 来运行 NaviMuse。

1. 创建 `docker-compose.yml` (仓库中已包含) 或将此服务添加到你现有的应用栈中：

```yaml
services:
  navimuse:
    image: baofen14787/navimuse:latest
    container_name: navimuse
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - ND_URL=http://host.docker.internal:4533 # 如果 Navidrome 在不同主机上，请调整此地址
      - ND_USER=你的用户名
      - ND_PASS=你的密码
      - OPENAI_API_KEY=你的Key
      - OPENAI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
    extra_hosts:
      - "host.docker.internal:host-gateway" # 访问宿主机服务所必需
```

2. 启动服务：
```bash
docker-compose up -d
```

### 网络配置说明
如果你的 Navidrome 运行在 **Host 网络模式** 下，或者直接暴露在宿主机的端口 (例如 4533) 上，得益于 `extra_hosts` 配置，NaviMuse 可以通过 `http://host.docker.internal:4533` 直接访问它。
