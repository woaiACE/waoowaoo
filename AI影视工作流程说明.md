# AI 影视工作流程说明

> 本文档描述将原始小说文本转化为短剧视频的完整 AI 流水线。
> 每个阶段均由独立的 Worker Handler 驱动，通过 BullMQ 队列调度，支持断点续跑与进度上报。

---

## 总览

```
原始小说文本（用户输入）
    │
    ▼
阶段 1  配置          →  选模型 / 设参数 / 上传文本
    │
    ▼
阶段 2  小说分析       →  LLM 提取角色 / 场景 / 道具 / 全局情节
    │
    ▼
阶段 3  资产制作       →  图像模型生成角色图 / 场景图 / 道具图（固定比例）
    │
    ▼
阶段 4  剧本生成       →  LLM 将小说转换为分镜剧本（按集处理）
    │
    ▼
阶段 5  分镜生成       →  LLM 将剧本拆解为逐帧分镜描述，写入 Panel 记录
    │
    ▼
阶段 6  分镜图生成     →  图像模型按 videoRatio 生成每帧插画（首次画面比例生效）
    │
    ▼
阶段 7  配音           →  LLM 提取台词 → 声线设计 → TTS 生成音频
    │
    ▼
阶段 8  视频生成       →  图生视频模型，长轮询外部 API，持心跳
    │
    ▼
阶段 9  口型同步       →  视频 + TTS 音频 → 嘴型对齐合成
    │
    ▼
阶段 10 片段剪辑 & 导出 → Remotion v4 渲染合成最终 .mp4
```

---

## 阶段 1 ▎ 项目配置（开工前设置）

这一阶段的作用：先把项目的基础方向一次性定好，后续每个阶段都会按这里的设置自动执行。

```text
阶段 1 配置树
├── 1) 上传小说内容
│   ├── 作用：告诉系统"要改编哪段故事"
│   ├── 支持整本上传，也支持按集分批上传
│   └── 影响：后续所有角色、场景、分镜、台词都从这里开始生成
│
├── 2) 填写各服务密钥
│   ├── 作用：让系统获得调用各类生成功能的权限
│   ├── 需要填写：文字理解、画图、视频生成、配音等服务各自的密钥
│   └── 影响：缺少密钥无法开始生成；密钥正确才能稳定出结果
│
├── 3) 选择生成能力
│   ├── 文字理解能力    →  用于小说分析、剧本撰写、分镜拆解（阶段 2、4、5）
│   ├── 画图能力        →  用于角色图、场景图、分镜图（阶段 3、6）
│   ├── 视频能力        →  用于把分镜图变成动态视频片段（阶段 8）
│   └── 配音能力        →  用于把台词变成人声音频（阶段 7）
│
├── 4) 内容方向
│   ├── 作用：确定整部作品偏言情、悬疑、喜剧、古风等哪种调性
│   └── 影响：后续文字生成和剧情气质都会向这个方向靠，减少"风格跑偏"
│
├── 5) 生成质量策略
│   ├── 作用：决定"更快出结果"还是"更精细更稳"
│   └── 影响：速度、画面细节、消耗费用会随策略变化
│
├── 6) 画面比例
│   ├── 作用：决定最终画面是竖屏、横屏还是方形
│   ├── 常见选择：9:16 竖屏 / 16:9 横屏 / 1:1 方形
│   └── ⚠️  从阶段 6（分镜图生成）起才生效；阶段 3 的角色图和场景图使用固定比例，不受此影响
│
├── 7) 目标发布平台  ✅ 已实现（2026-04）
│   ├── 作用：提前告诉系统这部剧计划发到哪里
│   ├── 可选平台：抖音 / 哔哩哔哩 / 快手 / 视频号 / 优兔 / 小红书 / 通用
│   ├── 影响：系统会自动匹配该平台推荐的画面比例，避免做完才发现尺寸不对
│   └── 联动逻辑：选择平台后自动填写画面比例（抖音→竖屏 / 哔哩哔哩→横屏 / 优兔→横屏）
│
├── 8) 全局色调基调  ✅ 已实现（2026-04）
│   ├── 作用：为整部作品选一种统一的色彩氛围（共 25 种预设）
│   │   ├── 暖黄古风    →  米黄琥珀做旧质感，适合古装历史题材
│   │   ├── 赛博霓虹    →  荧光紫电子蓝高对比，适合科幻都市悬疑
│   │   ├── 粉彩治愈    →  低饱和粉紫梦幻柔光，适合少女向温馨日常
│   │   ├── 冷峻电影    →  青橙对比降饱和度，适合正剧犯罪题材
│   │   └── ……等 25 种
│   ├── 已生效范围
│   │   ├── 阶段 3：角色图和场景图生成时注入色彩关键词
│   │   └── 阶段 6：分镜图生成时注入色彩关键词
│   └── 智能冲突处理
│       ├── 当某帧场景已有专属色调描述时（如"月光下的水面"）
│       ├── 系统自动保留预设中的质感词（如胶片颗粒、柔光晕染）
│       └── 把具体色相主导权让给场景本身，避免两套颜色互相打架拉低出图质量
│
└── 9) 项目模板  ✅ 已实现（2026-04）
    ├── 作用：一键套用成套配置（共 25 种，含古装言情、都市甜宠、悬疑犯罪、仙侠奇幻等）
    ├── 自动填充：画风 + 色调基调 + 目标平台 + 内容方向
    └── 对用户价值：新项目开局更快，不熟悉参数的用户选模板即可直接开始制作
```

