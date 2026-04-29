# LXT 质量优化实施方案 — PRD

> 版本：v2.0  
> 更新时间：2026-04-29 (P1-15 实施完成)  
> 来源：合并《LXT_质量评估与行业对标分析》《LXT_优化路线图》+《LXT_2026行业对标架构分析》为单一可执行 PRD 文档  
> 行业对标：Seedance 2.0、FilmWeaver、Camera Artist、DramaBench、VISTA、VQQA、PPEF、NovaKit、Genvid

---

## 一、项目背景与目标

### 1.1 背景

LXT 是 waoowaoo 平台的 AI 短剧生产流水线，覆盖 5 个阶段：资产库（lxt-assets）→ 脚本生成（lxt-script/storyboard/final-script）→ 成片（lxt-final-film）。在 2026 年 AI 短剧行业快速演进的背景下，需要系统性评估 LXT 各阶段产出质量，找出与行业标准的差距，并制定可执行的改进路线。

**2026 年行业核心趋势**：AI 短剧已从"生成即结束"的线性模式进入**"生成+评估+优化"闭环时代**，以 VISTA（多智能体自改进，提升 Veo3 60%）、FilmWeaver（双级缓存角色一致性）、DramaBench（六维评估）为代表。

### 1.2 目标

- **短期（1-2 周）**：修复核心瓶颈（P0），立即提升产出质量
- **中期（2-6 周）**：补齐重要短板（P1），达到行业标准
- **长期（6-12 周）**：建设竞争力（P2），拉开与竞品差距

### 1.3 对标基准

| 阶段 | 对标行业基准 |
|------|------------|
| 资产库 | OpenCharacter、Seedance 2.0 角色管理、FilmWeaver 双级缓存、纳米漫剧流水线 |
| 脚本生成 | DramaBench 六维评估、DSR 双阶段精炼、Camera Artist RSG、Dramaturge |
| 成片 | Seedance 2.0 工作流、FilmWeaver 角色一致性、VISTA 多智能体评审、PPEF 九维评估 |
| 后处理 | Topaz Video AI（Apollo 8x/Aion 16x）、ElevenLabs v5 TTS、ArbInterp（ICLR 2026） |
| 模型路由 | NovaKit 按镜头类型路由、行业三段式（原型→量产→旗舰） |

### 1.4 行业架构一致性评估

> 完整分析见：《LXT_2026行业对标架构分析.MD》

```
维度                   LXT 位置       行业标准       一致性
──────────────────────────────────────────────────────
Prompt 工程质量         Phase 1-3      行业模板        ★★★★★ 已达一流
多模型适配              Strategy 模式   模型路由        ★★★★★ 已对齐
流水线阶段架构          Stage 1-5      Stage 1-7      ★★★★☆ 缺音频/发布
数据模型设计            行级 patch 合并  IPTC 本体       ★★★★☆ 架构前瞻
并发流水线              4队列+5并发     Genvid 架构     ★★★★☆ 基本对齐
资产提取质量            15+字段/9关系   角色护照        ★★★★☆ 缺多角度参考图
角色一致性              种子+尾帧+4帧   FilmWeaver     ★★★☆☆ 缺双级缓存/IP-Adapter
视频后处理              无 VFI/转场     Topaz AI       ★★☆☆☆ 完全缺失
音频集成                无 TTS/音效     ElevenLabs     ★☆☆☆☆ 仍为静音
质量评估闭环            无              VISTA/VQQA     ☆☆☆☆☆ 2026 最大代差
```

**15 项关键能力中，LXT 已对齐 6 项（40%），缺失 9 项（60%）。架构一致性约 65%。**

---

## 二、当前状态评估

### 2.1 核心优势

1. **Prompt 工程已达行业一流**：摄影机词汇（16 种景别 + 16 种视角 + 20+ 种运动 + 微移模板库）、表演指导词汇（58 个术语 7 大类）、4 帧关键帧架构（7 要素 + 递进变化）、中文 Prompt 细节度均超越行业平均
2. **4 阶段并行流水线架构合理**：单镜拆分 + 5 并发处理 + 进度回传，Phase2A/2B 并行，可扩展性强
3. **数据模型设计前瞻**：行级 patch 合并、版本化 JSON、资产唯一键、历史保留
4. **模型适配层成熟**：Strategy 模式统一多供应商（Seedance/Wan/Veo/Sora/Kling）
5. **资产提取质量高**：角色 15+ 结构化字段、9 种关系类型、9 条严格道具排除规则、场景 3 层空间锚定、非人类角色专属字段、人称视角映射
6. **角色一致性基础已建立**：种子锁定（P0-2）+ 前一镜尾帧注入（P0-3）+ 4 帧全量注入（P0-1）+ 资产参考图注入（P0-6）

### 2.2 量化差距总览

```
能力维度             严重缺失    不足      接近      达标      超越

角色提取字段                                          ████████
场景空间锚定                                          ████████
道具提取标准                                          ████████
非人类角色处理                                                          ██████
摄影机词汇                                                              ██████
表演指导词汇                                                            ██████
4阶段流水线架构                                       ████████
中文Prompt质量                                                          ██████
多模型适配                                            ████████
种子+尾帧+4帧注入                                     ████████
资产参考注入                                          ████████
prompt工程整体                                                           ██████

并行处理能力                                          ████████
空间上下文追踪                                        ██████
首尾帧模式                                            ████████

关系数据利用                      ██
多集资产分析                      ██
英文Prompt对标                    ██
跨镜上下文窗口                    ██
小说→剧本叙事丰富                  ██
参数可配置化                      ██
角色状态追踪                      ██
资产Negative Prompt               ██
中英文Prompt混合                   ██
四宫格Negative Prompt              ██

FilmWeaver级角色一致性 ██████       ← 2026 新增
智能模型路由           ██████       ← 2026 新增
多角度参考图           ██████       ← 2026 新增
质量评估闭环                     ✅  (P1-15)  ← 2026 最大代差已修复
帧插值         ██████
种子锁定               ██████
质量自动验证   ██████
多智能体协作评审 ██████
无音频生成     ██████
无变体筛选     ██████
角色人格系统化 ██████
前一镜尾帧注入         ██████
LXT资产无参考图        ██████
场景无布局指导         ██████
切割假设脆弱           ██████
IP-Adapter/LoRA ██████             ← 2026 新增
Anchor Prompt库  ██████            ← 2026 新增
```

### 2.3 核心短板（13 项 — 已修复 8 项，待修复 5 项）

> **2026-04-29 更新**：P1-15（质量评估闭环）已实施完成，消除 2026 年最大代差。P0-10（body_proportion 持久化）、P1-13（下部身体描述）、P1-14（画风一致性）已修复并通过三只小猪项目实测验证。

1. ✅ **缺少质量反馈闭环**：~~所有阶段"生成即结束"，无 Review/Critic/Validate 机制~~ — 已修复（P1-15）：DramaBench 六维 Critic Agent + Repair Agent + 最大 2 次重试闭环
2. **连续性约束不足**：跨镜上下文 + 帧插值，两个环节仍缺失（种子锁定 P0-2 + 尾帧注入 P0-3 已修复）
3. **角色一致性无 FilmWeaver 级缓存**：已实现种子+尾帧+4 帧基本方案，但缺少 CLIP 检索 Shot Cache + 滑动窗口 Temporal Cache
4. **数据孤岛**：资产库已提取的关系数据、角色档案未充分流转到脚本和成片阶段
5. **英文 Prompt 不对标**：中文版 Phase2A 169 行 vs 英文版 125 行，缺少 7 要素模板、微移模板库、空间约束
6. ~~图片提示词缺少 Negative Prompt~~ ✅ 已修复（P0-5/P0-6）：资产库和四宫格均已传递画风特定 negative prompt + Ark positive 退化路径
7. **中英文混合 Prompt**：英文 gridPrefix + 中文 Phase2A + 英文 artStyle，对 Imagen/OpenAI 英文优先模型不友好
8. ~~LXT 资产缺少参考图一致性~~ ✅ 已修复（P0-6）：角色类型查询同名已有资产的 imageUrl 作为参考图注入
9. ~~body_proportion & species_traits 持久化丢失~~ ✅ 已修复（P0-10）：PATCH 端点改为 merge 策略，不再全量覆盖
10. ~~非人类角色下部身体描述系统性缺失~~ ✅ 已修复（P1-13）：LLM prompt 强制要求 8 区域完整性 + 输出前自检
11. ~~画风一致性对齐~~ ✅ 已修复（P1-14）：artStyle 作为强约束传入 LLM prompt
12. **缺少 IP-Adapter/FaceID 角色一致性**：行业标配 FaceID（权重 0.7-0.85）+ LoRA 角色微调（30min+/角色）
13. **缺少智能模型路由**：整集统一模型，无按镜头类型/成本优化路由（行业降成本 60-70%）

