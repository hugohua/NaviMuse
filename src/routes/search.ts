import { Router } from 'express';
import { searchService } from '../services/search/SearchService';

const router = Router();

// GET /api/search?q=sad%20piano&instrumental=true&limit=20
router.get('/', async (req, res, next) => {
    try {
        const query = req.query.q as string;
        if (!query) {
            res.status(400).json({ error: "Missing query parameter 'q'" });
            return;
        }

        const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
        // Parse 'instrumental'. Handle 'true', '1' as true. 'false', '0' as false.
        let is_instrumental: boolean | undefined = undefined;
        if (req.query.instrumental !== undefined) {
            const val = String(req.query.instrumental).toLowerCase();
            if (val === 'true' || val === '1') is_instrumental = true;
            else if (val === 'false' || val === '0') is_instrumental = false;
        }

        const results = await searchService.hybridSearch(query, {
            limit,
            is_instrumental
        });

        res.json(results);
    } catch (error) {
        next(error);
    }
});

export const searchRouter = router;
