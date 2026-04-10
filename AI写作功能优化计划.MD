# AI 帮我写 — 功能优化计划

> 文档目的：定义"AI 帮我写"从当前 MVP 状态升级至企业级 AI 写作工具的完整路线图。

---

## 零、实施进度跟踪

| 阶段 | 子项 | 状态 | 完成日期 |
|------|------|------|----------|
| **Phase 1** | 1.1 实时流式预览（SSE Hook + Modal 重写）| ✅ **已完成** | 2026-04-10 |
| | 1.2 改写模式迁移（从底部工具栏移入 Modal）| ✅ **已完成** | 2026-04-10 |
| | 1.3 字数目标控制（超短/短/标准/长四档）| ✅ **已完成** | 2026-04-10 |
| | SSE 鉴权修复（home-ai-write 虚拟 projectId）| ✅ **已完成** | 2026-04-10 |
| | i18n 中英文文案补齐（13 个新 key）| ✅ **已完成** | 2026-04-10 |
| **Phase 2** | 2.1 多版本历史 | ⬜ 待开始 | — |
| | 2.2 修改指令（Instruct 模式）| ⬜ 待开始 | — |
| | 2.3 续写模式 | ⬜ 待开始 | — |
| **Phase 3** | 3.1 角色/场景上下文绑定 | ⬜ 待开始 | — |
| | 3.2 质量指标（场景数/画面感评分）| ⬜ 待开始 | — |
| **Phase 4** | 4.x 顶级改写平台竞品差距补全 | ⬜ 规划中 | — |

### Phase 1 已交付文件清单

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `src/components/home/AiWriteModal.tsx` | 重写 | 三阶段 UI：idle → streaming → completed |
| `src/lib/home/useAiStoryExpandStream.ts` | 新增 | SSE 流式任务 Hook，含 fallback 轮询 |
| `src/app/api/sse/route.ts` | 修改 | 新增 `home-ai-write` 虚拟 projectId 白名单 |
| `src/lib/screenplay-tone-presets.ts` | 修改 | 新增 `LengthTargetOption` + `AI_EXPAND_LENGTH_TARGETS` |
| `src/app/api/user/ai-story-expand/route.ts` | 修改 | 接收 `lengthTarget` 参数 |
| `src/lib/workers/handlers/ai-story-expand.ts` | 修改 | 应用 `getAiExpandLengthInstruction` |
| `lib/prompts/novel-promotion/ai_story_expand.zh.txt` | 修改 | 新增 `{length_instruction}` 占位符 |
| `lib/prompts/novel-promotion/ai_story_expand.en.txt` | 修改 | 新增 `{length_instruction}` 占位符 |
| `src/lib/prompt-i18n/catalog.ts` | 修改 | `variableKeys` 补齐 `length_instruction` |
| `src/app/[locale]/home/page.tsx` | 修改 | 切换至 `onAccept` 回填模式 |
| `src/app/[locale]/workspace/.../NovelInputStage.tsx` | 修改 | 切换至新 Modal 参数，移除底部改写选择器 |
| `messages/zh/home.json` / `messages/en/home.json` | 修改 | 补充 `aiWrite.*` 系列 13 个 i18n key |

---

## 一、行业现状：企业级 AI 写作工具的核心能力图谱

参考 Notion AI、Jasper、Copy.ai、字节 AI 写作、腾讯文档 AI 等主流产品，企业级 AI 写作通常具备以下能力维度：

| 维度 | 代表能力 | 备注 |
|------|----------|------|
| **创作入口多样** | 关键词扩写 / 大纲扩写 / 续写 / 从零生成 | 不只是一个输入框 |
| **内容控制** | 风格 / 基调 / 字数 / 视角 / 受众群体 | 精细化参数 |
| **实时流式输出** | 字符逐帧显示，用户可中途停止 | 消除"黑屏等待"体验 |
| **结果可交互** | 接受 / 拒绝 / 重新生成 / 局部修改 | 非覆盖式结果处理 |
| **历史版本** | 多次生成可对比选择 | 保留每次结果 |
| **续写 / 修改指令** | 继续扩写、改变结尾、增加反转、调整节奏 | 对话式指令驱动 |
| **角色/场景约束** | 写作时绑定已有角色/场景描述 | 项目级上下文 |
| **字数目标** | 用户可指定目标篇幅（短 / 中 / 长） | 精确控制输出量 |
| **多轮对话** | 用自然语言迭代修改结果 | Chat 模式 |
| **质量指标反馈** | 标注画面感 / 节奏评分 / 可生成场景数估算 | 生产辅助 |