### 📋 阶段 1 改进计划进度

```text
阶段 1 已完成
├── ✅ 目标发布平台预配置（7 个平台可选）
├── ✅ 选平台后自动填写画面比例（抖音→竖屏、哔哩哔哩/优兔→横屏等）
├── ✅ 全局色调基调（25 种预设，角色图/场景图/分镜图全链路生效，含冲突自动处理）
└── ✅ 项目模板库（25 种模板，一键组合配置）

阶段 1 仍未落地
├── ❌ 自定义模板保存：用户把当前配置另存为专属模板，下次新建项目直接复用
│       价值：适合批量制作同类型短剧，减少重复配置时间
└── ❌ 内容基调约束：在内容方向之外增加"禁止项"字段（如"不出现暴力""仅限温馨向"）
        价值：剧本和分镜生成时自动遵守，从源头保障内容安全

优先级：🟡 中
```

---

## 阶段 2 ▎ 小说分析 (analyze-novel / analyze-global)

**Worker:** `text.worker.ts`
**Handlers:** `analyze-novel.ts` / `analyze-global.ts`

LLM 对上传文本做两路并行分析：

```
analyze-novel（单集资产提取）
├── analyze_characters    提取角色姓名、性格特征、外貌描述
│                         → 支持别名匹配去重（按 '/' 拆分别名联合判定）
│                         → 写入 novelPromotionCharacter 表
├── analyze_locations     提取场景名称、氛围描述、视觉特征
│                         → 自动触发 seedProjectLocationBackedImageSlots()
│                         → 写入 novelPromotionLocation 表
└── analyze_props         提取关键道具外观描述（resolvePropVisualDescription）
                          → 写入 novelPromotionLocation 表（assetKind=prop）

analyze-global（跨集全局分析）
├── 内容分块处理           超长文本按 CHUNK_SIZE 切片，逐块累积结果
│                         → 新角色名推送至 existingCharacterNames（跨块去重已修复）
│
├── 角色关系图谱  ✅ 已完整实现（2026-04）
│   ├── LLM 输出        每块响应含 relationships[]（characterA/B / relationshipType / description）
│   ├── 解析层           safeParseCharactersResponse() → CharacterRelationItem[]
│   ├── 持久化层         upsertCharacterRelations() → CharacterRelation 表
│   │                    → 每次全量分析前先 deleteMany 清空旧记录，保证结果干净
│   └── 前端可视化       React Flow 力导向图
│       ├── 布局         按 roleLevel (S/A/B/C/D) 分层排列，同层水平均匀分布
│       ├── 节点         CharacterGraphNode：头像圈（已确认→真实图片 / 未确认→首字母占位）
│       │                + 角色等级彩色角标 + 职衔标签（occupation/title）
│       ├── 边           按 relationshipType 映射颜色/虚线样式（20 种类型覆盖）
│       │                + 悬停 tooltip 显示关系描述
│       ├── 控件         MiniMap / 缩放控制条 / 适应画面按钮
│       └── 入口         AssetsStage "图谱视图" Tab（卡片视图 ↔ 图谱视图 切换）
│
├── 情节分段               全集情节弧度标注
└── 内容轨道标签           自动推断 contentTrack 建议值
```

**关键逻辑：别名去重**

```typescript
// 按 '/' 拆分后，任一别名精确匹配即视为同一角色，避免重复创建
function nameMatchesWithAlias(existingName: string, newName: string): boolean
```

### 📋 阶段 2 改进计划进度

