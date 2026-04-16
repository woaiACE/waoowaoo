# LTX 导演模式（短剧脚本生成）集成方案 v2

## 一、设计原则

参照项目已有的 Story→Script 和 Script→Storyboard 工作流，导演模式遵循以下核心原则：

1. **每次 LLM 调用只做一件事** —— 单一职责，降低推理复杂度
2. **按场次并行** —— 多个场次同时处理，使用 `mapWithConcurrency` 控制并发
3. **Phase 并行** —— 同一场次内互不依赖的 Phase 用 `Promise.all` 并行
4. **逐步精化** —— 粗 → 细，每步输出作为下一步输入，token 压力分摊到多次调用
5. **Artifact 驱动** —— 每步结果立即写入 GraphArtifact，支持单步重试

---

## 二、流程对比：旧方案 vs 新方案

### 旧方案（3 大块 Prompt）的问题

| 问题 | 说明 |
|------|------|
| 单次推理压力过大 | Prompt C（分镜→脚本）要求 LLM 同时输出 4 格图提示词 + 视频提示词 + 音效 + 全局位置，单次 token 输出可达 8000+ |
| 无法按场次并行 | 整个故事一次性处理，无法利用多工作线程 |
| 失败重试粒度粗 | 一个场次的失败导致整体重跑 |
| 不符合项目模式 | 项目现有架构是「多步骤、细粒度、按片段并行」 |

### 新方案：7 步 DAG + 按场次 × Phase 并行

```
[用户输入原文]
       │
       ▼
 ┌── analyze_characters ──┐
 │   analyze_locations     │   ← 并行，复用现有
 └─────────┬──────────────┘
           ▼
   split_scenes                  ← 步骤 1：切分场次
           │
           ▼
 ┌─── 按场次并行（mapWithConcurrency）──────────────────────┐
 │                                                           │
 │   scene_to_events              ← 步骤 2：场次→事件        │
 │         │                                                 │
 │         ▼                                                 │
 │   events_to_storyboard         ← 步骤 3：事件→分镜        │
 │         │                                                 │
 │         ▼                                                 │
 │   ┌── shot_image_prompt ──┐                               │
 │   │   shot_video_prompt   │    ← 步骤 4a/4b/4c：并行     │
 │   │   shot_sound_design   │                               │
 │   └──────────┬────────────┘                               │
 │              ▼                                            │
 │      merge_shot_script         ← 步骤 5：合并            │
 │                                                           │
 └───────────────────────────────────────────────────────────┘
           │
           ▼
   persist_director_artifacts     ← 持久化
```

### LLM 调用计数

对于 N 个场次，每个场次 M 个镜头：

| 步骤 | 调用次数 | 单次 token 压力 | 说明 |
|------|---------|----------------|------|
| analyze_characters | 1 | 中 | 复用现有 |
| analyze_locations | 1 | 中 | 复用现有 |
| split_scenes | 1 | 低 | 只切分场次边界 |
| scene_to_events (×N) | N | 中 | 每场次独立，输出事件列表 |
| events_to_storyboard (×N) | N | 中 | 每场次独立，输出分镜列表 |
| shot_image_prompt (×N) | N | 中 | 每场次的所有镜头图片提示词 |
| shot_video_prompt (×N) | N | 中 | 每场次的所有镜头视频提示词 |
| shot_sound_design (×N) | N | 低 | 每场次的音效设计 |
| **总计** | **5N + 3** | | 4 场次 = 23 次调用 |

vs 旧方案只有 3 次调用但每次极重。

---

## 三、入口 UI 设计

### 触发方式

在项目创建完成后进入工作区 `ConfigStage` 页面时，在现有「开始创作」按钮旁边新增一个「导演模式」按钮。

### 涉及文件

| 文件 | 改动 |
|------|------|
| `NovelInputStage.tsx` | 在 `primaryAction` 区域新增「导演模式」按钮 |
| `messages/zh/novel-promotion.json` | 新增 `smartImport.directorMode.button` = "导演模式" |
| `messages/en/novel-promotion.json` | 新增 `smartImport.directorMode.button` = "Director Mode" |
| `useWorkspaceExecution.ts` | 新增 `runDirectorModeFlow()` |
| `useWorkspaceStageRuntime.ts` | 新增 `onRunDirectorMode` 回调 |

### 按钮布局

```tsx
primaryAction={(
  <div className="flex items-center gap-3">
    <button onClick={handleStartClick} ...>
      <span>{t("smartImport.manualCreate.button")}</span>
    </button>
    <button onClick={handleDirectorModeClick} ...>
      <AppIcon name="film" />
      <span>{t("smartImport.directorMode.button")}</span>
    </button>
  </div>
)}
```

可见条件：项目已创建 + `hasContent` + `!isSubmittingTask`

---

## 四、DAG 工作流定义

### 新增 Task Type

```typescript
// src/lib/task/types.ts
DIRECTOR_MODE_RUN = 'director_mode_run'
```

### 工作流定义

