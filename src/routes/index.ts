import { Router } from 'express';
import { CuratorController } from '../controllers/curator.controller';
import { PlaylistController } from '../controllers/playlist.controller';
import { StreamController } from '../controllers/stream.controller';
import { tagCategories } from '../data/tags';

import { searchRouter } from './search';

const router = Router();

// --- Config / Meta ---
router.get('/config/tags', (req, res) => {
    res.json(tagCategories);
});

// --- Search ---
router.use('/search', searchRouter);

// --- Curator (AI) ---
router.post('/generate', CuratorController.generate);
router.post('/profile/analyze', CuratorController.analyzeProfile);

// --- Playlist Management ---
router.get('/playlists', PlaylistController.getAll);
router.get('/playlists/:id', PlaylistController.getOne);
router.delete('/playlists/:id', PlaylistController.delete);

// --- Song Interaction ---
router.post('/songs/:id/star', PlaylistController.starSong);
router.delete('/songs/:id/star', PlaylistController.unstarSong);

// --- Stream Proxy ---
router.get('/stream/:id', StreamController.streamSong);

export const apiRouter = router;