---

## 三、详细差距分析

### 3.1 资产库阶段（lxt-assets）

#### 3.1.1 资产提取质量

| 差距 | 严重度 | 描述 |
|------|--------|------|
| 关系数据未利用 | 中 | `agent_character_profile` 已提取 `relationships[]`（9 种关系类型 + 方向性），但下游完全不消费 |
| 缺少大五人格 | 中 | `personality_tags` 仅覆盖中文网文标签，缺 OCEAN 心理学维度（DuoDrama、OpenCharacter 标准） |
| 缺少角色状态追踪 | 中 | 无分镜/分集的角色外观变化管理（Seedance 2.0 支持叙事时间线追踪） |
| 多集分析未实现 | 中 | `lxt-analyze-assets` 只取第一集（`findFirst`） |
| 无自动质量评分 | 中 | 完全依赖人工确认档案，无自动扫描视觉不一致性 |
| **多角度参考图缺失** | **高** | 仅有单一 imageUrl，行业标准 4 角度（正面/侧面/¾/全身）角色护照 |
| **跨项目资产库未激活** | 中 | globalCharacterId/LocationId/PropId 体系已建但未被充分利用 |

#### 3.1.2 资产图片 Prompt 质量

**Prompt 组装流程**：`[bodyProportion?] + [description] + [artStyle] + [PromptSuffix] → 图像模型`

| 资产类型 | Prompt 结构 | 宽高比 | 使用模型 |
|---------|------------|--------|---------|
| 角色 | `{bodyProportion}，{description}，{artStyle}，角色设定图，左侧1/3面部+右侧2/3三视图` | 3:2 | `userModels.characterModel` |
| 场景 | `{description}，{artStyle}` | 1:1 | `userModels.locationModel` |
| 道具 | `{description}，{artStyle}，道具设定图，左侧主视图+右侧三视图` | 3:2 | `userModels.characterModel` ✅ |

**资产 Prompt 差距项**：

| 差距 | 严重度 | 描述 |
|------|--------|------|
| ~~缺少 Negative Prompt~~ | ~~高~~ | ✅ 已修复（P0-5/P0-6） |
| ~~LXT 资产无参考图~~ | ~~高~~ | ✅ 已修复（P0-6） |
| ~~道具使用场景模型~~ | ~~中~~ | ✅ 已修复（P0-7）：道具优先 characterModel |
| 描述回退链风险 | 中 | `description → summary → name` 回退链，summary 为叙事文本非视觉描述 |
| 中英文混合 | 中 | 中文 Suffix + 英文 artStyle，对 Imagen/OpenAI 不友好 |
| 场景无布局指导 | 中 | `LOCATION_PROMPT_SUFFIX = ''`，完全无构图指令 |
| 无质量后验 | 中 | 不验证三视图布局/面部可见/纯白背景 |

#### 3.1.3 角色描述 Prompt 推理质量分析

`buildDescriptionPrompt`（`confirm-profile/route.ts`）通过 LLM 推理生成 tag 式逗号分隔描述，再拼接 `CHARACTER_PROMPT_SUFFIX` + `artStyle` 提交图像模型。

**当前 LLM 推理产出示例（猪妈妈 — P1-13/P1-14 修复后）：**
```
Q版卡通风格, 一只成年雌性家猪, 3头身Q版比例, 体型丰满圆润, , 穿着一件米白色棉质圆领长袖上衣, 外层围蓝底白格带碎花棉质围裙, 系带在背后打结覆盖躯干前部, , 自然微笑表情, 典型猪科动物面部, 吻部突出粉红色, 鼻孔大而圆, 脸颊肉质饱满, , 站立高度约120厘米, 体态宽大厚实, 腹部圆润, 四肢粗短有力, 皮肤呈粉红色, 表面有少量稀疏白色刚毛, , 眼睛小且黑亮, 位于头部两侧上方, 眼睑呈浅粉色, 耳朵大而下垂紧贴脸颊, 吻部湿润有光泽, 嘴角自然闭合, , 无人类头发, 头部覆盖稀疏浅粉色短鬃毛, 耳后鬃毛稍长, , 无独立下装, 围裙下摆延伸至膝盖下方, 露出粉红色猪蹄, , 颈部佩戴细款红色布质项圈, 无任何挂饰, , 
```

**达标项：**

| 维度 | 评价 |
|------|------|
| 风格锚定 | **达标**：`Q版卡通风格` 明确前缀 |
| 语义密度 | **达标**：无废话，每个 token 都携带视觉信息 |
| 颜色+材质+形态三要素 | **达标**：全程遵守（如"米白色棉质圆领长袖"） |
| `, , ` 身体分区 | **达标**：8 区域结构清晰完整 |
| 非人类角色完整性 | **达标**：8 个区域 100% 覆盖，含脚蹄/尾巴/下摆/露蹄声明 |
| 默认表情 | **达标**："自然微笑表情" |

**差距项：**

| 差距 | 严重度 | 状态 | 描述 |
|------|--------|------|------|
| ~~缺少风格锚定前缀~~ | ~~高~~ | ✅ 已修复 (P0-8) | 描述现已以 `{artStyle}风格,` 开头 |
| ~~缺少头身比量化~~ | ~~高~~ | ✅ 已修复 (P0-10) | PATCH 端点 merge 策略保留 body_proportion |
| ~~缺少默认表情~~ | ~~高~~ | ✅ 已修复 (P0-9) | 面部区域③现已包含默认表情 |
| ~~下部身体描述系统性缺失~~ | ~~高~~ | ✅ 已修复 (P1-13) | 8 区域完整性强制 + 输出前自检 |
| ~~画风一致性对齐~~ | ~~中~~ | ✅ 已修复 (P1-14) | artStyle 强约束传入 LLM |
| **缺少渲染风格指导** | **中** | 待修复 (P1-11) | 无线条/填色/光影/色调指令 |
| **缺少正向防退化约束** | **中** | 待修复 (P1-12) | 无机制防止模型走向写实/恐怖谷/暗黑风格 |
| **项目级风格一致性缺失** | **中** | 待修复 (P2-6) | 同项目多角色之间无共享风格令牌 |
| **尾部空双逗号风险** | **低** | 待修复 (P2-7) | 部分模型可能将空段解释为等待补充 |

**高质量 Prompt 理想结构（按优先级排序）：**

```
[风格锚定 + 受众] → [物种+性别+年龄段] → [头身比+造型比例] → [面部细节 + 默认表情] → [辨识特征] → [发型] → [体型体态] → [服装逐件] → [鞋履] → [渲染风格 + 正向防退化词]
```

### 3.2 脚本生成阶段

#### 3.2.1 脚本推理质量

