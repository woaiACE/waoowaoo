# LXT 优化路线图

> 更新时间：2026-04-28  
> 基于《LXT_质量评估与行业对标分析.MD》的差距分析，按优先级排列的改进路线图。

---

## 一、优先级定义

| 优先级 | 含义 | 时间线 |
|--------|------|--------|
| **P0** | 核心瓶颈，立即修复即可显著提升产出质量 | 1-2 周 |
| **P1** | 重要短板，补齐后达到行业标准 | 2-6 周 |
| **P2** | 竞争力提升，拉开与竞品的差距 | 6-12 周 |

---

## 二、P0 — 立即改进（改动小、收益大）

> **P0 完成度：9/10（P0-1~P0-9 已实施并验证，P0-10 待修复）**
>
> 2026-04-28 三只小猪项目实测验证了 P0-1~P0-9 全部已生效。

### P0-1: ✅ 4 帧全量注入视频生成

**状态**：✅ 已完成（2026-04-28）

**现状**：4 宫格切割后仅用 index 0（首帧）和 index 3（尾帧），index 1、2 完全浪费。

**目标**：将 4 帧全部作为参考图注入 Seedance 2.0（支持最多 9 张参考图），利用时序关系提升运动连贯性。

**实现**：`handleLxtFinalFilmVideoTask` 中收集当前镜头的 `splitImageUrls` 全部 4 张，作为 `referenceImages` 传入视频生成。

**预计改动**（已实施）：
- `src/lib/workers/handlers/lxt-final-film-task-handlers.ts`

### P0-2: ✅ 镜头间种子锁定

**状态**：✅ 已完成（2026-04-28）

**现状**：每个镜头独立生成视频，使用不同随机种子，无几何一致性。

**目标**：同一集所有镜头共用同一个 seed 值，保持噪声模式一致 → 角色面部几何跨镜稳定。

**实现**：`LxtFinalFilmContent` 增加 `videoSeed` 字段，首镜生成后保存 seed，后续镜头复用。

**预计改动**（已实施）：
- `src/lib/lxt/final-film.ts`、`src/lib/workers/handlers/lxt-final-film-task-handlers.ts`

### P0-3: ✅ 前一镜尾帧注入

**状态**：✅ 已完成（2026-04-28）

**现状**：`buildMultiShotVideoPrompt` 仅提供文本上下文，无视觉连续。

**目标**：当前镜视频生成时，将前一镜的 `videoEndFrameUrl` 作为额外参考图传入。

**实现**：从 `allRows[currentIdx - 1]?.videoEndFrameUrl` 获取前一镜尾帧，加入 `referenceImages`。

**预计改动**（已实施）：
- `src/lib/workers/handlers/lxt-final-film-task-handlers.ts`

### P0-4: ✅ 视频参数可配置化

**状态**：✅ 已完成（2026-04-28）

**现状**：时长硬编码 8 秒、分辨率硬编码 `720p`。

**目标**：UI 可选 4s/6s/8s/10s/12s，分辨率可选 480p/720p/1080p。

**实现**：`LxtFinalFilmContent` 增加 `videoDuration`、`videoResolution` 字段，UI 增加选择器，handler 从 content 读取。

**预计改动**（已实施）：
- `LxtFinalFilmContent`、`LxtFinalFilmStage.tsx`、`handleLxtFinalFilmVideoTask`

### P0-5: ✅ 补全四宫格图片 Negative Prompt

**状态**：✅ 已完成（2026-04-28）

**现状**：`handleLxtFinalFilmImageTask` 不传递 `negativePrompt`，也不使用 `convertNegativeToPositivePrompt` 退化路径。

**目标**：与行业标准对齐——传递画风特定的 negative prompt，对 Ark 模型使用 positive 退化路径。

**实现**：导入 `getArtStyleNegativePrompt`、`convertNegativeToPositivePrompt`、`isArkModel`，在 `resolveImageSourceFromGeneration` 调用中传入画风特定 negative prompt；Ark/Gemini 模型使用 `convertNegativeToPositivePrompt` 退化路径。

**预计改动**（已实施）：
- `src/lib/workers/handlers/lxt-final-film-task-handlers.ts`

### P0-6: ✅ 补全资产图片 Negative Prompt + 参考图一致性

**状态**：✅ 已完成（2026-04-28）

**现状**：`lxt-asset-image-task-handler.ts` 不传递 negative prompt，也不传递参考图像。

