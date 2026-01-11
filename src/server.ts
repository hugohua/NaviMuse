import express from 'express';
import axios from 'axios';
import path from 'path';
import { config, promptConfig } from './config';
import { curatorService } from './services/curator';
import { navidromeClient } from './services/navidrome';

const app = express();

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// API Routes
app.get('/api/config/tags', (req, res) => {
    res.json(promptConfig.tagCategories);
});

// API Routes
app.post('/api/generate', async (req, res) => {
    try {
        const { prompt, mode, userProfile } = req.body;

        if (!prompt) {
            return res.status(400).json({ error: 'Prompt is required' });
        }

        // Default to 'default' mode if not provided
        const targetMode = mode || 'default';

        // Pass userProfile to curator service if available
        const result = await curatorService.curate(prompt, targetMode, userProfile);

        res.json({ success: true, data: result });
    } catch (error: any) {
        console.error('Generation failed:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/profile/analyze', async (req, res) => {
    try {
        const profile = await curatorService.generateUserProfile();
        res.json({ success: true, data: profile });
    } catch (error: any) {
        console.error('Profile Analysis failed:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Playlist Management Routes
app.get('/api/playlists', async (req, res) => {
    try {
        const all = await navidromeClient.getPlaylists();
        // 返回所有歌单，前端根据 name 判断是否显示删除按钮
        res.json(all);
    } catch (error: any) {
        console.error('Fetch Playlists failed:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/playlists/:id', async (req, res) => {
    try {
        const data = await navidromeClient.getPlaylist(req.params.id);
        res.json(data);
    } catch (error: any) {
        console.error('Fetch Playlist Details failed:', error);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/playlists/:id', async (req, res) => {
    try {
        await navidromeClient.deletePlaylist(req.params.id);
        res.json({ success: true });
    } catch (error: any) {
        console.error('Delete Playlist failed:', error);
        res.status(500).json({ error: error.message });
    }
});

// Star/Unstar Song Routes
app.post('/api/songs/:id/star', async (req, res) => {
    try {
        await navidromeClient.starSong(req.params.id);
        res.json({ success: true });
    } catch (error: any) {
        console.error('Star Song failed:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/songs/:id/star', async (req, res) => {
    try {
        await navidromeClient.unstarSong(req.params.id);
        res.json({ success: true });
    } catch (error: any) {
        console.error('Unstar Song failed:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Stream Proxy
app.get('/api/stream/:id', async (req, res) => {
    try {
        const streamUrl = navidromeClient.getStreamUrl(req.params.id);

        // Stream using axios for better Node.js stream compatibility
        const response = await axios({
            method: 'get',
            url: streamUrl,
            responseType: 'stream',
            // Disable default validation to handle non-2xx manually if needed (though we catch errors below)
            validateStatus: () => true
        });

        console.log(`[Stream Proxy] Fetching ${req.params.id} -> Status: ${response.status}`);
        console.log(`[Stream Proxy] Upstream Headers:`, response.headers);

        if (response.status >= 400) {
            console.error('[Stream Proxy] Upstream error');
            // Pipe error body if possible or just end
            return res.status(response.status).end();
        }

        // Forward important headers
        const contentType = response.headers['content-type'] || 'audio/mpeg';
        res.setHeader('Content-Type', contentType);
        console.log(`[Stream Proxy] Set Content-Type: ${contentType}`);

        // Explicitly set keep-alive to avoid "Data after Connection: close" if upstream sent close
        res.setHeader('Connection', 'keep-alive');

        // Check for non-audio content (likely error)
        const contentTypeStr = response.headers['content-type'] || '';
        if (!contentTypeStr.startsWith('audio/') && !contentTypeStr.startsWith('application/octet-stream')) {
            console.warn(`[Stream Proxy] Warning: Non-audio content type: ${contentTypeStr}`);

            // If it's HTML/JSON/Text, try to log it for debugging
            response.data.on('data', (chunk: Buffer) => {
                console.error('[Stream Proxy] Response Body Preview:', chunk.toString('utf8').slice(0, 500));
                // We only need the first chunk to see the error usually
                if (response.data && typeof response.data.destroy === 'function') {
                    response.data.destroy();
                }
            });

            return res.status(502).json({ error: 'Upstream returned non-audio content' });
        }

        // Handle stream events to prevent app crash
        response.data.on('error', (err: any) => {
            console.error('Stream data error:', err);
            if (!res.headersSent) {
                res.status(502).end();
            } else {
                res.end();
            }
        });

        // Cleanup if client disconnects
        req.on('close', () => {
            // ... existing cleanup
            if (response.data && typeof response.data.destroy === 'function') {
                response.data.destroy();
            }
        });

        // Pipe stream
        response.data.pipe(res);
    } catch (error: any) {
        console.error('Stream Proxy failed:', error);
        if (!res.headersSent) {
            res.status(500).end();
        }
    }
});

// Start
app.listen(config.app.port, () => {
    console.log(`
  🚀 NaviMuse Server running at http://localhost:${config.app.port}
  ---------------------------------------------------------
  Navidrome Ref: ${config.navidrome.url} (${config.navidrome.user})
  AI Model:      ${config.ai.model}
  ---------------------------------------------------------
  `);
});
