<div align="center">
  <img src="logo-light.svg" alt="NaviMuse Logo" width="120" />
</div>

# NaviMuse
[English](./README.md) | [中文说明](./README_zh-CN.md)

**NaviMuse** is an AI-driven personal music curator for [Navidrome](https://www.navidrome.org/). It uses Aliyun Qwen LLM to create scene-based smart playlists from your local library.

## Features
- **Project Goal**: Revive your music library with AI curation.
- **Hybrid Context**: Mixes random discovery + your favorites + recent habits.
- **Privacy Focus**: Your audio files never leave your server. Only metadata is processed.
- **Mobile Controller**: A minimal web UI for your phone to trigger playlists.

## Tech Stack
- **Frontend**: React 19, TypeScript, Vite, Framer Motion, Radix UI, Lucide React
- **Backend**: Node.js, Express, OpenAI SDK
- **Styling**: Vanilla CSS (CSS Modules), PostCSS
- **Deployment**: Docker, Docker Compose

## Quick Start

### 1. Configuration
Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

Edit `.env` with your settings:

```bash
# Navidrome credentials (Required)
ND_URL=http://<your-navidrome-ip>:4533
ND_USER=<your-username>
ND_PASS=<your-password-or-token>  # If using LDAP/Token, use hex encoded token

# AI Provider (Required)
# Any OpenAI-compatible provider (Aliyun Qwen, DeepSeek, OpenAI, etc.)
OPENAI_API_KEY=<your-api-key>
OPENAI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1 # Optional, defaults to Aliyun
OPENAI_MODEL=qwen3-max # Optional, defaults to qwen3-max
# Optional: Comma separated list of models to randomly choose from
OPENAI_MODEL_LIST=deepseek-v3.2,qwen3-max
```

### 2. Run
```bash
# Install dependencies (if not already)
npm install

# Start the server
npm start
```

### 3. Use
- Open the printed URL (e.g., `http://localhost:3000`) on your phone.
- Tap a preset (e.g., "Friday Night Jazz") or type a mood.
- Open your Navidrome App, pull to refresh, and enjoy your new playlist!

## Docker Deployment (Recommended)

NaviMuse includes full Docker support for easy deployment on your server (e.g., Synology NAS, remote VPS).

### 1. Build Image
We provide a helper script to build and export the image for Linux/AMD64 platforms:

```bash
# Build navimuse:latest and export to dockers/ directory
./build-and-export.sh
```

### 2. Configure & Run
You can use `docker-compose` to run NaviMuse.

1. Create a `docker-compose.yml` (included in the repo) or add this service to your existing stack:

```yaml
services:
  navimuse:
    image: baofen14787/navimuse:latest
    container_name: navimuse
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - ND_URL=http://host.docker.internal:4533 # Adjust if Navidrome is on a different host
      - ND_USER=your_username
      - ND_PASS=your_password
      - OPENAI_API_KEY=your_key
      - OPENAI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
    extra_hosts:
      - "host.docker.internal:host-gateway" # Required to access host services
```

2. Start the service:
```bash
docker-compose up -d
```

### Networking Note
If your Navidrome is running on the **Host Network** or just exposed on the host's port (e.g. 4533), NaviMuse can access it via `http://host.docker.internal:4533` thanks to the `extra_hosts` configuration.