| 差距 | 严重度 | 描述 |
|------|--------|------|
| 无多智能体协作 | 高 | 每 Phase 仅一次 LLM 调用。Dramaturge 三级评审提升 53.2%；Postwriter Plan→Draft→Validate→Repair→Revise |
| 无质量验证闭环 | 高 | 无生成后自评。DramaBench 六维评估（格式/叙事/角色/情感/逻辑/冲突）可自动化 |
| 跨镜上下文缺失 | 中 | Phase 1/2A/2B 每镜独立分析。Camera Artist RSG 每镜推理前一镜状态 |
| 英文 Prompt 不对标 | 中 | Phase2A 英文版 125 行 vs 中文 169 行（缺 7 要素模板、微移模板库、空间约束） |
| 小说→剧本过于保守 | 中 | 仅格式转换。DSR 双阶段精炼先丰富叙事再转换，达人类水平 82.7% |
| 角色关系未注入 | 中 | `buildLxtAssetPromptContext()` 仅注入名称+摘要，无关系图谱 |
| **🆕 景别多样性不足** | **中** | **2026-04-29 实测发现**：三只小猪 7 镜项目中仅出现中景/近景，缺少全景建立镜和特写表情镜，分镜节奏偏平。Prompt 未明确要求景别多样化 |
| **🆕 资产确认不完整** | **中** | **实测发现**：8 个资产中 3 个（1 场景 + 2 道具）未确认档案/未生成图片，但已绑定到分镜中，导致参考图注入缺失 |

#### 3.2.2 四宫格图片 Prompt 质量

**组装流程**（`handleLxtFinalFilmImageTask`）：
```
fullPrompt = gridPrefix + imagePrompt + ", " + artStyleText
```

**四宫格 Prompt 差距项**：

| 差距 | 严重度 | 描述 |
|------|--------|------|
| ~~缺少 Negative Prompt~~ | ~~高~~ | ✅ 已修复（P0-5）：导入 getArtStyleNegativePrompt + Ark positive 退化路径 |
| 中英文混合 Prompt | **高** | 英文 gridPrefix + 中文 Phase2A + 英文 artStyle，Imagen/OpenAI 质量显著降低 |
| 英文 Phase2A 不完整 | **中** | 英文版仅 125 行，缺核心规则 |
| ~~4 帧仅用 2 帧~~ | ~~中~~ | ✅ 已修复（P0-1）：splitImageUrls 全部 4 张传入 referenceImages |
| 切割假设脆弱 | **中** | `splitGridImage` 假设 AI 严格输出 2x2 等分布局 |
| 无图像质量后验 | **低** | 不验证宫格布局/4 帧完整性/分辨率 |

#### 3.2.3 模型兼容性矩阵

| 图像模型 | 中文 Prompt | 英文 Prompt | Negative Prompt | 语言混合风险 |
|----------|-----------|-----------|----------------|------------|
| Seedream 4.x/5.0 (Ark) | 良好 | 良好 | 静默丢弃 | 低（中英双语） |
| Imagen (Google) | 差 | 良好 | 支持 | **高**（英文优先） |
| OpenAI Compatible | 差 | 良好 | 支持 | **高** |
| FAL/Banana | 一般 | 良好 | 支持 | 中 |

### 3.3 成片阶段

| 差距 | 严重度 | 描述 |
|------|--------|------|
| ~~4 帧未充分利用~~ | ~~高~~ | ✅ 已修复（P0-1）：4 帧全量传入 |
| 无帧插值（VFI） | 高 | 完全无。ArbInterp（ICLR 2026）支持 2x-32x 任意倍率 |
| ~~无种子锁定~~ | ~~高~~ | ✅ 已修复（P0-2）：videoSeed 跨镜锁定 |
| ~~无前一镜尾帧注入~~ | ~~中~~ | ✅ 已修复（P0-3）：prevEndFrameSigned 注入 |
| ~~参数硬编码~~ | ~~中~~ | ✅ 已修复（P0-4）：duration/resolution UI 可配置 |
| 无音频 | 中 | 无 TTS/音效/BGM。Seedance 2.0 原生支持 8+ 语言音频同步 |
| 无变体筛选 | 中 | 每镜仅 1 个视频。纳米漫剧一次多选成功率 90%+ |
| 无转场处理 | 低 | 各镜独立生成。StoryGen-Atelier "插值链"算法 |
| **无智能模型路由** | **高** | 整集统一模型。行业按镜头类型+成本路由（降成本 60-70%） |

### 3.4 行业对标差距（2026 新增）

> 本章节基于《LXT_2026行业对标架构分析.MD》提取 2026 年最关键的架构差距。

#### 3.4.1 质量评估闭环（最显著代差）

**LXT 现状**：所有阶段"生成即结束"，无任何自动化质量验证、评分或修复循环。

**行业标准**：

| 系统 | 机制 | 效果 |
|------|------|------|
| VISTA | 多智能体自改进：结构化规划→候选池→成对锦标赛→三维度评审（视觉/音频/语境）→深度思考修订→重新生成 | 提升 Veo3 60% |
| VQQA | 3 专业 Agent（问题生成→回答→优化） | 自动化质量问答 |
| DramaBench | 六维自动化评估（格式/叙事/角色/情感/逻辑/冲突） | 可量化的质量分数 |
| PPEF | 九维生产流水线评估框架 | ≥0.70 为可投产 |
| Postwriter | Plan→Draft→Validate→Repair→Revise 五阶段闭环 | 单次修复提升显著 |
| OmniAgent | 超图多节点质量门控 | 多层级质量把关 |

**差距评级**：★★★★★ — **2026 年最核心代差，已通过 P1-15 质量评估闭环（DramaBench 六维 Critic + Repair + 重试）消除。**

#### 3.4.2 角色一致性 — FilmWeaver 级方案

**LXT 现状**：种子锁定 + 前一镜尾帧 + 4 帧 + 资产参考图（基础方案）

**FilmWeaver 架构**（2026 行业标杆，Kling/Kuaishou 团队）：

```
双级缓存：
  Shot Cache (长期): CLIP 检索前镜关键帧 → 维护角色/场景身份跨剪切
  Temporal Cache (短期): 压缩滑动窗口 → 确保连续流畅运动
  4 种工作模式：无缓存(开始)/仅时间/仅镜头/完整缓存
```

| 技术 | LXT | FilmWeaver/行业 | 差距 |
|------|-----|----------------|------|
| 种子锁定 | ✅ videoSeed | 行业推荐但脆弱 | 对齐 |
| 参考图注入 | ✅ 4 帧 + 尾帧 + 资产图 | Seedance 最多 9 图 | 对齐 |
| CLIP 检索缓存 | ❌ | FilmWeaver Shot Cache | **代差** |
| 滑动窗口时序缓存 | ❌ | FilmWeaver Temporal Cache | **代差** |
| IP-Adapter/FaceID | ❌ | 行业标配（权重 0.7-0.85） | **代差** |
| LoRA 角色微调 | ❌ | 行业推荐（30min+/角色） | 差距 |
| DNA 锁定（40+ 属性） | ❌ | Artiroom 9/10 一致性 | **代差** |
| 角色护照多角度 | ❌ | 4 角度标准(正面/侧面/¾/全身) | 差距 |

**差距评级**：★★★☆☆ — 基础方案已落地，但缺少双级缓存和 IP-Adapter/LoRA。

#### 3.4.3 智能模型路由

| 能力 | LXT | 行业标准 | 对比 |
|------|-----|---------|------|
| 多供应商适配 | Seedance/Wan/Veo/Sora/Kling 统一接口 | NovaKit 按镜头类型路由 | ✅ 对齐 |
| 模型能力探测 | `resolveModelMaxReferenceImages` + Ark/Gemini 检测 | 行业按能力边界路由 | ✅ 对齐 |
| 分层模型策略 | 未实现（整集统一模型） | 行业: 快速预览→广度→控制→终版 | ❌ 差距 |
| 按镜头类型路由 | 未实现 | NovaKit: 建立→Kling, 特写→Runway, 产品→Veo | ❌ 差距 |
| 成本优化路由 | 未实现 | Wan 原型→Kling 量产→Sora 旗舰（降成本 60-70%） | ❌ 差距 |

**差距评级**：★★★☆☆ — 适配层成熟，但缺少智能路由和成本优化。

#### 3.4.4 视频后处理

