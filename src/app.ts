import express from 'express';
import path from 'path';
import compression from 'compression';
import helmet from 'helmet';
import { apiRouter } from './routes';
import { errorHandler } from './middleware/error';
import { initQueueDashboard } from './services/queue/queueMonitor';

const app = express();

// --- Queue Dashboard ---
// Must be set up before body parsers if it has its own, but usually fine here.
// We mount it at /admin/queues
app.use('/admin/queues', initQueueDashboard());

// Security Headers (Helmet)
// Note: Content Security Policy might need tuning if you have external scripts, 
// strictly checking 'self' might block some dev tools or external assets.
// For now, we use defaults but disable upgradeInsecureRequests if issues arise in dev.
app.use(helmet({
    contentSecurityPolicy: false, // Disable CSP for simplicity in this project context
    crossOriginEmbedderPolicy: false
}));

// Compression (Gzip)
app.use(compression());

// Body Parser
app.use(express.json());

// Serve Static Files (Frontend Build)
app.use(express.static(path.join(__dirname, '../public')));

// API Routes
app.use('/api', apiRouter);

// Error Handling Middleware (Must be last)
app.use(errorHandler);

export { app };
