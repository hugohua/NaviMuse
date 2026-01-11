import { Request, Response, NextFunction } from 'express';
import { curatorService } from '../services/curator';

export class CuratorController {

    // POST /api/generate
    static async generate(req: Request, res: Response, next: NextFunction) {
        try {
            const { prompt, mode, userProfile } = req.body;

            if (!prompt) {
                res.status(400).json({ error: 'Prompt is required' });
                return;
            }

            // Default to 'default' mode if not provided
            const targetMode = mode || 'default';

            // Pass userProfile to curator service if available
            const result = await curatorService.curate(prompt, targetMode, userProfile);

            res.json({ success: true, data: result });
        } catch (error) {
            next(error);
        }
    }

    // POST /api/profile/analyze
    static async analyzeProfile(req: Request, res: Response, next: NextFunction) {
        try {
            const profile = await curatorService.generateUserProfile();
            res.json({ success: true, data: profile });
        } catch (error) {
            next(error);
        }
    }
}
