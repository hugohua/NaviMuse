# 元数据生成测试报告

生成时间: 2026-01-17T01:42:25.237Z

测试歌曲数: 20


## System Prompt

```xml

<system_config>
  <role>Ultra-Precision Music Embedding Architect</role>
  <specialization>1024D Vector Space Optimization & Acoustic Modeling</specialization>
</system_config>

<vector_strategy>
  <goal>最大化向量空间中的余弦距离，通过“正向特征+物理属性+负向约束”建模</goal>
  <acoustic_precision>
    使用[瞬态响应/谐波密度/动态范围/空间混响/频谱质感]定义物理特征。
    - Tempo_Vibe 判定：Static(静止/环境), Drifting(漂浮/无固定律动), Driving(推进/强节奏), Explosive(爆发)。
    - Timbre_Texture 判定：Organic(原生乐器), Metallic(金属/冷色), Electronic(合成器), Grainy(颗粒/复古质感)。
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
      tempo_vibe: "Static" | "Drifting" | "Driving" | "Explosive";
      timbre_texture: "Organic" | "Metallic" | "Electronic" | "Grainy";
      mood_coord: string[]; 
      objects: string[]; 
      scene_tag: string; 
    };
    language: "CN" | "EN" | "JP" | "KR" | "Instrumental" | "Other";
    is_instrumental: boolean;
    popularity_raw: number; 
  }
</output_schema>

<execution_instruction>
  处理以下歌曲数据。
  1. 确保 vector_anchor 中的描述不含任何虚词。
  2. 针对 tempo_vibe 和 timbre_texture，必须基于音频制作逻辑严谨打标。
  3. Output ONLY the JSON Array (No Markdown blocks).
</execution_instruction>

```


## User Prompt (输入)

```json
[{"id":1,"title":"金兰结","artist":"于台烟&郭崇仪"},{"id":2,"title":"惑","artist":"刘雪芳"},{"id":3,"title":"铁警雄风","artist":"姜鄂"},{"id":4,"title":"牛车水人家","artist":"巫启贤"},{"id":5,"title":"不夜城传奇","artist":"徐小凤"},{"id":6,"title":"满满的幸福","artist":"石欣卉"},{"id":7,"title":"亚答籽","artist":"翁素英&蔡振雄"},{"id":8,"title":"岛的儿子","artist":"翁素英&蔡振雄"},{"id":9,"title":"爱不胜防","artist":"苏梽诚&魏妙如"},{"id":10,"title":"责任","artist":"邓碧源"},{"id":11,"title":"爱一直都在","artist":"郑可为"},{"id":12,"title":"初衷","artist":"郑斌辉"},{"id":13,"title":"跟着我一起","artist":"郑斌辉"},{"id":14,"title":"信任","artist":"陈奕迅"},{"id":15,"title":"碌卡","artist":"陈奕迅"},{"id":16,"title":"重口味","artist":"陈奕迅"},{"id":17,"title":"Super no'1","artist":"卓文萱"},{"id":18,"title":"一秒也好","artist":"卓文萱"},{"id":19,"title":"在你身边","artist":"卓文萱"},{"id":20,"title":"幸福氧气","artist":"卓文萱"}]
```


## AI 生成结果 (元数据)