---

## 二、当前项目的差距分析

### 现有能力（已实现）
- ✅ 单次关键词 → 故事扩写（`ai_story_expand` worker）
- ✅ 风格基调注入（`screenplayTone` → 24 种风格预设）
- ✅ 改写模式（`storyRewriteMode`：保守改写 / 大幅重构 / 不改写）
- ✅ 原文改写模式（`sourceText` 传入已有文本）
- ✅ BullMQ 异步任务 + 流式 LLM 回调（基础设施已就绪）
- ✅ **实时流式预览**（`useAiStoryExpandStream` hook，SSE token 逐帧追加）—— *2026-04-10 完成*
- ✅ **改写模式迁移至 Modal**（底部工具栏选择器已移除）—— *2026-04-10 完成*
- ✅ **字数目标四档控制**（超短/短/标准/长，含 prompt 指令注入）—— *2026-04-10 完成*
- ✅ **Accept / Regenerate / Stop 三阶段交互**（不再直接覆盖输入框）—— *2026-04-10 完成*

### 明显缺口
| 缺口 | 当前状态 | 用户感知问题 |
|------|----------|------------|
| **流式实时预览** | 等待任务完成后一次性返回 | 用户干等，无反馈感 |
| **多次生成 / 历史版本** | 每次覆盖主文本框 | 不能对比选择 |
| **字数目标控制** | 固定 300-800 字，不可调 | 无法适配不同剧集时长 |
| **续写 / 修改指令** | 无 | 只能全部重新生成 |
| **角色/场景上下文绑定** | 无 | 生成内容可能与已建档角色矛盾 |
| **生成结果预览区** | 直接覆盖输入框 | 无对比、无 Accept/Reject |
| **改写模式 UI 入口** | 在工作台底部（非 AI 帮我写 Modal 内） | UI 割裂，模式选择与操作不在同屏 |

---

## 三、优化路线图

遵循"先核心体验 → 再深度功能"原则，分三期落地。

---

### Phase 1 — 实时流式输出 + 结果交互（最高优先级）

**目标**：消除黑屏等待感，让用户看到 AI 实时打字效果，并能选择接受/重新生成。

#### 1.1 实时流式预览

**问题根因**：  
当前 `resolveTaskResponse` 是轮询任务态 → 完成后一次性拿结果。  
Worker 已有 `createWorkerLLMStreamCallbacks`，每个 token 都在通过 `TaskEvent` 向前端推送，但前端 `AiWriteModal` 没有订阅这些事件。

**落地方案**：
1. `AiWriteModal` 提交任务后，拿到 `taskId`
2. 调用现有的 SSE 任务事件流（`/api/task/[taskId]/stream` 或类似端点）
3. 将 `llm_token` 事件逐帧追加到 Modal 内的预览文本区
4. 任务完成后展示"接受 / 重新生成 / 取消"三个操作按钮

**关键文件**：
- `src/components/home/AiWriteModal.tsx` — 添加流式预览区 + 任务 SSE 订阅
- `src/lib/home/ai-story-expand.ts` — `expandHomeStory` 改为返回 `taskId`，让调用方自行订阅流
- `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/NovelInputStage.tsx` — 同步更新调用方

**UI 变化**（Modal 内部结构）：
```
[输入区] 用户描述/关键词
[参数区] 风格 | 改写模式 | 字数目标（见 1.3）
[▶ 开始生成] 按钮

--- 生成过程中 ---

[预览区] 实时流式文字输出（可滚动，字符逐帧追加）
[● 停止生成] 按钮

--- 生成完成 ---

[预览区] 完整结果文本
[✓ 接受并填入] [↺ 重新生成] [✕ 取消]
```

#### 1.2 改写模式入口迁移

将 `storyRewriteMode` 选择器从工作台底部工具栏移入 `AiWriteModal` 内部，使"参数选择 → 触发生成"在同一屏完成。

**关键文件**：
- `AiWriteModal.tsx` — 增加 storyRewriteMode 选择 UI
- `NovelInputStage.tsx` — 底部工具栏移除 storyRewriteMode 选择器，改写模式完全归属 AI 帮我写入口

