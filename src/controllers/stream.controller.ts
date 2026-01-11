import { Request, Response, NextFunction } from 'express';
import axios from 'axios';
import { navidromeClient } from '../services/navidrome';

export class StreamController {

    // GET /api/stream/:id
    static async streamSong(req: Request, res: Response, next: NextFunction) {
        try {
            const streamUrl = navidromeClient.getStreamUrl(req.params.id);

            // Stream using axios for better Node.js stream compatibility
            const response = await axios({
                method: 'get',
                url: streamUrl,
                responseType: 'stream',
                // Disable default validation to handle non-2xx manually if needed
                validateStatus: () => true
            });

            console.log(`[Stream Proxy] Fetching ${req.params.id} -> Status: ${response.status}`);

            if (response.status >= 400) {
                console.error('[Stream Proxy] Upstream error');
                res.status(response.status).end();
                return;
            }

            // Forward important headers
            const contentType = response.headers['content-type'] || 'audio/mpeg';
            res.setHeader('Content-Type', contentType);

            // Explicitly set keep-alive
            res.setHeader('Connection', 'keep-alive');

            // Check for non-audio content (likely error from upstream)
            const contentTypeStr = typeof contentType === 'string' ? contentType : '';
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

                res.status(502).json({ error: 'Upstream returned non-audio content' });
                return;
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
                if (response.data && typeof response.data.destroy === 'function') {
                    response.data.destroy();
                }
            });

            // Pipe stream
            response.data.pipe(res);

        } catch (error) {
            next(error);
        }
    }
}
