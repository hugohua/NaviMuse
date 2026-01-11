import { Request, Response, NextFunction } from 'express';
import { navidromeClient } from '../services/navidrome';

export class PlaylistController {

    // GET /api/playlists
    static async getAll(req: Request, res: Response, next: NextFunction) {
        try {
            const all = await navidromeClient.getPlaylists();
            res.json(all);
        } catch (error) {
            next(error);
        }
    }

    // GET /api/playlists/:id
    static async getOne(req: Request, res: Response, next: NextFunction) {
        try {
            const data = await navidromeClient.getPlaylist(req.params.id);
            res.json(data);
        } catch (error) {
            next(error);
        }
    }

    // DELETE /api/playlists/:id
    static async delete(req: Request, res: Response, next: NextFunction) {
        try {
            await navidromeClient.deletePlaylist(req.params.id);
            res.json({ success: true });
        } catch (error) {
            next(error);
        }
    }

    // POST /api/songs/:id/star
    static async starSong(req: Request, res: Response, next: NextFunction) {
        try {
            await navidromeClient.starSong(req.params.id);
            res.json({ success: true });
        } catch (error) {
            next(error);
        }
    }

    // DELETE /api/songs/:id/star
    static async unstarSong(req: Request, res: Response, next: NextFunction) {
        try {
            await navidromeClient.unstarSong(req.params.id);
            res.json({ success: true });
        } catch (error) {
            next(error);
        }
    }
}