```typescript
// src/lib/workflow-engine/director-mode-definition.ts

export const DIRECTOR_MODE_DEFINITION: WorkflowDefinition = {
  workflowType: TASK_TYPE.DIRECTOR_MODE_RUN,
  orderedSteps: [
    // ── 阶段 0：资产分析（并行）──
    {
      key: 'analyze_characters',
      dependsOn: [],
      retryable: true,
      artifactTypes: ['analysis.characters'],
      failureMode: 'fail_run',
    },
    {
      key: 'analyze_locations',
      dependsOn: [],
      retryable: true,
      artifactTypes: ['analysis.locations'],
      failureMode: 'fail_run',
    },

    // ── 阶段 1：场次切分（依赖分析）──
    {
      key: 'split_scenes',
      dependsOn: ['analyze_characters', 'analyze_locations'],
      retryable: true,
      artifactTypes: ['director.scenes.split'],
      failureMode: 'fail_run',
    },

    // ── 阶段 2：场次→事件（按场次并行，内部 per-scene 动态创建子步骤）──
    {
      key: 'scene_to_events',
      dependsOn: ['split_scenes'],
      retryable: true,
      artifactTypes: ['director.scene.events'],
      failureMode: 'fail_run',
    },

    // ── 阶段 3：事件→分镜（按场次并行）──
    {
      key: 'events_to_storyboard',
      dependsOn: ['scene_to_events'],
      retryable: true,
      artifactTypes: ['director.scene.storyboard'],
      failureMode: 'fail_run',
    },

    // ── 阶段 4：分镜→脚本细化（按场次并行，内部 3 Phase 并行）──
    {
      key: 'shot_detail',
      dependsOn: ['events_to_storyboard'],
      retryable: true,
      artifactTypes: [
        'director.scene.shot.image',
        'director.scene.shot.video',
        'director.scene.shot.sound',
      ],
      failureMode: 'fail_run',
    },

    // ── 阶段 5：持久化 ──
    {
      key: 'persist_director_artifacts',
      dependsOn: ['shot_detail'],
      retryable: false,
      artifactTypes: [],
      failureMode: 'fail_run',
    },
  ],

  resolveRetryInvalidationStepKeys: ({ stepKey, existingStepKeys }) => {
    const cascade: Record<string, string[]> = {
      analyze_characters: [
        'split_scenes', 'scene_to_events', 'events_to_storyboard',
        'shot_detail', 'persist_director_artifacts',
      ],
      analyze_locations: [
        'split_scenes', 'scene_to_events', 'events_to_storyboard',
        'shot_detail', 'persist_director_artifacts',
      ],
      split_scenes: [
        'scene_to_events', 'events_to_storyboard',
        'shot_detail', 'persist_director_artifacts',
      ],
      scene_to_events: [
        'events_to_storyboard', 'shot_detail', 'persist_director_artifacts',
      ],
      events_to_storyboard: [
        'shot_detail', 'persist_director_artifacts',
      ],
      shot_detail: [
        'persist_director_artifacts',
      ],
    }
    return (cascade[stepKey] || []).filter(k => existingStepKeys.includes(k))
  },
}
```

### Sub-Step ID 命名规则（遵循现有模式）

```
scene_{sceneId}_events              → 场次N的事件生成
scene_{sceneId}_storyboard          → 场次N的分镜生成
scene_{sceneId}_shot_image          → 场次N的图片提示词
scene_{sceneId}_shot_video          → 场次N的视频提示词
scene_{sceneId}_shot_sound          → 场次N的音效设计
```

---

## 五、编排器详细设计

### 步骤 1：split_scenes（场次切分）

**职责**：将原文按时间+地点切分为独立场次，生成场次边界

**LLM 输入**：原文 + 角色列表 + 场景列表
**LLM 输出**：场次列表（每个场次标注起止文本、时间、地点、出场角色）
**单次 token 压力**：低（只做切分，不做内容转换）

```typescript
// Artifact
createArtifact({
  stepKey: 'split_scenes',
  artifactType: 'director.scenes.split',
  refId: episodeId,
  payload: {
    scenes: [
      {
        scene_id: 'scene_1',
        scene_number: 1,
        time: '白天',
        location: '小学走廊',
        characters: ['小蓝', '小仪'],
        content: '从前，在一所小学里...另一个叫小仪。',
        start_text: '从前，在一所小学里',
        end_text: '另一个叫小仪',
      },
      // ...
    ],
  },
})
```

### 步骤 2：scene_to_events（场次→事件）—— 按场次并行

**职责**：将每个场次的文本转换为「可拍摄的物理动作事件」列表
**并行**：`mapWithConcurrency(scenes, concurrency, ...)`

**每个场次的 LLM 输入**：单个场次文本 + 出场角色 + 场景描述
**每个场次的 LLM 输出**：事件列表 + 对白列表

```typescript
// Per-scene artifact
createArtifact({
  stepKey: `scene_${sceneId}_events`,
  artifactType: 'director.scene.events',
  refId: sceneId,
  payload: {
    scene_number: 1,
    events: [
      {
        event_number: 1,
        description: '小蓝和小仪并肩行走，两人视线向前。',
      },
    ],
    dialogues: [
      { after_event: 3, speaker: '妈妈', line: '发生了什么事？' },
    ],
  },
})
```

### 步骤 3：events_to_storyboard（事件→分镜）—— 按场次并行

**职责**：将每个场次的事件列表转换为分镜列表（含时长、画面信息、绝对位置、行为、对白）
**并行**：`mapWithConcurrency(scenes, concurrency, ...)`

**每个场次的 LLM 输入**：场次事件 JSON + 角色完整描述 + 场景完整描述
**每个场次的 LLM 输出**：分镜数组