```text
阶段 2 已完成
└── ✅ 角色关系图谱可视化（2026-04）
        数据层：analyze-global 每块输出 relationships[]，safeParseCharactersResponse
                解析为 CharacterRelationItem，upsertCharacterRelations 写入
                CharacterRelation 表；每次重新分析前 deleteMany 清空旧记录
        接口层：GET /api/projects/[projectId]/character-relations
                → 返回 characters（含 signedUrl 头像、occupation/title）+ relations
                → 已过滤 status≠completed 任务和 orphan 孤立关系
        展示层：React Flow 图，按 roleLevel S/A/B/C/D 分层布局
                节点：头像圆圈 + 职衔标签 + 确认状态指示
                边：20 种关系类型映射颜色/虚线（友好→蓝 / 敌对→红虚 / 家族→橙 / 师徒→紫 …）
        入口：  AssetsStage "图谱视图" Tab，点击节点聚焦对应角色卡片

阶段 2 仍未落地
├── ❌ 分析结果一致性校验
│   │
│   ├── 目标：同一文本以 temperature 0 + temperature 0.7（当前主力）跑两路角色提取，
│   │         差异名单超过阈值时前端标黄提示人工确认
│   │
│   ├── [GitNexus: blast radius = LOW，仅影响 handleAnalyzeGlobalTask 本身，无直接调用方]
│   │
│   └── 技术落地计划（5 步）
│       ├── 1. 新建 src/lib/workers/handlers/analyze-global-consistency.ts
│       │       fn checkCharacterConsistency({ job, analysisModel, firstChunk, knownNames, ... })
│       │       → 对 firstChunk 以 temperature=0 调用 executeAiTextStep，只提取角色名
│       │       → diff 对比 knownNames，返回主运行遗漏的名字数组
│       ├── 2. prisma/schema.prisma → NovelPromotionProject 追加字段
│       │       analysisConsistencyWarnings  Json?
│       │       执行: prisma migrate dev --name add-analysis-warnings
│       ├── 3. analyze-global.ts → chunk 循环结束后（96% 进度前）插入
│       │       const missing = await checkCharacterConsistency(...)
│       │       if (missing.length) prisma.novelPromotionProject.update({ analysisConsistencyWarnings: missing })
│       ├── 4. character-relations/route.ts → 返回体追加 consistencyWarning?: string[]
│       └── 5. AssetsStage.tsx / CharacterGraphView.tsx
│               当 consistencyWarning.length > 0 时图谱顶部渲染黄色 Alert 列出疑似遗漏角色名
│
└── ❌ 内容敏感词预警
    │
    ├── 目标：分析完成后扫描角色描述/场景描述，提前告警平台违禁内容，
    │         避免后续图像/视频生成被拦截浪费 API 费用
    │
    ├── [GitNexus: blast radius = LOW，仅影响 handleAnalyzeGlobalTask 本身，无直接调用方]
    │
    └── 技术落地计划（5 步）
        ├── 1. 新建 src/lib/workers/handlers/analyze-global-sensitivity.ts
        │       fn checkContentSensitivity({ job, analysisModel, projectId, ... })
        │       → 查询刚写入的角色 description + 场景 summary
        │       → 以 temperature=0 调用"内容审核 prompt"（问 LLM 是否含平台违禁元素）
        │       → 返回 Array<{ field, text, reason }>
        ├── 2. prisma/schema.prisma → NovelPromotionProject 追加字段
        │       contentSensitivityWarnings  Json?
        │       合并入 add-analysis-warnings 同一迁移
        ├── 3. analyze-global.ts → 一致性校验之后插入
        │       const items = await checkContentSensitivity(...)
        │       if (items.length) prisma.novelPromotionProject.update({ contentSensitivityWarnings: items })
        ├── 4. character-relations/route.ts → 返回体追加 sensitivityWarning?: Array<{field,text,reason}>
        └── 5. AssetsStage.tsx
                当 sensitivityWarning.length > 0 时渲染橙色 Alert + 可折叠违禁详情面板，
                提示用户进入阶段 3 前先修改相关描述

优先级：🟡 中
```

---

## 阶段 3 ▎ 资产制作 (assets)

**Worker:** `image.worker.ts`
**Handlers:** `character-image-task-handler.ts` / `location-image-task-handler.ts` / `asset-hub-ai-modify.ts`

⚠️ **本阶段所有图像均为提示词构建用的视觉参考，使用固定宽高比，与项目 `videoRatio` 无关。**

```
image.worker.ts（资产制作并发池）
├── character-image-task-handler（角色肖像生成）
│   ├── 固定宽高比    3:2       左侧面部特写 + 右侧三视图横排，纯白背景
│   ├── 参考图注入  ✅ 已实现（2026-04）
│   │   ├── 子形象生成：取同角色主形象（appearanceIndex=0）图片作为 referenceImages
│   │   │              → findFirst(appearanceIndex=PRIMARY_APPEARANCE_INDEX)
│   │   └── 主形象初次生成：来源全局资产库（sourceGlobalCharacterId 存在）时
│   │                       取全局 appearance 图片注入，实现像素级视觉约束
│   ├── Prompt 构建链
│   │   ├── artStyleId → getArtStylePrompt()           画风正向提示词
│   │   ├── → getArtStyleNegativePrompt()              画风负向提示词
│   │   │   └── Ark 降级兼容  ✅ 已修复（2026-04）
│   │   │       isArkModelKey() 识别豆包系列模型
│   │   │       → convertNegativeToPositivePrompt() 将负向词转正向约束追加到 prompt
│   │   │       （Ark 接收 negativePrompt 但静默丢弃，其他提供商正常透传）
│   │   ├── → addCharacterPromptSuffix()               注入三视图布局指令
│   │   └── → generateCleanImageToStorage()            调用图像生成 API → 上传 MinIO
│   └── Character Bible 锁定  ✅ 已实现（2026-04）
│       ├── 数据层   CharacterAppearance 追加 bibleLocked Boolean / bibleLockedAt DateTime?
│       │            → 便携版启动时 prisma db push 自动执行迁移，无需手动操作
│       ├── API 层   PATCH /character/bible-lock → 锁定指定 appearance（自动解锁同角色其他）
│       │            DELETE /character/bible-lock → 解锁指定 appearance
│       ├── Worker  image-task-handler-shared.ts → collectPanelReferenceImages()
│       │            bibleLocked 优先级 > item.appearance 指定 > 默认第 0 个
│       │            → 阶段 6 分镜图生成自动使用锁定形象作像素级视觉约束
│       └── UI 层   CharacterCard 锁定/解锁按钮
│                    锁定态→琥珀色实心图标 / 未锁定态→透明描边图标
│
├── location-image-task-handler（场景 & 道具概念图生成）
│   ├── 场景概念图   固定宽高比 1:1   单张正方形场景概念图，纯白背景
│   └── 道具概念图   固定宽高比 3:2   左侧主视图特写 + 右侧三视图横排（assetKind=prop）
│
└── asset-hub-ai-modify（全局资产库生成/微调）
    ├── 用途      全局角色/场景/道具的 AI 设计、微调、变体生成、重绘
    └── 规格      宽高比自定义，独立于项目 videoRatio
```

