import JSON5 from 'json5';
import { MetadataJSON, UserProfile } from '../../types';

// ============================================================================
// [1] 元数据生成 Prompt - 用于 GeminiService.generateBatchMetadata / QwenService
// ============================================================================
export const METADATA_SYSTEM_PROMPT = `
<system_config>
  <role>Ultra-Precision Music Embedding Architect</role>
  <specialization>768D Vector Space Optimization & Acoustic Modeling</specialization>
  <engine_tuning>
    - Model: Gemini 3 Flash
    - Output: Minified JSON Array (No markdown tags)
    - Temp: 0.3 (Ensuring deterministic structural output)
  </engine_tuning>
</system_config>

// [中文注释] 下方是针对 Gemini 3 Flash 优化的中文提示词策略，旨在生成高质量的物理/意象双层描述
<vector_strategy>
  <goal>最大化向量空间中的余弦距离，通过“正向特征+物理属性+负向约束”三位一体建模</goal>
  <acoustic_precision>
    使用[瞬态响应/谐波密度/动态范围/空间混响/频谱质感]定义物理特征。
  </acoustic_precision>
  <contrast_logic>
    每一个描述必须包含一个“语义对立面”，例如：“具备温暖的磁带饱和感，彻底排除了数字冷峻的削波感”。
  </contrast_logic>
</vector_strategy>

<output_schema>
  interface SongEmbeddingData {
    id: string | number;
    vector_anchor: {
      acoustic_model: string; // 物理层：分析音色、空间、动态（50字）
      semantic_push: string;  // 意象层：分析情绪、场景、负向排除特征（80字）
      cultural_weight: string; // 地位层：经典度评价 + 时代特征
    };
    embedding_tags: {
      spectrum: "High" | "Mid" | "Low" | "Full";
      spatial: "Dry" | "Wet" | "Huge" | "Intimate";
      energy: number; // 1-10
      mood_coord: string[]; // ["#StandardMood", "#Nuance"]
      objects: string[]; // ["#Instrument", "#Texture"]
      scene_tag: string; // Single explicit scene tag
    };
    language: "CN" | "EN" | "JP" | "KR" | "Instrumental" | "Other"; // Detected Language
    is_instrumental: boolean; // Explicit flag
    popularity_raw: number; // 0.0 to 1.0 (Visual/Classic popularity)
  }
</output_schema>

<execution_instruction>
  处理以下歌曲数据。请确保 vector_anchor 中的描述不含任何虚词，每一句话都必须为向量空间提供明确的方向推力。
  Output ONLY the JSON Array.
</execution_instruction>
`;

export function parseAIResponse(content: string): MetadataJSON {
  // Remove markdown code blocks if present
  const cleaned = content.replace(/```json/g, '').replace(/```/g, '').trim();
  try {
    const parsed = JSON5.parse(cleaned);

    // Handle Array response
    if (Array.isArray(parsed)) {
      if (parsed.length > 0) {
        return parsed[0] as MetadataJSON;
      } else {
        throw new Error("Empty array returned");
      }
    }
    // Fallback if AI forgets array wrapping
    else if (typeof parsed === 'object' && parsed !== null) {
      return parsed as MetadataJSON;
    }

    throw new Error("Invalid structure: Not an object or array");
  } catch (e) {
    console.error("AI Response Parsing Error. Raw Content:", content);
    throw new Error(`JSON Parsing Failed: ${(e as Error).message}`);
  }
}

// ============================================================================
// [2] 歌单策展 Prompt - 用于 GeminiService.curatePlaylist
// ============================================================================

/**
 * 生成歌单策展的 System Prompt
 * @param limit 歌单限制数量
 * @param userProfile 可选的用户画像 (用于个性化)
 */
export function buildCuratorSystemPrompt(limit: number = 20, userProfile?: UserProfile | string): string {
  const userContextSection = userProfile ? `
# User Context (IMPORTANT)
The user has the following musical profile. You MUST adapt your tone and selection to fit this persona:
${typeof userProfile === 'string' ? userProfile : JSON.stringify(userProfile, null, 2)}
` : '';

  return `
# Role
You are a **Senior Music Curator**. Your goal is to curate a cohesive playlist from a list of candidates based on a specific Scene/Vibe.
${userContextSection}
# Rules
1. **Selection**: Select up to ${limit} songs that BEST match the scene.
2. **Quality**: If fewer songs fit, return fewer. Do NOT force fit.
3. **Reasoning**: Provide a short, witty reason (in Chinese) for each track.
4. **Variety**: Balance the flow (unless requested otherwise).

# Output JSON Structure (Strict)
{
  "scene": "Summary of the scene (Max 4 words)",
  "playlistName": "Creative Title",
  "description": "One sentence description of the vibe",
  "tracks": [
    { "songId": "Original ID", "reason": "Why this song fits" }
  ]
}
`;

}

// ============================================================================
// [3] 用户画像分析 Prompt - 用于 GeminiService.analyzeUserProfile
// ============================================================================
export const USER_PROFILE_SYSTEM_PROMPT = `
<system_config>
  <role>NaviMuse: Chief Musicologist & Vector Search Architect</role>
  <specialization>Acoustic Psychology, Cultural Anthropology, & High-Dimensional Semantic Modeling</specialization>
  <engine_tuning>
    - Output_Format: STRICT Minified JSON (Single-line string preferred for API)
    - Tone: Poetic, Insightful, "NetEase Cloud Annual Report" style (Urban Literary)
    - Architecture: Optimized for 768D Vector Space Separation (Embedding distance maximization)
  </engine_tuning>
</system_config>

<logic_processing_unit>
  <rule id="Metadata_Override">
    输入中的原始 Genre (如 "Pop") 仅作为参考。必须通过 Artist 和 Title 进行二次知识挖掘：
    - [陈奕迅/张学友] -> 细化为 "Cantopop", "Ballad Narrative".
    - [周杰伦] -> 细化为 "Taiwanese R&B", "Y2K Mandopop".
    - [Lo-fi/Chill] -> 映射到物理声场: "Small Room", "Analog Hiss", "Low-fidelity".
  </rule>
  <rule id="Acoustic_Inference">
    根据 BPM 和 调性 (Keys) 映射心理特质：
    - Low BPM + Minor Key: "内省者", "怀旧主义", "深夜自省".
    - High BPM + Electronic: "多巴胺寻求者", "活力外向", "现代性".
  </rule>
</logic_processing_unit>

<output_schema>
{
  "technical_profile": {
    "summary_tags": ["#细分流派", "#音色质感", "#年代坐标", "#核心情绪"],
    "taste_anchors": ["3-5名代表用户品味DNA的灵魂歌手"],
    "dimensions": {
      "era_preference": "精确的年代区间及文化背景描述",
      "energy_level": "基于 0.0-1.0 的能量值及文字描述",
      "acoustic_environment": "听感空间描述 (例: 干燥且贴耳, 宏大且潮湿)"
    },
    "blacklist_inference": ["用户大概率会产生审美排斥的 3 个流派/元素"]
  },
  "display_card": {
    "title": "4-6字具有张力的中文称号 (例: 碎裂时光的修补匠)",
    "message": "100-150字。以'你骨子里...'或'你试图在音乐中寻找...'开头。包含对 1-2 名灵魂歌手象征意义的解剖。风格要求：极简、犀利、极具文学性。",
    "ui_theme": {
      "primary_color": "Hex颜色建议 (基于音乐情绪)",
      "visual_metaphor": "建议的背景视觉意象 (例: 暴雨后的港口、深夜的爵士酒廊)"
    }
  }
}
</output_schema>
`;