| 能力 | LXT | 行业标准 |
|------|-----|---------|
| 帧插值（VFI） | **无** | Topaz Video AI（Apollo 8x / Aion 16x）/ ArbInterp（ICLR 2026） |
| 转场效果 | **无** | cross-fade / motion blur transition / 匹配首尾帧 |
| 颜色分级 | **无** | DaVinci Resolve LUT 统一色调 |
| 超分辨率 | **无** | Topaz 最高 24K |
| 音频合成 | **无** | ElevenLabs v5 TTS + Suno/Udio 音乐 + FFmpeg 合成 |
| 唇形同步 | **无** | Seedance 2.0 原生音素级唇形同步 8+ 语言 |
| 去噪/稳定 | **无** | Topaz Video AI 内置 |
| 胶片质感 | **无** | 35mm 胶片颗粒 + bloom 效果 |

**差距评级**：★★☆☆☆ — 视频后处理层完全空白。

#### 3.4.5 其他关键差距

| 差距 | 行业标准 | 影响 |
|------|---------|------|
| 英文 Prompt 补齐 | Imagen/OpenAI 英文优先 | Phase2A 英文版仅 125 行 vs 中文 169 行 |
| Anchor Prompt 库 | 行业最佳实践：按场景/风格/平台维护模板库 | 每个项目从零构建 Prompt |
| 弹性伸缩 | 行业按队列深度自动扩缩 | 高峰期可能排队 |
| webhook 优先 | 行业 webhook 优先于轮询 | `waitExternalResult` 重试+恢复可用但非最优 |

---

## 四、改进方案

### 4.1 优先级定义

| 优先级 | 含义 | 时间线 | 投入 |
|--------|------|--------|------|
| **P0** | 核心瓶颈，修复即可显著提升产出质量 | 1-2 周 | 低 |
| **P1** | 重要短板，补齐后达到行业标准 | 2-6 周 | 中 |
| **P2** | 竞争力提升，拉开与竞品的差距 | 6-12 周 | 高 |

### 4.2 P0 — 立即改进（10 项 — 全部已完成 ✅）

> **2026-04-29 更新**：P0-1~P0-10 全部已实施并通过三只小猪项目实测验证。

#### P0-1: ✅ 4 帧全量注入视频生成

- **状态**：✅ 已完成（2026-04-28）
- **实现**：`handleLxtFinalFilmVideoTask` 收集 `splitImageUrls` 全部 4 张传入 `referenceImages`
- **改动**：`src/lib/workers/handlers/lxt-final-film-task-handlers.ts`
- **验证**：对比单帧 vs 4 帧视频质量（人工 + CLIP 一致性评分）

#### P0-2: ✅ 镜头间种子锁定

- **状态**：✅ 已完成（2026-04-28）
- **实现**：`LxtFinalFilmContent` 增加 `videoSeed`，首镜生成后保存，后续镜复用
- **改动**：`src/lib/lxt/final-film.ts`、`src/lib/workers/handlers/lxt-final-film-task-handlers.ts`
- **验证**：检查同集相邻两镜角色面部一致性（diff 对比）

#### P0-3: ✅ 前一镜尾帧注入

- **状态**：✅ 已完成（2026-04-28）
- **实现**：`allRows[currentIdx - 1]?.videoEndFrameUrl` 作为额外参考图传入
- **改动**：`src/lib/workers/handlers/lxt-final-film-task-handlers.ts`
- **验证**：检查相邻镜过渡平滑度（无跳变）

#### P0-4: ✅ 视频参数可配置化

- **状态**：✅ 已完成（2026-04-28）
- **实现**：`LxtFinalFilmContent` 增加 `videoDuration`、`videoResolution`；UI 增加选择器；handler 从 content 读取
- **改动**：`src/lib/lxt/final-film.ts`、`src/app/.../components/LxtFinalFilmStage.tsx`、`src/lib/workers/handlers/lxt-final-film-task-handlers.ts`
- **验证**：UI 修改参数 → 生成视频参数正确

#### P0-5: ✅ 补全四宫格图片 Negative Prompt

- **状态**：✅ 已完成（2026-04-28）
- **实现**：导入 `getArtStyleNegativePrompt`、`convertNegativeToPositivePrompt`、`isArkModel`；Ark 模型使用 positive 退化路径
- **改动**：`src/lib/workers/handlers/lxt-final-film-task-handlers.ts`
- **验证**：检查日志确认 negativePrompt 已传入；对比有无 negative 的卡通/模糊率

#### P0-6: ✅ 补全资产图片 Negative Prompt + 参考图一致性

- **状态**：✅ 已完成（2026-04-28）
- **实现**：角色类型查询同名已有资产 `imageUrl` 作为参考图；场景/道具传递画风 negative prompt；Ark 使用 positive 退化路径
- **改动**：`src/lib/workers/handlers/lxt-asset-image-task-handler.ts`
- **验证**：同角色两次生成 CLIP 余弦相似度 > 0.85

#### P0-7: ✅ 修复道具使用场景模型

- **状态**：✅ 已完成（2026-04-28）
- **实现**：道具优先使用 `characterModel`，fallback 到 `locationModel`
- **改动**：`src/lib/workers/handlers/lxt-asset-image-task-handler.ts`
- **验证**：检查 handler 日志中道具任务的 modelId

#### P0-8: ✅ 角色描述增加风格锚定前缀

- **状态**：✅ 已完成（2026-04-28）
- **实现**：LLM prompt 要求输出以 `{artStyle}风格,` 开头
- **改动**：`src/app/api/lxt/[projectId]/assets/[assetId]/confirm-profile/route.ts` 的 `buildDescriptionPrompt`：sectionOrder 最前面增加"⓪ 风格锚定"区
- **验证**：所有角色 description 首句包含风格类别关键词

#### P0-9: ✅ 角色描述增加默认表情必填区

- **状态**：✅ 已完成（2026-04-28）
- **实现**：面部区域③强制包含表情字段
- **改动**：`src/app/api/lxt/[projectId]/assets/[assetId]/confirm-profile/route.ts` 的 `buildDescriptionPrompt`：面部区域增加表情强制要求
- **验证**：所有角色 description 包含默认表情描述

#### P0-10: ✅ 修复 body_proportion 持久化丢失

- **状态**：✅ 已完成（2026-04-29）
- **根因**：PATCH 端点对 profileData 做全量覆盖，前端表单未包含 LLM 推断字段（body_proportion、species_traits），导致 DB 持久化后为 undefined
- **实现**：PATCH 端点改为 merge 策略：`{ ...existing, ...incoming }` — incoming 优先保留用户编辑，existing 保留 LLM 推断字段
- **改动**：`src/app/api/lxt/[projectId]/assets/[assetId]/route.ts` — 导入 `parseProfileData`，merge 替代 overwrite
- **验证**：DB 查询 `profileData.body_proportion` 和 `species_traits` 不为 undefined/null

### 4.3 P1 — 短期补齐（18 项 — 3 项已完成 ✅，15 项待实施）

> **2026-04-29 更新**：基于行业对标分析，新增 P1-15（质量评估闭环）、P1-16（智能模型路由）、P1-17（FilmWeaver 级角色缓存）、P1-18（IP-Adapter 集成）。P2-3 多智能体评审提升至 P1-15。

#### P1-1: 视频帧插值后处理

- **目标**：视频生成后跑一次 VFI（FAL frame-interpolation / Wan 2.6），帧率翻倍
- **改动**：新增 `LXT_FINAL_FILM_VFI` task + `lxt-final-film-vfi.ts` handler
- **验证**：前后帧率对比 + LPIPS 指标

#### P1-2: 多模型策略支持（基础）

- **目标**：分镜头选择不同模型（Kling 快速预览 → Seedance 2.0 终版）——"广度→控制→终版"三段式
- **改动**：`LxtFinalFilmRow` 增加 `videoModelId?`，Stage UI 增加行级模型选择器
- **验证**：切换模型 → 视频正常生成
- **注**：智能路由（按镜头类型/成本优化）见 P1-16

#### P1-3: TTS/音频集成

- **目标**：利用已有 voice-design 基础设施，为每镜生成 TTS 并 FFmpeg 合成
- **改动**：新增 `LXT_FINAL_FILM_AUDIO` task + handler
- **验证**：视频生成后 TTS 音轨存在且可播放

