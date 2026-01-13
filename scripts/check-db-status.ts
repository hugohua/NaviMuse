
import { initDB, db } from '../src/db';
import 'dotenv/config';

initDB();

const vecCount = db.prepare('SELECT count(*) as c FROM vec_songs').get() as { c: number };
const metaCount = db.prepare('SELECT count(*) as c FROM smart_metadata').get() as { c: number };

console.log("Smart Metadata Count:", metaCount.c);
console.log("Vector Count:", vecCount.c);
