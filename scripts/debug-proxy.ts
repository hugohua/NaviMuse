import dotenv from 'dotenv';
import path from 'path';
import nodeFetch from 'node-fetch';
import { HttpsProxyAgent } from 'https-proxy-agent';

// Load .env
dotenv.config({ path: path.join(__dirname, '../.env') });

async function main() {
    console.log("=== Debugging Proxy & Connectivity ===");
    const proxy = process.env.HTTPS_PROXY;
    console.log(`HTTPS_PROXY: ${proxy}`);

    if (!proxy) {
        console.error("ERROR: HTTPS_PROXY is not set!");
        return;
    }

    const agent = new HttpsProxyAgent(proxy);
    const url = "https://generativelanguage.googleapis.com/v1beta/models?key=" + process.env.GEMINI_API_KEY;

    console.log(`Testing connection to: ${url.split('?')[0]}...`);

    try {
        const res = await nodeFetch(url, { agent });
        console.log(`Response Status: ${res.status} ${res.statusText}`);

        if (res.ok) {
            console.log("Connection Successful!");
            const data = await res.json();
            console.log("Models found:", (data as any).models?.length);
            console.log("Model Names:", (data as any).models?.map((m: any) => m.name).filter((n: string) => n.includes('flash')));
        } else {
            console.error("Connection Failed:", await res.text());
        }

    } catch (e: any) {
        console.error("Fetch Exception:", e.message);
        console.error("Code:", e.code);
    }
}

main();