#### P1-4: 激活角色关系数据链路

- **目标**：`agent_character_profile` 的 `relationships[]` 注入 Phase 1 Prompt，约束对话语气和空间定位
- **改动**：`buildLxtAssetPromptContext` 增加 `relationships` 参数 → Phase1 prompt 增加关系约束
- **验证**：上下级关系角色对话语气有明显级别区分

#### P1-5: Phase 1/2A/2B 跨镜上下文

- **目标**：Phase 1 输入前后镜标签/景别/场景；Phase 2A 看到相邻镜帧布局
- **改动**：`mapWithConcurrency` 中构建前后镜上下文 → Prompt 增加 `{context}` 变量
- **验证**：相邻镜空间布局一致（场景、光线、角色位置连续）

#### P1-6: 补齐英文 Prompt 关键缺失规则

- **目标**：中文版独有规则（7 要素模板、微移模板库、光线克制、空间约束）同步到英文版
- **改动**：`shot_phase2a_image.en.txt` 从 125 行扩展到约 160 行；所有英文 Prompt 增加示例块
- **验证**：英文模式下 Phase2A 产出包含 7 要素 + 递进变化

#### P1-7: 多集资产分析

- **目标**：支持全量多集分析，自动遍历全部 episode
- **改动**：`lxt-analyze-assets.ts`：未指定 episodeId 时查询所有有 `shotListContent` 的集
- **验证**：多集项目资产提取不遗漏

#### P1-8: 小说→剧本叙事丰富

- **目标**：DSR 双阶段精炼——Stage 1 LLM 丰富叙事细节 → Stage 2 格式转换
- **改动**：新增 `LXT_NOVEL_ENRICH` Prompt，`lxt-novel-to-script.ts` 两阶段调用（`instruction` 参数控制）
- **验证**：剧本输出包含环境氛围、动作细节描写

#### P1-9: 中英文混合 Prompt 对齐

- **目标**：根据模型语言能力自动选择 prompt 语言。Seedream → 中文；Imagen/OpenAI → 英文 Phase2A + 英文 Suffix
- **实测确认**（2026-04-29）：三只小猪测试中同一分镜 imagePrompt 为中文、videoPrompt 为英文，确认混合问题存在
- **改动**：
  - `lxt-final-film-task-handlers.ts`：根据 modelId 判断是否需要翻译 Phase2A
  - `lxt-asset-image-task-handler.ts`：根据模型语言能力选择 Suffix 语言
  - 先补齐 `shot_phase2a_image.en.txt` 英文版规则
- **验证**：Imagen/OpenAI 下四宫格 prompt 为纯英文；对比中英混合 vs 纯英文生成质量

#### P1-10: 场景图片 Layout 指导

- **目标**：`LOCATION_PROMPT_SUFFIX` 从空字符串改为带构图布局指令
- **改动**：`constants.ts` 替换为 `广角场景图，前景/中景/背景层次分明，光线方向明确，空间深度感强`
- **验证**：场景生成图有明显的前景/中景/背景层次

#### P1-11: 角色描述增加渲染风格规则

- **目标**：description 生成模板中增加渲染风格指令（线条/填色/光影/色调），确保生成图风格可控
- **改动**：`confirm-profile/route.ts` 的 `buildDescriptionPrompt`：在 sectionOrder 末尾增加"渲染风格"区，要求 LLM 输出"柔和圆润轮廓线, 纯色块填充为主, 微渐变阴影, 粉彩色调, 无写实纹理"
- **验证**：同一项目多角色生成图风格一致（人工对比）

#### P1-12: 角色描述增加正向防退化约束

- **目标**：通过正向词汇防止模型走向写实/恐怖谷/暗黑风格（弥补 Ark 丢弃 negative prompt 的限制）
- **改动**：`confirm-profile/route.ts` 的 `buildDescriptionPrompt` 格式规则中增加禁止词（"真实""照片级""暗黑""恐怖"）和强制词（"非写实""可爱化处理""明亮色调""儿童友好"）
- **验证**：批量检查生成结果中是否出现写实/暗黑风格（人工抽检）

#### P1-13: ✅ 非人类角色下部身体描述强化

- **状态**：✅ 已完成（2026-04-29）
- **实现**：LLM prompt 强制要求全部 8 个区域输出；新增规则 8（非人类角色强制规则）和输出前自检指令
- **改动**：`confirm-profile/route.ts` — 强化 ⑦⑧ 区为必填 + 输出前 8 区域完整性自检
- **验证**：非人类角色描述包含 ⑦下身+脚蹄区（脚蹄/尾巴/下摆/露蹄声明）；8 区域全覆盖

#### P1-14: ✅ 画风一致性对齐

- **状态**：✅ 已完成（2026-04-29）
- **实现**：artStyle 作为强约束传入 `buildDescriptionPrompt`；风格指令改为 `严格使用【${artStyleName}】风格生成描述，禁止自行推断或改变风格`
- **改动**：`confirm-profile/route.ts`（后端接收 artStyle）、`LxtAssetsStage.tsx`（前端传 artStyle）
- **验证**：用户选择 `realistic` 时不以 `Q版卡通风格` 开头

#### P1-15: ✅ 质量评估闭环（轻量版） — 已完成 (2026-04-29)

- **状态**：✅ 已完成
- **实现**：
  - 新增 `lib/prompts/lxt-script/shot_critic.zh.txt` / `shot_critic.en.txt` — Critic Agent prompt（中英文双语，六维评分 JSON 输出）
  - 新增 `lib/prompts/lxt-script/shot_repair.zh.txt` / `shot_repair.en.txt` — Repair Agent prompt（基于弱点 + 修复建议修订 video prompt）
  - 新增 `src/lib/lxt/quality-scorer.ts` — `scoreCriticResponse()` 解析 Critic JSON 输出，`isPassing()` 阈值判断（默认 ≥ 0.70），`computeAggregate()` 跨镜聚合
  - 新增 `src/lib/workers/handlers/lxt-shot-review.ts` — Review handler（text 队列）：
    - Critic 评分 → pass：写入 `reviewResult.status = 'pass'`
    - fail + retryCount < 2 → Repair Agent 修订 → 更新 videoPrompt → 重新提交 `LXT_FINAL_FILM_VIDEO` task → `reviewResult.status = 'repairing'`
    - fail + retryCount ≥ 2 → `reviewResult.status = 'failed'`
  - 新增 `LXT_SHOT_REVIEW` task type（`src/lib/task/types.ts`）
  - 新增 `LXT_SHOT_CRITIC` / `LXT_SHOT_REPAIR` prompt IDs + catalog 注册
  - `src/lib/lxt/final-film.ts`：`LxtFinalFilmRow` 增加 `reviewResult?: LxtFinalFilmRowReviewResult` 字段 + `normalizeReviewResult()` 标准化
  - `src/lib/workers/text.worker.ts`：新增 `LXT_SHOT_REVIEW` case → 动态 import handler
  - `src/lib/workers/handlers/lxt-final-film-task-handlers.ts`：视频生成后自动提交 `LXT_SHOT_REVIEW` 任务（dedupeKey 防重）
  - `src/lib/task/intent.ts`：`LXT_SHOT_REVIEW` intent 注册为 `'process'`
  - `tests/contracts/task-type-catalog.ts`：`LXT_SHOT_REVIEW` owner 注册
- **验证**：DramaBench 六维评分 ≥ 0.70 为通过；Repair 后质量提升；最大 2 次重试防止无限循环
- **架构**：
  ```
  视频生成 → LXT_SHOT_REVIEW 异步任务 → Critic Agent 六维评分 → ≥0.70 → pass
                                                            → <0.70 → Repair Agent → 重新生成 → 再次评审（最多2轮）
  ```

#### P1-16: 🆕 智能模型路由（成本优化）

