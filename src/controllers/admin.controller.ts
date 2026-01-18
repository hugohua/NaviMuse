
import { Request, Response } from 'express';
import { metadataRepo } from '../db';
import { SongMetadata } from '../db';

export class AdminController {
    static async getSongs(req: Request, res: Response) {
        try {
            const page = parseInt(req.query.page as string) || 1;
            const limit = parseInt(req.query.limit as string) || 50;
            const filter = req.query.filter as 'all' | 'no_metadata' | 'no_vector' | undefined;
            const offset = (page - 1) * limit;

            const total = metadataRepo.getSongCount(filter);
            const songs = metadataRepo.getPaginatedSongs(limit, offset, filter);

            res.json({
                data: songs,
                pagination: {
                    total,
                    page,
                    limit,
                    totalPages: Math.ceil(total / limit)
                }
            });
        } catch (error: any) {
            console.error('Failed to fetch songs:', error);
            res.status(500).json({ error: 'Failed to fetch songs' });
        }
    }
}
