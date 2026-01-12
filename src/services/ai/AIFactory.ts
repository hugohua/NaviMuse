import { IAIService } from './IAIService';
import { QwenService } from './QwenService';
import { GeminiService } from './GeminiService';

export class AIFactory {
    static getService(): IAIService {
        const provider = process.env.AI_PROVIDER || 'qwen';

        console.log(`[AIFactory] Initializing AI Service with provider: ${provider}`);

        if (provider.toLowerCase() === 'gemini') {
            return new GeminiService();
        }

        return new QwenService();
    }
}
