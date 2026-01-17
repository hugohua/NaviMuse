import { IAIService } from './IAIService';
import { QwenService } from './QwenService';
import { GeminiService } from './GeminiService';
import { systemRepo } from '../../db';

export class AIFactory {
    static getService(): IAIService {
        // Priority: DB Setting > Env Var > Default
        const dbProvider = systemRepo.getSetting('ai_provider');
        const provider = dbProvider || process.env.AI_PROVIDER || 'gemini';

        console.log(`[AIFactory] Initializing AI Service with provider: ${provider} (DB: ${dbProvider || 'null'})`);

        // 'openrouter' (frontend value) or 'gemini' (legacy env value) -> GeminiService
        if (provider.toLowerCase() === 'gemini' || provider.toLowerCase() === 'openrouter') {
            return new GeminiService();
        }

        // 'aliyun' or default fallback -> QwenService
        return new QwenService();
    }
}