**关键逻辑：参考图归一化**

```typescript
// 将所有来源（URL / Base64 / COS 签名链接）统一转换后注入模型 referenceImages
normalizeReferenceImagesForGeneration(referenceImages: string[]): Promise<string[]>
```

### 📋 阶段 3 改进计划进度

```text
阶段 3 已完成
├── ✅ ① 角色参考图 Image Input 强注入（2026-04）
│       子形象生成时自动取主形象（appearanceIndex=0）图片作 referenceImages
│       主形象初次生成且绑定全局资产时，取全局首个 appearance 注入
│       归一化：normalizeReferenceImagesForGeneration() 统一转 Base64，全模型通用
│
├── ✅ ③ Negative Prompt 降级兼容（2026-04）
│       isArkModelKey() 识别豆包系列 → convertNegativeToPositivePrompt() 转正向约束
│       character-image-task-handler + location-image-task-handler 均已接入
│       源码：src/lib/style-categories.ts，统一通过 src/lib/constants.ts 导出
│
└── ✅ ④ Character Bible 锁定（2026-04）
        全链路：DB 字段 → API PATCH/DELETE → Worker 优先级 → UI 切换按钮
        便携版启动时 prisma db push 自动执行迁移，无需手动操作
        前端合约：contracts.ts / mappers.ts / useProjectAssets.ts / project.ts 四处同步
        UI：CharacterSection → useCharacterBibleLock → CharacterCard 锁定按钮

阶段 3 已放弃
└── ❌ ② 角色视觉一致性评分
        原计划：CLIP 嵌入余弦相似度评分，生成后图片 vs 参考图对比打分
        放弃原因：对当前工作流收益有限，维护成本高，不实现

优先级：✅ 全部落地（3 项完成，1 项主动放弃）
```

---

## 阶段 4 ▎ 剧本生成 (story-to-script)

**Worker:** `text.worker.ts`
**Handler:** `story-to-script.ts` + `orchestrator`

这一阶段的作用：把按集小说文本拆成 Clip，并生成可编辑、可重跑分镜的结构化剧本，为阶段 5 分镜拆解提供稳定输入。

```text
阶段 4 能力树
├── 1) 文本拆片（episode-split）
│   ├── 作用：将单集长文本按情节节奏拆分为多个 Clip
│   └── 结果：写入 novelPromotionClip，成为后续并发生成单位
│
├── 2) Clip 级剧本生成（screenplay_<clipId>）
│   ├── 作用：每个 Clip 独立生成结构化 screenplay JSON
│   ├── 包含内容：对白 / 旁白 / 动作 / 场景头信息
│   └── 并发控制：getUserWorkflowConcurrencyConfig() 限制同批 Clip 并发
│
├── 3) 剧本风格基调  ✅ 已实现（2026-04）
│   ├── 作用：在配置阶段选择 tone（自动/甜宠/悬疑/动作等）
│   ├── 传递链路：ConfigStage → useWorkspaceExecution → story-to-script-stream
│   └── Prompt 注入：tone_instruction 占位符写入中英模板，worker 注入 screenplayToneInstruction
│
├── 4) Clip 级人工编辑（内联）
│   ├── 作用：对白/旁白/动作在剧本面板中直接修改
│   └── 结果：以 clip 粒度更新 screenplay，避免整集重做
│
├── 5) Clip 级局部重跑分镜  ✅ 已实现（2026-04）
│   ├── 作用：仅对当前 Clip 重新执行 script-to-storyboard
│   ├── 触发方式：剧本卡片 hover 按钮“重新生成分镜”
│   └── 技术要点：retryStepKey = clip_{clipId}_phase1（原子重试入口）
│
├── 6) 剧本节奏评分 Badge  ✅ 已实现（2026-04）
│   ├── 作用：按 Clip 快速给出“紧凑/适中/舒展”节奏反馈
│   ├── 算法维度：场景数 + 对白占比 + 内容密度（0-100）
│   └── 展示位置：ScriptViewScriptPanel 的 Clip 标题区
│
└── 7) 工件与续跑
    ├── 工件存储：createArtifact() 持久化中间产物到 run-runtime
    └── 续跑机制：retryStepKey / retryStepAttempt 支持失败步骤重试
```