#### 1.3 字数目标选择

在 Modal 内添加篇幅目标选项，映射为 prompt 中的字数硬约束。

| 选项标签 | 目标字数 | 适用场景 |
|---------|---------|---------|
| 超短（30s） | 100-200 字 | 竖版超短剧 / 广告 |
| 短（1min） | 300-500 字 | 标准短剧单集 |
| 标准（2min）| 500-800 字 | 默认，当前行为 |
| 长（3-5min）| 800-1500 字 | 长剧情集 / 多集拆分前 |

**关键文件**：
- `src/lib/screenplay-tone-presets.ts` — 新增 `getLengthTargetInstruction(target)` 函数
- `lib/prompts/novel-promotion/ai_story_expand.zh.txt` — 增加 `{length_instruction}` 占位符
- `src/lib/prompt-i18n/catalog.ts` — `NP_AI_STORY_EXPAND.variableKeys` 增加 `length_instruction`
- `src/app/api/user/ai-story-expand/route.ts` — 接收 `lengthTarget` 参数
- `src/lib/workers/handlers/ai-story-expand.ts` — 解析 `lengthTarget`，注入 instruction

---

### Phase 2 — 多版本历史 + 续写/修改指令

**目标**：AI 生成结果可对比选择，可用自然语言继续迭代。

#### 2.1 多版本历史

每次生成的结果保存在 Modal 本地状态（不需要持久化），用户可左右切换查看：

```
[← 版本 2/3 →]  第 2 次生成的结果...
[✓ 接受] [↺ 再生成] [✕ 关闭]
```

**实现**：纯前端 `useState` 维护 `versions: string[]` 数组，无需 API 改动。

#### 2.2 AI 修改指令（Instruct 模式）

用户在预览结果后，可输入自然语言修改指令重新生成，例如：

- "把结尾改成开放式悬念"
- "增加一个反转，男主其实是反派"
- "压缩到 300 字以内"
- "改成更暗黑的风格"

**落地方案**：
1. 结果预览区下方增加"修改建议"输入框
2. 点击"按指令修改"时，将原结果作为 `sourceText`，指令作为额外的 `rewrite_instruction` 注入
3. `storyRewriteMode` 自动切换为 `'reconstruct'`

**关键文件**：
- `AiWriteModal.tsx` — 增加"修改建议"输入框和按钮
- `lib/prompts/novel-promotion/ai_story_expand.zh.txt` — `{rewrite_instruction}` 支持自由文本指令（不只是预设模式）
- `src/lib/workers/handlers/ai-story-expand.ts` — 支持直接传入自由文本 `customRewriteInstruction`

#### 2.3 续写模式

在预览结果之后，可继续追加内容（"继续往下写"）：

```
[✓ 接受] [↺ 再生成] [➕ 续写下一幕] [✕ 关闭]
```

点击"续写下一幕"时，以当前结果为 `sourceText`，`storyRewriteMode = 'continue'`（新增模式），让 LLM 接续故事。

**关键文件**：
- `src/lib/screenplay-tone-presets.ts` — `STORY_REWRITE_MODES` 增加 `continue` 模式
- `lib/prompts/novel-promotion/ai_story_expand.zh.txt` — `{rewrite_instruction}` 适配续写指令

---

### Phase 3 — 项目上下文绑定 + 质量反馈

**目标**：生成内容与项目已建档的角色/场景不冲突，并给用户提供质量参考。

#### 3.1 角色/场景上下文绑定

当在工作台内使用"AI 帮我写"时（非首页），自动注入当前项目的关键角色描述和场景名称，避免生成内容与项目已有设定矛盾。

**落地方案**：
1. `NovelInputStage.tsx` 在调用 AI 帮我写时，读取项目的 `NovelPromotionCharacter` 和 `NovelPromotionLocation` 列表
2. 将关键描述（角色名 + 一句话外观）作为 `characterContext` 传给 API
3. API → Worker → Prompt 注入 `{project_context_block}` 占位符

**关键文件**：
- `src/app/api/user/ai-story-expand/route.ts` — 接收可选 `characterContext`
- `src/lib/workers/handlers/ai-story-expand.ts` — 构建 `projectContextBlock`
- `lib/prompts/novel-promotion/ai_story_expand.zh.txt` — 增加 `{project_context_block}` 占位符

