
const fs = require('fs');
const content = fs.readFileSync('data/batch/fail_2138.json', 'utf8');
const pos = 840;
const start = Math.max(0, pos - 50);
const end = Math.min(content.length, pos + 50);

console.log('--- Context ---');
console.log(content.substring(start, end));
console.log('--- Indices ---');
for (let i = start; i < end; i++) {
    console.log(`${i}: ${content[i]}`);
}