### 📋 阶段 4 改进计划进度（按阶段 1 模板）

```text
阶段 4 已完成
├── ✅ 剧本风格基调（screenplayTone）全链路贯通
│       配置选择 → API 入参 → worker 解析 → orchestrator 注入 tone_instruction
├── ✅ Clip 级局部重跑分镜
│       ScriptView 卡片按钮触发 script-to-storyboard-stream，按 retryStepKey 仅重跑单 Clip
└── ✅ 剧本节奏评分 Badge
        基于 scenes/dialogue/density 的轻量算法，前端即时反馈“紧凑/适中/舒展”

阶段 4 仍未落地
├── ❌ 多版本剧本对比（同集多 tone 并排对比）
│       价值：减少试风格成本，提升导演决策效率
└── ❌ 标准格式预览（可切换行业剧本排版视图）
        价值：便于编剧审阅与跨团队交接

优先级：🟡 中（核心生产链路已可用，后续以协作体验增强为主）
```

---

## 阶段 5 ▎ 分镜生成 (script-to-storyboard)

**Worker:** `text.worker.ts`
**Handler:** `script-to-storyboard.ts` + `orchestrator`

```
输入：Clip 剧本文本
  │
  ▼
runScriptToStoryboardOrchestrator()
  ├── 逐 Clip 拆解为 Panel（分镜帧）
  │   每帧包含：
  │   ├── shotType        镜头类型（特写 / 中景 / 全景 / 航拍 等）
  │   ├── imagePrompt     静态画面描述（供阶段 6 图像生成使用）
  │   ├── videoPrompt     动态运镜描述（供阶段 8 视频生成使用）
  │   ├── characters[]    出镜角色列表
  │   └── voiceLines[]    当帧台词（供阶段 7 配音使用）
  ├── persistStoryboardOutputs()   写入 Panel 数据库记录
  └── parseVoiceLinesJson()        预解析台词到 VoiceLine 表

断点续跑：runScriptToStoryboardAtomicRetry() 支持指定 Panel 原子重试
推理模型：支持 reasoning=true / reasoningEffort (minimal|low|medium|high)
```

### 📋 阶段 5 差距分析 & 改进计划

| 项目 | 内容 |
|------|------|
| **缺失功能** | Animatic 动态节奏预检；专业运镜模板库；Panel 时长与台词时长自动匹配；分镜画布批量操作 |
| **优先级** | 🔴 最高 |
| **待实现** | ① **客户端 Animatic 预览**：分镜生成完成后，用 Panel 顺序 + voiceLine 时长 + Ken Burns 平移效果在浏览器端串联为低帧率预览视频（Canvas/WebGL），零后端成本，让用户在出图前确认叙事节奏 ② **专业运镜模板库**：为 videoPrompt 编辑器提供内置模板（慢速推进 Push-In / 环绕 Arc Shot / 跟随 Follow / 拉开 Pull-Back 等），模板映射到各视频模型的运镜参数关键词，解决用户不会写运镜描述的问题 ③ **台词时长→视频时长建议**：根据 voiceLine 文字字数估算 TTS 时长（中文约 4 字/秒），自动在 Panel 上标注"建议视频时长"，引导阶段 8 视频时长设置 ④ **分镜批量操作**：支持多选 Panel，批量修改 shotType、批量绑定角色、批量重生成 |
| **实现好处** | Animatic 使节奏问题在 API 费用最低的阶段暴露；运镜模板使视频动感提升，避免全集都是静帧缩放；批量操作减少重复劳动约 80% |

---

## 阶段 6 ▎ 分镜图生成 (storyboard images)

**Worker:** `image.worker.ts`
**Handler:** `panel-image-task-handler.ts`

✅ **`videoRatio` 在本阶段首次生效，控制输出图像宽高比。**

```
输入：Panel 记录（shotType + imagePrompt + videoPrompt）
  │
  ▼
buildPanelPromptContext()
  ├── 注入 shotType         镜头语言描述
  ├── 注入 imagePrompt      画面内容描述
  ├── 注入 videoPrompt      动作/运镜提示
  └── 注入 artStylePrompt   画风描述（来自项目 artStyleId）

collectPanelReferenceImages()
  ├── 角色参考图             引用阶段 3 生成的角色肖像（3:2）
  └── 场景参考图             引用阶段 3 生成的场景概念图（1:1）

normalizeReferenceImagesForGeneration()
  └── 将 MinIO 签名 URL 转换为 Base64，确保 API 可直接消费

图像生成 → 上传 MinIO → 更新 Panel.imageUrl

变体生成：shot-ai-variants.ts
  └── panel-variant-task-handler   同样读取 videoRatio，生成同帧多版本
```