#### 3.2 生成质量指标（轻量版）

生成完成后，在 Modal 内简单展示：
- **预估场景数**：按段落 / 空行估算可拆分的分镜数
- **画面感评分**：基于动词密度 / 场景描述词频的简单规则评分（无需 AI）
- **字要适中提示**：如字数超出或不足提示

**实现**：纯前端文本分析函数，无 API 依赖。

---

### Phase 4 — 顶级 AI 改写平台竞品差距补全

> 调研对象：Sudowrite（影视/小说改写标杆）、Jasper AI、Notion AI、Grammarly Business、WriteSonic（7 模式改写）、Copy.ai、ProWritingAid。  
> 聚焦："改写"这一核心动作，当前项目 vs 行业顶级差距。

---

#### 4.1 段落/句子粒度选中改写（Selection Rewrite）

**差距**：当前只能"全文一起改写"，不能选中某段单独改写。  
**标杆**：Notion AI（Cmd+J 选中即改写）、Sudowrite（选中任意句子 → 5 种变体）。  
**影视场景**：用户写完一段旁白，只想改其中一段对话的语气，不想全文重跑。

**落地方案**：
1. Modal 内的文本区域支持鼠标划选 → 浮出"改写选中"小工具条
2. 将选中区间 + 全文作为 `selectedRange` + `sourceText` 传给后端
3. Worker 只返回被替换区间的改写结果，前端做 splicing 合并

**关键文件新增**：
- `src/components/home/AiWriteModal.tsx` — 选中文字浮动工具条 (`SelectionRewriteBar`)
- `src/app/api/user/ai-story-expand/route.ts` — 接收 `selectedRange: { start, end }`
- `lib/prompts/novel-promotion/ai_story_expand.zh.txt` — 新增 `{selection_rewrite_mode}` 条件块

---

#### 4.2 多变体并列对比（Parallel Variations）

**差距**：每次只生成一版，没有"并列给 3 个版本看"的能力。  
**标杆**：Sudowrite（Rewrite 一次生成 5 个变体并排展示）、Copy.ai（三列对比）。  
**影视场景**：片头钩子句子，导演想对比语气激烈/温柔/悬疑三种版本。

**落地方案**：
1. Modal 增加"生成 3 个版本"开关（`multiVariant: true`）
2. 后端并发发起 3 个 LLM 请求（同参数，不同随机种子），各自流式输出
3. 前端用横向 Tab 或三列卡片展示，每列独立 Accept

**关键文件**：
- `src/app/api/user/ai-story-expand/route.ts` — 接收 `variantCount: number`
- `src/lib/workers/handlers/ai-story-expand.ts` — 并发 N 次，各自写入不同 `taskId`

---

#### 4.3 差异对比高亮视图（Diff View）

**差距**：接受改写后用户无法知道哪些内容被改动了。  
**标杆**：Grammarly（逐字 diff 高亮插入/删除）、Notion AI（Track Changes 样式）。  
**影视场景**：大幅重构后，用户需要确认关键剧情节拍是否被意外删除。

**落地方案**：
1. 完成后在 Modal 内增加"对比模式"切换按钮
2. 前端用 `diff-match-patch` 算法（浏览器端，零后端依赖）对比原文/新文
3. 增删内容分别用绿色/红色高亮渲染，用户可按 Accept Only Changes 接受

**关键文件**：
- `src/components/home/AiWriteModal.tsx` — DiffView 组件（基于 `diff-match-patch`）
- 无需后端改动

---

#### 4.4 改写强度连续滑块（Rewrite Intensity Slider）

**差距**：当前改写模式只有"保守/大幅重构/不改写"三档离散选项。  
**标杆**：WriteSonic（Standard/Fluency/Formal/Academic/Simple/Creative/Expand/Shorten 8 档）、Jasper（强度滑块 0–100%）。  
**影视场景**：用户有时想"只换几个词让句子更有力"，不需要结构性重构。

**落地方案**：
1. 将 3 档扩展为 5 档（微调措辞 → 优化行文 → 提升节奏 → 重构结构 → 全新创作）
2. 或用 0–100% 滑块映射到 prompt 中的"改写约束程度"描述
3. 变更 `STORY_REWRITE_MODES` 数组并更新 prompt 中的 `{rewrite_instruction}` 模板

