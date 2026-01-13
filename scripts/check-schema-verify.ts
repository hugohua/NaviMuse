import { db, initDB } from '../src/db';

initDB();

const columns = db.prepare("PRAGMA table_info(smart_metadata)").all() as any[];
const hasTempo = columns.some(c => c.name === 'tempo_vibe');
const hasTimbre = columns.some(c => c.name === 'timbre_texture');

console.log('Columns Check:');
console.log('tempo_vibe:', hasTempo ? 'OK' : 'MISSING');
console.log('timbre_texture:', hasTimbre ? 'OK' : 'MISSING');

if (!hasTempo || !hasTimbre) {
    process.exit(1);
}
// Optionally check indexes if relevant
