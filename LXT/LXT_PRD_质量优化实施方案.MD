# LXT 质量优化实施方案 — PRD

> 版本：v1.0  
> 更新时间：2026-04-28  
> 来源：合并《LXT_质量评估与行业对标分析》与《LXT_优化路线图》为单一可执行 PRD 文档

---

## 一、项目背景与目标

### 1.1 背景

LXT 是 waoowaoo 平台的 AI 短剧生产流水线，覆盖 5 个阶段：资产库（lxt-assets）→ 脚本生成（lxt-script/storyboard/final-script）→ 成片（lxt-final-film）。在 2026 年 AI 短剧行业快速演进的背景下，需要系统性评估 LXT 各阶段产出质量，找出与行业标准的差距，并制定可执行的改进路线。

### 1.2 目标

- **短期（1-2 周）**：修复核心瓶颈（P0），立即提升产出质量
- **中期（2-6 周）**：补齐重要短板（P1），达到行业标准
- **长期（6-12 周）**：建设竞争力（P2），拉开与竞品差距

### 1.3 对标基准

| 阶段 | 对标行业基准 |
|------|------------|
| 资产库 | OpenCharacter、Seedance 2.0 角色管理、纳米漫剧流水线 |
| 脚本生成 | DramaBench、DSR 双阶段精炼、Camera Artist、Dramaturge |
| 成片 | Seedance 2.0 工作流、FilmWeaver、行业首尾帧实践 |

---

## 二、当前状态评估

### 2.1 核心优势

1. **Prompt 工程已达行业一流**：摄影机词汇（16 种景别 + 16 种视角 + 20+ 种运动 + 微移模板库）、表演指导词汇（58 个术语 7 大类）、4 帧关键帧架构（7 要素 + 递进变化）、中文 Prompt 细节度均超越行业平均
2. **4 阶段并行流水线架构合理**：单镜拆分 + 5 并发处理 + 进度回传，Phase2A/2B 并行，可扩展性强
3. **数据模型设计前瞻**：行级 patch 合并、版本化 JSON、资产唯一键、历史保留
4. **模型适配层成熟**：Strategy 模式统一多供应商（Seedance/Wan/Veo/Sora/Kling）
5. **资产提取质量高**：角色 15+ 结构化字段、9 种关系类型、9 条严格道具排除规则、场景 3 层空间锚定、非人类角色专属字段、人称视角映射

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

并行处理能力                                          ████████
空间上下文追踪                                        ██████
首尾帧模式                                            ████████
资产参考注入                                          ████████

关系数据利用                      ██
多集资产分析                      ██
英文Prompt对标                    ██
跨镜上下文窗口                    ██
小说→剧本叙事丰富                  ██
4帧充分利用                       ██
参数可配置化                      ██
角色状态追踪                      ██
资产Negative Prompt               ██
中英文Prompt混合                   ██
4宫格Negative Prompt              ██