```typescript
// Per-scene artifact
createArtifact({
  stepKey: `scene_${sceneId}_storyboard`,
  artifactType: 'director.scene.storyboard',
  refId: sceneId,
  payload: {
    shots: [
      {
        shot_number: 1,
        time: '白天',
        duration_seconds: 10,
        scene_name: '小学走廊',
        shot_info: '中景 + 明亮安静走廊氛围 + 侧面跟拍缓慢平移...',
        characters_present: ['小蓝', '小仪'],
        absolute_position: '小蓝在画面左侧，小仪在画面右侧...',
        character_action: '小蓝和小仪并肩匀速向前行走...',
        dialogue_info: '无',
        source_events: [1],
      },
    ],
  },
})
```

### 步骤 4：shot_detail（分镜→脚本细化）—— 按场次并行，内部 3 Phase 并行

**职责**：为每个场次的所有镜头生成完整脚本细节。内部拆分为 3 个独立 Phase，用 `Promise.all` 并行：

| Phase | 职责 | LLM 输入 | LLM 输出 |
|-------|------|---------|---------|
| **4a: shot_image_prompt** | 4 格关键帧图片提示词 | 分镜 JSON + 角色外貌 + 场景描述 | 每个镜头的 global_position + 4 格 image_prompt |
| **4b: shot_video_prompt** | 视频提示词 | 分镜 JSON + 角色年龄性别 | 每个镜头的 video_prompt + shot_caption |
| **4c: shot_sound_design** | 音效 + 语音分镜 | 分镜 JSON + 角色列表 + 音色配置 | 每个镜头的 sound_effect + voice_speaker |

```typescript
// 按场次并行
await mapWithConcurrency(scenes, concurrency, async (scene) => {
  const storyboardArtifact = /* 读取步骤3的 artifact */

  // Phase 4a, 4b, 4c 并行
  const [imageResult, videoResult, soundResult] = await Promise.all([
    runStepWithRetry(runStep, shotImageMeta, imagePromptTemplate, ...),
    runStepWithRetry(runStep, shotVideoMeta, videoPromptTemplate, ...),
    runStepWithRetry(runStep, shotSoundMeta, soundDesignTemplate, ...),
  ])

  // 合并到单个场次的结果
  const mergedShots = mergeDirectorShots({
    storyboard: storyboardArtifact.shots,
    imagePrompts: imageResult,
    videoPrompts: videoResult,
    soundDesign: soundResult,
  })

  // 写入 artifacts
  createArtifact({ stepKey: `scene_${sceneId}_shot_image`, ... })
  createArtifact({ stepKey: `scene_${sceneId}_shot_video`, ... })
  createArtifact({ stepKey: `scene_${sceneId}_shot_sound`, ... })
})
```

### 步骤 5：persist_director_artifacts

读取所有场次的 artifact，写入 DB（DirectorScript / DirectorStoryboard / DirectorShot）。

---

## 六、LLM 调用复杂度对比

以用户示例（4 个场次，12 个镜头）为例：

### 旧方案（3 大块）

| 步骤 | 调用次数 | 单次输出 token | 风险 |
|------|---------|---------------|------|
| A: 故事→剧本 | 1 | ~3000 | 中 |
| B: 剧本→分镜 | 1 | ~4000 | 高（12 个镜头的绝对位置+行为） |
| C: 分镜→脚本 | 1 | ~12000 | **极高**（12×4格图+12视频+12音效） |
| **总计** | **3** | **~19000** | 单步 C 极易超 token 或质量下降 |

### 新方案（多步细分）

| 步骤 | 调用次数 | 单次输出 token | 风险 |
|------|---------|---------------|------|
| analyze_characters | 1 | ~800 | 低 |
| analyze_locations | 1 | ~500 | 低 |
| split_scenes | 1 | ~600 | 低 |
| scene_to_events ×4 | 4 | ~800 | 低 |
| events_to_storyboard ×4 | 4 | ~1200 | 中 |
| shot_image_prompt ×4 | 4 | ~2000 | 中 |
| shot_video_prompt ×4 | 4 | ~1500 | 中 |
| shot_sound_design ×4 | 4 | ~600 | 低 |
| **总计** | **23** | 每次 ≤2000 | **每次调用都在安全范围内** |

**并行加速**：4 个场次同时处理，Phase 4a/4b/4c 同时处理 → 实际耗时约等于 5 次串行调用。

---

## 七、数据库模型

```prisma
// prisma/schema.prisma

model DirectorScript {
  id              String   @id @default(cuid())
  episodeId       String   @unique
  episode         NovelPromotionEpisode @relation(fields: [episodeId], references: [id], onDelete: Cascade)
  sceneCount      Int
  scriptJson      String   @db.Text
  characterInfo   String?  @db.Text
  locationInfo    String?  @db.Text
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  storyboard      DirectorStoryboard?
}

model DirectorStoryboard {
  id              String   @id @default(cuid())
  scriptId        String   @unique
  script          DirectorScript @relation(fields: [scriptId], references: [id], onDelete: Cascade)
  shotCount       Int
  storyboardJson  String   @db.Text
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  shots           DirectorShot[]
}

model DirectorShot {
  id                String   @id @default(cuid())
  storyboardId      String
  storyboard        DirectorStoryboard @relation(fields: [storyboardId], references: [id], onDelete: Cascade)
  shotIndex         Int

  shotCaption       String?  @db.Text     // 角色名-情绪:台词
  globalPosition    String?  @db.Text     // 全局空间位置
  imagePromptLT     String?  @db.Text     // 左上关键帧
  imagePromptRT     String?  @db.Text     // 右上关键帧
  imagePromptLB     String?  @db.Text     // 左下关键帧
  imagePromptRB     String?  @db.Text     // 右下关键帧
  videoPrompt       String?  @db.Text
  shotType          String?
  voiceSpeaker      String?
  soundEffect       String?  @db.Text

  imageUrl          String?
  imageMediaId      String?
  videoUrl          String?
  videoMediaId      String?
  voiceUrl          String?
  voiceMediaId      String?

  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  @@unique([storyboardId, shotIndex])
}
```