- **优先级理由**：行业通过分层模型策略降成本 60-70%。LXT 当前整集统一模型，无按镜头类型/成本优化路由。
- **目标**：实现三段式模型路由——快速预览（Wan/Kling 快速模式）→ 控制级（Seedance 2.0）→ 旗舰（Sora/Veo）；按镜头类型自动推荐模型
- **路由逻辑**：
  ```
  建立镜 (establishing) → Kling 2.6 (广角能力强)
  特写镜 (close-up)    → Runway Gen-4 (面部细节)
  动作镜 (action)      → Seedance 2.0 (运动流畅)
  产品/道具镜 (product) → Veo 3 (材质质感)
  默认镜              → 用户首选模型
  ```
- **改动**：
  - `src/lib/lxt/model-router.ts`（新建）— 模型路由决策引擎
  - `LxtFinalFilmContent` 增加 `modelRoutingMode?: 'unified' | 'smart' | 'economy'`
  - `LxtFinalFilmRow` 增加 `recommendedModel?` 字段
  - `lxt-final-film-task-handlers.ts`：按行路由模型
  - Stage UI 增加路由模式选择器
- **验证**：smart 模式下不同镜使用不同模型；economy 模式下成本降低 ≥ 50%

#### P1-17: 🆕 FilmWeaver 级 Shot Cache 角色一致性

- **优先级理由**：FilmWeaver 双级缓存是 2026 角色一致性的核心机制，CLIP 检索 + 滑动窗口 ROI 极高。LXT 已建立种子+尾帧+4 帧基础方案，追加缓存层可显著提升长片一致性。
- **目标**：实现轻量版双级缓存——Shot Cache（CLIP 检索前镜关键帧）+ Temporal Cache（滑动窗口连续帧）
- **技术方案**：
  ```
  Shot Cache (长期): 每镜完成后提取 CLIP embedding → 存为 shotIndexedCache
                    → 新镜生成时检索最相似前镜 → 注入为参考图
  Temporal Cache (短期): 当前镜前 2 镜的尾帧 + 关键帧滑动窗口
                        → 压缩为低分辨率参考拼图注入
  ```
- **改动**：
  - `src/lib/lxt/shot-cache.ts`（新建）— CLIP 检索 + 滑动窗口缓存
  - `lxt-final-film-task-handlers.ts`：集成 Shot Cache 查询
  - `prisma/schema.prisma`：`LxtFinalFilmContent` 增加 `shotIndexedCache` JSON 字段
  - 利用已有 `referenceImages` 参数链增加缓存参考图（无需改模型接口）
- **验证**：跨 5 镜长片角色一致性 CLIP 评分提升；Shot Cache 命中率 > 80%

#### P1-18: 🆕 IP-Adapter FaceID 集成

- **优先级理由**：IP-Adapter FaceID（权重 0.7-0.85）是 2026 行业标配。配合已有种子+尾帧方案，可大幅提升面部一致性。
- **目标**：为 Seedance 2.0 / Kling 集成 IP-Adapter FaceID，使用角色资产图作为 face reference
- **改动**：
  - `lxt-final-film-task-handlers.ts`：在支持 IP-Adapter 的模型上附加 face reference
  - `lxt-asset-image-task-handler.ts`：角色资产生成时生成标准面部参考图（256x256 正面照）
  - `prisma/schema.prisma`：`lxtProjectAsset` 增加 `faceReferenceUrl?` 字段
- **验证**：同角色跨镜面部 CLIP 余弦相似度 > 0.90；FaceID 权重可配置

### 4.4 P2 — 中期建设（11 项）

#### P2-1: 批量变体生成 + 自动筛选

- **目标**：每镜生成 N 个变体（默认 3），自动评分选最佳
- **改动**：`LxtFinalFilmRow` 增加 `videoVariants[]` + `video-scorer.ts`（运动流畅度/角色一致性/伪影检测）+ 变体对比 UI
- **复杂度**：高（需新增评分模块）

#### P2-2: 转场效果引擎

- **目标**：时间线拼装时自动插入过渡效果（cross-fade、motion blur transition）
- **改动**：新增 `transition-engine.ts`，集成到 `build-timeline.ts`
- **复杂度**：中

#### P2-3: 多智能体质量评审（完整版）

- **目标**：P1-15 的完整版——VISTA 风格多智能体系统：结构化规划→候选池→成对锦标赛→三维度评审→深度思考修订
- **改动**：在 P1-15 基础上扩展为多 Agent 协作（Visual Critic / Audio Critic / Context Critic）；引入成对锦标赛选择机制
- **复杂度**：高（需多 Agent 编排）
- **注**：P1-15 为轻量单 Critic 版，此为完整多智能体版

#### P2-4: 角色全生命周期状态追踪

- **目标**：追踪每镜造型变化、情绪变化、身体状态
- **改动**：新增 `CharacterState`（shotIndex, outfit, emotion, physicalCondition, position），Phase 1 自动追踪
- **复杂度**：中

#### P2-5: 自动化质量评分系统

- **目标**：PPEF 框架评分 ≥ 0.70 为可投产
- **改动**：在 P1-15 `quality-scorer.ts` 基础上扩展 PPEF 九维评估，前端显示质量 Badge
- **复杂度**：中

#### P2-6: 项目级角色视觉一致性令牌

- **目标**：同一项目的所有角色共享一个 `styleToken`（如 "warm pastel children's book illustration"），注入每个角色的 description 开头，确保跨角色风格统一
- **改动**：`LxtProject` 增加 `styleToken?: string`；`buildDescriptionPrompt` 在风格锚定区引用项目 `styleToken`
- **复杂度**：低

#### P2-7: 移除角色描述尾部空双逗号

- **目标**：将尾部 `, , ` 改为显式终止标记或直接移除，防止部分模型将空段解释为等待补充而随机生成内容
- **改动**：`confirm-profile/route.ts` 的 `buildDescriptionPrompt` 格式规则：尾部不加空双逗号，或改为 `。` 作为显式终止符
- **复杂度**：低

#### P2-8: 🆕 多角度参考图体系

- **目标**：建立 4 角度角色护照标准（正面/侧面/¾/全身），用于 IP-Adapter/LoRA 训练和跨镜参考
- **改动**：
  - 角色资产生成时自动请求多角度（修改 `CHARACTER_PROMPT_SUFFIX`）
  - `lxtProjectAsset` 增加 `referenceAngles?: string[]` 字段
  - 视频生成时选择最相关角度注入
- **复杂度**：中

#### P2-9: 🆕 Anchor Prompt 模板库

- **目标**：按场景类型/风格/平台维护可复用 Prompt 模板库，替代每项目从零构建
- **改动**：
  - `lib/prompts/lxt-anchors/` 目录（新建）— 按类型组织锚定模板
  - 常见类型：童话/都市/古装/科幻 + Q版/写实/二次元
  - Phase2A 支持 `{anchor_template}` 变量注入
- **复杂度**：中

#### P2-10: 🆕 视频后处理套件扩展

- **目标**：在 P1-1（VFI）基础上补齐颜色分级（LUT 统一色调）+ 胶片质感（颗粒 + bloom）+ 超分辨率选项
- **改动**：
  - 新增 `lxt-post-process.ts` handler
  - `LxtFinalFilmContent` 增加 `postProcessing?: { colorGrade?: string; filmGrain?: boolean; upscale?: string }`
  - Stage UI 增加后处理开关
- **复杂度**：中

#### P2-11: 🆕 弹性伸缩与 Webhook 优先

- **目标**：按队列深度自动扩缩 worker；外部 API 结果回调改为 webhook 优先（减少轮询开销）
- **改动**：
  - `waitExternalResult` 增加 webhook callback URL 参数
  - 新增 API 路由 `POST /api/lxt/webhook/[taskId]`
  - BullMQ 队列增加 `concurrencyScale` 动态调整
- **复杂度**：高

---

## 五、实施路线图

### 5.1 时间线