```json
[
  {
    "id": 1,
    "vector_anchor": {
      "acoustic_model": "双人声交叠对位，原声吉他与弦乐构建温暖共振腔，具备清晰的呼吸留白与动态起伏。",
      "semantic_push": "描绘忠义羁绊的古典意象，情绪庄重而内敛，彻底排除轻浮流行情歌的甜腻感。",
      "cultural_weight": "华语对唱经典范式，承载90年代戏曲化抒情传统"
    },
    "embedding_tags": {
      "spectrum": "Mid",
      "spatial": "Intimate",
      "energy": 6,
      "tempo_vibe": "Static",
      "timbre_texture": "Organic",
      "mood_coord": [
        "solemn",
        "loyalty",
        "melancholy"
      ],
      "objects": [
        "incense",
        "scroll",
        "mountain_path"
      ],
      "scene_tag": "ritual_bond"
    },
    "language": "CN",
    "is_instrumental": false,
    "popularity_raw": 72,
    "llm_model": "qwen-plus"
  },
  {
    "id": 2,
    "vector_anchor": "女声中频突出，电子合成器铺底伴随轻微相位颤动，形成心理压迫式的声场压缩感。",
    "semantic_push": "表达精神边界模糊的迷离状态，强调认知困惑而非感官刺激，彻底排除舞曲式的释放快感。",
    "cultural_weight": "千禧年前夜都市女性意识觉醒的隐喻文本",
    "embedding_tags": {
      "spectrum": "Low",
      "spatial": "Wet",
      "energy": 5,
      "tempo_vibe": "Drifting",
      "timbre_texture": "Electronic",
      "mood_coord": [
        "uncertainty",
        "introspection",
        "tension"
      ],
      "objects": [
        "mirror",
        "fog",
        "clock_face"
      ],
      "scene_tag": "mental_labyrinth"
    },
    "language": "CN",
    "is_instrumental": false,
    "popularity_raw": 68,
    "llm_model": "qwen-plus"
  },
  {
    "id": 3,
    "vector_anchor": "铜管乐主导的进行曲节奏，鼓点刚硬如踏步，高频镲片切割空气制造警觉性瞬态响应。",
    "semantic_push": "塑造执法者威严形象，情绪坚定不容置疑，彻底排除柔情或犹豫的人性化表达。",
    "cultural_weight": "体制内宣传音乐的典型声学模板",
    "embedding_tags": {
      "spectrum": "High",
      "spatial": "Dry",
      "energy": 9,
      "tempo_vibe": "Driving",
      "timbre_texture": "Metallic",
      "mood_coord": [
        "authority",
        "duty",
        "vigilance"
      ],
      "objects": [
        "badge",
        "uniform",
        "patrol_car"
      ],
      "scene_tag": "institutional_power"
    },
    "language": "CN",
    "is_instrumental": false,
    "popularity_raw": 54,
    "llm_model": "qwen-plus"
  },
  {
    "id": 4,
    "vector_anchor": "钢琴与南洋竹笛交替主奏，低频贝斯缓慢推进，空间混响模拟老街巷回音结构。",
    "semantic_push": "重构移民家庭的生活记忆，情绪怀旧但不沉溺，彻底排除现代化都市的效率焦虑。",
    "cultural_weight": "东南亚华人文化身份书写的代表作",
    "embedding_tags": {
      "spectrum": "Full",
      "spatial": "Huge",
      "energy": 6,
      "tempo_vibe": "Drifting",
      "timbre_texture": "Organic",
      "mood_coord": [
        "nostalgia",
        "resilience",
        "belonging"
      ],
      "objects": [
        "lantern",
        "wooden_door",
        "rain_gutter"
      ],
      "scene_tag": "heritage_district"
    },
    "language": "CN",
    "is_instrumental": false,
    "popularity_raw": 81,
    "llm_model": "qwen-plus"
  },
  {
    "id": 5,
    "vector_anchor": "大型管弦乐团编制搭配爵士鼓组，高频铜管爆发力强，动态范围极宽以匹配霓虹视觉想象。",
    "semantic_push": "渲染夜间都市的欲望流动，情绪亢奋而略带虚无，彻底排除田园牧歌式的宁静诉求。",
    "cultural_weight": "香港80年代摩登文化的听觉图腾",
    "embedding_tags": {
      "spectrum": "High",
      "spatial": "Huge",
      "energy": 8,
      "tempo_vibe": "Explosive",
      "timbre_texture": "Metallic",
      "mood_coord": [
        "glamour",
        "loneliness",
        "aspiration"
      ],
      "objects": [
        "neon_sign",
        "taxi",
        "highrise"
      ],
      "scene_tag": "urban_nightlife"
    },
    "language": "CN",
    "is_instrumental": false,
    "popularity_raw": 89,
    "llm_model": "qwen-plus"
  },
  {
    "id": 6,
    "vector_anchor": "明亮的合成器琶音循环，人声置于干声前置位置，整体谐波密度低以凸显纯净感。",
    "semantic_push": "传递简单直白的喜悦情绪，场景日常化且可触及，彻底排除悲剧性或复杂心理描写。",
    "cultural_weight": "2000年代初少女偶像工业标准产物",
    "embedding_tags": {
      "spectrum": "Mid",
      "spatial": "Dry",
      "energy": 7,
      "tempo_vibe": "Driving",
      "timbre_texture": "Electronic",
      "mood_coord": [
        "cheerful",
        "hopeful",
        "lightness"
      ],
      "objects": [
        "sunflower",
        "bicycle",
        "notebook"
      ],
      "scene_tag": "youthful_joy"
    },
    "language": "CN",
    "is_instrumental": false,
    "popularity_raw": 63,
    "llm_model": "qwen-plus"
  },
  {
    "id": 7,
    "vector_anchor": "马来传统打击乐与现代鼓机融合，人声采用民族唱腔微颤，频谱集中在中高频段。",
    "semantic_push": "指向热带风物的精神归属，意象具体而泥土化，彻底排除抽象哲学思辨倾向。",
    "cultural_weight": "新马多元文化共生现象的声音见证",
    "embedding_tags": {
      "spectrum": "High",
      "spatial": "Intimate",
      "energy": 6,
      "tempo_vibe": "Drifting",
      "timbe_texture": "Grainy",
      "mood_coord": [
        "rootedness",
        "warmth",
        "simplicity"
      ],
      "objects": [
        "coconut",
        "bamboo",
        "riverbank"
      ],
      "scene_tag": "tropical_village"
    },
    "language": "CN",
    "is_instrumental": false,
    "popularity_raw": 75,
    "llm_model": "qwen-plus"
  },
  {
    "id": 8,
    "vector_anchor": "男声低音区吟诵开场，逐步叠加电吉他失真墙，形成从压抑到抗争的声压梯度变化。",
    "semantic_push": "建构男性气概的岛屿寓言，主题宏大且具牺牲精神，彻底排除个人主义软弱表达。",
    "cultural_weight": "冷战时期边缘地带民族认同建构样本",
    "embedding_tags": {
      "spectrum": "Full",
      "spatial": "Huge",
      "energy": 8,
      "tempo_vibe": "Driving",
      "timbre_texture": "Metallic",
      "mood_coord": [
        "defiance",
        "pride",
        "struggle"
      ],
      "objects": [
        "anchor",
        "storm",
        "cliff"
      ],
      "scene_tag": "national_myth"
    },
    "language": "CN",
    "is_instrumental": false,
    "popularity_raw": 78,
    "llm_model": "qwen-plus"
  },
  {
    "id": 9,
    "vector_anchor": "男女声交替假声演唱，使用磁带饱和效果处理背景和声，营造轻微扭曲的记忆质感。",
    "semantic_push": "表现爱情中的不可控坠落，情感浓烈却不滥情，彻底排除理性克制的距离经营。",
    "cultural_weight": "当代都会情感关系的真实镜像记录",
    "embedding_tags": {
      "spectrum": "Mid",
      "spatial": "Wet",
      "energy": 7,
      "tempo_vibe": "Drifting",
      "timbre_texture": "Grainy",
      "mood_coord": [
        "vulnerability",
        "passion",
        "inevitability"
      ],
      "objects": [
        "photograph",
        "train_window",
        "unanswered_call"
      ],
      "scene_tag": "emotional_surrender"
    },
    "language": "CN",
    "is_instrumental": false,
    "popularity_raw": 83,
    "llm_model": "qwen-plus"
  },
  {
    "id": 10,
    "vector_anchor": "单簧管引奏后转入四拍子进行曲节奏，鼓点规整无即兴变奏，体现仪式化律动特征。",
    "semantic_push": "强调社会角色的义务承担，情绪严肃而不煽情，彻底排除自由放纵的享乐主义。",
    "cultural_weight": "儒家伦理价值观在流行音乐中的直接投射",
    "embedding_tags": {
      "spectrum": "Mid",
      "spatial": "Dry",
      "energy": 6,
      "tempo_vibe": "Driving",
      "timbre_texture": "Organic",
      "mood_coord": [
        "responsibility",
        "steadfastness",
        "dignity"
      ],
      "objects": [
        "ledger",
        "family_table",
        "workshop"
      ],
      "scene_tag": "moral_duty"
    },
    "language": "CN",
    "is_instrumental": false,
    "popularity_raw": 67,
    "llm_model": "qwen-plus"
  },
  {
    "id": 11,
    "vector_anchor": "钢琴分解和弦为基础，加入环境白噪音层，人声动态控制极细腻以传达温柔坚定感。",
    "semantic_push": "主张无条件的情感守候，意境开阔包容，彻底排除嫉妒猜忌等占有欲叙事。",
    "cultural_weight": "新世纪华语治愈系情歌的重要节点",
    "embedding_tags": {
      "spectrum": "Full",
      "spatial": "Huge",
      "energy": 5,
      "tempo_vibe": "Static",
      "timbre_texture": "Electronic",
      "mood_coord": [
        "endurance",
        "comfort",
        "presence"
      ],
      "objects": [
        "horizon",
        "open_hand",
        "steady_light"
      ],
      "scene_tag": "unconditional_love"
    },
    "language": "CN",
    "is_instrumental": false,
    "popularity_raw": 86,
    "llm_model": "qwen-plus"
  },
  {
    "id": 12,
    "vector_anchor": "尼龙弦吉他扫弦驱动，无额外配器干扰，瞬态响应干净利落体现极简制作哲学。",
    "semantic_push": "回溯人生起点的自我对话，情绪诚实朴素，彻底排除华丽包装的成功学话语。",
    "cultural_weight": "新加坡文艺复兴运动中的标志性素人美学",
    "embedding_tags": {
      "spectrum": "Mid",
      "spatial": "Intimate",
      "energy": 4,
      "tempo_vibe": "Static",
      "timbre_texture": "Organic",
      "mood_coord": [
        "reflection",
        "authenticity",
        "origin"
      ],
      "objects": [
        "diary",
        "childhood_room",
        "old_map"
      ],
      "scene_tag": "self_discovery"
    },
    "language": "CN",
    "is_instrumental": false,
    "popularity_raw": 70,
    "llm_model": "qwen-plus"
  },
  {
    "id": 13,
    "vector_anchor": "电音节拍触发八分音符脉冲，人声切片做延迟反馈处理，构建机械律动感。",
    "semantic_push": "号召集体行动的听觉动员，情绪积极外向，彻底排除孤独疏离的个体沉思。",
    "cultural_weight": "主流媒体青年正能量工程的标准音频组件",
    "embedding_tags": {
      "spectrum": "Low",
      "spatial": "Wet",
      "energy": 8,
      "tempo_vibe": "Driving",
      "timbre_texture": "Electronic",
      "mood_coord": [
        "unity",
        "action",
        "optimism"
      ],
      "objects": [
        "megaphone",
        "crowd",
        "starting_line"
      ],
      "scene_tag": "collective_movement"
    },
    "language": "CN",
    "is_instrumental": false,
    "popularity_raw": 69,
    "llm_model": "qwen-plus"
  },
  {
    "id": 14,
    "vector_anchor": "原声钢琴三连音铺垫，人声采用胸腔共鸣强化真诚质感，混响控制精准避免过度渲染。",
    "semantic_push": "表达无条件支持的信任关系，情绪稳定可靠，彻底排除背叛怀疑的戏剧冲突。",
    "cultural_weight": "陈奕迅成人抒情体系的核心价值宣言",
    "embedding_tags": {
      "spectrum": "Full",
      "spatial": "Intimate",
      "energy": 6,
      "tempo_vibe": "Static",
      "timbre_texture": "Organic",
      "mood_coord": [
        "trust",
        "support",
        "calm"
      ],
      "objects": [
        "handshake",
        "open_door",
        "steady_ground"
      ],
      "scene_tag": "reliable_connection"
    },
    "language": "CN",
    "is_instrumental": false,
    "popularity_raw": 91,
    "llm_model": "qwen-plus"
  },
  {
    "id": 15,
    "vector_anchor": "碎拍电子节奏搭配低音贝斯跳动，人声经过轻微比特压缩处理制造数字粗糙感。",
    "semantic_push": "讽刺消费社会的身份表演，态度戏谑不愤怒，彻底排除道德审判的严肃立场。",
    "cultural_weight": "香港后现代都市病的黑色幽默解剖",
    "embedding_tags": {
      "spectrum": "Low",
      "spatial": "Wet",
      "energy": 7,
      "tempo_vibe": "Drifting",
      "timbre_texture": "Electronic",
      "mood_coord": [
        "irony",
        "detachment",
        "critique"
      ],
      "objects": [
        "credit_card",
        "security_camera",
        "plastic_bag"
      ],
      "scene_tag": "consumer_culture"
    },
    "language": "CN",
    "is_instrumental": false,
    "popularity_raw": 88,
    "llm_model": "qwen-plus"
  },
  {
    "id": 16,
    "vector_anchor": "高速breakbeat驱动，合成器方波制造刺耳高频冲击，整体谐波密度达到饱和临界点。",
    "semantic_push": "主动拥抱感官 overload 的狂欢姿态，情绪挑衅而非取悦，彻底排除温和保守的审美妥协。",
    "cultural_weight": "粤语流行音乐极限风格化的里程碑",
    "embedding_tags": {
      "spectrum": "High",
      "spatial": "Huge",
      "energy": 10,
      "tempo_vibe": "Explosive",
      "timbre_texture": "Electronic",
      "mood_coord": [
        "excess",
        "liberation",
        "chaos"
      ],
      "objects": [
        "strobe_light",
        "broken_mirror",
        "dance_floor"
      ],
      "scene_tag": "sensory_overload"
    },
    "language": "CN",
    "is_instrumental": false,
    "popularity_raw": 93,
    "llm_model": "qwen-plus"
  },
  {
    "id": 17,
    "vector_anchor": "Power Pop编曲结构，强力五和弦反复推进，鼓组压缩强烈以增强攻击性瞬态表现。",
    "semantic_push": "宣告青春主导权的听觉起义，情绪自信张扬，彻底排除自卑退缩的成长叙事。",
    "cultural_weight": "台湾少女摇滚商业化成功的典型案例",
    "embedding_tags": {
      "spectrum": "High",
      "spatial": "Dry",
      "energy": 8,
      "tempo_vibe": "Driving",
      "timbre_texture": "Electronic",
      "mood_coord": [
        "confidence",
        "rebellion",
        "youth"
      ],
      "objects": [
        "microphone",
        "combat_boot",
        "graffiti_wall"
      ],
      "scene_tag": "youth_revolt"
    },
    "language": "CN",
    "is_instrumental": false,
    "popularity_raw": 84,
    "llm_model": "qwen-plus"
  },
  {
    "id": 18,
    "vector_anchor": "极简钢琴伴奏搭配ASMR级录音细节，呼吸声与按键声均被保留作为情感计量单位。",
    "semantic_push": "放大遗憾时刻的心理重量，情绪脆弱但不失控，彻底排除夸张哭腔的情绪勒索。",
    "cultural_weight": "Z世代情感表达精细化的代表性作品",
    "embedding_tags": {
      "spectrum": "Mid",
      "spatial": "Intimate",
      "energy": 3,
      "tempo_vibe": "Static",
      "timbre_texture": "Grainy",
      "mood_coord": [
        "regret",
        "longing",
        "quietness"
      ],
      "objects": [
        "empty_seat",
        "unanswered_letter",
        "frozen_clock"
      ],
      "scene_tag": "missed_moment"
    },
    "language": "CN",
    "is_instrumental": false,
    "popularity_raw": 77,
    "llm_model": "qwen-plus"
  },
  {
    "id": 19,
    "vector_anchor": "Funk-style贝斯线贯穿全曲，配合轻巧的staccato吉他切音，形成弹性律动基底。",
    "semantic_push": "传递陪伴带来的安全感，情绪轻松而不轻浮，彻底排除孤独绝望的存在主义议题。",
    "cultural_weight": "都市轻熟群体情感需求的精准音频配方",
    "embedding_tags": {
      "spectrum": "Low",
      "spatial": "Dry",
      "energy": 6,
      "tempo_vibe": "Driving",
      "timbre_texture": "Electronic",
      "mood_coord": [
        "companionship",
        "ease",
        "warmth"
      ],
      "objects": [
        "coffee_cup",
        "shared_umbrella",
        "city_walk"
      ],
      "scene_tag": "daily_companionship"
    },
    "language": "CN",
    "is_instrumental": false,
    "popularity_raw": 80,
    "llm_model": "qwen-plus"
  },
  {
    "id": 20,
    "vector_anchor": "大量使用铃铛与钢片琴音色，高频泛音丰富，整体动态压缩适中以维持空气感。",
    "semantic_push": "构建恋爱中的甜蜜幻境，情绪纯粹愉悦，彻底排除现实压力的侵入性暗示。",
    "cultural_weight": "少女浪漫幻想工业的成熟制式产品",
    "embedding_tags": {
      "spectrum": "High",
      "spatial": "Huge",
      "energy": 7,
      "tempo_vibe": "Drifting",
      "timbre_texture": "Electronic",
      "mood_coord": [
        "innocence",
        "bliss",
        "sparkle"
      ],
      "objects": [
        "firefly",
        "ribbon",
        "heart_lock"
      ],
      "scene_tag": "romantic_fantasy"
    },
    "language": "CN",
    "is_instrumental": false,
    "popularity_raw": 76,
    "llm_model": "qwen-plus"
  }
]
```