---

## 八、Prompt 模板设计（6 个 Prompt）

### 占位符约定

| 占位符 | 说明 |
|--------|------|
| `{input}` | 用户输入的原文 |
| `{scene_content}` | 单个场次的文本内容 |
| `{scene_time}` | 场次时间 |
| `{scene_location}` | 场次地点 |
| `{scene_characters}` | 场次出场角色列表 |
| `{scene_events_json}` | 步骤 2 输出的场次事件 JSON |
| `{scene_storyboard_json}` | 步骤 3 输出的场次分镜 JSON |
| `{characters_lib_name}` | 角色名称列表 |
| `{characters_introduction}` | 角色介绍文本 |
| `{characters_full_description}` | 角色完整外貌描述 |
| `{characters_age_gender}` | 角色年龄性别 |
| `{characters_voice_config}` | 角色音色配置 |
| `{locations_lib_name}` | 场景名称列表 |
| `{locations_description}` | 场景完整描述 |

---

### Prompt 1：director_split_scenes（场次切分）

文件：`lib/prompts/novel-promotion/director_split_scenes.zh.txt`

```
你是专业的影视编剧助手。你的唯一任务是将小说文本按照「时空变化」切分为独立的场次（Scene）。

⚠️ 你只做切分，不做任何内容改写或格式转换。

【切分规则】

1. **地点变化 → 新场次**
   - 「回到家后」→ 新场次（地点从学校变为家）
   - 「走在回家的路上」→ 新场次（地点从教室变为回家路上）

2. **时间跳跃 → 新场次**
   - 「第二天早上」→ 新场次
   - 「傍晚」→ 如果前面是白天事件则新场次

3. **同一时空 → 同一场次**
   - 同一间教室内连续发生的事 = 同一场次
   - 多个角色在同一地点的互动 = 同一场次

4. **场景名称匹配**
   - 优先从场景资产库中选择完全一致的名称
   - 如果资产库没有匹配的，使用原文中合理的场景名

5. **角色识别**
   - 列出每个场次中明确出现的角色
   - 角色名称必须与资产库一致
   - 禁止使用代词，必须用具体名字

6. **原文定位**
   - start_text / end_text 必须是原文中可精确定位的片段
   - content 必须是原文的精确摘取，禁止改写

【时间标记选项】
白天 | 上午 | 正午 | 下午 | 傍晚 | 夜晚 | 深夜 | 清晨

【输出格式】

只返回 JSON 对象，不得有 markdown 代码块标记、注释或解释。

{
  "scenes": [
    {
      "scene_id": "scene_1",
      "scene_number": 1,
      "time": "白天",
      "location": "小学走廊",
      "characters": ["小蓝", "小仪"],
      "start_text": "从前，在一所小学里",
      "end_text": "另一个叫小仪",
      "content": "从前，在一所小学里，有两个形影不离的好朋友，一个叫小蓝，另一个叫小仪。"
    }
  ]
}

【严格要求】

1. 只做切分，不改写任何原文内容
2. content 必须是原文的精确片段
3. start_text / end_text 必须在原文中可精确定位
4. 场景名称优先从资产库选择
5. 角色名称优先从资产库选择
6. 只返回 JSON 对象
7. ⚠️ JSON 安全：所有引号在 JSON 字符串值中替换为「」

【输入数据】

原文内容：
{input}

角色资产库：{characters_lib_name}
场景资产库：{locations_lib_name}

角色介绍：
{characters_introduction}
```

---

### Prompt 2：director_scene_to_events（场次→事件）

文件：`lib/prompts/novel-promotion/director_scene_to_events.zh.txt`