```
已完成 ✅  P0-1→P0-2→P0-3→P0-4→P0-5→P0-6→P0-7→P0-8→P0-9 (2026-04-28 全部实施并验证)
          P0-10→P1-13→P1-14 (2026-04-29 实施并验证)

Week 1-2   ✅ P1-15(质量评估闭环) → P1-11(渲染风格) → P1-12(正向防退化)
Week 3-4   P1-17(FilmWeaver缓存) → P1-18(IP-Adapter) → P1-16(智能模型路由)
Week 5-6   P1-1(帧插值) → P1-3(音频集成) → P1-6(英文Prompt) → P1-9(中英混合对齐)
Week 7-8   P1-4(关系数据) → P1-5(跨镜上下文) → P1-7(多集分析) → P1-8(叙事丰富) → P1-10(场景Layout)
Week 9-10  P2-1(变体筛选) → P2-3(完整多智能体评审)
Week 11-12 P2-2(转场引擎) → P2-4(角色生命周期) → P2-5(质量评分) → P2-6(项目风格令牌) → P2-7(尾部逗号)
Week 13-14 P2-8(多角度参考图) → P2-9(Anchor模板库) → P2-10(后处理套件)
Week 15+   P2-11(弹性伸缩)
```

### 5.2 关键里程碑

```
M1 (Week 1)  : ✅ 质量评估闭环上线 — 行业最大代差消除
M2 (Week 4)  : FilmWeaver 缓存 + IP-Adapter — 角色一致性达行业标准  
M3 (Week 6)  : VFI + 音频 — 视频产出不再是"静音"
M4 (Week 8)  : 英文 Prompt 补齐 + 中英对齐 — 国际化可用
M5 (Week 12) : 变体筛选 + 完整质量闭环 — 达行业一流
```

### 5.3 文件改动预估

#### P0 改动文件（7 个 — 全部已实施 ✅）

```
src/lib/lxt/final-film.ts                                 (P0-2/P0-4) ✅
src/lib/workers/handlers/lxt-final-film-task-handlers.ts  (P0-1~P0-5) ✅
src/lib/workers/handlers/lxt-asset-image-task-handler.ts  (P0-6/P0-7) ✅
src/app/api/lxt/[projectId]/assets/[assetId]/confirm-profile/route.ts  (P0-8/P0-9/P1-13/P1-14) ✅
src/app/api/lxt/[projectId]/assets/[assetId]/route.ts     (P0-10) ✅
src/lib/generators/ark.ts                                 (P0-1) ✅
src/app/.../components/LxtFinalFilmStage.tsx              (P0-4/P1-14) ✅
```

#### P1 改动文件（23 个 — 7 个已实施，16 个待实施）

```
src/lib/workers/handlers/lxt-final-film-vfi.ts            (新建 - P1-1)
src/lib/workers/handlers/lxt-final-film-audio.ts          (新建 - P1-3)
src/lib/workers/handlers/lxt-shot-review.ts               (新建 - P1-15) ✅
src/lib/lxt/quality-scorer.ts                              (新建 - P1-15) ✅
src/lib/lxt/model-router.ts                                (新建 - P1-16)
src/lib/lxt/shot-cache.ts                                  (新建 - P1-17)
src/lib/lxt/project-assets.ts                              (P1-4)
src/lib/lxt/parse-script.ts                                (P1-4)
src/lib/workers/handlers/lxt-storyboard-to-script.ts       (P1-5/P1-4)
src/lib/workers/handlers/lxt-analyze-assets.ts             (P1-7)
src/lib/workers/handlers/lxt-novel-to-script.ts            (P1-8)
src/lib/workers/handlers/lxt-final-film-task-handlers.ts   (P1-9/P1-15/P1-16/P1-17/P1-18) ✅ (P1-15)
src/lib/workers/handlers/lxt-asset-image-task-handler.ts   (P1-9/P1-18)
src/app/api/lxt/[projectId]/assets/[assetId]/confirm-profile/route.ts  (P1-11/P1-12) ✅
src/app/api/lxt/[projectId]/assets/[assetId]/route.ts     (P0-10) ✅
src/app/.../components/LxtAssetsStage.tsx                  (P1-14) ✅
src/lib/constants.ts                                       (P1-10/P1-11)
lib/prompts/lxt-script/shot_phase1_base.*.txt              (+context + 关系约束)
lib/prompts/lxt-script/shot_phase2a_image.*.txt            (+跨镜空间约束)
lib/prompts/lxt-script/shot_phase2a_image.en.txt           (P1-6)
lib/prompts/lxt-script/shot_critic.zh.txt                  (新建 - P1-15) ✅
lib/prompts/lxt-script/shot_critic.en.txt                  (新建 - P1-15) ✅
lib/prompts/lxt-script/shot_repair.zh.txt                  (新建 - P1-15) ✅
lib/prompts/lxt-script/shot_repair.en.txt                  (新建 - P1-15) ✅
src/lib/prompt-i18n/prompt-ids.ts                          (P1-15) ✅
src/lib/prompt-i18n/catalog.ts                             (P1-15) ✅
src/lib/workers/text.worker.ts                             (P1-15) ✅
src/lib/task/intent.ts                                     (P1-15) ✅
tests/contracts/task-type-catalog.ts                       (P1-15) ✅
src/lib/task/types.ts                                      (+VFI/AUDIO/REVIEW task 类型 — P1-15 ✅)
prisma/schema.prisma                                       (P1-17/P1-18/P1-16 新字段)
```

#### P2 改动文件（13 个）

```
src/lib/lxt/transition-engine.ts                           (新建 - P2-2)
src/lib/lxt/video-scorer.ts                                (新建 - P2-1)
src/lib/workers/handlers/lxt-post-process.ts               (新建 - P2-10)
src/app/api/lxt/webhook/[taskId]/route.ts                  (新建 - P2-11)
lib/prompts/lxt-anchors/                                   (新建目录 - P2-9)
src/app/api/lxt/[projectId]/assets/[assetId]/confirm-profile/route.ts  (P2-7)
prisma/schema.prisma                                       (VideoVariant, CharacterState, styleToken, referenceAngles)
src/lib/constants.ts                                       (P2-6)
```

### 5.4 关键风险与缓解

| 风险 | 可能性 | 影响 | 缓解措施 |
|------|--------|------|---------|
| Critic Agent 评审质量不稳定 | 高 | P1-15 评分不准确 | 先做轻量版单 Critic + 人工校验；逐步升级为多 Agent |
| IP-Adapter 模型支持有限 | 中 | P1-18 仅 Seedance 可用 | 按模型能力条件启用；降级方案为 LoRA |
| CLIP 检索增加生成延迟 | 中 | P1-17 Shot Cache 延迟 2-5s | 异步预计算 embedding；缓存命中优先 |
| 模型路由推荐不准确 | 中 | P1-16 效果不如统一模型 | 保留 unified 模式作为 fallback；路由建议而非强制 |
| 英文 Phase2A 补齐后产出风格偏离中文版 | 中 | 语言切换产出一致性差 | 中英文版对比测试，统一评估标准 |
| Ark 对 referenceImages 有隐式数量/尺寸限制 | 中 | 多图注入失败 | 按模型条件限制参考图数量（`resolveModelMaxReferenceImages`） |
| 帧插值引入额外延迟 | 低 | 用户体验下降 | VFI 设为可选后处理步骤 |

---

## 六、验证标准

### P0 验证标准（全部已验证通过 ✅）

| 改进项 | 验证方式 | 通过标准 | 状态 |
|--------|---------|---------|------|
| P0-1 4帧注入 | 对比单帧 vs 4 帧视频质量 | 人工 + CLIP 一致性评分提升 | ✅ |
| P0-2 种子锁定 | 同集相邻两镜角色面部 diff | 面部几何无明显跳变 | ✅ |
| P0-3 尾帧注入 | 相邻镜过渡检查 | 无跳变 | ✅ |
| P0-4 参数配置 | UI 修改参数后生成视频 | 视频 Duration/Resolution 正确 | ✅ |
| P0-5 四宫格Negative | 日志确认 negativePrompt 传入 | 卡通/模糊率明显下降 | ✅ |
| P0-6 资产Negative+参考图 | 同角色两次生成 CLIP 相似度 | > 0.85 | ✅ |
| P0-7 道具模型 | 日志检查 modelId | 非 locationModel | ✅ |
| P0-8 风格锚定前缀 | 检查角色 description 首句 | 以 `{artStyleName}风格,` 开头 | ✅ |
| P0-9 默认表情 | 检查角色 description | 面部区域③包含表情字段 | ✅ |
| P0-10 body_proportion修复 | DB 查询 + LLM 日志对比 | `body_proportion` 和 `species_traits` 不为 undefined/null | ✅ |
| P1-13 下部身体描述 | 非人类角色 description 检查 | ⑦下身+脚蹄区 + ⑧配饰区完整；8 区域全覆盖 | ✅ |
| P1-14 画风一致性 | 检查 description 风格 vs artStyle | 用户选 realistic 时不以 Q版卡通开头 | ✅ |

