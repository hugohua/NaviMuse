
import fs from 'fs';
import path from 'path';

const BATCH_DIR = path.join(process.cwd(), 'data', 'batch');
const MAIN_MAPPING = path.join(BATCH_DIR, 'batch_mapping.json');
const RETRY_MAPPING = path.join(BATCH_DIR, 'batch_retry_mapping.json');

if (fs.existsSync(MAIN_MAPPING) && fs.existsSync(RETRY_MAPPING)) {
    const main = JSON.parse(fs.readFileSync(MAIN_MAPPING, 'utf-8'));
    const retry = JSON.parse(fs.readFileSync(RETRY_MAPPING, 'utf-8'));

    // Merge
    Object.assign(main, retry);

    // Write back
    fs.writeFileSync(MAIN_MAPPING, JSON.stringify(main, null, 2), 'utf-8');
    console.log('✅ Merged retry mapping into main batch_mapping.json');
} else {
    console.log('Skipping merge: files not found');
}