## 向量嵌入结果

| # | 歌曲 | 向量维度 | 前5个值 |

|---|---|---|---|

| 1 | 金兰结 - 于台烟&郭崇仪 | 1024 | [-0.0309, 0.0482, -0.0663, -0.0543, -0.0463...] |

| 2 | 惑 - 刘雪芳 | 1024 | [-0.0894, 0.0071, -0.0548, -0.0563, -0.0533...] |

| 3 | 铁警雄风 - 姜鄂 | 1024 | [-0.0551, -0.0035, -0.0635, -0.0494, -0.0309...] |

| 4 | 牛车水人家 - 巫启贤 | 1024 | [-0.0741, 0.0188, -0.0612, -0.0221, -0.0265...] |

| 5 | 不夜城传奇 - 徐小凤 | 1024 | [-0.0684, 0.0304, -0.0499, 0.0114, -0.0153...] |

| 6 | 满满的幸福 - 石欣卉 | 1024 | [-0.0561, -0.0115, -0.0751, -0.0065, -0.0408...] |

| 7 | 亚答籽 - 翁素英&蔡振雄 | 1024 | [-0.0207, -0.0092, -0.0636, -0.0674, -0.0519...] |

| 8 | 岛的儿子 - 翁素英&蔡振雄 | 1024 | [-0.0308, -0.0096, -0.0815, -0.0527, -0.0229...] |

