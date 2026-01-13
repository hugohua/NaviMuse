import JSON5 from 'json5';
import { MetadataJSON } from '../../types';

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
