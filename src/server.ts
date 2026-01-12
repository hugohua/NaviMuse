import { app } from './app';
import { config } from './config';
import { initDB } from './db';

// Initialize DB
initDB();

// Start Server
app.listen(config.app.port, () => {
  console.log(`
  🚀 NaviMuse Server running at http://localhost:${config.app.port}
  ---------------------------------------------------------
  Navidrome Ref: ${config.navidrome.url} (${config.navidrome.user})
  AI Model:      ${config.ai.model}
  ---------------------------------------------------------
  `);
});

