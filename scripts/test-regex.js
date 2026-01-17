
const fs = require('fs');
let content = fs.readFileSync('data/batch/fail_2138.json', 'utf8').trim();

console.log('Original length:', content.length);

// Apply regex 1
content = content.replace(/"vector_anchor":\s*"((?:[^"\\]|\\.)*)"\s*}\s*,\s*"embedding_tags"/g,
    '"vector_anchor":{"acoustic_model":"$1"},"embedding_tags"');

// Apply regex 2
content = content.replace(/"scene_tag"\s*:\s*"((?:[^"\\]|\\.)*)"\s*\]/g,
    '"scene_tag":"$1"}');

console.log('Modified length:', content.length);

try {
    JSON.parse(content);
    console.log('✅ Parse Success!');
} catch (e) {
    console.log('❌ Parse Failed');
    console.log(e.message);
    if (e.message.includes('position')) {
        const match = e.message.match(/position (\d+)/);
        if (match) {
            const pos = parseInt(match[1]);
            const start = Math.max(0, pos - 20);
            const end = Math.min(content.length, pos + 20);
            console.log(`Context at ${pos}: ...${content.substring(start, end)}...`);
        }
    }
}