**关键文件**：
- `src/lib/screenplay-tone-presets.ts` — 扩展 `STORY_REWRITE_MODES`
- `lib/prompts/novel-promotion/ai_story_expand.zh.txt` — 细化改写约束指令
- `src/components/home/AiWriteModal.tsx` — 滑块或 5 档 UI

---

#### 4.5 角色台词口吻锁定（Character Voice Consistency）

**差距**：当前改写完全不感知角色语言风格，重构后某角色口吻可能与建档描述矛盾。  
**标杆**：Sudowrite（"Write in the voice of character X"），Jasper Brand Voice（保持品牌调性不变）。  
**影视场景**：反派角色的台词有独特的阴郁语气，改写后台词突然变得阳光——这是严重问题。

**落地方案**：
1. `NovelInputStage.tsx` 在发起改写时，读取已建档角色的 `voiceStyle`/`personality` 字段
2. 构建 `characterVoiceBlock`，在 prompt 中注入"保持以下角色台词特征不变"
3. 属于 Phase 3.1 角色绑定的改写专项延伸

**关键文件**：（与 Phase 3.1 共享，单独标注改写分支）
- `lib/prompts/novel-promotion/ai_story_expand.zh.txt` — `{character_voice_constraints}` 块

---

#### 4.6 情节节拍保护（Plot Beat Preservation）

**差距**：大幅重构时 LLM 可能删除关键剧情节点（转折、悬念、结局）。  
**标杆**：Sudowrite 的 Rewrite 功能在 UI 上明确提示"Structure preserved"/"Structure rewritten"。  
**影视场景**：剧情设计了男主在第二段被刺的节拍，改写后该事件消失——整集内容作废。

**落地方案**：
1. Modal 增加"保护关键节拍"复选框
2. 开启时，用户可在文本区手动标注 `[节拍：XX]` 锚点（或自动抽取段落首句）
3. prompt 中增加"必须保留以下剧情节拍（允许改写措辞，禁止删除事件）"指令

**关键文件**：
- `src/components/home/AiWriteModal.tsx` — 节拍保护 UI
- `lib/prompts/novel-promotion/ai_story_expand.zh.txt` — `{plot_beat_preservation}` 块

---

#### 4.7 句式节奏分析与建议（Rhythm / Pacing Feedback）

**差距**：当前无任何节奏反馈，用户不知道改写结果的节奏是否适合影视剪辑。  
**标杆**：ProWritingAid（句长分布图、节奏评分）、Hemingway App（情绪密度热力图）。  
**影视场景**：30 秒短剧需要短句密度高、动词率高；长剧情集需要有长短穿插的呼吸感。

**落地方案**：
1. 纯前端分析函数（无 API 依赖），在 Modal 底部展示：
   - 句子数 / 平均句长 / 最短句 / 最长句
   - 动词率（粗略：以"了/着/过/去/来/跑/打..."等动词结尾的词语比例）
   - 节奏档位：紧张（短句为主）/ 均衡 / 舒缓（长句为主）
2. 可与 Phase 3.2 质量指标合并实现

**关键文件**：
- `src/components/home/AiWriteModal.tsx` — `RhythmMeter` 子组件
- 新建 `src/lib/home/text-rhythm-analyzer.ts` — 分析逻辑（纯函数）

---

#### 4.8 从大纲展开改写（Outline-to-Prose Rewrite）

**差距**：当前输入框只接受自由文本，用户无法按大纲要点控制结构性生成。  
**标杆**：Jasper（Outline → Sections）、WriteSonic（Point to content）。  
**影视场景**：剧情大纲："第一幕：男主出门 → 撞到女主 → 女主认出男主 → 两人争执离开"，按此展开 300 字。

**落地方案**：
1. Modal 增加"大纲模式"切换（输入框变为 bullet list 编辑器）
2. 每个 bullet = 一个剧情节拍，按顺序依次传给 prompt 作为结构约束
3. LLM 按节拍顺序逐段生成，节拍之间保持连贯

**关键文件**：
- `src/components/home/AiWriteModal.tsx` — 大纲编辑器 UI
- `lib/prompts/novel-promotion/ai_story_expand.zh.txt` — `{outline_mode_block}` 条件块

