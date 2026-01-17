
import fs from 'fs';
import path from 'path';

const debugFile = path.join(process.cwd(), 'data', 'batch', 'debug_lines.jsonl');

try {
    const fileContent = fs.readFileSync(debugFile, 'utf-8');
    const lines = fileContent.trim().split('\n');

    for (const line of lines) {
        console.log('--- Processing Line ---');
        try {
            const result = JSON.parse(line);
            console.log(`Custom ID: ${result.custom_id}`);

            const aiContent = result.response?.body?.choices?.[0]?.message?.content;
            if (!aiContent) {
                console.log('No content found');
                continue;
            }

            console.log('--- Raw Content Start ---');
            console.log(aiContent);
            console.log('--- Raw Content End ---');

            const cleaned = aiContent.replace(/```json/g, '').replace(/```/g, '').trim();
            console.log('--- Cleaned Content Start ---');
            console.log(cleaned);
            console.log('--- Cleaned Content End ---');

            try {
                const parsed = JSON.parse(cleaned);
                console.log('✅ Parsing Successful');
                console.log(`Items count: ${Array.isArray(parsed) ? parsed.length : 1}`);
            } catch (e: any) {
                console.log('❌ Parsing Failed');
                console.log(`Error: ${e.message}`);
                // Try to find where it fails
                if (e.message.includes('position')) {
                    const match = e.message.match(/position (\d+)/);
                    if (match) {
                        const pos = parseInt(match[1]);
                        const start = Math.max(0, pos - 20);
                        const end = Math.min(cleaned.length, pos + 20);
                        console.log(`Context at position ${pos}: ...${cleaned.substring(start, end)}...`);
                        console.log('Character codes around failure:');
                        for (let i = start; i < end; i++) {
                            console.log(`${i}: ${cleaned[i]} (${cleaned.charCodeAt(i)})`);
                        }
                    }
                }
            }

        } catch (e: any) {
            console.log(`Line Parse Error: ${e.message}`);
        }
    }

} catch (e) {
    console.error(e);
}
