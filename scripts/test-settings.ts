import fetch from 'node-fetch';
import { db, systemRepo } from '../src/db';

const API_BASE = 'http://localhost:3000/api';

async function verifySettings() {
    console.log("=== Testing Dynamic Settings ===\n");

    // 1. Initial State
    console.log("1. Checking Initial Settings in DB...");
    const initialSettings = systemRepo.getAllSettings();
    console.log("   Current DB Settings:", initialSettings);

    // 2. Test API: Save Settings
    console.log("\n2. Testing POST /api/settings...");
    const testModel = "google/gemini-2.0-flash-exp:ver-test";
    const res = await fetch(`${API_BASE}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            settings: {
                ai_provider: 'openrouter',
                ai_model: testModel
            }
        })
    });

    if (!res.ok) throw new Error(`API failed: ${res.statusText}`);
    console.log("   -> API reported success.");

    // 3. Verify Persistence
    console.log("\n3. Verifying Persistence in DB...");
    const savedModel = systemRepo.getSetting('ai_model');
    if (savedModel === testModel) {
        console.log(`   -> SUCCESS: Model updated to '${savedModel}'`);
    } else {
        console.error(`   -> FAIL: Expected '${testModel}', got '${savedModel}'`);
    }

    // 4. Test OpenRouter Models Proxy
    console.log("\n4. Testing GET /api/settings/models/openrouter...");
    const modelsRes = await fetch(`${API_BASE}/settings/models/openrouter`);
    if (modelsRes.ok) {
        const data = await modelsRes.json();
        // @ts-ignore
        console.log(`   -> SUCCESS: Fetched ${data.models?.length} models.`);
        // @ts-ignore
        if (data.models?.length > 0) {
            // @ts-ignore
            console.log(`   -> Sample: ${data.models[0].name} (${data.models[0].id})`);
        }
    } else {
        console.error(`   -> FAIL: Fetch models failed: ${modelsRes.status}`);
    }

    console.log("\n=== Verification Complete ===");
}

verifySettings().catch(console.error);
