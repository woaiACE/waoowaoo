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

## 阶段 1 ▎ 配置 (config)

用户在 UI 完成项目初始化配置，所有参数持久化到数据库，后续阶段均从此读取。

```
配置项
├── 小说文本上传        支持整本或按集拆分上传
├── AI 提供商配置       填写各服务商 API Key（LLM / 图像 / 视频 / TTS）
├── 模型选择
│   ├── LLM             用于分析、剧本生成、分镜生成
│   ├── 图像模型         用于阶段 3 资产图 + 阶段 6 分镜图
│   ├── 视频模型         用于阶段 8 图生视频
│   └── TTS             用于阶段 7 配音合成
├── contentTrack        内容轨道（影响 Prompt 风格选择）
├── workflowProfile     工作流模式（影响各阶段并发与质量策略）
└── videoRatio          画面比例，默认 9:16
                        ⚠️  仅在阶段 6 起生效，阶段 3 资产图不受此影响
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
├── 角色关系图谱           全剧角色动机、关系梳理
├── 情节分段               全集情节弧度标注
└── 内容轨道标签           自动推断 contentTrack 建议值
```

**关键逻辑：别名去重**

```typescript
// 按 '/' 拆分后，任一别名精确匹配即视为同一角色，避免重复创建
function nameMatchesWithAlias(existingName: string, newName: string): boolean
```

---

## 阶段 3 ▎ 资产制作 (assets)

**Worker:** `image.worker.ts`
**Handlers:** `character-image-task-handler.ts` / `location-image-task-handler.ts`

⚠️ **本阶段所有图像均为提示词构建用的视觉参考，使用固定宽高比，与项目 `videoRatio` 无关。**

```
资产类型            Handler                          固定宽高比   说明
─────────────────────────────────────────────────────────────────────────
角色肖像            character-image-task-handler      3:2         左侧面部特写 + 右侧三视图横排，纯白背景
场景概念图          location-image-task-handler       1:1         单张正方形场景概念图，纯白背景
道具概念图          location-image-task-handler       3:2         左侧主视图特写 + 右侧三视图横排，纯白背景
                    (assetType=prop)
资产 Hub 设计       asset-hub-ai-modify.ts            自定义        支持微调 / 变体生成 / 重绘
```

**Prompt 构建流程（以角色图为例）：**

```
artStyleId → getArtStylePrompt()      画风正向提示词
          → getArtStyleNegativePrompt() 画风负向提示词（不支持该参数的提供商静默丢弃）
          → addCharacterPromptSuffix()  注入三视图布局指令
          → generateCleanImageToStorage() 调用图像生成 API → 上传 MinIO
```

**negativePrompt 兼容性说明：**

```
提供商           支持 negativePrompt
────────────────────────────────────
Ark (豆包系列)   ❌ 接收但静默丢弃（API 不支持此字段）
Fal              ✅
其他提供商        视各自 API 能力
```

---

## 阶段 4 ▎ 剧本生成 (story-to-script)

**Worker:** `text.worker.ts`
**Handler:** `story-to-script.ts` + `orchestrator`

```
输入：novelText（按集）
  │
  ▼
runStoryToScriptOrchestrator()
  ├── episode-split        将长文本按情节节奏拆分为片段（Clip）
  │                        → 写入 novelPromotionClip 记录
  ├── screenplay_<clipId>  每个 Clip 独立生成剧本
  │   ├── 对白             角色台词（含情绪标注）
  │   ├── 旁白             叙事旁白文字
  │   ├── 动作指令          人物动作描述
  │   └── 情绪标注          场景情绪色彩
  └── screenplay-convert   可选：剧本格式规范化转换

并发控制：getUserWorkflowConcurrencyConfig() 限制同时执行的 Clip 数量
断点续跑：retryStepKey / retryStepAttempt 支持指定 Clip 单独重试
工件存储：createArtifact() 将中间产物持久化到 run-runtime
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