**宽高比映射（以 Ark 豆包为例）：**

```
videoRatio → getSizeMapForModel(modelId) → size 参数
  9:16  →  1440x2560
  16:9  →  2560x1440
  1:1   →  2048x2048
```

### 📋 阶段 6 差距分析 & 改进计划

```text
阶段 6 已完成
└── ✅ 分镜图审核关卡（Stage Gate）（2026-04）
        DB 层：NovelPromotionPanel 新增 imageApproved Boolean @default(false)
               + imageApprovedAt DateTime?（已通过 prisma db push 落库）
        API 层：PATCH /api/novel-promotion/[projectId]/panel/approve
                → 支持 panelIds[] 批量审核 / storyboardId 整分镜批量审核
                DELETE /api/novel-promotion/[projectId]/panel/approve
                → 撤销审核（imageApproved=false）
        安全：重新生成图片时 panel-image-task-handler 自动将 imageApproved 重置为 false
              防止旧审核为新生成图片背书
        前端：PanelCard 图片左下角"审核 / 已审核"切换按钮 + 绿色边框环指示
              usePanelApprove hook 封装 PATCH/DELETE + invalidateQueries
              StoryboardGroup 集成；支持逐帧点击审核
```

| 项目 | 内容 |
|------|------|
| **缺失功能** | 角色参考图 Image Input 强注入（当前仅 prompt 文字）；构图规则自动注入；跨帧一致性自动 QC；批量生成前预检关卡 |
| **优先级** | 🔴 最高 |
| **待实现** | ① **角色参考图 Image Input 强注入**（核心）：`collectPanelReferenceImages()` 已收集参考图，但部分模型调用路径未将其作为 `image_input` 参数传入。对 Fal Flux Kontext、Kling v3 等支持 image reference 的模型，确保参考图以 Base64 形式作为强约束传入，而非只拼接到文字 prompt ② **专业构图规则注入**：在 `buildPanelPromptContext()` 中根据 shotType 自动追加构图关键词（特写→三分法人脸居三分之一 / 全景→前景遮挡增加层次感 / 航拍→鸟瞰几何构图），提升画面专业度 ③ **多变体自动评分选优**：`panel-variant-task-handler` 已支持多版本生成，补充 VLM 自动评分（构图、一致性、美学）并自动选取最优版本标为默认，减少用户手动对比工作量 ④ **批量生成前 QC 预检**：提交批量出图任务前，检查所有 Panel 的 imagePrompt 是否为空、角色绑定是否缺失，给出缺失清单，避免出图后发现空白帧 |
| **实现好处** | 角色一致性大幅提升是此阶段最大收益；构图规则注入使画面从"AI 味"转向"电影感"；自动评分选优节省约 60% 的人工挑图时间 |

---

## 阶段 7 ▎ 配音 (voice)

**Worker:** `voice.worker.ts`
**Handlers:** `voice-analyze.ts` / `voice-design.ts` / TTS 生成

```
子流程 1: voice-analyze
  ├── 读取 Panel.voiceLines（阶段 5 已预解析）
  ├── LLM 补充提取台词（MAX_VOICE_ANALYZE_ATTEMPTS=2 次重试）
  └── 输出：每帧台词文本 + 说话角色映射

子流程 2: voice-design
  ├── 汇总项目全部角色
  ├── 调用百炼（Bailian）声音设计 API
  │   → getProviderConfig(userId, 'bailian')
  └── 为每个角色分配 voiceId（声线 ID）

子流程 3: TTS 生成
  ├── 按角色 voiceId 调用 TTS API
  ├── 生成 .wav / .mp3 音频文件
  └── 上传 MinIO → 写入 VoiceLine.audioUrl
```

### 📋 阶段 7 差距分析 & 改进计划

```text
阶段 7 已完成
└── ✅ 一键出图+配音并行批量按钮（2026-04）
        StoryboardHeader 新增"一键出图+配音"按钮
        → 同时触发 handleGenerateAllPanels（批量图片，10并发）
          + useBatchGenerateVoices.mutateAsync({ lineIds })（批量配音）
          两路 Promise.allSettled 并发，互不阻塞
        → 角标实时显示：图X 音Y（待生成数量）
        → 当 pendingPanelCount > 0 或 pendingVoiceCount > 0 时显示按钮
```

| 项目 | 内容 |
|------|------|
| **缺失功能** | BGM 背景音乐生成；音效（SFX/Foley）生成；多维情绪参数矩阵；响度归一化（LUFS）；混音层 |
| **优先级** | 🟠 高 |
| **待实现** | ① **BGM 生成子流程**（新增 Stage 7.5）：接入 FAL 音乐生成模型（Stable Audio / MusicGen），根据 contentTrack + 情节情绪标注自动生成全集 BGM，写入 `VideoEditorProject.bgmUrl`，供阶段 10 混音使用 ② **音效生成**：对场景描述中的关键动作词（爆炸/脚步声/雨声）自动触发 SFX 生成任务，与视频帧时间轴对齐 ③ **情绪参数矩阵扩展**：当前 emotion 为单字段，扩展为（语速 × 情绪强度 × 音调偏移 × 停顿节奏）四维参数，支持同一角色在不同情绪场景下的声音变化 ④ **响度归一化**：批量 TTS 生成完成后对所有 VoiceLine 音频进行 LUFS 标准化（目标 -14 LUFS），消除不同 TTS 调用间的音量不一致问题 |
| **实现好处** | BGM 是短剧情绪渲染最重要的工具，当前缺失导致交付物为"哑剧"；响度归一化解决用户反馈最多的"忽大忽小"问题；SFX 使最终视频从三流提升至专业感 |

