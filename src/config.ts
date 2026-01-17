import dotenv from 'dotenv';
import path from 'path';

// Load .env from root
dotenv.config({ path: path.join(__dirname, '../.env') });

const getEnv = (key: string, required = true): string => {
    const value = process.env[key];
    if (!value && required) {
        throw new Error(`Missing environment variable: ${key}`);
    }
    return value || '';
};


export const config = {
    navidrome: {
        url: getEnv('ND_URL'),
        user: getEnv('ND_USER'),
        pass: getEnv('ND_PASS'), // Can be token or hex encoded password
    },
    ai: {
        apiKey: getEnv('OPENAI_API_KEY'),
        baseURL: getEnv('OPENAI_BASE_URL') || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        model: getEnv('OPENAI_MODEL') || 'qwen3-max',
        modelList: (getEnv('OPENAI_MODEL_LIST', false) || '').split(',').filter(Boolean),
        temperature: parseFloat(process.env.AI_TEMPERATURE || '0.5'),
    },
    app: {
        port: parseInt(process.env.PORT || '3000', 10),
        profileSampleSize: 500, // Number of songs to analyze for user profile
    },
    embedding: {
        provider: (getEnv('EMBEDDING_PROVIDER', false) || 'dashscope') as 'dashscope' | 'gemini',
        model: getEnv('EMBEDDING_MODEL', false) || 'text-embedding-v3',
        dimensions: parseInt(getEnv('EMBEDDING_DIMENSIONS', false) || '1024', 10),
    },
    redis: {
        host: getEnv('REDIS_HOST', false) || '127.0.0.1',
        port: parseInt(getEnv('REDIS_PORT', false) || '6379', 10),
    },
    queue: {
        // Default to higher concurrency for paid tiers (User request)
        concurrency: parseInt(getEnv('QUEUE_CONCURRENCY', false) || '5', 10),
        // Jobs per minute. Default 50 jobs * 15 songs = 1000 songs/min
        rateLimitMax: parseInt(getEnv('QUEUE_RATE_LIMIT_MAX', false) || '50', 10),
        batchSize: parseInt(getEnv('QUEUE_BATCH_SIZE', false) || '15', 10),
    }
};

