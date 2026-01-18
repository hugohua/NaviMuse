
/**
 * OpenRouter 连通性验证脚本
 * 
 * 功能：
 * 1. 验证 OpenRouter SDK 和 API Key 是否配置正确
 * 2. 测试通过 SDK 进行简单推理的可行性
 * 
 * 用法：
 * npx ts-node --project tsconfig.server.json scripts/verify-openrouter.ts
 */
import { OpenRouter } from "@openrouter/sdk";
import { HttpsProxyAgent } from 'https-proxy-agent';
import nodeFetch from 'node-fetch';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// --- Proxy Configuration ---
const proxyUrl = process.env.HTTPS_PROXY;
if (proxyUrl) {
    console.log(`[Verify] Configuring Proxy: ${proxyUrl}`);
    const agent = new HttpsProxyAgent(proxyUrl);

    // @ts-ignore
    global.fetch = async (input: RequestInfo, init?: RequestInit) => {
        let url = '';
        let options: any = {
            agent: agent,
            ...init
        };

        if (typeof input === 'string') {
            url = input;
        } else if (input && typeof input === 'object' && 'url' in input) {
            const req = input as any;
            url = req.url;
            options.method = options.method || req.method;
            options.headers = options.headers || req.headers;

            if (!options.body && req.body) {
                try {
                    options.body = await req.text();
                } catch (e) { /* ignore */ }
            }
        }

        console.log(`[Verify] Fetch URL: ${url}`);
        return nodeFetch(url, options);
    };
} else {
    console.log('[Verify] No Proxy configured.');
    // Polyfill fetch for Node environment if needed (though node 18+ has it, safe to polyfill if strictly node-fetch is used for proxy)
    if (!global.fetch) {
        // @ts-ignore
        global.fetch = nodeFetch;
    }
}

async function main() {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
        console.error("Error: OPENROUTER_API_KEY not found in .env");
        process.exit(1);
    }
    console.log(`[Verify] API Key found (ends with ...${apiKey.slice(-4)})`);

    const openRouter = new OpenRouter({
        apiKey: apiKey
    });

    console.log('[Verify] Sending request to OpenRouter (google/gemini-2.0-flash-exp:free)...');

    try {
        // @ts-ignore
        const result = await openRouter.chat.send({
            messages: [
                {
                    role: "user",
                    content: "Hello, what models are you?",
                },
            ],
            model: "google/gemini-2.0-flash-exp:free",
        });

        console.log('\n[Verify] Response received:');
        console.log('--------------------------------------------------');
        console.log(JSON.stringify(result, null, 2));
        console.log('--------------------------------------------------');
        console.log('[Verify] Success!');

    } catch (error) {
        console.error('\n[Verify] Failed:', error);
    }
}

main();