**目标**：传递 negative prompt（同 P0-5），并借鉴 novel-promotion 模式注入已有资产图像作为参考。

**实现**：导入 `getArtStyleNegativePrompt`、`convertNegativeToPositivePrompt`；角色类型查询同名已有资产的 `imageUrl` 作为参考图注入；场景/道具传递画风特定 negative prompt。

**实测验证**：首次生成时 `referenceImageCount=0`（预期行为），后续重新生成将获得参考图。

**预计改动**（已实施）：
- `src/lib/workers/handlers/lxt-asset-image-task-handler.ts`

### P0-7: ✅ 修复道具使用场景模型

**状态**：✅ 已完成（2026-04-28）

**现状**：`lxt-asset-image-task-handler.ts` 使用 `userModels.locationModel` 生成道具图像。

**目标**：道具应有专用模型配置，或至少不错误使用场景模型。

**实现**：道具优先使用 `characterModel`，fallback 到 `locationModel`。

**预计改动**（已实施）：
- `src/lib/workers/handlers/lxt-asset-image-task-handler.ts`

### P0-8: ✅ 资产描述风格锚定

**状态**：✅ 已完成（2026-04-28）

**现状**：`buildDescriptionPrompt`（`confirm-profile/route.ts`）生成的视觉描述首元素直接是角色主题（如"猪哥哥"），缺少风格方向声明。

**目标**：在描述开头显式注入用户选择的 `artStyle` 风格名，作为生成方向锚定。格式：`{artStyleName}风格, {角色名}, ...`

**实现**：修改 `confirm-profile/route.ts` 中 LLM prompt，要求输出以 `{artStyle}风格,` 开头。

**实测验证**（三只小猪）：描述输出 `Q版卡通风格, 猪哥哥, 约8岁雄性小猪...` ✅

**预计改动**（已实施）：
- `src/app/api/lxt/[projectId]/assets/[assetId]/confirm-profile/route.ts`

### P0-9: ✅ 默认表情注入

**状态**：✅ 已完成（2026-04-28）

**现状**：角色描述中表情字段可能被 LLM 省略或生成不合适的表情。

**目标**：在面部区域③显式注入默认表情"开心活泼表情"（中性默认），确保所有角色设定图都有明确的表情参考。

**实现**：在 LLM prompt 中强制要求面部区域包含表情字段。

**实测验证**（三只小猪）：描述面部区域包含 `开心活泼表情, 圆润小猪脸型...` ✅

**预计改动**（已实施）：
- `src/app/api/lxt/[projectId]/assets/[assetId]/confirm-profile/route.ts`

### P0-10: ⚠️ 修复 body_proportion 持久化丢失

**状态**：⚠️ 待修复（2026-04-28 实测发现）

**现状**：LLM 分析阶段完整生成了 `body_proportion`（如 `头身比1:3的幼童比例，体型匀称，身高约1米`）和 `species_traits`（6 个关键词），但 DB 持久化后查询为 `undefined`。

**影响**：角色描述 prompt 缺少体格测量数据，头身比精确控制退化（猪哥哥描述中"3头身幼童比例"出现在配饰区而非体型区，说明 LLM 从其他字段自行推断）。

**根因推测**：`confirm-profile/route.ts` 中前端传回的 `profileData` 可能未包含 LLM 分析阶段生成的全部字段，合并/更新时覆盖了完整数据。

**目标**：修复 `body_proportion` 和 `species_traits` 在 DB 中的持久化链路，确保 LLM 分析阶段的所有字段不丢失。

**预计改动**：
- `src/app/api/lxt/[projectId]/assets/[assetId]/confirm-profile/route.ts`：确认 `profileData` 合并/更新逻辑不会丢失 LLM 分析阶段生成但前端未传回的字段
- 增加日志验证：保存前后 `profileData` 包含 `body_proportion` 和 `species_traits`

---

## 三、P1 — 短期补齐（2-6 周）

### P1-1: 视频帧插值后处理

**现状**：视频生成后直接保存，无后处理。

**目标**：视频生成后跑一次 VFI（如通过 FAL 的 frame-interpolation 模型，或 Wan 2.6 的视频扩展能力），将帧率翻倍，提升流畅度。

**预计改动**：
- 新增 task type：`LXT_FINAL_FILM_VFI`
- `src/lib/workers/handlers/lxt-final-film-vfi.ts`：接收视频 URL，调 FAL/Wan 插值，上传结果
- `handleLxtFinalFilmVideoTask`：视频生成完成后自动触发 VFI