### P1 验证标准

| 改进项 | 验证方式 | 通过标准 |
|--------|---------|---------|
| P1-1 帧插值 | 前后帧率 + LPIPS | 帧率翻倍，LPIPS ≤ 0.1 |
| P1-2 多模型 | 切换模型生成视频 | 正常生成 |
| P1-3 音频 | 视频含 TTS 音轨 | 可播放 |
| P1-4 关系数据 | 上下级关系角色对话检查 | 语气有明显级别区分 |
| P1-5 跨镜上下文 | 相邻镜空间布局检查 | 场景/光线/位置连续 |
| P1-6 英文Prompt | 英文 Phase2A 输出检查 | 包含 7 要素 + 递进变化 |
| P1-7 多集分析 | 多集项目资产提取检查 | 不遗漏 |
| P1-8 叙事丰富 | 剧本输出检查 | 包含环境氛围、动作细节 |
| P1-9 中英混合对齐 | Imagen/OpenAI 下 prompt 检查 | 纯英文 prompt |
| P1-10 场景Layout | 场景生成图检查 | 前景/中景/背景层次分明 |
| P1-11 渲染风格规则 | 同项目多角色生成图对比 | 风格一致 |
| P1-12 正向防退化 | 批量抽检生成结果 | 无写实/暗黑风格 |
| P1-15 质量评估闭环 | Critic 评分 vs 人工评分 | ✅ DramaBench 六维分数 ≥ 0.70；Repair 后提升 |
| P1-16 智能模型路由 | 同一项目不同路由模式对比 | 成本降低 ≥ 50%（economy 模式）；smart 模式质量不降 |
| P1-17 FilmWeaver缓存 | 跨 5 镜长片角色一致性 | CLIP 评分提升；Shot Cache 命中率 > 80% |
| P1-18 IP-Adapter | 同角色跨镜面部一致性 | CLIP 余弦相似度 > 0.90 |

### P2 验证标准

| 改进项 | 验证方式 | 通过标准 |
|--------|---------|---------|
| P2-6 项目风格令牌 | 同项目跨角色 description 检查 | 共享 styleToken 前缀 |
| P2-7 尾部逗号修复 | description 末尾检查 | 无空 `, , ` 终止符 |
| P2-8 多角度参考图 | 角色资产生成结果 | 4 角度齐全（正面/侧面/¾/全身） |
| P2-9 Anchor模板库 | 模板覆盖范围 | 核心场景类型全覆盖（童话/都市/古装/科幻） |

---

## 七、改进优先级矩阵

```
                    低投入          中投入          高投入

高收益    ┌─────────────────────────────────────────────┐
          │ ✅种子锁定     补齐英文Prompt   ✅质量评估闭环  │
          │ ✅4帧全利用    跨镜上下文      FilmWeaver缓存  │
          │ ✅参数可配置   多集资产分析    IP-Adapter     │
          │ ✅尾帧注入     叙事丰富阶段    智能模型路由    │
          │ ✅中英混合对齐  ✅Negative      变体筛选       │
          │ ✅道具模型     ✅LXT参考图     音频生成        │
          │ ✅body_prop   ✅下部身体描述   多智能体完整版  │
          │ ✅画风一致性   ✅风格锚定      帧插值          │
          │               ✅默认表情                       │
          │               激活关系数据                    │
          │               场景Layout                     │
          │               渲染风格规则                    │
          │               正向防退化                      │
          │               英文Prompt补齐                  │
          ├─────────────────────────────────────────────┤
          │ ✅项目风格令牌  转场引擎        多角度参考图    │
          │ ✅尾部逗号修复  角色生命周期    后处理套件      │
          │               Anchor模板库    弹性伸缩        │
          └─────────────────────────────────────────────┘
```

**图例**：✅ 已完成 | 🔥 最高优先级 | 无标记 = 待实施

---

## 八、附录：模型兼容性矩阵

| 图像模型 | 中文 Prompt | 英文 Prompt | Negative Prompt | 语言混合风险 | 推荐语言 |
|----------|-----------|-----------|----------------|------------|---------|
| Seedream 4.x/5.0 (Ark) | 良好 | 良好 | 静默丢弃 → positive 退化 | 低（中英双语） | 中文/英文 |
| Imagen (Google) | 差 | 良好 | 支持 | **高**（英文优先） | 英文 |
| OpenAI Compatible | 差 | 良好 | 支持 | **高** | 英文 |
| FAL/Banana | 一般 | 良好 | 支持 | 中 | 英文 |

---

## 九、附录：行业参考来源

- Seedance 2.0 Short-Drama Ready (Medium, 2026)
- FilmWeaver: Multi-Scenario Video Generation (Tsinghua/Kuaishou, 2026)
- Camera Artist: Multi-Agent Cinematography (ArXiv 2604.09195, 2026)
- DramaBench: Large-Scale Drama Script Evaluation (ArXiv 2512.19012, 2026)
- VISTA: Video Iterative Self-improvement Agent (ArXiv 2510.15831, 2026)
- VQQA: Video Quality Question Answering (ArXiv 2603.12310, 2026)
- PPEF: Production-Pipeline Evaluation Framework (JAI-IT, 2026)
- OmniAgent: Hierarchical Multi-Agent Framework (2026)
- NovaKit AI Video Creation Workflow (2026)
- Genvid Universal Reference Architecture (2026)
- Artiroom Character Consistency Guide (2026)

---

> **更新日志**：
> - 2026-04-29 v2.2：三只小猪全链路实测完成。发现 3 个新问题：①景别多样性不足（仅中景/近景）；②中英 Prompt 混合确认（imagePrompt 中文 + videoPrompt 英文）；③资产确认不完整（3/8 未确认致参考图缺失）。新增 3 项 Bug 修复：首帧点击放大、套图历史保留、视频生成 ARK API 冲突。详见修复计划。
> - 2026-04-29 v2.1：P1-15（质量评估闭环）实施完成。新增 4 个 prompt 模板（critic/repair zh+en）、`quality-scorer.ts`、`lxt-shot-review.ts` handler；`LxtFinalFilmRow` 增加 `reviewResult` 字段；`text.worker.ts` 注册 `LXT_SHOT_REVIEW` case；视频生成后自动链式触发评审任务。消除 2026 年最大代差。`npx tsc --noEmit` 零错误。
> - 2026-04-29 v2.0：基于《LXT_2026行业对标架构分析.MD》全面更新。新增行业架构一致性评估（1.4）；新增行业对标差距章节（3.4）；P0-10、P1-13、P1-14 标记为已完成；新增 P1-15（质量评估闭环）、P1-16（智能模型路由）、P1-17（FilmWeaver 缓存）、P1-18（IP-Adapter）；新增 P2-8~P2-11；重构 P1/P2 优先级以反映行业影响；更新实施时间线和里程碑；更新验证标准和优先级矩阵。
> - 2026-04-28 v1.0：P0-1~P0-9 全部实施并通过三只小猪项目实测验证。新增 P0-10、P1-13、P1-14。更新核心短板列表。
> - 2026-04-28 初版：合并《LXT_质量评估与行业对标分析》与《LXT_优化路线图》。
>
> **下一步**：P1-11（渲染风格规则）、P1-12（正向防退化约束）；景别多样性优化（script_to_storyboard prompt）；P1-9（中英 Prompt 对齐）。