帧插值               ██████
种子锁定             ██████
质量自动验证         ██████
多智能体协作评审     ██████
无音频生成           ██████
无变体筛选           ██████
角色人格系统化       ██████
前一镜尾帧注入       ██████
LXT资产无参考图      ██████
场景无布局指导       ██████
切割假设脆弱         ██████
```

### 2.3 核心短板（9 项 — 已修复 3 项，新增 2 项）

> **2026-04-28 更新**：P0-5（Negative Prompt）、P0-6（资产参考图）、P0-7（道具模型）已于三只小猪实测中验证通过。

1. **缺少质量反馈闭环**：所有阶段"生成即结束"，无 Review/Critic/Validate 机制——这是 2026 年行业最显著的代差
2. **连续性约束不足**：跨镜上下文 + 帧插值，两个环节仍缺失（种子锁定 P0-2 + 尾帧注入 P0-3 已修复）
3. **数据孤岛**：资产库已提取的关系数据、角色档案未充分流转到脚本和成片阶段
4. **英文 Prompt 不对标**：中文版 Phase2A 169 行 vs 英文版 125 行，缺少 7 要素模板、微移模板库、空间约束
5. ~~图片提示词缺少 Negative Prompt~~ ✅ 已修复（P0-5/P0-6）：资产库和四宫格均已传递画风特定 negative prompt + Ark positive 退化路径
6. **中英文混合 Prompt**：英文 gridPrefix + 中文 Phase2A + 英文 artStyle，对 Imagen/OpenAI 英文优先模型不友好
7. ~~LXT 资产缺少参考图一致性~~ ✅ 已修复（P0-6）：角色类型查询同名已有资产的 imageUrl 作为参考图注入
8. ⚠️ **新增**：**body_proportion & species_traits 持久化丢失**：LLM 分析完整产出但 DB 中为 undefined，导致角色描述缺少体格测量数据
9. ⚠️ **新增**：**非人类角色下部身体描述系统性缺失**：脚蹄/尾巴/下摆/露蹄声明丢失，AI 可能补全人类特征

---

## 三、详细差距分析

### 3.1 资产库阶段（lxt-assets）

#### 3.1.1 资产提取质量

| 差距 | 严重度 | 描述 |
|------|--------|------|
| 关系数据未利用 | 中 | `agent_character_profile` 已提取 `relationships[]`（9 种关系类型 + 方向性），但下游完全不消费。注意：儿童故事角色关系简单（家庭成员），LLM 从名称已能推断，边际收益有限。建议降级为 P0-6 的附属改动（顺手存 profileData JSON） |
| 缺少大五人格 | 中 | `personality_tags` 仅覆盖中文网文标签，缺 OCEAN 心理学维度（DuoDrama、OpenCharacter 标准） |
| 缺少角色状态追踪 | 中 | 无分镜/分集的角色外观变化管理（Seedance 2.0 支持叙事时间线追踪） |
| 多集分析未实现 | 中 | `lxt-analyze-assets` 只取第一集（`findFirst`） |
| 无自动质量评分 | 中 | 完全依赖人工确认档案，无自动扫描视觉不一致性 |

#### 3.1.2 资产图片 Prompt 质量

**Prompt 组装流程**：`[bodyProportion?] + [description] + [artStyle] + [PromptSuffix] → 图像模型`

| 资产类型 | Prompt 结构 | 宽高比 | 使用模型 |
|---------|------------|--------|---------|
| 角色 | `{bodyProportion}，{description}，{artStyle}，角色设定图，左侧1/3面部+右侧2/3三视图` | 3:2 | `userModels.characterModel` |
| 场景 | `{description}，{artStyle}` | 1:1 | `userModels.locationModel` |
| 道具 | `{description}，{artStyle}，道具设定图，左侧主视图+右侧三视图` | 3:2 | `userModels.locationModel` ⚠️ |

**资产 Prompt 差距项**：

| 差距 | 严重度 | 描述 |
|------|--------|------|
| 缺少 Negative Prompt | **高** | 完全不传递 `negativePrompt`（novel-promotion 全部处理程序均传递） |
| LXT 资产无参考图 | **高** | 同一角色多次生成无视觉一致性保障 |
| 道具使用场景模型 | **中** | `userModels.locationModel` 用于道具生成（`lxt-asset-image-task-handler.ts:85`） |
| 描述回退链风险 | **中** | `description → summary → name` 回退链，summary 为叙事文本非视觉描述 |
| 中英文混合 | **中** | 中文 Suffix + 英文 artStyle，对 Imagen/OpenAI 不友好 |
| 场景无布局指导 | **中** | `LOCATION_PROMPT_SUFFIX = ''`，完全无构图指令 |
| 无质量后验 | **中** | 不验证三视图布局/面部可见/纯白背景 |

#### 3.1.3 角色描述 Prompt 推理质量分析

`buildDescriptionPrompt`（`confirm-profile/route.ts`）通过 LLM 推理生成 tag 式逗号分隔描述，再拼接 `CHARACTER_PROMPT_SUFFIX` + `artStyle` 提交图像模型。以下以实际产出（儿童童话"猪哥哥"）为例分析质量。

**当前 LLM 推理产出示例：**
```
猪哥哥, 约6-8岁男性幼童, , 圆嘟嘟小猪脸型, 浅棕色柔和弯眉, 黑亮圆溜杏眼, 粉色圆翘猪鼻, 粉嘟嘟软嫩嘴唇, 细腻光滑粉白皮质感, , 额头浅棕色爱心形胎记, , 浅棕色短软绒毛, 长度及耳, 软绒顺直发型, 齐额碎刘海, , 身形圆滚滚软乎乎, 肩宽窄小, 娇小可爱感, , 明黄色纯棉圆领短袖上衣, 内搭浅蓝色纯棉贴身打底衫, 下装橙色纯棉休闲短裤, , 白色橡胶底休闲帆布鞋, ,
```

**达标项：**

| 维度 | 评价 |
|------|------|
| 语义密度 | **达标**：无废话，每个 token 都携带视觉信息 |
| 颜色+材质+形态三要素 | **达标**：全程遵守（如"明黄色纯棉圆领短袖"） |
| `, , ` 身体分区 | **达标**：结构清晰，面部/头发/体型/服装/鞋履分区明确 |
| 辨识标志 | **达标**："额头浅棕色爱心形胎记"——良好的唯一性锚点 |
| 年龄段匹配 | **达标**："约6-8岁""娇小可爱感"与儿童绘本定位一致 |

**差距项：**

> **2026-04-28 实测更新**：P0-8（风格锚定前缀）和 P0-9（头身比+默认表情）已实施并通过三只小猪项目验证。

| 差距 | 严重度 | 状态 | 描述 |
|------|--------|------|------|
| ~~缺少风格锚定前缀~~ | ~~高~~ | ✅ 已修复 (P0-8) | 描述现已以 `{artStyle}风格,` 开头。实测：`Q版卡通风格, 猪哥哥, 约8岁雄性小猪...` |
| ~~缺少头身比量化~~ | ~~高~~ | ⚠️ 部分修复 (P0-9) | LLM prompt 已要求头身比区，但 `body_proportion` 字段 DB 持久化丢失导致精确数据不可用（见 P0-10） |
| ~~缺少默认表情~~ | ~~高~~ | ✅ 已修复 (P0-9) | 面部区域③现已包含默认表情。实测：`开心活泼表情, 圆润小猪脸型...` |
| **缺少渲染风格指导** | **中** | 待修复 (P1-11) | 无线条/填色/光影/色调指令。应加"柔和圆润轮廓线, 纯色块填充, 粉彩色调" |
| **缺少正向防退化约束** | **中** | 待修复 (P1-12) | 无任何机制防止模型走向写实/恐怖谷/暗黑风格 |
| **项目级风格一致性缺失** | **中** | 待修复 (P2-6) | 同项目多角色之间无共享风格令牌 |
| **尾部空双逗号风险** | **低** | 待修复 (P2-7) | 部分模型可能将空段解释为等待补充 |
| ⚠️ **新增：下部身体描述系统性缺失** | **高** | 待修复 (P1-13) | ⑦下身+脚蹄和⑧配饰区域完全缺失。实测猪哥哥缺少脚蹄/尾巴/下摆延伸/露蹄声明 |
| ⚠️ **新增：画风一致性对齐** | **中** | 待修复 (P1-14) | 用户选 `realistic` 但 LLM 推断为 `Q版卡通风格`。`artStyle` 未作为强约束传入 LLM prompt |

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

#### 3.2.2 四宫格图片 Prompt 质量

**组装流程**（`handleLxtFinalFilmImageTask`）：
```
fullPrompt = gridPrefix + imagePrompt + ", " + artStyleText
```
示例：`2x2 grid layout, 4 sequential keyframes, 全局物理空间位置:...分镜图片布局：左上...右上...左下...右下..., Realistic cinematic look...`

**四宫格 Prompt 差距项**：

| 差距 | 严重度 | 描述 |
|------|--------|------|
| 缺少 Negative Prompt | **高** | 唯一不传 negative 的图片 handler（对比 `character-image-task-handler.ts:123`） |
| 中英文混合 Prompt | **高** | 英文 gridPrefix + 中文 Phase2A + 英文 artStyle，Imagen/OpenAI 质量显著降低 |
| 英文 Phase2A 不完整 | **中** | 英文版仅 125 行，缺核心规则。用户英文界面时 imagePrompt 质量系统性低于中文 |
| 4 帧仅用 2 帧 | **中** | 切割后仅用 index 0 和 index 3，中间帧（含关键动势递进信息）完全丢弃 |
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
| 4 帧未充分利用 | 高 | index 1、2 完全浪费。Seedance 2.0 支持最多 9 张参考图 |
| 无帧插值（VFI） | 高 | 完全无。ArbInterp（ICLR 2026）支持 2x-32x 任意倍率 |
| 无种子锁定 | 高 | 各镜独立种子，无几何一致性。Seedance 2.0 "DNA 锁定"是核心机制 |
| 无前一镜尾帧注入 | 中 | `buildMultiShotVideoPrompt` 仅文本上下文。FilmWeaver 用镜头记忆缓存关键帧 |
| 参数硬编码 | 中 | 8 秒、720p 不可配置（行业 4-60s + 480p-1080p） |
| 无音频 | 中 | 无 TTS/音效/BGM。Seedance 2.0 原生支持 8+ 语言音频同步 |
| 无变体筛选 | 中 | 每镜仅 1 个视频。纳米漫剧一次多选成功率 90%+ |
| 无转场处理 | 低 | 各镜独立生成。StoryGen-Atelier "插值链"算法 |

---

## 四、改进方案

### 4.1 优先级定义

| 优先级 | 含义 | 时间线 | 投入 |
|--------|------|--------|------|
| **P0** | 核心瓶颈，修复即可显著提升产出质量 | 1-2 周 | 低 |
| **P1** | 重要短板，补齐后达到行业标准 | 2-6 周 | 中 |
| **P2** | 竞争力提升，拉开与竞品的差距 | 6-12 周 | 高 |

### 4.2 P0 — 立即改进（10 项 — 9 项已完成 ✅）

> **2026-04-28 三只小猪实测验证**：P0-1~P0-9 全部已实施并验证通过。P0-10 为实测新发现。

#### P0-1: ✅ 4 帧全量注入视频生成

- **状态**：✅ 已完成（2026-04-28）
- **实现**：`handleLxtFinalFilmVideoTask` 收集 `splitImageUrls` 全部 4 张传入 `referenceImages`
- **改动**：`lxt-final-film-task-handlers.ts`
- **验证**：对比单帧 vs 4 帧视频质量（人工 + CLIP 一致性评分）

#### P0-2: ✅ 镜头间种子锁定

- **状态**：✅ 已完成（2026-04-28）
- **实现**：`LxtFinalFilmContent` 增加 `videoSeed`，首镜生成后保存，后续镜复用
- **改动**：`final-film.ts`、`lxt-final-film-task-handlers.ts`
- **验证**：检查同集相邻两镜角色面部一致性（diff 对比）

#### P0-3: ✅ 前一镜尾帧注入

- **状态**：✅ 已完成（2026-04-28）
- **实现**：`allRows[currentIdx - 1]?.videoEndFrameUrl` 作为额外参考图传入
- **改动**：`lxt-final-film-task-handlers.ts`
- **验证**：检查相邻镜过渡平滑度（无跳变）

#### P0-4: ✅ 视频参数可配置化

- **状态**：✅ 已完成（2026-04-28）
- **实现**：`LxtFinalFilmContent` 增加 `videoDuration`、`videoResolution`；UI 增加选择器；handler 从 content 读取
- **改动**：`final-film.ts`、`LxtFinalFilmStage.tsx`、`lxt-final-film-task-handlers.ts`
- **验证**：UI 修改参数 → 生成视频参数正确

#### P0-5: ✅ 补全四宫格图片 Negative Prompt

- **状态**：✅ 已完成（2026-04-28）
- **实现**：导入 `getArtStyleNegativePrompt`、`convertNegativeToPositivePrompt`、`isArkModel`；Ark 模型使用 positive 退化路径
- **改动**：`lxt-final-film-task-handlers.ts`
- **验证**：检查日志确认 negativePrompt 已传入；对比有无 negative 的卡通/模糊率

#### P0-6: ✅ 补全资产图片 Negative Prompt + 参考图一致性

- **状态**：✅ 已完成（2026-04-28）
- **实现**：角色类型查询同名已有资产 `imageUrl` 作为参考图；场景/道具传递画风 negative prompt；Ark 使用 positive 退化路径
- **实测**：首次生成 `referenceImageCount=0`（预期），后续重新生成将获得参考图
- **改动**：`lxt-asset-image-task-handler.ts`
- **验证**：同角色两次生成 CLIP 余弦相似度 > 0.85

#### P0-7: ✅ 修复道具使用场景模型

- **状态**：✅ 已完成（2026-04-28）
- **实现**：道具优先使用 `characterModel`，fallback 到 `locationModel`
- **改动**：`lxt-asset-image-task-handler.ts`
- **验证**：检查 handler 日志中道具任务的 modelId

#### P0-8: ✅ 角色描述增加风格锚定前缀

- **状态**：✅ 已完成（2026-04-28）
- **实现**：LLM prompt 要求输出以 `{artStyle}风格,` 开头。实测：`Q版卡通风格, 猪哥哥, 约8岁雄性小猪...`
- **改动**：`confirm-profile/route.ts` 的 `buildDescriptionPrompt`：sectionOrder 最前面增加"⓪ 风格锚定"区
- **验证**：所有角色 description 首句包含风格类别关键词

#### P0-9: ✅ 角色描述增加默认表情必填区

- **状态**：✅ 已完成（2026-04-28）
- **实现**：面部区域③强制包含表情字段。实测：`开心活泼表情, 圆润小猪脸型...`
- **改动**：`confirm-profile/route.ts` 的 `buildDescriptionPrompt`：面部区域增加表情强制要求
- **验证**：所有角色 description 包含默认表情描述

#### P0-10: ⚠️ 修复 body_proportion 持久化丢失

- **状态**：⚠️ 待修复（2026-04-28 实测发现）
- **现状**：LLM 分析阶段完整生成了 `body_proportion`（如 `头身比1:3的幼童比例，体型匀称，身高约1米`）和 `species_traits`（6 个关键词），但 DB 持久化后查询为 `undefined`
- **影响**：角色描述 prompt 缺少体格测量数据，头身比精确控制退化。P0-9 的头身比区无法从 DB 获取精确值
- **根因推测**：`confirm-profile/route.ts` 中前端传回的 `profileData` 未包含 LLM 分析阶段生成的全部字段，合并/更新时覆盖了完整数据
- **目标**：修复 `body_proportion` 和 `species_traits` 在 DB 中的持久化链路
- **改动**：`confirm-profile/route.ts` — 确认 `profileData` 合并/更新逻辑不会丢失 LLM 分析阶段生成但前端未传回的字段；增加日志验证
- **验证**：DB 查询 `profileData.body_proportion` 和 `species_traits` 不为 undefined/null

### 4.3 P1 — 短期补齐（14 项）

#### P1-1: 视频帧插值后处理

- **目标**：视频生成后跑一次 VFI（FAL frame-interpolation / Wan 2.6），帧率翻倍
- **改动**：新增 `LXT_FINAL_FILM_VFI` task + `lxt-final-film-vfi.ts` handler
- **验证**：前后帧率对比 + LPIPS 指标

#### P1-2: 多模型策略支持

- **目标**：分镜头选择不同模型（Kling 快速预览 → Seedance 2.0 终版）——"广度→控制→终版"三段式
- **改动**：`LxtFinalFilmRow` 增加 `videoModelId?`，Stage UI 增加行级模型选择器
- **验证**：切换模型 → 视频正常生成

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

#### P1-13: ⚠️ 非人类角色下部身体描述强化

- **状态**：⚠️ 新增（2026-04-28 实测发现）
- **现状**：角色视觉描述的 8 区域模板中，⑦下身+脚蹄 和 ⑧配饰 区域系统性缺失。实测猪哥哥描述中脚蹄、尾巴、下摆延伸、是否露蹄等关键特征完全丢失
- **影响**：AI 图像模型可能"补全"人类特征（鞋子、裤子），破坏物种一致性。对动物/怪物/机器人等非人类角色尤其严重
- **目标**：在 LLM prompt 中将⑦下身和⑧配饰标记为必填区，添加输出后完整性检查；针对非人类角色（`species_traits` 非空）强制要求脚蹄/尾巴/皮毛等关键特征
- **改动**：`confirm-profile/route.ts` — LLM prompt 强化⑦⑧区为必填；新增输出后 8 区域完整性验证
- **验证**：非人类角色描述包含⑦下身+脚蹄区（脚蹄/尾巴/下摆/露蹄声明）；逐区完整性检查全部 8 区域通过

#### P1-14: ⚠️ 画风一致性对齐

- **状态**：⚠️ 新增（2026-04-28 实测发现）
- **现状**：用户选择 `realistic` 画风，但 LLM 自动推断为 `Q版卡通风格`。P0-8 仅在 description 首句添加风格名，但 LLM 推理阶段未接收用户 artStyle 作为强约束
- **影响**：用户选择的画风与实际生成的资产风格不一致，导致最终成片风格偏离预期
- **目标**：将用户选择的 `artStyle` 作为强约束传入 `buildDescriptionPrompt` 的 LLM 推理阶段
- **改动**：`confirm-profile/route.ts` — 将 `artStyle.name` 作为风格约束参数传入 LLM prompt；添加风格一致性指令："严格按 {artStyleName} 风格生成描述，不要自行推断风格"
- **验证**：用户选择 `realistic` 时描述不以 `Q版卡通风格` 开头；描述风格与用户选择的 `artStyle` 一致

### 4.4 P2 — 中期建设（7 项）

#### P2-1: 批量变体生成 + 自动筛选

- **目标**：每镜生成 N 个变体（默认 3），自动评分选最佳
- **改动**：`LxtFinalFilmRow` 增加 `videoVariants[]` + `video-scorer.ts`（运动流畅度/角色一致性/伪影检测）+ 变体对比 UI
- **复杂度**：高（需新增评分模块）

#### P2-2: 转场效果引擎

- **目标**：时间线拼装时自动插入过渡效果（cross-fade、motion blur transition）
- **改动**：新增 `transition-engine.ts`，集成到 `build-timeline.ts`
- **复杂度**：中

#### P2-3: 多智能体质量评审

- **目标**：Phase 3 后增加 Critic Agent，DramaBench 六维评估，不合格触发 2 轮 Repair
- **改动**：新增 `LXT_SHOT_CRITIC` Prompt + `LXT_SHOT_REVIEW` task + handler（参照 Postwriter Validate→Repair→Revise）
- **复杂度**：高（需质量模型设计）

#### P2-4: 角色全生命周期状态追踪

- **目标**：追踪每镜造型变化、情绪变化、身体状态
- **改动**：新增 `CharacterState`（shotIndex, outfit, emotion, physicalCondition, position），Phase 1 自动追踪
- **复杂度**：中

#### P2-5: 自动化质量评分系统

- **目标**：PPEF 框架评分 ≥ 0.70 为可投产
- **改动**：新增 `quality-scorer.ts`，集成 DramaBench 六维 + PPEF，前端显示质量 Badge
- **复杂度**：中

#### P2-6: 项目级角色视觉一致性令牌

- **目标**：同一项目的所有角色共享一个 `styleToken`（如 "warm pastel children's book illustration"），注入每个角色的 description 开头，确保跨角色风格统一
- **改动**：`LxtProject` 增加 `styleToken?: string`；`buildDescriptionPrompt` 在风格锚定区引用项目 `styleToken`
- **复杂度**：低

#### P2-7: 移除角色描述尾部空双逗号

- **目标**：将尾部 `, , ` 改为显式终止标记或直接移除，防止部分模型将空段解释为等待补充而随机生成内容
- **改动**：`confirm-profile/route.ts` 的 `buildDescriptionPrompt` 格式规则：尾部不加空双逗号，或改为 `。` 作为显式终止符
- **复杂度**：低

---

## 五、实施路线图

### 5.1 时间线

```
已完成 ✅  P0-1 → P0-2 → P0-3 → P0-4 → P0-5 → P0-6 → P0-7 → P0-8 → P0-9 (2026-04-28 全部实施并验证)
Week 1     P0-10(body_proportion修复) → P1-13(下部身体描述) → P1-14(画风一致性)
Week 2-3   P1-4(关系数据) → P1-5(跨镜上下文) → P1-6(英文Prompt) → P1-9(中英混合对齐) → P1-10(场景Layout) → P1-11(渲染风格) → P1-12(正向防退化)
Week 4-5   P1-1(帧插值) → P1-7(多集分析) → P1-8(叙事丰富)
Week 6-7   P1-2(多模型) → P1-3(音频集成)
Week 8-10  P2-1(变体筛选) → P2-3(多智能体评审)
Week 11-12 P2-2(转场引擎) → P2-4(角色生命周期) → P2-5(质量评分) → P2-6(项目风格令牌) → P2-7(尾部逗号修复)
```

### 5.2 文件改动预估

#### P0 改动文件（7 个 — 全部已实施 ✅）

```
src/lib/lxt/final-film.ts                            (P0-2/P0-4: +videoSeed, +videoDuration, +videoResolution) ✅
src/lib/workers/handlers/lxt-final-film-task-handlers.ts  (P0-1~P0-5: 核心改动) ✅
src/lib/workers/handlers/lxt-asset-image-task-handler.ts  (P0-6/P0-7: Negative + 参考图 + 道具模型) ✅
src/app/api/lxt/[projectId]/assets/[assetId]/confirm-profile/route.ts  (P0-8/P0-9: 风格锚定+默认表情 ✅; P0-10: body_proportion修复 ⚠️)
src/lib/generators/ark.ts                            (P0-1: 确认参数链) ✅
src/lib/constants.ts                                  (P0-8/9: 渲染风格常量定义) ✅
src/app/.../components/LxtFinalFilmStage.tsx         (P0-4: +Duration/Resolution 选择器) ✅
```

#### P1 改动文件（18 个）

```
src/lib/workers/handlers/lxt-final-film-vfi.ts       (新建 - 帧插值)
src/lib/workers/handlers/lxt-final-film-audio.ts     (新建 - 音频合成)
src/lib/lxt/project-assets.ts                         (关系数据注入)
src/lib/lxt/parse-script.ts                           (关系字段解析)
src/lib/workers/handlers/lxt-storyboard-to-script.ts  (跨镜上下文 + 关系注入)
src/lib/workers/handlers/lxt-analyze-assets.ts        (多集分析)
src/lib/workers/handlers/lxt-novel-to-script.ts       (叙事丰富)
src/lib/workers/handlers/lxt-final-film-task-handlers.ts  (P1-9：中英混合对齐)
src/lib/workers/handlers/lxt-asset-image-task-handler.ts  (P1-9：模型语言选择 Suffix)
src/app/api/lxt/[projectId]/assets/[assetId]/confirm-profile/route.ts  (P1-11/P1-12: 渲染风格+防退化; P1-13/P1-14: 下部身体+画风一致性 ⚠️)
src/lib/constants.ts                                   (P1-10：LOCATION_PROMPT_SUFFIX；P1-11：渲染风格常量)
lib/prompts/lxt-script/shot_phase1_base.*.txt         (+context 变量 + 关系约束)
lib/prompts/lxt-script/shot_phase2a_image.*.txt       (+跨镜空间约束)
lib/prompts/lxt-script/shot_phase2a_image.en.txt      (补齐英文规则)
lib/prompts/lxt-script/shot_phase2b_acting_arc.en.txt (补齐英文规则)
lib/prompts/lxt-script/shot_phase1_base.en.txt        (补齐英文规则)
lib/prompts/lxt-script/shot_phase3_video_refine.en.txt(补齐英文规则)
src/lib/task/types.ts                                  (+VFI/AUDIO 等新 task 类型)
```

#### P2 改动文件（7 个）

```
src/lib/lxt/transition-engine.ts                      (新建 - 转场引擎)
src/lib/lxt/quality-scorer.ts                          (新建 - 质量评分)
src/lib/lxt/video-scorer.ts                            (新建 - 变体评分)
src/lib/workers/handlers/lxt-shot-review.ts            (新建 - Critic + Repair)
src/app/api/lxt/[projectId]/assets/[assetId]/confirm-profile/route.ts  (P2-7：尾部逗号修复)
prisma/schema.prisma                                   (VideoVariant, CharacterState 新表；LxtProject.styleToken)
src/lib/constants.ts                                   (P2-6：项目风格令牌常量)
```

### 5.3 关键风险与缓解

| 风险 | 可能性 | 影响 | 缓解措施 |
|------|--------|------|---------|
| Ark 对 referenceImages 有隐式数量/尺寸限制 | 中 | P0-1 4 帧注入失败 | 先验证 4 图注入用例，必要时降为 2-3 帧 |
| seed 参数在部分模型（Kling/Sora）不生效 | 中 | P0-2 跨镜一致性无改善 | 按模型条件启用 seed 锁定 |
| Seedream 静默丢弃 negative_prompt | 高 | P0-5/6 无效 | 使用 `convertNegativeToPositivePrompt` 退化路径 |
| 英文 Phase2A 补齐后产出风格偏离中文版 | 中 | 语言切换产出一致性差 | 中英文版对比测试，统一评估标准 |
| 帧插值引入额外 30-60s 延迟 | 低 | 用户体验下降 | VFI 设为可选后处理步骤 |

---

## 六、验证标准

| 改进项 | 验证方式 | 通过标准 |
|--------|---------|---------|
| P0-1 4帧注入 | 对比单帧 vs 4 帧视频质量 | 人工 + CLIP 一致性评分提升 |
| P0-2 种子锁定 | 同集相邻两镜角色面部 diff | 面部几何无明显跳变 |
| P0-3 尾帧注入 | 相邻镜过渡检查 | 无跳变 |
| P0-4 参数配置 | UI 修改参数后生成视频 | 视频 Duration/Resolution 正确 |
| P0-5 四宫格Negative | 日志确认 negativePrompt 传入 | 卡通/模糊率明显下降 |
| P0-6 资产Negative+参考图 | 同角色两次生成 CLIP 相似度 | > 0.85 |
| P0-7 道具模型 | 日志检查 modelId | 非 locationModel |
| P0-8 风格锚定前缀 | 检查角色 description 首句 | 以 `{artStyleName}风格,` 开头 |
| P0-9 默认表情 | 检查角色 description | 面部区域③包含表情字段（如"开心活泼表情"） |
| P1-1 帧插值 | 前后帧率 + LPIPS | 帧率翻倍，LPIPS ≤ 0.1 |
| P1-2 多模型 | 切换模型生成视频 | 正常生成 |
| P1-3 音频 | 视频含 TTS 音轨 | 可播放 |
| P1-4 关系数据 | 上下级关系角色对话检查 | 语气有明显级别区分 |
| P1-5 跨镜上下文 | 相邻镜空间布局检查 | 场景/光线/位置连续 |
| P1-6 英文Prompt | 英文 Phase2A 输出检查 | 包含 7 要素 + 递进变化 |
| P1-7 多集分析 | 多集项目资产提取检查 | 不遗漏 |
| P1-8 叙事丰富 | 剧本输出检查 | 包含环境氛围、动作细节 |
| P1-9 中英混合对齐 | Imagen/OpenAI 下 prompt 检查 | 纯英文 prompt |
| P0-10 body_proportion修复 | DB 查询 + LLM 日志对比 | `profileData.body_proportion` 和 `species_traits` 不为 undefined/null |
| P1-10 场景Layout | 场景生成图检查 | 前景/中景/背景层次分明 |
| P1-11 渲染风格规则 | 同项目多角色生成图对比 | 风格一致 |
| P1-12 正向防退化 | 批量抽检生成结果 | 无写实/暗黑风格 |
| P1-13 下部身体描述 | 非人类角色 description 检查 | ⑦下身+脚蹄区 + ⑧配饰区完整；8 区域全覆盖 |
| P1-14 画风一致性 | 检查 description 风格 vs artStyle | 用户选 realistic 时不以 Q版卡通开头 |
| P2-6 项目风格令牌 | 同项目跨角色 description 检查 | 共享 styleToken 前缀 |
| P2-7 尾部逗号修复 | description 末尾检查 | 无空 `, , ` 终止符 |

---

## 七、改进优先级矩阵

```
                    低投入          中投入          高投入