### P1-2: 多模型策略支持

**现状**：整集统一视频模型。

**目标**：支持分镜头选择不同模型（快速预览用 Kling，终版用 Seedance 2.0）。实现"广度→控制→终版"三段式。

**预计改动**：
- `LxtFinalFilmRow`：增加 `videoModelId?: string` 覆盖
- `LxtFinalFilmStage.tsx`：每个镜头行增加模型下拉选择器
- `handleLxtFinalFilmVideoTask`：优先读取行级 modelId

### P1-3: TTS/音频集成

**现状**：成片阶段完全没有音频，Stage 3 已生成 `语音分镜` 和 `音效` 字段但未使用。

**目标**：利用已有 voice-design 基础设施，为每镜头生成 TTS 并合成到视频。

**预计改动**：
- 新增 task type：`LXT_FINAL_FILM_AUDIO`
- 读取 `LxtProjectAsset.voiceId` → 调用已有 TTS 基础设施 → 生成音轨
- 使用 FFmpeg/Remotion 合成视频+音频

### P1-4: 激活角色关系数据链路

**现状**：`agent_character_profile` 已提取 `relationships[]`，但 Phase 1 未使用。

**目标**：将关系数据格式化为 `buildLxtAssetPromptContext` 的一部分，注入 Phase 1 Prompt，约束对话语气和空间定位。

**预计改动**：
- `src/lib/lxt/project-assets.ts`：`buildLxtAssetPromptContext` 增加 `relationships` 参数，输出关系图文本
- `src/lib/workers/handlers/lxt-storyboard-to-script.ts`：从资产 `profileData` JSON 中提取 relationships 传入
- `lib/prompts/lxt-script/shot_phase1_base.*.txt`：在 `spatial_context` 规则中增加关系约束

### P1-5: Phase 1/2A/2B 跨镜上下文

**现状**：Phase 1/2A/2B 每镜独立分析，仅 Phase 3 有 ±1 镜上下文。

**目标**：Phase 1 输入前后镜标签/景别/场景信息，Phase 2A 看到相邻镜的帧布局以保持空间连续性。

**预计改动**：
- `src/lib/workers/handlers/lxt-storyboard-to-script.ts`：在 mapWithConcurrency 中为每个镜头的 Phase 1/2A/2B 构建前后镜上下文
- `lib/prompts/lxt-script/shot_phase1_base.*.txt`：增加 `{context}` 变量（前后镜摘要）
- `lib/prompts/lxt-script/shot_phase2a_image.*.txt`：增加前后镜空间约束

### P1-6: 补齐英文 Prompt 关键缺失规则

**现状**：中文版 Prompt 比英文版多 30-40% 的规则和示例。

**目标**：将中文版独有的 7 要素模板、机位微移模板库（22 个精确保留术语已在 Phase3 中英文版有，需确认 Phase2A 英文版补齐）、光线克制规则、全局空间约束同步到英文版。

**预计改动**：
- `lib/prompts/lxt-script/shot_phase2a_image.en.txt`：从 125 行扩展到约 160 行
- `lib/prompts/lxt-script/shot_phase2b_acting_arc.en.txt`：补充场景类型特定约束
- 所有英文 Prompt 增加对应的示例块

### P1-7: 多集资产分析

**现状**：`lxt-analyze-assets` 只分析第一集。

**目标**：支持全量多集分析，对多集项目自动遍历全部 episode。

**预计改动**：
- `src/lib/workers/handlers/lxt-analyze-assets.ts`：当 payload 未指定 episodeId 时，查询所有有 `shotListContent` 的集，合并内容（保持 30,000 字截断）

### P1-8: 小说→剧本叙事丰富

**现状**：`novel_to_script` 严格禁止添加任何内容，仅为格式转换。

**目标**：参考 DSR 双阶段精炼——Stage 1 先让 LLM 丰富叙事细节（环境氛围、角色微表情、动作细节），Stage 2 再做格式转换。

**预计改动**：
- 新增 Prompt：`LXT_NOVEL_ENRICH`
- 修改 `src/lib/workers/handlers/lxt-novel-to-script.ts`：两阶段调用（可选，由 `instruction` 参数控制是否启用）

### P1-9: 中英文混合 Prompt 对齐

