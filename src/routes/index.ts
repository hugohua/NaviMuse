import { Router } from 'express';
import { CuratorController } from '../controllers/curator.controller';
import { PlaylistController } from '../controllers/playlist.controller';
import { StreamController } from '../controllers/stream.controller';
import { QueueController } from '../controllers/queue.controller';
import { tagService } from '../services/tags/TagService';
import { searchRouter } from './search';

const router = Router();

// --- Config / Meta ---
router.get('/config/tags', async (req, res) => {
    try {
        const tags = await tagService.getTags();
        res.json(tags);
    } catch (e) {
        console.error('Fetch tags failed:', e);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

router.post('/admin/tags/refresh', async (req, res) => {
    // Run in background
    tagService.refreshSystemTags().catch(err => console.error('[API] Tag refresh failed:', err));
    res.json({ status: 'ok', message: 'Tag refresh started in background.' });
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

// --- Queue Management ---
router.post('/queue/start', QueueController.start);
router.post('/queue/pause', QueueController.pause);
router.post('/queue/resume', QueueController.resume);
router.post('/queue/stop', QueueController.stop);
router.get('/queue/status', QueueController.status);
// 分离队列 - 元数据
router.post('/queue/metadata-only/start', QueueController.startMetadataOnly);
router.post('/queue/metadata-only/pause', QueueController.pauseMetadataOnly);
router.post('/queue/metadata-only/resume', QueueController.resumeMetadataOnly);
router.post('/queue/metadata-only/stop', QueueController.stopMetadataOnly);
// 分离队列 - 向量
router.post('/queue/embedding-only/start', QueueController.startEmbeddingOnly);
router.post('/queue/embedding-only/pause', QueueController.pauseEmbeddingOnly);
router.post('/queue/embedding-only/resume', QueueController.resumeEmbeddingOnly);
router.post('/queue/embedding-only/stop', QueueController.stopEmbeddingOnly);
router.post('/queue/immediate', QueueController.immediate);

// --- Admin / Inspection ---
import { AdminController } from '../controllers/admin.controller';
import settingsRouter from './settings';

router.get('/admin/songs', AdminController.getSongs);
router.use('/settings', settingsRouter);

export const apiRouter = router;
