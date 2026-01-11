# NaviMuse

**NaviMuse** is an AI-driven personal music curator for [Navidrome](https://www.navidrome.org/). It uses Aliyun Qwen LLM to create scene-based smart playlists from your local library.

## Features
- **Project Goal**: Revive your music library with AI curation.
- **Hybrid Context**: Mixes random discovery + your favorites + recent habits.
- **Privacy Focus**: Your audio files never leave your server. Only metadata is processed.
- **Mobile Controller**: A minimal web UI for your phone to trigger playlists.

## Quick Start

### 1. Configuration
Open `.env` file and fill in your Navidrome credentials:
```bash
ND_URL=http://<your-navidrome-ip>:4533
ND_USER=<your-username>
ND_PASS=<your-password-or-token>  # If using LDAP/Token, use hex encoded token
DASHSCOPE_API_KEY=<your-aliyun-key> # Already configured
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
