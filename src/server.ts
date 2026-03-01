import { app } from './app';
import { config } from './config';
import { initDB, systemRepo } from './db';

// Initialize DB
initDB();

// Start Server
app.listen(config.app.port, () => {
  const provider = systemRepo.getSetting('ai_provider') || process.env.AI_PROVIDER || 'local';
  const model = systemRepo.getSetting('ai_model') || (provider === 'local' ? config.etl.model : config.ai.model);

  console.log(`
  🚀 NaviMuse Server running at http://localhost:${config.app.port}
  ---------------------------------------------------------
  Navidrome Ref: ${config.navidrome.url} (${config.navidrome.user})
  AI Provider:   ${provider}
  AI Model:      ${model}
  ---------------------------------------------------------
  `);
});