```
你是专业的导演。你的任务是将一个场次的文本转换为「可拍摄的物理动作事件」列表。

⚠️⚠️⚠️【最高优先级 - 100%忠实原文】⚠️⚠️⚠️

🚫 绝对禁止：添加原文中没有的动作、对话、场景
✅ 你必须做：将叙述性描述转换为「摄像机可拍摄的物理动作」

【核心概念】

**事件（Event）**= 一个可拍摄的物理动作单元
- 每个事件必须是摄像机能看到的东西
- 禁止出现抽象描述（如「感到悲伤」→ 应为「低头，视线看向地面」）

【物理动作描述规范】

每个事件必须包含以下维度（至少 2 个）：

| 维度 | 示例 |
|------|------|
| 身体位移 | 走向沙发、从座位站起、走进门内 |
| 肢体动作 | 举起右手、双臂环抱、将手放下 |
| 身体朝向 | 身体转向老师方向、面朝前方 |
| 视线方向 | 视线看向试卷、视线低垂看向地面 |
| 面部微动作 | 嘴唇微动（说话必备）、眉头轻皱 |
| 物体交互 | 接过试卷、手掌轻放在头顶 |

⚠️ 禁止出现的抽象词：感到、觉得、认为、想着、心里、温柔地、愤怒地、悲伤地

【转换示例】

原文：「妈妈温柔地摸摸小蓝的头，轻声问她发生了什么事。」

✅ 正确拆解：
- 事件1：妈妈从画面一侧走向沙发。妈妈走到小蓝身旁停下。妈妈伸出右手，手掌轻放在小蓝头顶。
- 事件2：妈妈嘴唇微动。
- 对白：妈妈：发生了什么事？

原文：「小蓝觉得好失落，低着头闷闷不乐地坐在沙发上。」

✅ 正确拆解：
- 事件1：小蓝走到沙发旁坐下，身体前倾，低头，视线看向地面。

【对白处理规则】

1. 直接引语 → 保留原文台词
2. 间接引语 → 转述为对白
3. 心理活动 → [旁白]
4. 对白必须紧跟在包含「嘴唇微动」的事件之后

【输出格式】

只返回 JSON 对象，不得有 markdown 代码块标记、注释或解释。

{
  "scene_id": "{scene_id}",
  "events": [
    {
      "event_number": 1,
      "description": "小仪坐在座位上，举起右手。小蓝坐在另一座位，举起右手。老师站在讲台后，视线看向小仪，右手抬起指向小仪。"
    },
    {
      "event_number": 2,
      "description": "小仪从座位站起，身体转向老师方向，嘴唇微动。老师视线注视小仪。"
    }
  ],
  "dialogues": [
    {
      "after_event": 2,
      "speaker": "小仪",
      "line": "（回答老师的问题）"
    }
  ]
}

【严格要求】

1. 🚨 禁止编造！所有事件必须源自原文
2. 🚨 description 只能是物理动作
3. 🚨 对白必须有对应「嘴唇微动」事件
4. 原文简短则输出也简短，禁止扩写
5. 角色名称与资产库一致
6. 只返回 JSON 对象
7. ⚠️ JSON 安全：所有引号替换为「」

【输入数据】

场次内容：
{scene_content}

场次时间：{scene_time}
场次地点：{scene_location}
出场角色：{scene_characters}

角色资产库：{characters_lib_name}
场景资产库：{locations_lib_name}

角色介绍：
{characters_introduction}

场次 ID：{scene_id}
```

---

### Prompt 3：director_events_to_storyboard（事件→分镜）

文件：`lib/prompts/novel-promotion/director_events_to_storyboard.zh.txt`

```
你是专业的分镜设计师。你的任务是将一个场次的事件列表转化为分镜，每个分镜包含时长、画面信息、角色绝对位置、角色行为和对白。

【核心原则】

⚠️ 每个分镜 = 一个连续镜头，时长 5-15 秒
⚠️ 角色位置用「绝对位置」描述（画面左侧/右侧/中央）
⚠️ 画面信息 = 景别 + 氛围 + 镜头运动
⚠️ 分镜之间保持空间连续性

【事件→分镜映射规则】

- 1 个简单事件 → 1 个分镜
- 1 个复杂事件（多角色同时动作）→ 1-2 个分镜
- 连续对话事件 → 按说话人切换拆分
- 新场次第一个分镜应是全景/中景「建立镜头」

【分镜时长设定】

| 类型 | 时长 |
|------|------|
| 简单动作（走路、转头） | 5-8 秒 |
| 中等复杂度（发试卷、拥抱） | 10-15 秒 |
| 纯情绪/氛围镜头 | 8-10 秒 |

【画面信息（shot_info）格式】

必须包含三个部分：

```
景别 + 氛围描述 + 详细镜头运动描述
```

景别选项：全景 | 中景 | 近景 | 特写
氛围示例：明亮安静的走廊氛围 | 傍晚昏暗氛围 | 温馨客厅氛围

⚠️ 镜头运动必须具体：
✅「摄影机从侧面跟拍，缓慢平移，跟随两人行走，同时镜头轻微推进」
❌「跟拍」

镜头运动词库：跟拍、推镜头、拉镜头、摇镜头、平移、环绕、固定机位

【绝对位置（absolute_position）规则】

每个角色必须指定：
1. 画面位置：左侧 / 右侧 / 中央 / 偏左 / 偏右
2. 面朝方向
3. 姿态：站立 / 坐下 / 行走

✅「小蓝在画面左侧，小仪在画面右侧，两人并肩站立，面朝前方（走廊深处）。」
❌「两个角色在画面中」

⚠️ 位置连续性：
- 相邻分镜同一角色位置不能突变（除非有明确移动事件）
- 同场次内角色的画面左右关系保持一致

【输出格式】

只返回 JSON 数组。

[
  {
    "shot_number": 1,
    "time": "白天",
    "duration_seconds": 10,
    "scene_name": "小学走廊",
    "shot_info": "中景 + 明亮安静走廊氛围 + 摄影机从侧面跟拍，缓慢平移...",
    "characters_present": ["小蓝", "小仪"],
    "absolute_position": "小蓝在画面左侧，小仪在画面右侧...",
    "character_action": "小蓝和小仪并肩匀速向前行走...",
    "dialogue_info": "无",
    "source_events": [1]
  }
]

【严格要求】

1. absolute_position 精确到画面左/右/中，含面朝方向和姿态
2. 相邻分镜位置连续
3. shot_info 含景别 + 氛围 + 详细镜头运动
4. duration_seconds 在 5-15 之间
5. character_action 只允许物理动作
6. 场景名称 / 角色名称与资产库一致
7. 只返回 JSON 数组
8. ⚠️ JSON 安全：所有引号替换为「」

【输入数据】

场次事件 JSON：
{scene_events_json}

场次时间：{scene_time}
场次地点：{scene_location}

角色资产库：{characters_lib_name}
场景资产库：{locations_lib_name}

角色完整描述：
{characters_full_description}

场景完整描述：
{locations_description}

角色介绍：
{characters_introduction}
```

