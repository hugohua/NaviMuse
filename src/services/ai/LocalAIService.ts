import { BaseOpenAIService } from './BaseOpenAIService';
import { config } from '../../config';
import { systemRepo } from '../../db';

export class LocalAIService extends BaseOpenAIService {
    constructor() {
        super(config.etl.apiKey, config.etl.baseURL);
    }

    protected getModelName(): string {
        const dbModel = systemRepo.getSetting('ai_model');
        // 当为 local 参数时，如果没有特别在前端选择模型，则使用默认的 etl 模型
        if (dbModel && systemRepo.getSetting('ai_provider') === 'local') {
            // 可以通过设置模型下拉让客户自己选，如果有配走 DB
            return dbModel;
        }
        return config.etl.model;
    }
}
