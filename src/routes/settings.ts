import express, { Request, Response } from 'express';
import { systemRepo } from '../db';
import fetch from 'node-fetch';
import { HttpsProxyAgent } from 'https-proxy-agent';

const router = express.Router();

// Get all settings
router.get('/', (req: Request, res: Response) => {
    try {
        const settings = systemRepo.getAllSettings();
        res.json(settings);
    } catch (error: any) {
        console.error('[Settings API] Failed to fetch settings:', error);
        res.status(500).json({ error: 'Failed to fetch settings' });
    }
});

// Update settings
router.post('/', (req: Request, res: Response) => {
    try {
        const { settings } = req.body; // Expects object: { key: value, ... }
        if (!settings || typeof settings !== 'object') {
            return res.status(400).json({ error: 'Invalid settings format' });
        }

        for (const [key, value] of Object.entries(settings)) {
            systemRepo.setSetting(key, String(value));
        }

        res.json({ success: true, updated: Object.keys(settings) });
    } catch (error: any) {
        console.error('[Settings API] Failed to update settings:', error);
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

// Proxy OpenRouter Models
router.get('/models/openrouter', async (req: Request, res: Response) => {
    try {
        const openRouterKey = process.env.OPENROUTER_API_KEY;
        if (!openRouterKey) {
            return res.status(500).json({ error: 'OPENROUTER_API_KEY not configured on server' });
        }

        const proxyUrl = process.env.HTTPS_PROXY;
        const options: any = {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${openRouterKey}`,
                'Content-Type': 'application/json'
            }
        };

        if (proxyUrl) {
            options.agent = new HttpsProxyAgent(proxyUrl);
        }

        const externalRes = await fetch('https://openrouter.ai/api/v1/models', options);

        if (!externalRes.ok) {
            const errorText = await externalRes.text();
            console.error('[Settings API] OpenRouter Error:', errorText);
            return res.status(externalRes.status).json({ error: 'Failed to fetch from OpenRouter', details: errorText });
        }

        const data = await externalRes.json();
        // @ts-ignore
        const models = data.data || [];

        // Return sorted list of models
        res.json({
            models: models.map((m: any) => ({
                id: m.id,
                name: m.name,
                pricing: m.pricing,
                context_length: m.context_length
            }))
        });

    } catch (error: any) {
        console.error('[Settings API] Failed to fetch OpenRouter models:', error);
        res.status(500).json({ error: 'Internal Error fetching models' });
    }
});

export default router;
