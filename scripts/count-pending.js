
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'data', 'navimuse.db');
const db = new Database(dbPath);

const pending = db.prepare('SELECT COUNT(*) as c FROM smart_metadata WHERE last_analyzed IS NULL').get();
console.log(`Pending Songs: ${pending.c}`);