---

### Prompt 4a：director_shot_image_prompt（镜头图片提示词）

文件：`lib/prompts/novel-promotion/director_shot_image_prompt.zh.txt`

```
你是顶级分镜师和图片提示词工程师。你的任务是为一个场次的所有镜头生成「全局物理空间位置」和「4 格关键帧图片提示词」。

【核心概念 - 4 格关键帧】

每个镜头（5-15 秒）拆为 4 个时间切片：

┌──────────┬──────────┐
│  左上(LT) │  右上(RT) │  ← 前半段
├──────────┼──────────┤
│  左下(LB) │  右下(RB) │  ← 后半段
└──────────┴──────────┘

- 左上：镜头起始（0-25%）
- 右上：动作发展（25-50%）
- 左下：动作高潮（50-75%）
- 右下：镜头结束（75-100%）

4 格是同一镜头的 4 个时间切片，不是 4 个不同镜头。

【全局物理空间位置（global_position）】

在 4 格之前，声明当前镜头的空间布局：
1. 场景名称
2. 每个角色的初始位置和朝向
3. 角色间的相对关系
4. 镜头拍摄位置

必须与输入分镜的 absolute_position 完全一致。使用角色原名。

✅ 示例：
「教室内纵深构图，讲台位于画面上方偏中；老师站在讲台后偏中位置，面朝下方学生座位区；小仪坐在画面偏左的座位上，面朝讲台方向举起右手；小蓝坐在画面偏右的座位上，面朝讲台方向举起右手；镜头由后向前推进。」

【4 格图片提示词撰写规则】

每张约 100-200 字，完整自包含：

1. 景别（与 shot_info 一致）
2. 场景环境（时间、光线、氛围）
3. 所有角色的完整状态（位置、姿态、动作、可见细节）
4. 摄影机位置和角度
5. 与上一帧的变化说明（右上/左下/右下必须说明变化）

⚠️ 连续性规则：
- 角色画面左右关系在 4 格中一致
- 角色动作在 4 格中渐进发展
- 景别可渐进变化（中景→近景）
- 光线色调一致

⚠️ 图片提示词中使用角色原名（不用年龄性别替代）。

⚠️ 禁止抽象描述：
❌「气氛紧张」→ ✅「小蓝眉头微皱，双手攥紧试卷边缘」

【单张图提示词模板】

```
[景别]，[场景名]，[时间/光线]，[光线细节]。
摄影机[位置和角度]。
[角色A]在画面[位置]，[姿态/动作]，[视线/表情]。
[角色B]在画面[位置]，[姿态/动作]，[视线/表情]。
[环境元素]。
[与前一帧变化]（右上/左下/右下需要）。
```

【输出格式】

只返回 JSON 数组。

[
  {
    "shot_number": 1,
    "global_position": "小学走廊内横向构图...",
    "image_prompt_lt": "中景，小学走廊，白天...",
    "image_prompt_rt": "中景，小学走廊，白天...",
    "image_prompt_lb": "中景，小学走廊，白天...",
    "image_prompt_rb": "中景，小学走廊，白天..."
  }
]

【严格要求】

1. 每个镜头必须有 4 格，禁止缺失
2. 4 格之间体现时间连续性
3. 角色左右关系在 4 格中一致
4. global_position 与输入分镜的 absolute_position 一致
5. 图片提示词使用角色原名
6. 禁止抽象描述
7. 只返回 JSON 数组
8. ⚠️ JSON 安全：所有引号替换为「」

【输入数据】

场次分镜 JSON：
{scene_storyboard_json}

角色完整描述（外貌、服装、五官）：
{characters_full_description}

场景完整描述：
{locations_description}
```

---

### Prompt 4b：director_shot_video_prompt（镜头视频提示词）

文件：`lib/prompts/novel-promotion/director_shot_video_prompt.zh.txt`