---

#### Phase 4 工作量估算

| 子项 | 前端复杂度 | 后端复杂度 | 优先级 |
|------|----------|----------|--------|
| 4.1 选中段落改写 | 中 | 小 | P1 |
| 4.2 多变体并列展示 | 中 | 中 | P1 |
| 4.3 Diff 对比视图 | 中（前端 diff 库）| 无 | P2 |
| 4.4 改写强度滑块 | 小 | 小 | P2 |
| 4.5 角色台词口吻锁定 | 小 | 小（复用 Phase 3）| P2 |
| 4.6 情节节拍保护 | 中 | 小 | P2 |
| 4.7 节奏分析反馈 | 小（纯前端）| 无 | P3 |
| 4.8 大纲展开改写 | 中 | 小 | P3 |

---

## 四、各期工作量估算

| Phase | 核心工作 | 前端工作量 | 后端工作量 | 优先级 |
|-------|---------|----------|----------|--------|
| 1.1 实时流式预览 | SSE 订阅 + 预览 UI | 大 | 小（基础设施已有）| P0 |
| 1.2 改写模式迁移 | Modal 内增加选择器 | 小 | 无 | P0 |
| 1.3 字数目标 | 新增选项 + prompt 指令 | 小 | 小 | P1 |
| 2.1 多版本历史 | 纯前端状态管理 | 小 | 无 | P1 |
| 2.2 修改指令 | 输入框 + rewrite_instruction 自由文本 | 中 | 小 | P1 |
| 2.3 续写模式 | 新增 continue 模式 | 小 | 小 | P2 |
| 3.1 角色/场景绑定 | 数据读取 + prompt 注入 | 中 | 中 | P2 |
| 3.2 质量指标 | 纯前端规则函数 | 小 | 无 | P3 |

---

## 五、受影响文件清单

### Phase 1（最近需动的文件）

```
src/components/home/AiWriteModal.tsx                     ← 主要改造目标
src/lib/home/ai-story-expand.ts                          ← 返回 taskId 而非等结果
src/app/[locale]/home/page.tsx                            ← 更新调用方
src/app/[locale]/workspace/.../NovelInputStage.tsx        ← 更新调用方 + 移除底部改写选择器
src/lib/screenplay-tone-presets.ts                       ← 新增 getLengthTargetInstruction
lib/prompts/novel-promotion/ai_story_expand.zh.txt       ← 增加 {length_instruction}
lib/prompts/novel-promotion/ai_story_expand.en.txt       ← 增加 {length_instruction}
src/lib/prompt-i18n/catalog.ts                           ← variableKeys 增加 length_instruction
src/app/api/user/ai-story-expand/route.ts                ← 接收 lengthTarget
src/lib/workers/handlers/ai-story-expand.ts              ← 解析 lengthTarget
```

### Phase 2（续写/修改指令）

```
src/components/home/AiWriteModal.tsx                     ← 修改指令输入框 + 续写按钮
src/lib/screenplay-tone-presets.ts                       ← STORY_REWRITE_MODES 增加 continue
lib/prompts/novel-promotion/ai_story_expand.zh.txt       ← 续写指令支持
src/lib/workers/handlers/ai-story-expand.ts              ← customRewriteInstruction 支持
```

### Phase 3（项目上下文绑定）

```
src/app/api/user/ai-story-expand/route.ts                ← characterContext 参数
src/lib/workers/handlers/ai-story-expand.ts              ← projectContextBlock 构建
lib/prompts/novel-promotion/ai_story_expand.zh.txt       ← {project_context_block} 占位符
src/lib/prompt-i18n/catalog.ts                           ← variableKeys 增加 project_context_block
```

---

## 六、当前最小可改善点（今日可做）

不触及流式架构，仅做 UI 提升和参数补全：

1. **[改写模式迁移]** 把 `storyRewriteMode` 选择器移入 `AiWriteModal`，底部工具栏删除该选择器
2. **[字数目标]** Modal 内增加篇幅档位选择（超短/短/标准/长），注入 `length_instruction`
3. **[生成中 loading 优化]** Modal 显示"AI 正在创作中…"动画而非按钮 loading 态（体验提升）

---

> 最后更新：2026-04-10 | Phase 1 已全部完成，Phase 4 竞品差距分析已补充