**现状**：四宫格最终 prompt 为 `英文gridPrefix + 中文Phase2A内容 + 英文artStyle`，对 Imagen/OpenAI 等英文优先模型不友好。资产 prompt 同样存在 `中文描述 + 中文Suffix + 英文artStyle` 的混合。

**目标**：根据目标模型的语言能力自动选择 prompt 语言。Seedream → 保持中文内容（中英双语能力）；Imagen/OpenAI → 英文 Phase 2A 输出 + 英文 Suffix。

**预计改动**：
- `src/lib/workers/handlers/lxt-final-film-task-handlers.ts`：根据 modelId 判断是否需要翻译 Phase 2A 内容
- `src/lib/workers/handlers/lxt-asset-image-task-handler.ts`：同样根据模型语言能力选择 Suffix 语言
- 新增 `translatePromptForModel` 工具函数，或在 Phase 2A 调用时根据下游模型选择 locale
- `lib/prompts/lxt-script/shot_phase2a_image.en.txt`：先补齐英文版缺失的 7 要素模板等规则

### P1-10: 场景图片 Layout 指导

**现状**：`LOCATION_PROMPT_SUFFIX = ''`，场景生成无任何结构性 layout 指导。

**目标**：增加场景构图提示——至少包括锚点对象位置、光线方向、构图比例建议。

**预计改动**：
- `src/lib/constants.ts`：`LOCATION_PROMPT_SUFFIX` 从空字符串改为带构图的布局指令
- 格式参考：`广角场景图，前景/中景/背景层次分明，光线方向明确，空间深度感强`

### P1-11: 非人类角色下部身体描述强化

**状态**：⚠️ 新增（2026-04-28 实测发现）

**现状**：角色视觉描述的 8 区域模板中，⑦下身+脚蹄 和 ⑧配饰 区域系统性缺失。实测猪哥哥描述中脚蹄、尾巴、下摆延伸、是否露蹄等关键特征完全丢失。

**影响**：AI 图像模型可能"补全"人类特征（鞋子、裤子），破坏物种一致性。对动物/怪物/机器人等非人类角色尤其严重。

**目标**：在 LLM prompt 中将⑦下身和⑧配饰标记为必填区，添加输出后完整性检查，确保非人类角色关键形态特征不丢失。

**预计改动**：
- `src/app/api/lxt/[projectId]/assets/[assetId]/confirm-profile/route.ts`：LLM prompt 强化⑦⑧区为必填
- 新增输出后完整性验证：检查描述是否覆盖全部 8 区域
- 针对非人类角色（`species_traits` 非空）强制要求脚蹄/尾巴/皮毛等关键特征

### P1-12: 画风一致性对齐

**状态**：⚠️ 新增（2026-04-28 实测发现）

**现状**：用户选择 `realistic` 画风，但 LLM 自动推断为 `Q版卡通风格`。`buildDescriptionPrompt` 未将用户选择的 `artStyle` 显式传入 LLM prompt（P0-8 仅在描述前缀添加风格名，但 LLM 推理阶段未接收用户 artStyle 作为约束）。

**影响**：用户选择的画风与实际生成的资产风格不一致，导致最终成片风格偏离预期。

**目标**：将用户选择的 `artStyle` 作为强约束传入 `buildDescriptionPrompt`，确保 LLM 推理的风格方向与用户选择一致。

**预计改动**：
- `src/app/api/lxt/[projectId]/assets/[assetId]/confirm-profile/route.ts`：
  - 将 `artStyle.name` 作为风格约束参数传入 LLM prompt
  - 添加风格一致性指令："严格按 {artStyleName} 风格生成描述，不要自行推断风格"

---

## 四、P2 — 中期建设（6-12 周）

### P2-1: 批量变体生成 + 自动筛选

**现状**：每镜仅生成 1 个视频。

**目标**：每镜一次生成 N 个变体（N 可配，默认 3），自动评分选最佳。

**预计改动**：
- `LxtFinalFilmRow`：增加 `videoVariants[]`、`selectedVariantIndex`
- 新增评分模块：`src/lib/lxt/video-scorer.ts`（运动流畅度、角色一致性、伪影检测）
- `LxtFinalFilmStage.tsx`：变体对比选择 UI

### P2-2: 转场效果引擎

**现状**：各镜视频独立，无转场。

**目标**：时间线拼装时自动插入过渡效果（cross-fade、motion blur transition、匹配前一镜尾帧和后一镜首帧）。