```
你是顶级视频提示词工程师。你的任务是为一个场次的所有镜头生成视频提示词和镜头文案。

【视频提示词撰写规则】

⚠️ 视频提示词中用「年龄段+性别」替代角色名：
- 少年/少女：约 10-16 岁
- 年轻男子/年轻女子：约 17-30 岁
- 中年男子/中年女子：约 31-50 岁
- 老年男子/老年女子：50 岁以上

格式：按时间顺序分「第一个镜头」「第二个镜头」...逐段描述：

「第一个镜头，摄影机以中景平视机位固定在走廊中两人右侧略后方，少年在左，少女在右...准备向前走。第二个镜头，摄影机开始与两人一起向前平移跟随...手臂自然前后摆动。第三个镜头，...。最后一个镜头，...。」

每段必须包含：
1. 摄影机位置和运动
2. 角色动作发展过程
3. 环境音提示（脚步声、摩擦声等）
4. 如有对白：[角色年龄性别描述：台词]

⚠️ 动态优先：
- 每段必须有「动」的元素
- 禁止纯静态
- 对话场景也要加微动作（呼吸起伏、手势、微转头）

【镜头文案（shot_caption）规则】

该镜头需要录制的语音台词：
- 有对白：「角色名-情绪:台词」如「妈妈-关心:发生了什么事？」
- 有旁白：「旁白-情绪:内容」如「旁白-悲伤:难道老师也觉得我很笨吗？」
- 无语音：「无」

情绪标签：平静 | 开心 | 悲伤 | 愤怒 | 惊讶 | 担忧 | 关心 | 感动 | 害怕 | 期待

【输出格式】

只返回 JSON 数组。

[
  {
    "shot_number": 1,
    "shot_caption": "无",
    "video_prompt": "第一个镜头，摄影机以中景平视机位..."
  }
]

【严格要求】

1. video_prompt 中用年龄性别替代角色名
2. 每段视频描述必须有动态元素
3. shot_caption 严格遵循「角色名-情绪:台词」格式
4. shot_number 与输入分镜一一对应
5. 只返回 JSON 数组
6. ⚠️ JSON 安全：所有引号替换为「」

【输入数据】

场次分镜 JSON：
{scene_storyboard_json}

角色年龄性别：
{characters_age_gender}

角色介绍：
{characters_introduction}
```

---

### Prompt 4c：director_shot_sound_design（镜头音效设计）

文件：`lib/prompts/novel-promotion/director_shot_sound_design.zh.txt`

```
你是专业的影视音效设计师。你的任务是为一个场次的所有镜头设计环境音效，并指定语音分镜角色。

【音效撰写规则】

描述每个镜头中应该出现的环境音和动作音效：

1. 具体到声源和声音特征
2. 说明音量关系（主要/次要/背景/极轻）
3. 与画面动作同步

✅ 正确：
「教室内安静环境声，偶有纸张轻微翻动声、笔轻触桌面的声音，远处走廊模糊脚步声，整体背景安静有秩序。」

❌ 错误：
「环境音」「安静」

【音效类型参考】

| 场景类型 | 典型音效 |
|---------|---------|
| 教室 | 纸张翻动、笔触桌面、椅子轻响、远处走廊脚步 |
| 走廊 | 鞋底摩擦声、远处说话的模糊人声、门开关声 |
| 街道 | 脚步声、远处车辆、风声、树叶沙沙声 |
| 客厅 | 沙发受压声、脚步踩地板声、空调底噪、衣料摩擦 |
| 对话 | 说话者人声、呼吸声、衣料摩擦、环境底噪 |

【语音分镜（voice_speaker）规则】

- 有角色对白 → 填角色名
- 有旁白 → 填「旁白」
- 无语音 → 填「旁白」
- 多人说话时以主要说话人为准

【输出格式】

只返回 JSON 数组。

[
  {
    "shot_number": 1,
    "voice_speaker": "旁白",
    "sound_effect": "安静走廊里的细碎脚步声，橡胶鞋底与地面轻微摩擦声，远处若有同学说话的模糊环境人声..."
  }
]

【严格要求】

1. sound_effect 必须具体，禁止笼统描述
2. 与画面动作同步（需参考分镜中的 character_action）
3. voice_speaker 必须是具体角色名或「旁白」
4. shot_number 与输入分镜一一对应
5. 只返回 JSON 数组
6. ⚠️ JSON 安全：所有引号替换为「」

【输入数据】

场次分镜 JSON：
{scene_storyboard_json}

角色资产库：{characters_lib_name}

角色音色配置：
{characters_voice_config}
```

---

## 九、API 路由 & Worker

### API 路由

文件：`src/app/api/novel-promotion/[projectId]/director-mode-stream/route.ts`

```typescript
export const POST = apiHandler(async (request, context) => {
  const { projectId } = await context.params
  const session = await requireAuth()
  const body = await request.json()

  const asyncTaskResponse = await maybeSubmitLLMTask({
    request,
    userId: session.user.id,
    projectId,
    episodeId: body.episodeId,
    type: TASK_TYPE.DIRECTOR_MODE_RUN,
    targetType: 'NovelPromotionEpisode',
    targetId: body.episodeId,
    routePath: `/api/novel-promotion/${projectId}/director-mode-stream`,
    body: { ...body, displayMode: 'detail' },
    dedupeKey: `director_mode_run:${body.episodeId}`,
    priority: 2,
  })

  return asyncTaskResponse
})
```

### Worker 派遣

`src/lib/workers/text.worker.ts` 新增 case：

```typescript
case TASK_TYPE.DIRECTOR_MODE_RUN:
  return await handleDirectorModeTask(job)
```

### Handler 内部按场次并行