---

## 阶段 8 ▎ 视频生成 (videos)

**Worker:** `video.worker.ts`

```
输入：Panel.imageUrl（阶段 6 生成的分镜图）+ Panel.videoPrompt
  │
  ▼
图生视频（Image-to-Video）

支持模型：
  ├── Kling v2 / v3          快手，支持首尾帧锁定
  ├── Doubao Seedance 1.5    字节，支持同步生成音效
  ├── Vidu Q2                支持同步音效
  ├── Wan 2.5                via fal
  ├── Veo 3.1                Google，via fal
  └── Sora 2                 OpenAI，via fal  ⚠️ 当前无音效能力

长轮询机制：
  waitExternalResult()
  ├── 定期轮询外部 API 状态
  ├── assertTaskActive()   每次轮询前确认任务未被取消
  └── reportTaskProgress() 实时上报生成进度（0-100%）
```

### 📋 阶段 8 差距分析 & 改进计划

```text
阶段 8 已完成
├── ✅ Stage Gate 人工审核关卡（2026-04）
│       批量视频生成（all: true）仅提交 imageApproved=true 的 Panel
│       未审核的 Panel 不消耗视频 API 费用
│       VideoStage 工具栏显示"审核 X/Y"计数：全数审核字色变绿，部分审核显示警告色
│
├── ✅ 视频时长自动推算 inferPanelVideoDuration（2026-04）
│       规则：max(台词总时长 + 0.5s 缓冲, shotType 最短时长, LLM 分镜建议时长)
│       四舍五入至 0.5s 粒度，上限 15s
│       批量提交时若用户未指定 duration，自动注入推算值
│       数据来源：NovelPromotionVoiceLine.audioDuration + panel.duration
│
└── ✅ 视频完成后自动触发 Lip Sync（2026-04）
        video.worker.ts 写入 videoUrl 后，查询对应 Panel 已完成配音
        有配音则自动 submitTask(LIP_SYNC)，dedupeKey=lip_sync:{panelId}:{voiceLineId}
        读取用户 userPreference.lipSyncModel，fallback=fal/kling-video/lipsync
        整个流程包裹 try/catch，Lip Sync 失败不影响视频生成结果
```

| 项目 | 内容 |
|------|------|
| **缺失功能** | 首尾帧全局引导 UI；运镜模板 UI；模型能力差异提示；批量运镜参数统一配置 |
| **优先级** | 🟠 高 |
| **待实现** | ① **首尾帧引导检查**：批量提交视频生成前，自动检测哪些 Clip 的首/尾 Panel 未设置 FirstLastFrame 约束，以警告列表形式提示用户补全，引导充分利用已有的首尾帧功能 ② **运镜模板 UI**：在 VideoRenderPanel 中新增运镜模板选择器（推进 / 拉开 / 横移 / 环绕 / 跟随 / 俯冲），选择后自动转换为目标模型（Kling/Seedance/Vidu）的最优运镜关键词填充到 videoPrompt ③ **模型能力矩阵提示**：选择视频模型时，实时显示该模型是否支持音效同步、首尾帧、运镜指令等能力，避免用户选错模型导致参数静默丢弃 |
| **实现好处** | 首尾帧引导使镜头衔接流畅度显著提升；运镜模板解决"全集都是原地缩放"的最大用户痛点 |

---

## 阶段 9 ▎ 口型同步 (lip-sync)

**Worker:** `video.worker.ts`（lipsync handler）

```
输入：
  ├── 视频片段 URL（阶段 8 生成）
  └── TTS 音频 URL（阶段 7 生成）
  │
  ▼
resolveLipSyncVideoSource()
  │
支持提供商：
  ├── Fal         通用口型同步
  ├── Vidu        原生支持唇形驱动
  └── Bailian     阿里云口唇同步
  │
输出：嘴型对齐的合成视频 URL → 写入 Panel.lipSyncVideoUrl
```

### 📋 阶段 9 差距分析 & 改进计划

