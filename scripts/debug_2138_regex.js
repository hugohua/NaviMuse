
const fs = require('fs');
const content = fs.readFileSync('data/batch/fail_2138.json', 'utf8');

const item2Index = content.indexOf('bc78');
const keyIndex3 = content.indexOf('"cultural_weight"', item2Index);
console.log('cultural_weight index:', keyIndex3);

const startVal = content.indexOf(':', keyIndex3) + 1;
const startQuote = content.indexOf('"', startVal);

let i = startQuote + 1;
while (i < content.length) {
    if (content[i] === '"' && content[i - 1] !== '\\') break;
    i++;
}
const endQuote = i;
console.log('End quote of cultural_weight at:', endQuote);

console.log('Context after end quote:');
console.log(content.substring(endQuote, endQuote + 50));
console.log('Indices after end quote:');
for (let j = endQuote; j < endQuote + 50; j++) {
    console.log(`${j}: ${content[j]} (${content.charCodeAt(j)})`);
}