**预计改动**：
- 新增：`src/lib/lxt/transition-engine.ts`
- 在 `build-timeline.ts`（计划中）中集成转场参数

### P2-3: 多智能体质量评审

**现状**：所有阶段"生成即结束"，无 Review 机制。

**目标**：在 Phase 3 之后增加轻量级 Critic Agent，对照 DramaBench 六维评估自评，不合格项自动触发 Repair 循环。

**预计改动**：
- 新增 Prompt：`LXT_SHOT_CRITIC`
- 新增 task type：`LXT_SHOT_REVIEW`
- `src/lib/workers/handlers/lxt-shot-review.ts`：Critic → 评分 → 不合格字段 → 定向修复（最多 2 轮）
- 参照 Postwriter 的 Validate→Repair→Revise 模式

### P2-4: 角色全生命周期状态追踪

**现状**：每个角色只有一套设定图和档案，无分镜/分集状态变化。

**目标**：为角色建立叙事时间线状态表，追踪每镜造型变化、情绪变化、身体状态。

**预计改动**：
- 新表或 JSON 字段：`CharacterState`（shotIndex, outfit, emotion, physicalCondition, position）
- 由 Phase 1 在空间上下文中自动追踪

### P2-5: 自动化质量评分系统

**现状**：无自动质量评估。

**目标**：对图片/视频产出自动评分（PPEF 框架 >= 0.70 为可投产），不合格标记 review。

**预计改动**：
- 新增：`src/lib/lxt/quality-scorer.ts`
- 集成 DramaBench 六维 + PPEF 评分
- 前端在镜头行上显示质量 Badge

---

## 五、实施顺序建议

```
已完成 ✅  P0-1(4帧注入) → P0-2(种子锁定) → P0-3(尾帧注入) → P0-4(参数配置) → P0-5(四宫格Negative) → P0-6(资产Negative+参考图) → P0-7(道具模型) → P0-8(风格锚定) → P0-9(默认表情)
Week 1     P0-10(body_proportion修复) → P1-11(下部身体描述) → P1-12(画风一致性)
Week 2-3   P1-4(关系数据) → P1-5(跨镜上下文) → P1-6(英文Prompt) → P1-9(中英混合对齐) → P1-10(场景Layout)
Week 4-5   P1-1(帧插值) → P1-7(多集分析) → P1-8(叙事丰富)
Week 6-7   P1-2(多模型) → P1-3(音频集成)
Week 8-10  P2-1(变体筛选) → P2-3(多智能体评审)
Week 11-12 P2-2(转场引擎) → P2-4(角色生命周期) → P2-5(质量评分)
```

---

## 六、文件改动预估

### P0 改动文件

```
src/lib/lxt/final-film.ts                            (P0-2/P0-4: +videoSeed, +videoDuration, +videoResolution) ✅
src/lib/workers/handlers/lxt-final-film-task-handlers.ts  (P0-1~P0-5: 核心改动) ✅
src/lib/workers/handlers/lxt-asset-image-task-handler.ts  (P0-6/P0-7: Negative Prompt + 参考图 + 道具模型) ✅
src/lib/generators/ark.ts                            (P0-1: 确认参数链) ✅
src/app/.../components/LxtFinalFilmStage.tsx         (P0-4: +参数选择器 UI) ✅
src/app/api/lxt/[projectId]/assets/[assetId]/confirm-profile/route.ts  (P0-8/P0-9: 风格锚定+默认表情 ✅, P0-10: body_proportion修复 ⚠️)
```

### P1 改动文件

