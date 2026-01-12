import dotenv from 'dotenv';
import path from 'path';

// Load env before imports that might check it
dotenv.config({ path: path.join(process.cwd(), '.env') });

import { EmbeddingService } from '../src/services/ai/EmbeddingService';
import { db, initDB } from '../src/db';
import { metadataRepo } from '../src/db';

initDB();

async function main() {
    console.log("Beginning Verification Plan...");

    // 1. Test Embedding Generation
    console.log("\n[Step 1] Testing Embedding Service...");
    const service = new EmbeddingService();
    // Use a test phrase
    const testText = "Sad song about a heartbreak in winter";
    let vector: number[];

    try {
        console.log(`Generating embedding for: "${testText}"`);
        vector = await service.embed(testText);
        console.log(`Success! Vector length: ${vector.length}`);

        if (vector.length !== 768) {
            console.error(`ERROR: Expected 768 dimensions, got ${vector.length}`);
            process.exit(1);
        }
    } catch (err) {
        console.error("Embedding generation failed:", err);
        process.exit(1);
    }

    // 2. Test DB Insertion
    console.log("\n[Step 2] Testing DB Insertion...");
    // Find a valid song rowid or insert a dummy one
    // Let's insert a dummy song into smart_metadata for testing
    const testId = `test_vec_${Date.now()}`;

    // We need to insert directly to smart_metadata to get a rowid
    const insertInfo = db.prepare(`
        INSERT INTO smart_metadata (navidrome_id, title, artist, file_path) 
        VALUES (?, ?, ?, ?)
    `);

    try {
        insertInfo.run(testId, "Test Title", "Test Artist", "/tmp/test.mp3");
        console.log(`Inserted test song with ID: ${testId}`);
    } catch (err) {
        // If it exists, that's fine
        console.log("Test song might already exist, continuing...");
    }

    const rowId = metadataRepo.getSongRowId(testId);
    if (!rowId) {
        console.error("Could not retrieve rowid for test song");
        process.exit(1);
    }
    console.log(`Generic RowID: ${rowId}`);

    try {
        metadataRepo.saveVector(rowId, vector!);
        console.log("Vector saved successfully.");
    } catch (err) {
        console.error("Vector save failed:", err);
        process.exit(1);
    }

    // 3. Test Retrieval / Search
    console.log("\n[Step 3] Testing Vector Search...");
    // We search for something similar
    // We need to generate a query vector
    const queryText = "Songs about winter heartbreak";
    const queryVector = await service.embed(queryText);

    // Manual search query
    // vector_distance returns distance, we order by it ASC
    const searchStmt = db.prepare(`
        SELECT 
            rowid, 
            distance 
        FROM vec_songs 
        WHERE embedding MATCH ? 
        ORDER BY distance 
        LIMIT 5
    `);

    // vec0 MATCH operator expects the raw float array as well? 
    // Usually standard FTS match syntax is different, but for vec0/sqlite-vec:
    // "WHERE embedding MATCH ?" binding the vector works.

    try {
        const results = searchStmt.all(new Float32Array(queryVector));
        console.log("Search Results:", results);

        const found = results.find(r => (r as any).rowid === rowId);
        if (found) {
            console.log("SUCCESS: Found our inserted test song in search results!");
        } else {
            console.warn("WARNING: Test song not found in top 5 (might be distance issue or empty DB)");
        }
    } catch (err) {
        console.error("Search query failed:", err);
        console.log("Detailed error:", err);
        process.exit(1);
    }

    console.log("\nVerification Complete!");
}

main().catch(console.error);
