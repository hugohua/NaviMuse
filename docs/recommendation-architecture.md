# NaviMuse 混合推荐系统架构设计

本文档记录了 NaviMuse 针对“AI 歌单生成高度重复”问题而演进的**多阶段混合推荐架构 (Multi-stage Hybrid Recommendation Architecture)**。

该架构摒弃了单一的向量检索路线，引入了工业级的“召回 (Recall) -> 排序预筛 (Rerank) -> 大模型策展 (LLM Curation)”漏斗模型，兼顾了相关性（Relevance）与多样性（Diversity）。

---

## 1. 核心流程 pipeline

不论前端选用何种探索模式 (`default` / `familiar` / `fresh`)，当用户输入场景词（Prompt）后，都会经过以下四个阶段的处理。

### Stage -1: Query 预处理 (Normalization)
为了避免前端 UI 展现带来的杂音干扰检索和 AI 策展，需要净化 Query。
*   **输入示例**：`"中频饱满 (Mid) ⚡ 周杰伦"`
*   **处理逻辑**：正则剔除 emoji、剥离括号及内部的统计数字/英文标注、去除多余标点。
*   **输出示例**：`"中频饱满 周杰伦"`

### Stage 0: 意图向量化与个性化融合 (Embedding & Personalization)
*   **Query Embedding**：使用 `text-embedding-v3` 将清洗后的 Query 转化为 1024 维的高密向量。
*   **User Taste Blend**：若用户有听歌记录（User Profile），则提取其基础品位向量（Taste Vector），与 Query Vector 进行加权线性插值（Alpha 融合）。Alpha 参数动态受模式和 Query 长度影响（Query 越短，Alpha 越低，越依赖用户基础品味）。

### Stage 1: 多路互斥召回 (Multi-Channel Recall)
为扩大候选池（Candidate Pool），并行（或串行依赖）触发三个互斥的通道。**前序通道捕获的歌曲 ID，将被后序通道在 SQL 级排除 (excludeIds)**，以最大化检索广度。

1.  **向量通道 (Vector Channel)**: 基于余弦相似度 KNN 检索，捕获与 Query 语义强相关的 Top N 首。
2.  **属性通道 (Attribute Channel)**: 基于正则表达式，从 Query 中提取明确的过滤维度（如：`tempo_vibe='Driving'` 或 `energy_range=[7,10]`），直接在 SQLite 执行精准匹配。
3.  **随机探索通道 (Random Channel)**: `ORDER BY RANDOM()` 强行注入符合基础阈值的随机歌曲，打破信息茧房。

*(Stage 1 结束后，通过计算得到约 ~130 首去重候选)*

### Stage 1.5: 红心歌曲注入 (Starred Injection)
在候选池进入 MMR 裁剪前，强行将用户明确标记为“喜欢”的歌曲（与 Query 相似度距离 < 0.65）按比例注入。此举在增强多样性的同时，**守住“好听”的下限 (Exploitation)**。

### Stage 2: MMR 多样性预筛 (Maximal Marginal Relevance)
候选池由于引入了随机和红心通道，数量通常超出 LLM 的最佳注意力窗口（比如 130+ 首）。
需要从池中挑选出目标数量（如 100 首）送给 LLM。**MMR 算法用于在“与 Query 相关”和“彼此之间不相似”中寻找帕累托最优的子集。**

*   **相关性**：使用原本向量检索返回的 `distance` 代理。
*   **相似度近似**：由于在内存中计算 130×130 的高维向量内积开销太大，我们采用**结构化标签指纹重叠度 (Tag Fingerprint Overlap)** 作为代理。比对每首歌的 `artist`, `mood`, `tempo_vibe`, `timbre_texture`, `spectrum`, `energy_level`。同歌手直接高度惩罚。
*   **打分公式**：`MMR Score = λ * Relevance - (1 - λ) * MaxSimilarityToSelected`

### Stage 3: LLM 动态策展 (LLM Curation)
将预筛后的 Top 100 候选编织成带局部上下文的 CSV 格式 Prompt，交由大语言模型（如 Gemini / Qwen / Local）进行最终的 20 首逻辑串联与包装。

通过 System Prompt 的硬约束保障多样性：
*   **Rule**: `Do NOT select more than 3 songs from the same artist.`
*   **Rule**: `Ensure at least 2 different mood-clusters or genres are represented.`
*   **Temperature**: 强制设定为高创造性（如 `1.0`）。

---

## 2. 模式参数矩阵配置 (Mode Matrix)

系统提供了极大的灵活性，通过一套参数矩阵控制探索（Exploration）与守成（Exploitation）的平衡。

| 参数 / 模式 | Default (默认) | Familiar (熟悉) | Fresh (新鲜) | 作用说明 |
| :--- | :--- | :--- | :--- | :--- |
| **Vector Limit** | 80 | 80 | 100 | 向量空间强相关召回的基盘 |
| **Attribute Limit** | 30 | 20 | 40 | 基于结构化标签硬检索的数量 |
| **Random Limit** | 20 | 0 | 40 | 纯随机抽样的数量 |
| **Starred Injection Ratio** | 10% | 20% | 0% | 候选池中最多允许多少比例的用户“红心”旧歌 |
| **MMR Lambda (λ)** | 0.5 | 0.7 | 0.3 | λ 越高越注重相关性，越低越注重多样性防冗余 |
| **MMR Target** | 100 | 100 | 100 | 最终送给 LLM 策展的候选基数 (防超长上下文崩塌) |
| **Temperature** | 1.0\* | 1.0\* | 1.0\* | 调用 LLM 的温度值 (注：当前已统一开启高随机性) |

---

## 3. 架构优势总结

1.  **突破“向量同质化”**：单一的 KNN `ORDER BY distance` 极易导致返回一堆同一歌手、同一专辑、或极度同质化的歌曲。多路打捞+标签互斥极大缓解了这个问题。
2.  **避免“AI 幻觉与性能崩塌”**：通过可控的 100 首喂给 LLM，既给了大模型充足的选择余地（挑 20 首），又不会超长导致 Attention 分散变傻。
3.  **零额外向量存储与极低 IO**：MMR 用标签交叉率做距离近似代理，巧妙避开了对每首歌曲加载高位 Embedding 导致的扫盘和内存激增问题。
4.  **高度可配置**：只需调优 `MODE_CONFIGS` 参数矩阵，即可一阶衍生新的产品形态（比如针对派对的 "Party Mode" 或纯人声的 "Vocal First"）。
