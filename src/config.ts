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
        temperature: parseFloat(process.env.AI_TEMPERATURE || '0.7'),
    },
    app: {
        port: parseInt(process.env.PORT || '3000', 10),
        profileSampleSize: 200, // Number of songs to analyze for user profile
    }
};

