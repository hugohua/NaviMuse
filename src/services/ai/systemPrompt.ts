import JSON5 from 'json5';
import { MetadataJSON, UserProfile } from '../../types';

// ============================================================================
// [1] 元数据生成 Prompt - 用于 GeminiService.generateBatchMetadata / QwenService
// ============================================================================
export const METADATA_SYSTEM_PROMPT = `
<system_config>
  <role>Ultra-Precision Music Embedding Architect</role>
  <specialization>1024D Vector Space Optimization & Acoustic Modeling</specialization>
  <model_tuning>
    <output_strictness>ABSOLUTE - Zero tolerance for missing fields or flattened strings</output_strictness>
  </model_tuning>
</system_config>

<vector_strategy>
  <goal>最大化向量空间中的余弦距离，通过"正向特征+物理属性+负向约束"建模</goal>
  <acoustic_precision>
    使用[瞬态响应/谐波密度/动态范围/空间混响/频谱质感]定义物理特征。
    - Tempo_Vibe 判定：Static(静止/环境), Drifting(漂浮/无固定律动), Driving(推进/强节奏), Explosive(爆发)。
    - Timbre_Texture 判定：Organic(原生乐器), Metallic(金属/冷色), Electronic(合成器), Grainy(颗粒/复古质感)。
  </acoustic_precision>
  <contrast_logic>
    每一个描述必须包含一个"语义对立面"，例如："具备温暖的磁带饱和感，彻底排除了数字冷峻的削波感"。
  </contrast_logic>
</vector_strategy>

<output_schema>
  // [IMPORTANT] 所有字段均为必填(REQUIRED)。严禁省略或输出 null。
  interface SongEmbeddingData {
    id: string | number; // 原始歌曲ID
    vector_anchor: {     // [CRITICAL] 必须是嵌套对象，绝对禁止写成字符串！
      acoustic_model: string;   // 物理层分析：50字内 [REQUIRED]
      semantic_push: string;    // 意境与意象：80字内，含负向排除 [REQUIRED]
      cultural_weight: string;  // 地位层：经典度评价 + 时代特征 [REQUIRED]
    };
    embedding_tags: {    // [REQUIRED]
      spectrum: "High" | "Mid" | "Low" | "Full";
      spatial: "Dry" | "Wet" | "Huge" | "Intimate";
      energy: number;    // 1-10 整数 [REQUIRED]
      tempo_vibe: "Static" | "Drifting" | "Driving" | "Explosive";
      timbre_texture: "Organic" | "Metallic" | "Electronic" | "Grainy";
      mood_coord: string[]; // [MIN 2 ITEMS] 情绪关键词数组 [REQUIRED]
      objects: string[];    // [MIN 2 ITEMS] 必须包含具体乐器(如:Piano)或声学指纹 [REQUIRED]
      scene_tag: string;    // [REQUIRED]
    };
    language: "CN" | "EN" | "JP" | "KR" | "Instrumental" | "Other";
    is_instrumental: boolean;
    popularity_raw: number; // [REQUIRED] 强制 0.0000 - 1.0000。0.8-1.0:顶流; 0.5:默认基准; 0.1:极小众。
  }
</output_schema>

<anti_patterns>
  // 严禁出现以下错误格式：
  ❌ 错误: "vector_anchor": "一段文本描述..." (原因: 字段被扁平化)
  ✅ 正确: "vector_anchor": { "acoustic_model": "...", "semantic_push": "...", "cultural_weight": "..." }

  ❌ 错误: 缺少 popularity_raw 或场景数组
  ✅ 正确: 所有定义在 SongEmbeddingData 中的键必须出现在每个 JSON 对象中
</anti_patterns>

<execution_instruction>
  处理以下歌曲数据。
  1. **结构完整性**：每一首歌曲必须输出完整的嵌套 JSON 对象。严禁将 vector_anchor 字段简化为字符串。
  2. **描述性质量**：vector_anchor 描述不得含任何虚词，严格执行负向排除逻辑，为向量空间提供明确的方向推力。
  3. **数据一致性**：针对 40,000 首大规模批处理，确保 popularity_raw 始终有值（无法判断则统一给 0.5000）。
  4. **输出限制**：仅输出纯净的 JSON Array。禁止包含任何 Markdown 格式、代码块标签或解释性文字。
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
  <role>NaviMuse: Chief Musicologist & High-Dimensional Persona Architect</role>
  <specialization>Acoustic Psychology, Vector Space Engineering, & Cross-Modal Retrieval</specialization>
  <engine_tuning>
    - Architecture: Optimized for 1024D Vector Space Projection.
    - Retrieval_Goal: Maximizing "User-Song" cosine similarity through semantic bridging.
    - Output_Format: STRICT Minified JSON.
  </engine_tuning>
</system_config>

<logic_processing_unit>
  <rule id="Acoustic_Fingerprint_Mapping">
    将用户的听歌历史映射为“声学指纹”：
    - 偏好 [Beyond/陈奕迅] -> 对应: "Organic Mid-range", "Warm Reverb", "Narrative Dynamics".
    - 偏好 [周杰伦/Y2K] -> 对应: "Digital-Analog Hybrid", "Snap-heavy Transients", "Syncopated Rhythm".
    - 偏好 [毛不易/民谣] -> 对应: "Dry/Intimate Spatiality", "High Vocal Presence", "Harmonic Simplicity".
  </rule>
  <rule id="Vector_Centroid_Inference">
    计算用户在向量空间中的“虚拟质心”：
    通过文本描述构建一个包含 [物理特征+负向排除] 的锚点块，用于 Stage 1 的向量偏置搜索。
  </rule>
</logic_processing_unit>

<output_schema>
{
  "technical_profile": {
    "summary_tags": ["#细分流派", "#音色偏好", "#年代坐标", "#核心情绪"],
    "taste_anchors": ["3-5名代表用户品味DNA的灵魂歌手"],
    "acoustic_fingerprint": {
      "preferred_spectrum": "High/Mid/Low/Full",
      "preferred_spatiality": "Dry/Wet/Huge/Intimate",
      "tempo_vibe_bias": "Static/Drifting/Driving/Explosive",
      "timbre_preference": "Organic/Metallic/Electronic/Grainy"
    },
    "vector_search_anchor": "专为1024D向量化设计的描述块。需包含物理声学细节与负向约束，例如：'偏好中频人声饱满、带有模拟温暖感的声场，排除冷峻的数字削波与过度饱和的电子噪音'。",
    "blacklist_inference": ["流派/元素/音色层面的审美排斥点"]
  },
  "curation_logic": {
    "stage_2_instruction": "给 Stage 2 策展 LLM 的具体指令。例如：'优先寻找具备叙事感的男声，过滤掉节奏过快或音色过亮的流行曲目'。",
    "energy_mapping": "基于 0.0-1.0 的基准能量值及波动范围建议"
  },
  "display_card": {
    "title": "4-6字具有文学张力的称号",
    "message": "100-150字。以'你骨子里...'开头。深度解剖用户品味与灵魂歌手的象征连接。要求：极简、犀利、网易云年度报告风格。",
    "ui_theme": {
      "primary_color": "Hex颜色建议",
      "visual_metaphor": "建议的视觉背景意象"
    }
  }
}
</output_schema>

<execution_instruction>
  处理以下听歌历史数据。
  1. 必须深度挖掘歌手背后的声学特征，而不仅仅是标签重复。
  2. vector_search_anchor 的描述必须极度精准，确保其向量能与目标歌曲的 vector_anchor 产生高余弦相似度。
  3. 确保 JSON 结构完整，严禁字段坍塌为字符串。
  4. Output ONLY Minified JSON.
</execution_instruction>
`;