| 项目 | 内容 |
|------|------|
| **缺失功能** | 唇形同步参数配置 UI（当前前端仅一个开关）；同步效果前后对比预览；批量参数统一配置；音频时间轴偏移校正 |
| **优先级** | 🟡 中 |
| **待实现** | ① **参数配置 UI**：在 VideoStage 的 Lip Sync 开关旁展开提供商参数面板（嘴型平滑度、强度、延迟偏移），当前参数全部使用默认值导致效果参差 ② **效果对比预览**：提供"同步前/同步后"并排视频播放器，让用户直观判断是否接受当前同步效果，决定是否重试 ③ **批量配置界面**：支持为整集所有 Panel 统一设置 Lip Sync 提供商和强度参数，避免逐条手动配置 ④ **音频静音头部偏移校正**：检测 TTS 音频静音头部（silence head），自动计算偏移量补偿，解决"嘴动了半秒后声音才出来"的常见问题 |
| **实现好处** | Lip Sync 是观感最直接的质量指标之一，参数暴露可使同步自然度从"机械感"提升到"基本自然"；对比预览减少用户反复重试的时间浪费 |

---

## 阶段 10 ▎ 片段剪辑 & 最终导出

```
clips-build
  └── LLM 根据台词时长 + 视频时长决定片段切分时间点

Remotion v4 渲染引擎
  ├── 视频轨道    Panel 视频片段（口型同步版 / 原版降级）
  ├── 音频轨道    TTS 配音 + BGM（可选）
  └── 字幕轨道    VoiceLine 文字叠加（时间轴对齐）

输出：最终 .mp4 短剧视频
```

### 📋 阶段 10 差距分析 & 改进计划

```text
阶段 10 已完成
└── ✅ 前端剪辑台路由连接（2026-04）
        EditorStageRoute.tsx 已连接 VideoEditorStage 组件
        用户可从阶段 10 入口进入剪辑台界面
```

| 项目 | 内容 |
|------|------|
| **缺失功能** | LUT 调色；BGM 混音；多平台格式导出；字幕样式设计；片头/片尾模板 |
| **优先级** | 🔴 最高（交付链路必须） |
| **待实现** | ① **LUT 调色选择器**：在剪辑台新增调色面板，提供预设 LUT 风格（电影感橙青 / 暖黄复古 / 冷蓝科幻 / 黑白默片），渲染时作为滤镜叠加到 Remotion 合成轨道 ② **BGM 混音时间轴**：将阶段 7.5 生成的 BGM 显示在时间轴独立音频轨道，支持音量淡入淡出曲线编辑、循环截断、与 TTS 人声分轨混合 ③ **多平台格式导出**：抖音（1080×1920 H.264）/ B站（1920×1080 H.264）/ YouTube（2160×3840 H.265）预设导出按钮，调用 Remotion 渲染参数适配 ④ **字幕样式设计器**：提供样式选择（宋体黑边 / 综艺花字 / 电影英文字幕风），字号、颜色、位置可配置 ⑤ **片头/片尾模板**：内置 3-5 套片头/片尾 Remotion 动画模板，用户填入剧名和集数信息后自动渲染拼接 |
| **实现好处** | LUT 调色使全集视觉统一感质量提升最明显；多平台导出直接支撑分发变现 |

---

## 📐 宽高比（videoRatio）分层说明

```
阶段          Handler                           宽高比来源                    固定值        备注
──────────────────────────────────────────────────────────────────────────────────────────────
阶段 3 角色图  character-image-task-handler      CHARACTER_ASSET_IMAGE_RATIO   3:2          左侧面部特写 + 右侧三视图
阶段 3 场景图  location-image-task-handler       LOCATION_IMAGE_RATIO          1:1          单张正方形场景图
阶段 3 道具图  location-image-task-handler       PROP_IMAGE_RATIO              3:2          左侧主视图 + 右侧三视图
阶段 6 分镜图  panel-image-task-handler          project.videoRatio            用户设定      16:9 / 9:16 / 1:1 等
阶段 8 视频    video.worker.ts                   project.videoRatio            用户设定      与分镜图比例一致
```

> **关键结论**：`videoRatio` 配置从**阶段 6**起才真正控制画面比例。
> 阶段 3 的角色图 / 场景图 / 道具图使用硬编码常量，目的是为阶段 6 的提示词注入提供标准化视觉参考，不作为视频帧直接输出。

---

## 🗂️ Worker 与 Queue 对应关系

```
Queue              Handler 文件                         负责阶段
────────────────────────────────────────────────────────────────────────
text.worker.ts     analyze-novel.ts                     阶段 2（单集资产提取）
                   analyze-global.ts                    阶段 2（全局分析）
                   story-to-script.ts                   阶段 4
                   script-to-storyboard.ts              阶段 5

image.worker.ts    character-image-task-handler.ts      阶段 3（角色图）
                   location-image-task-handler.ts       阶段 3（场景/道具图）
                   panel-image-task-handler.ts          阶段 6
                   shot-ai-variants.ts                  阶段 6（变体）
                   asset-hub-ai-modify.ts               阶段 3（微调/变体）

voice.worker.ts    voice-analyze.ts                     阶段 7（台词提取）
                   voice-design.ts                      阶段 7（声线设计）
                   TTS 生成                             阶段 7（音频合成）

video.worker.ts    图生视频 handler                     阶段 8
                   lipsync handler                      阶段 9
```