```typescript
// handlers/director-mode.ts（简化伪代码）

async function handleDirectorModeTask(job) {
  // 1. 加载 prompt 模板（6 个）
  const templates = loadDirectorPromptTemplates(job.data.locale)

  // 2. analyze_characters + analyze_locations（并行，复用现有）
  const [characters, locations] = await Promise.all([
    runStep(analyzeCharactersMeta, characterPrompt, ...),
    runStep(analyzeLocationsMeta, locationPrompt, ...),
  ])

  // 3. split_scenes
  const scenes = await runStep(splitScenesMeta, splitPrompt, ...)

  // 4. 按场次并行处理 scene_to_events
  const eventsPerScene = await mapWithConcurrency(scenes, concurrency, async (scene) => {
    return await runStepWithRetry(
      runStep,
      { stepId: `scene_${scene.scene_id}_events`, ... },
      eventPrompt.replace('{scene_content}', scene.content),
      ...
    )
  })

  // 5. 按场次并行处理 events_to_storyboard
  const storyboardPerScene = await mapWithConcurrency(scenes, concurrency, async (scene, i) => {
    return await runStepWithRetry(
      runStep,
      { stepId: `scene_${scene.scene_id}_storyboard`, ... },
      storyboardPrompt.replace('{scene_events_json}', JSON.stringify(eventsPerScene[i])),
      ...
    )
  })

  // 6. 按场次并行处理 shot_detail（内部 3 phase 并行）
  const shotResults = await mapWithConcurrency(scenes, concurrency, async (scene, i) => {
    const [imageResult, videoResult, soundResult] = await Promise.all([
      runStepWithRetry(runStep,
        { stepId: `scene_${scene.scene_id}_shot_image`, ... },
        imagePrompt, ...),
      runStepWithRetry(runStep,
        { stepId: `scene_${scene.scene_id}_shot_video`, ... },
        videoPrompt, ...),
      runStepWithRetry(runStep,
        { stepId: `scene_${scene.scene_id}_shot_sound`, ... },
        soundPrompt, ...),
    ])

    return mergeDirectorShots(storyboardPerScene[i], imageResult, videoResult, soundResult)
  })

  // 7. persist
  await persistDirectorArtifacts(shotResults)
}
```

---

## 十、完整文件清单

### 新增文件

| # | 文件路径 | 用途 |
|---|---------|------|
| 1 | `lib/prompts/novel-promotion/director_split_scenes.zh.txt` | Prompt 1 中文 |
| 2 | `lib/prompts/novel-promotion/director_split_scenes.en.txt` | Prompt 1 英文 |
| 3 | `lib/prompts/novel-promotion/director_scene_to_events.zh.txt` | Prompt 2 中文 |
| 4 | `lib/prompts/novel-promotion/director_scene_to_events.en.txt` | Prompt 2 英文 |
| 5 | `lib/prompts/novel-promotion/director_events_to_storyboard.zh.txt` | Prompt 3 中文 |
| 6 | `lib/prompts/novel-promotion/director_events_to_storyboard.en.txt` | Prompt 3 英文 |
| 7 | `lib/prompts/novel-promotion/director_shot_image_prompt.zh.txt` | Prompt 4a 中文 |
| 8 | `lib/prompts/novel-promotion/director_shot_image_prompt.en.txt` | Prompt 4a 英文 |
| 9 | `lib/prompts/novel-promotion/director_shot_video_prompt.zh.txt` | Prompt 4b 中文 |
| 10 | `lib/prompts/novel-promotion/director_shot_video_prompt.en.txt` | Prompt 4b 英文 |
| 11 | `lib/prompts/novel-promotion/director_shot_sound_design.zh.txt` | Prompt 4c 中文 |
| 12 | `lib/prompts/novel-promotion/director_shot_sound_design.en.txt` | Prompt 4c 英文 |
| 13 | `src/lib/workflow-engine/director-mode-definition.ts` | 工作流定义 |
| 14 | `src/lib/novel-promotion/director-mode/orchestrator.ts` | 编排器 |
| 15 | `src/lib/workers/handlers/director-mode.ts` | Worker handler |
| 16 | `src/app/api/novel-promotion/[projectId]/director-mode-stream/route.ts` | API |

### 需修改的文件

| # | 文件路径 | 改动 |
|---|---------|------|
| 1 | `src/lib/task/types.ts` | +DIRECTOR_MODE_RUN |
| 2 | `src/lib/workflow-engine/registry.ts` | 注册工作流 |
| 3 | `src/lib/workers/text.worker.ts` | +switch case |
| 4 | `prisma/schema.prisma` | +3 model |
| 5 | `NovelInputStage.tsx` | +按钮 |
| 6 | `useWorkspaceExecution.ts` | +执行函数 |
| 7 | `useWorkspaceStageRuntime.ts` | +回调 |
| 8 | `messages/zh/novel-promotion.json` | +i18n |
| 9 | `messages/en/novel-promotion.json` | +i18n |

---

## 十一、实施优先级

| 阶段 | 内容 | 验证方式 |
|------|------|---------|
| **P0** | TaskType + 工作流定义 + DB模型 + API路由 + Worker | 管道打通 |
| **P1** | Prompt 1 (split_scenes) + 编排步骤 | 输入原文 → 输出场次 JSON |
| **P2** | Prompt 2 (scene_to_events) + 按场次并行 | 输入场次 → 输出事件 JSON |
| **P3** | Prompt 3 (events_to_storyboard) | 输入事件 → 输出分镜 JSON |
| **P4** | Prompt 4a/4b/4c + Promise.all 并行 | 输入分镜 → 输出完整脚本 |
| **P5** | UI 按钮 + Hook + i18n | 前端入口 |
| **P6** | 结果展示 UI | 可视化 |
