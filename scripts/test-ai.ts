import { AIFactory } from '../src/services/ai';
import path from 'path';
import dotenv from 'dotenv';

// Load .env from root
dotenv.config({ path: path.join(__dirname, '../.env') });

async function main() {
    console.log("=== Testing AI Factory & Service ===");
    console.log("Provider:", process.env.AI_PROVIDER || 'Default (Qwen)');
    console.log("Gemini Model:", process.env.GEMINI_MODEL || 'Default');
    console.log("Proxy:", process.env.HTTPS_PROXY ? 'Set' : 'Not Set');

    try {
        const service = AIFactory.getService();
        console.log("Service created successfully.");

        // Test with a sample song
        // Using a song that definitely requires inference to test V4 prompt logic if possible, 
        // or a well known one to check accuracy.
        const artist = "周杰伦";
        const title = "以父之名";

        console.log(`\nGenerating metadata for: ${artist} - ${title}`);
        console.log("Waiting for AI response...");

        const metadata = await service.generateMetadata(artist, title);

        console.log("\n>>> AI Response Result:");
        console.log(JSON.stringify(metadata, null, 2));

        if (!metadata.vector_description) throw new Error("Missing Vector Description");
        if (!metadata.tags || metadata.tags.length === 0) throw new Error("Missing Tags");
        if (!metadata.tags[0].startsWith('#')) console.warn("Tags do not start with #");

        console.log("\nValidation Passed!");
    } catch (e: any) {
        console.error("\n!!! Error Occurred !!!");
        console.error(e);
        // Print cause if available
        if (e.cause) console.error("Cause:", e.cause);
    }
}

main();
