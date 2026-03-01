import { BaseOpenAIService } from './BaseOpenAIService';
import { config } from '../../config';
import { systemRepo } from '../../db';

export class QwenService extends BaseOpenAIService {
    constructor() {
        super(config.ai.apiKey, config.ai.baseURL);
    }

    protected getModelName(): string {
        const dbModel = systemRepo.getSetting('ai_model');
        if (dbModel) return dbModel;
        return config.ai.model;
    }
}
