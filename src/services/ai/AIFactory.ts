import { IAIService } from './IAIService';
import { QwenService } from './QwenService';
import { GeminiService } from './GeminiService';
import { LocalAIService } from './LocalAIService';
import { systemRepo } from '../../db';

export class AIFactory {
    static getService(): IAIService {
        // Priority: DB Setting > Env Var > Default
        const dbProvider = systemRepo.getSetting('ai_provider');
        let provider = dbProvider || process.env.AI_PROVIDER || 'local';

        console.log(`[AIFactory] Initializing AI Service with provider: ${provider} (DB: ${dbProvider || 'null'})`);

        provider = provider.toLowerCase();

        // 'openrouter' (frontend value) or 'gemini' (legacy env value) -> GeminiService
        if (provider === 'gemini' || provider === 'openrouter') {
            return new GeminiService();
        }

        // 'aliyun' -> QwenService
        if (provider === 'aliyun') {
            return new QwenService();
        }

        // 'local' or default fallback -> LocalAIService
        return new LocalAIService();
    }
}
