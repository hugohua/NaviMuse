import OpenAI from 'openai';
import { config, promptConfig } from '../config';
import { Song, CuratorResponse } from '../types';

/**
 * LLM 客户端 (基于 OpenAI 兼容接口 - Aliyun Qwen)
 * 负责构建 System Prompt, User Prompt 并处理 AI 的结构化输出。
 */
export class LLMClient {
    private client: OpenAI;
    private model: string;

    constructor() {
        this.client = new OpenAI({
            apiKey: config.ai.apiKey,
            baseURL: config.ai.baseURL,
        });
        this.model = config.ai.model;
    }

    /**
     * 核心策展方法: 根据上下文生成歌单
     * @param scenePrompt 用户输入的场景或提示词
     * @param userContextSummary 用户画像摘要 (如：喜欢爵士，处于默认模式)
     * @param candidates 候选歌曲列表 (已清洗)
     */
    async curatePlaylist(
        scenePrompt: string,
        userContextSummary: import('../types').UserProfile,
        candidates: Song[]
    ): Promise<CuratorResponse> {

        // 1. 压缩候选列表 (CSV 格式节省 Token)
        // 格式: ID:123|Title:Song|Artist:Singer|...
        const candidatesCSV = candidates.map(s =>
            `ID:${s.id}|Title:${s.title}|Artist:${s.artist}|Genre:${s.genre}|Fav:${s.starred ? 'Yes' : 'No'}`
        ).join('\n');

        const tagKnowledgeBase = promptConfig.tagCategories
            .flatMap(cat => Object.entries(cat.attributes).map(([tag, desc]) => `- "${tag}": ${desc}`))
            .join('\n');

        // 2. 构建 System Prompt (策展人设 & 规则)
        const systemPrompt = `
 # Role
You are a **Senior Music Curator and Cultural Decoder** with a deep understanding of music theory, Chinese pop culture, and internet trends.
Your goal is to curate the perfect playlist by filtering a list of candidate songs based on the User's "Long-term Taste" and "Current Scene".

# Knowledge Base: Context Understanding
Use the following logic to interpret User Tags/Scenes:
${tagKnowledgeBase}
# Execution Rules

1. **Selection Strategy**:
   - Select **up to 20** songs that best match the **Current Scene**.
   - **Quality > Quantity**: If only 5 songs fit the scene, return only 5. Do not force completely irrelevant songs.
   - **Dirty Data Handling**: If 'Genre' is "undefined", numeric, or missing, **infer the genre** based on the Artist and Title.

2. **Conflict Resolution (Crucial)**:
   - **Scene > Taste**: The **Current Scene** is the primary constraint. (e.g., If Scene="Gym", do NOT pick slow ballads even if the user loves them).
   - **Taste Alignment**: Within the valid songs for the Scene, prioritize those that match the **User Profile** (e.g., For "Gym", pick "Indie Rock" if the user loves Indie, rather than "Generic EDM").
   - **Blacklist**: Strictly adhere to the "Strictly Avoid" list unless the Scene explicitly demands it.

3. **Comment Style ("reason")**:
   - Language: **Chinese (Simplified)**.
   - Tone: Witty, concise, "Netizen-savvy" (网感).
   - *Example*: "这首前奏一响，老板的钉钉消息都听不见了。" (For Slacking)

4. **Output Format**:
   - Return **strictly valid JSON**.
   - Do NOT use markdown code blocks.
   - Do NOT include any conversational text.

# JSON Structure
{
  "scene": "Summarized Scene Title (Max 4 words)",
  "playlistName": "A creative, catchy title for the mix",
  "description": "A one-sentence description of the vibe.",
  "tracks": [
    { "songId": "Original ID string", "reason": "Short witty comment" }
  ]
}
`;

        // 3. 构建 User Prompt (注入当前上下文)

        // New Structured Profile Logic
        const p = userContextSummary;
        const tasteKeywords = p.technical_profile.summary_tags.join(", ");
        const blackList = p.technical_profile.blacklist_inference.join(", ");
        const userPersona = p.display_card.title;

        const content = `
User Profile Analysis (Long-term Taste):
- Persona: "${userPersona}"
- Music DNA: ${tasteKeywords}
- Taste Anchors: ${p.technical_profile.taste_anchors ? p.technical_profile.taste_anchors.join(", ") : "None"} (Look for songs with a similar vibe/style to these artists)
- Preferred Era: ${p.technical_profile.dimensions.era_preference}
- Vocal Taste: ${p.technical_profile.dimensions.vocal_style}
- Strictly Avoid: ${blackList}

Current Request:
- Scene/Mood: "${scenePrompt}"
- Instruction: Filter the Candidate Pool to find the best matches for this SCENE.

Candidate Pool:
${candidatesCSV}
`;

        // 4. 调用 AI
        // console.log('--- [DEBUG] System Prompt: ---\n', systemPrompt);
        // console.log('--- [DEBUG] User Prompt: ---\n', content);

        const response = await this.client.chat.completions.create({
            model: this.model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: content }
            ],
            response_format: { type: 'json_object' }, // 强制 JSON 模式确保稳定性
            temperature: 0.7, // 0.7 保证一定创意性但不过于发散
        });

        const result = response.choices[0].message.content;
        if (!result) throw new Error("Empty response from AI");

        // Cleanup markdown code blocks if present (handle ```json and ```)
        const cleanResult = result.replace(/```json/g, '').replace(/```/g, '').trim();

        try {
            return JSON.parse(cleanResult) as CuratorResponse;
        } catch (e) {
            console.error("Failed to parse AI response:", result);
            throw new Error("AI returned invalid JSON");
        }
    }
    /**
     * 用户画像分析
     * @param songs 用户近期/常听歌曲列表
     */
    async analyzeUserProfile(songs: Song[]): Promise<import('../types').UserProfile> {
        // 1. 压缩歌单信息
        const songsCSV = songs.map(s =>
            `Title:${s.title}|Artist:${s.artist}|Genre:${s.genre}|Plays:${s.playCount}`
        ).join('\n');

        const systemPrompt = `
# Role
You are an **Expert Music Profiler & Psychologist**.
Your goal is to analyze a user's listening history to create a dual-layer profile:
1. A **Technical Profile** for the recommendation engine.
2. A **Narrative Persona** for the user to read.

# Input Data
List of songs: 'Title | Artist | PlayCount | IsFavorite'

# Analysis Framework (Think step-by-step)
1. **Sonic Texture**: Acoustic vs. Electronic, High vs. Low BPM.
2. **Emotional Spectrum**: Melancholic (Emo) vs. Uplifting, Chill vs. Aggressive.
3. **Cultural Context**: Mandopop eras (80s/90s/00s), Western Pop, Niche genres.
4. **Artistic Anchors**: Identify 3-5 key artists that define their taste (Taste Anchors). Ignoring white noise.

# Output Format (Strict JSON)
- Do NOT use markdown code blocks (e.g. \`\`\`json).
- Return specific raw JSON only.

{
  "technical_profile": {
    "summary_tags": ["List", "of", "5", "core", "tags"],
    "taste_anchors": ["Artist A", "Artist B", "Artist C"],
    "dimensions": {
      "era_preference": "e.g., 2000s Mandopop focus",
      "energy_level": "e.g., Low-Mid (Chill)",
      "vocal_style": "e.g., Expressive Female Vocals"
    },
    "blacklist_inference": ["Genres unlikely to be liked"]
  },
  "display_card": {
    "title": "Short Persona Title (e.g., '浪漫的怀旧派')",
    "message": "A warm, insightful paragraph (max 150 words) in Chinese (Simplified). Use a psychological tone to explain their taste based on the analysis. Mention key artists."
  }
}
`;

        const userPrompt = `
Here is a sample of ${config.app.profileSampleSize} songs from my library (Starred / Most Played):

${songsCSV}

Please generate my User Persona in Strict JSON format.
`;

        console.log('[LLM] Generating User Profile with Sample:', config.app.profileSampleSize);

        const response = await this.client.chat.completions.create({
            model: this.model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            response_format: { type: 'json_object' },
            temperature: 0.8,
        });

        const result = response.choices[0].message.content;
        if (!result) throw new Error("Empty response from AI for profile analysis");

        // Cleanup markdown code blocks if present (handle ```json and ```)
        const cleanResult = result.replace(/```json/g, '').replace(/```/g, '').trim();

        try {
            return JSON.parse(cleanResult) as import('../types').UserProfile;
        } catch (e) {
            console.error("Failed to parse User Profile JSON:", cleanResult);
            throw new Error("AI returned invalid Profile JSON");
        }
    }
}


export const llmClient = new LLMClient();