高收益    ┌─────────────────────────────────────────────┐
          │ 激活关系数据   补齐英文Prompt   多智能体评审  │
          │ 种子锁定       跨镜上下文      角色生命周期   │
          │ 4帧全利用      多集资产分析    帧插值        │
          │ 参数可配置     叙事丰富阶段    音频生成      │
          │ 前一镜尾帧注入 补齐Negative    质量自动评分   │
          │ 中英混合对齐   LXT资产参考图    变体筛选       │
          │ 道具模型修正                                   │
          └─────────────────────────────────────────────┘
```

---

## 八、附录：模型兼容性矩阵

| 图像模型 | 中文 Prompt | 英文 Prompt | Negative Prompt | 语言混合风险 | 推荐语言 |
|----------|-----------|-----------|----------------|------------|---------|
| Seedream 4.x/5.0 (Ark) | 良好 | 良好 | 静默丢弃 → positive 退化 | 低（中英双语） | 中文/英文 |
| Imagen (Google) | 差 | 良好 | 支持 | **高**（英文优先） | 英文 |
| OpenAI Compatible | 差 | 良好 | 支持 | **高** | 英文 |
| FAL/Banana | 一般 | 良好 | 支持 | 中 | 英文 |

---

> **更新日志**：
> - 2026-04-28：P0-1~P0-9 全部实施并通过三只小猪项目实测验证。新增 P0-10（body_proportion 持久化丢失）、P1-13（下部身体描述强化）、P1-14（画风一致性对齐）。更新核心短板列表至 9 项（已修复 3 项）。
> - 2026-04-28 初版：合并《LXT_质量评估与行业对标分析》与《LXT_优化路线图》。
>
> **下一步**：Week 1 启动 P0-10（body_proportion 修复）→ P1-13（下部身体描述）→ P1-14（画风一致性），改动集中于 `confirm-profile/route.ts` 一个文件，预期 1 周内完成。
