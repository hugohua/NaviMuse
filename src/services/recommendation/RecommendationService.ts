import { GeminiService } from '../ai/GeminiService';
import { Song, CuratorResponse, UserProfile } from '../../types';

/**
 * 推荐服务 (Recommendation Service)
 * 负责构建 System Prompt, User Prompt 并处理 AI 的结构化输出。
 * 原 LLMClient
 */
export class RecommendationService {
    private geminiService: GeminiService;

    constructor() {
        this.geminiService = new GeminiService();
    }

    /**
     * 核心策展方法: 根据上下文生成歌单
     * @param scenePrompt 用户输入的场景或提示词
     * @param userContextSummary 用户画像摘要 (如：喜欢爵士，处于默认模式)
     * @param candidates 候选歌曲列表 (已清洗)
     */
    async curatePlaylist(
        scenePrompt: string,
        userContextSummary: UserProfile,
        candidates: Song[]
    ): Promise<CuratorResponse> {
        return this.geminiService.curatePlaylist(scenePrompt, candidates, 20, userContextSummary);
    }
    /**
     * 用户画像分析
     * @param songs 用户近期/常听歌曲列表
     */
    async analyzeUserProfile(songs: Song[]): Promise<UserProfile> {
        // Delegate to GeminiService
        return this.geminiService.analyzeUserProfile(songs);
    }
}


export const recommendationService = new RecommendationService();