| 9 | 爱不胜防 - 苏梽诚&魏妙如 | 1024 | [-0.0745, 0.0172, -0.0651, -0.0225, -0.0300...] |

| 10 | 责任 - 邓碧源 | 1024 | [-0.0825, -0.0058, -0.0611, -0.0554, -0.0595...] |

| 11 | 爱一直都在 - 郑可为 | 1024 | [-0.0525, 0.0218, -0.0707, -0.0169, -0.0053...] |

| 12 | 初衷 - 郑斌辉 | 1024 | [-0.0507, 0.0082, -0.0735, -0.0263, -0.0354...] |

| 13 | 跟着我一起 - 郑斌辉 | 1024 | [-0.0731, -0.0118, -0.0805, -0.0493, -0.0593...] |

| 14 | 信任 - 陈奕迅 | 1024 | [-0.0290, 0.0038, -0.0669, -0.0066, -0.0231...] |

| 15 | 碌卡 - 陈奕迅 | 1024 | [-0.0517, 0.0117, -0.0557, -0.0302, -0.0121...] |

| 16 | 重口味 - 陈奕迅 | 1024 | [-0.0162, -0.0036, -0.0465, -0.0132, -0.0151...] |

| 17 | Super no'1 - 卓文萱 | 1024 | [-0.0636, 0.0067, -0.0649, -0.0206, -0.0072...] |

| 18 | 一秒也好 - 卓文萱 | 1024 | [-0.0411, 0.0185, -0.0711, -0.0272, -0.0012...] |

| 19 | 在你身边 - 卓文萱 | 1024 | [-0.0629, 0.0311, -0.0676, -0.0245, -0.0296...] |

| 20 | 幸福氧气 - 卓文萱 | 1024 | [-0.0401, 0.0068, -0.0733, -0.0464, -0.0241...] |


## 测试总结

- 元数据生成: 20/20 成功

- 向量嵌入: 20/20 成功

- 向量维度: 1024