```
src/lib/workers/handlers/lxt-final-film-vfi.ts       (新建 - 帧插值)
src/lib/workers/handlers/lxt-final-film-audio.ts     (新建 - 音频)
src/lib/lxt/project-assets.ts                         (关系数据注入)
src/lib/lxt/parse-script.ts                           (关系字段解析)
src/lib/workers/handlers/lxt-storyboard-to-script.ts  (跨镜上下文 + 关系注入)
src/lib/workers/handlers/lxt-analyze-assets.ts        (多集分析)
src/lib/workers/handlers/lxt-novel-to-script.ts       (叙事丰富)
src/lib/workers/handlers/lxt-final-film-task-handlers.ts  (P1-9：中英混合 Prompt 对齐)
src/lib/workers/handlers/lxt-asset-image-task-handler.ts  (P1-9：模型语言能力选择 Suffix)
src/lib/constants.ts                                   (P1-10：LOCATION_PROMPT_SUFFIX 替换)
src/app/api/lxt/[projectId]/assets/[assetId]/confirm-profile/route.ts  (P1-11/P1-12: 下部身体描述 + 画风一致性) ⚠️ 新增
lib/prompts/lxt-script/shot_phase1_base.*.txt         (+context 变量 + 关系约束)
lib/prompts/lxt-script/shot_phase2a_image.*.txt       (+跨镜空间约束)
lib/prompts/lxt-script/shot_phase2a_image.en.txt      (补齐英文规则)
lib/prompts/lxt-script/shot_phase2b_acting_arc.en.txt (补齐英文规则)
lib/prompts/lxt-script/shot_phase1_base.en.txt        (补齐英文规则)
lib/prompts/lxt-script/shot_phase3_video_refine.en.txt(补齐英文规则)
src/lib/task/types.ts                                  (+新 task 类型)
```

### P2 改动文件（概要）

```
src/lib/lxt/transition-engine.ts                      (新建)
src/lib/lxt/quality-scorer.ts                          (新建)
src/lib/lxt/video-scorer.ts                            (新建)
src/lib/workers/handlers/lxt-shot-review.ts            (新建 - Critic + Repair)
prisma/schema.prisma                                   (VideoVariant, CharacterState 等新表)
```

---

## 七、验证标准

每个 P0/P1 改进项的验证方式：

| 改进项 | 验证方式 |
|--------|---------|
| P0-1 4帧注入 | 对比同一镜头单帧 vs 4 帧生成的视频质量（人工 + CLIP 一致性评分） |
| P0-2 种子锁定 | 检查同集相邻两镜的角色面部一致性（diff 对比） |
| P0-3 尾帧注入 | 检查相邻两镜的过渡是否平滑（无跳变） |
| P0-4 参数配置 | UI 端修改 Duration/Resolution → 生成的视频参数正确 |
| P0-5 四宫格Negative | 检查 `handleLxtFinalFilmImageTask` 日志确认 negativePrompt 已传入；对比有无 negative 的生成结果（人工判断卡通/模糊率） |
| P0-6 资产Negative+参考图 | 检查资产图片任务日志确认 negativePrompt 已传入；同角色两次生成的图片 CLIP 余弦相似度 > 0.85 |
| P0-7 道具模型 | 确认道具任务使用 `characterModel` 而非 `locationModel`（检查 handler 日志中的 modelId） |
| P0-8 风格锚定 | 检查角色描述首元素是否以 `{artStyleName}风格,` 开头（如 `Q版卡通风格, 猪哥哥...`） |
| P0-9 默认表情 | 检查角色描述面部区域③是否包含表情字段（如 `开心活泼表情`） |
| P0-10 body_proportion修复 | DB 查询 `profileData.body_proportion` 和 `species_traits` 不为 undefined/null；LLM 分析日志和 DB 持久化后的字段一致 |
| P1-1 帧插值 | 前后帧率对比 + LPIPS 指标 |
| P1-2 多模型 | 切换模型 → 视频正常生成 |
| P1-3 音频 | 视频生成后 TTS 音轨存在且可播放 |
| P1-4 关系数据 | 同镜中有上下级关系的角色对话语气明显有级别区分 |
| P1-5 跨镜上下文 | 相邻镜的空间布局一致（场景、光线、角色位置连续） |
| P1-6 英文Prompt | 英文模式下 Phase2A 产出包含 7 要素 + 递进变化 |
| P1-7 多集分析 | 多集项目资产提取不遗漏 |
| P1-8 叙事丰富 | 剧本输出包含环境氛围、动作细节描写 |
| P1-9 中英混合对齐 | Imagen/OpenAI 模型下四宫格生成传入纯英文 prompt（检查日志）；对比中英混合 vs 纯英文 prompt 的生成质量 |
| P1-10 场景Layout | 场景生成 prompt 包含锚点对象、光线方向、构图比例指令；生成图有明显的前景/中景/背景层次 |
| P1-11 下部身体描述 | 非人类角色描述包含⑦下身+脚蹄区（脚蹄/尾巴/下摆/露蹄声明）；逐区完整性检查全部 8 区域通过 |
| P1-12 画风一致性 | 用户选择 `realistic` 时描述不以 `Q版卡通风格` 开头；描述风格与用户选择的 `artStyle` 一致 |
