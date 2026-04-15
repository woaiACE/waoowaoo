# waoowaoo — "固定 IP 角色模式" 架构设计方案

> 核心原则：**双轨并行**。现有的自由生成流程零改动，IP 模式作为独立的新增模块平滑接入。

---

## 一、现有架构关键连接点总结

在设计之前，先明确现有系统中可被 IP 模式复用或扩展的锚点：

| 现有组件 | IP 模式中的角色 | 复用策略 |
|---------|---------------|---------|
| `GlobalCharacter` + `GlobalCharacterAppearance` | IP 资产的"雏形" | **扩展**，新增 IP 专属字段和关联表 |
| `CharacterAppearance.bibleLocked` | 核心特征锁定概念已存在 | **语义升级**，在 IP 模式下赋予更强约束 |
| `GlobalVoice` + 角色级 `voiceId/voiceType` | 音画绑定的基础 | **强化**，增加情感参数层 |
| `CharacterProfileData` (role_level, archetype, personality_tags) | 角色"软设定"的载体 | **扩展**，增加 IP 专属人设字段 |
| `story-to-script` 管道的角色注入 (`baseCharacterIntroductions`) | 剧本改写的注入点 | **分叉**，IP 模式走增强版注入路径 |
| `WorkflowDefinition` + `GraphRun/GraphStep` | 新工作流的编排基础 | **新增**工作流定义，复用执行引擎 |
| `TaskType` 枚举 + Bull 队列 + Worker | 新任务类型的运行基础 | **新增** task type，复用现有队列 |
| `MediaObject` + MinIO 存储 | 所有资产存储 | **直接复用** |

---

## 二、总体架构：解耦策略

### 2.1 后端解耦原则

```
┌────────────────────────────────────────────────────────────────┐
│                     API Gateway Layer                          │
│  /api/novel-promotion/[projectId]/...   (现有, 不动)           │
│  /api/ip-hub/...                        (新增, IP 资产管理)    │
│  /api/novel-promotion/[projectId]/ip/...（新增, IP 模式生成）   │
└──────────────┬───────────────────────────┬─────────────────────┘
               │                           │
    ┌──────────▼──────────┐     ┌──────────▼──────────┐
    │  常规模式 Services   │     │  IP 模式 Services    │
    │  (完全不变)          │     │  (新增, 独立目录)     │
    │  src/lib/            │     │  src/lib/ip-mode/    │
    │    novel-promotion/  │     │    ip-asset/         │
    │    voice/            │     │    ip-voice/         │
    │    workflow-engine/  │     │    ip-screenplay/    │
    └──────────┬──────────┘     │    ip-generation/    │
               │                └──────────┬──────────┘
               │                           │
    ┌──────────▼───────────────────────────▼──────────┐
    │            共享基础设施 (不改动, 直接复用)          │
    │  • TaskSystem (Bull queues + workers)            │
    │  • WorkflowEngine (GraphRun/GraphStep)           │
    │  • ModelGateway (LLM/Image/Video/TTS routers)    │
    │  • MediaObject + Storage                         │
    │  • Billing                                       │
    │  • Embedding Service                             │
    └─────────────────────────────────────────────────┘
```

**关键决策**：
- 新模块代码放在独立目录 `src/lib/ip-mode/`，不修改 `src/lib/novel-promotion/` 下任何文件
- 新增 API 路由使用独立命名空间 `/api/ip-hub/` 和 `/api/.../ip/`
- 新增 Prisma model 均以 `Ip` 前缀命名，与现有表零冲突
- 通过 `NovelPromotionProject.workflowMode` (已有字段) 或新增 `ipModeEnabled` 字段区分双轨

### 2.2 前端解耦原则

```
src/
  components/
    ip-mode/                     ← 全新目录
      IpWorkbench/               ← IP 形象设计工作台
      IpVoiceBinder/             ← 音色绑定面板
      IpScreenplayEditor/        ← IP 剧本编辑器
      IpVariantManager/          ← 形态衍生管理
      IpModeSwitcher.tsx         ← 模式切换控件
  contexts/
    ip-mode-context.tsx          ← IP 模式全局状态
  hooks/
    use-ip-assets.ts             ← IP 资产查询
    use-ip-mode.ts               ← 模式检测
```

- 所有 IP 组件独立目录，不侵入现有组件
- 通过 Context + Hook 注入 IP 状态，现有组件无需感知
- 模式切换器作为顶层 UI 入口，切换后路由到不同的子页面

---

## 三、数据模型设计 (Prisma Schema 新增)

### 3.1 IP 资产核心模型

```prisma
// ============================================================
// IP 角色模式 — 新增模型 (不修改任何现有模型)
// ============================================================

/// IP 角色资产：跨项目持久化的数字角色
model IpCharacter {
  id                String   @id @default(uuid())
  userId            String                          // 所属用户（租户隔离）
  folderId          String?                         // 可选：归属的 GlobalAssetFolder

  // ---- 基础身份 ----
  name              String                          // 角色名
  aliases           String?  @db.Text               // JSON: 别名数组
  gender            String?                         // 性别
  ageRange          String?                         // 年龄段

  // ---- 核心视觉特征 (不可变层) ----
  faceEmbedding     Bytes?                          // 面部特征向量 (用于一致性匹配)
  faceReferenceUrl  String?  @db.Text               // 面部参考图 URL
  faceMediaId       String?                         // 关联 MediaObject
  bodyArchetype     String?  @db.Text               // 基础骨架描述

  // ---- 软设定 (性格/人设/口吻) ----
  profileData       String?  @db.Text               // JSON: 扩展版 CharacterProfileData
  personality       String?  @db.Text               // 性格描述自然语言
  speakingStyle     String?  @db.Text               // 说话口吻/语言风格
  backstory         String?  @db.Text               // 背景故事

  // ---- 声音绑定 ----
  voiceId           String?                         // TTS voice ID
  voiceType         String?                         // 'custom' | 'qwen-designed' | 'uploaded'
  customVoiceUrl    String?  @db.Text               // 自定义音频 URL
  customVoiceMediaId String?                        // 关联 MediaObject
  globalVoiceId     String?                         // 关联 GlobalVoice
  voiceEmotionConfig String? @db.Text               // JSON: 默认情感参数

  // ---- 来源追踪 ----
  sourceGlobalCharacterId String?                   // 从 GlobalCharacter 升级而来
  sourceType        String   @default("manual")     // "manual" | "upgraded" | "ai-generated"

  // ---- 元数据 ----
  status            String   @default("draft")      // "draft" | "active" | "archived"
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  // ---- 关联 ----
  variants          IpCharacterVariant[]
  referenceSheets   IpReferenceSheet[]
  castings          IpCasting[]
  user              User     @relation(fields: [userId], references: [id])

  @@index([userId])
  @@index([status])
}

/// IP 角色形态预设：同一 IP 的不同外观方案
model IpCharacterVariant {
  id                String   @id @default(uuid())
  ipCharacterId     String                          // 父 IP 角色
  
  // ---- 可变层描述 ----
  variantName       String                          // "现代版" / "古装版" / "战斗形态"
  costumeDescription String? @db.Text               // 服装描述
  hairstyleDescription String? @db.Text             // 发型描述
  accessoryDescription String? @db.Text             // 配饰描述
  environmentHint   String?  @db.Text               // 环境/时代提示

  // ---- 预览图 ----
  previewUrls       String?  @db.Text               // JSON: 预览图 URL 数组
  previewMediaIds   String?  @db.Text               // JSON: MediaObject ID 数组
  selectedPreviewIndex Int?                         // 用户选中的预览图

  // ---- 状态 ----
  isDefault         Boolean  @default(false)        // 是否默认形态
  sortOrder         Int      @default(0)
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  // ---- 关联 ----
  ipCharacter       IpCharacter @relation(fields: [ipCharacterId], references: [id], onDelete: Cascade)

  @@index([ipCharacterId])
}

/// IP 参考图集：角色三视图、表情集、标准动作等
model IpReferenceSheet {
  id                String   @id @default(uuid())
  ipCharacterId     String
  
  sheetType         String                          // "turnaround" | "expression" | "pose" | "detail"
  description       String?  @db.Text               // 生成描述
  imageUrls         String?  @db.Text               // JSON: 图片 URL 数组
  imageMediaIds     String?  @db.Text               // JSON: MediaObject ID 数组
  
  // ---- 生成状态 ----
  status            String   @default("pending")    // "pending" | "generating" | "completed" | "failed"
  taskId            String?                         // 关联的生成任务

  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  ipCharacter       IpCharacter @relation(fields: [ipCharacterId], references: [id], onDelete: Cascade)

  @@index([ipCharacterId])
  @@index([sheetType])
}

/// IP 选角：将 IP 角色投射到具体项目中
model IpCasting {
  id                String   @id @default(uuid())
  projectId         String                          // 目标项目
  ipCharacterId     String                          // IP 角色
  ipVariantId       String?                         // 使用的形态预设 (null = 默认)
  
  // ---- 项目内角色标识 ----
  projectCharacterId String?                        // 映射到项目内的 NovelPromotionCharacter
  castRole          String?  @db.Text               // 在本项目中扮演的角色名/角色描述
  
  // ---- 剧本注入覆盖 ----
  personalityOverride String? @db.Text              // 项目级性格覆盖
  speakingStyleOverride String? @db.Text            // 项目级口吻覆盖
  
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  ipCharacter       IpCharacter @relation(fields: [ipCharacterId], references: [id])
  project           NovelPromotionProject @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@unique([projectId, ipCharacterId])              // 同一项目中同一 IP 不重复选角
  @@index([projectId])
  @@index([ipCharacterId])
}

/// IP 剧本结构化输出
model IpScreenplaySegment {
  id                String   @id @default(uuid())
  projectId         String
  clipId            String                          // 关联 NovelPromotionClip
  segmentIndex      Int                             // 段落序号
  
  segmentType       String                          // "scene_desc" | "dialogue" | "action" | "narration" | "transition"
  content           String   @db.Text               // 段落内容
  
  // ---- 角色关联 (仅 dialogue/action 类型) ----
  ipCharacterId     String?                         // 发言/动作的 IP 角色
  ipCastingId       String?                         // 选角记录（含变体信息）
  emotionTag        String?                         // 情感标记: "happy" | "angry" | "sad" | ...
  emotionIntensity  Float?                          // 情感强度 0-1
  
  // ---- 舞台指示 ----
  stageDirection    String?  @db.Text               // 动作/表情描述
  
  createdAt         DateTime @default(now())

  @@index([projectId, clipId])
  @@index([ipCharacterId])
}
```

### 3.2 现有模型的最小化扩展

仅需在 `NovelPromotionProject` 补充一个字段即可桥接双轨：

```prisma
// 在 NovelPromotionProject 中新增 (追加字段, 不修改现有字段)
model NovelPromotionProject {
  // ... 现有字段不变 ...
  
  ipModeEnabled     Boolean  @default(false)        // 是否启用 IP 模式
  ipCastings        IpCasting[]                     // 反向关联
}
```

### 3.3 模型关系图

```
                    ┌──────────────┐
                    │     User     │
                    └──────┬───────┘
                           │ owns
              ┌────────────┼────────────┐
              ▼            ▼            ▼
     ┌────────────┐ ┌────────────┐ ┌───────────┐
     │IpCharacter │ │GlobalChar  │ │  Project   │
     │  (IP资产)   │ │ (现有全局)  │ │  (现有)    │
     └─┬──┬──┬────┘ └────────────┘ └─────┬─────┘
       │  │  │                           │
       │  │  │    ┌──────────────┐       │
       │  │  └───►│IpRefSheet   │       │
       │  │       │(三视图/表情) │       │
       │  │       └──────────────┘       │
       │  │                              │
       │  │    ┌──────────────┐          │
       │  └───►│IpCharVariant │          │
       │       │(形态预设)     │          │
       │       └──────────────┘          │
       │                                 │
       │         ┌──────────────┐        │
       └────────►│  IpCasting   │◄───────┘
                 │ (选角映射)    │
                 └──────┬───────┘
                        │
                        ▼
                ┌───────────────┐
                │IpScreenplay   │
                │  Segment      │
                │(结构化剧本)    │
                └───────────────┘
```

---

## 四、新增 API 路由设计

### 4.1 IP 资产管理 (`/api/ip-hub/`)

```
# ---- IP 角色 CRUD ----
POST   /api/ip-hub/characters                     # 创建 IP 角色
GET    /api/ip-hub/characters                     # 列出用户所有 IP 角色
GET    /api/ip-hub/characters/[id]                # 获取详情
PATCH  /api/ip-hub/characters/[id]                # 更新基础信息
DELETE /api/ip-hub/characters/[id]                # 删除（软删除→archived）

# ---- 核心视觉特征 ----
POST   /api/ip-hub/characters/[id]/extract-face   # 从参考图提取面部特征
POST   /api/ip-hub/characters/[id]/upload-face    # 上传面部参考图

# ---- 参考图集生成 ----
POST   /api/ip-hub/characters/[id]/ref-sheets     # 触发三视图/表情集/动作生成
GET    /api/ip-hub/characters/[id]/ref-sheets     # 查询参考图集状态
DELETE /api/ip-hub/characters/[id]/ref-sheets/[sheetId]

# ---- 形态预设 ----
POST   /api/ip-hub/characters/[id]/variants       # 创建形态预设
GET    /api/ip-hub/characters/[id]/variants       # 列出所有预设
PATCH  /api/ip-hub/characters/[id]/variants/[vid] # 更新预设
DELETE /api/ip-hub/characters/[id]/variants/[vid] # 删除预设
POST   /api/ip-hub/characters/[id]/variants/[vid]/preview  # 生成预设预览图

# ---- 声音绑定 ----
POST   /api/ip-hub/characters/[id]/voice          # 绑定/更新音色
DELETE /api/ip-hub/characters/[id]/voice          # 解绑音色
POST   /api/ip-hub/characters/[id]/voice/preview  # 试听（带情感参数）

# ---- 从现有资产升级 ----
POST   /api/ip-hub/characters/upgrade-from-global  # GlobalCharacter → IpCharacter
```

### 4.2 项目级 IP 模式 (`/api/novel-promotion/[projectId]/ip/`)

```
# ---- IP 模式开关 ----
POST   .../ip/enable                              # 启用 IP 模式
POST   .../ip/disable                             # 禁用（回到常规模式）

# ---- 选角 ----
POST   .../ip/cast                                # 为项目选角 (选择 IP + 变体)
GET    .../ip/cast                                # 获取当前选角列表
PATCH  .../ip/cast/[castingId]                    # 更新选角（切换变体/覆盖人设）
DELETE .../ip/cast/[castingId]                    # 移除选角

# ---- IP 剧本改写 ----
POST   .../ip/screenplay-rewrite                  # 基于 IP 人设重写剧本 (streaming)
GET    .../ip/screenplay-segments/[clipId]        # 获取结构化剧本

# ---- IP 图像生成 (附加面部一致性约束) ----
POST   .../ip/generate-image                      # IP 模式图像生成
POST   .../ip/regenerate-group                    # IP 模式批量重生成

# ---- IP 语音生成 (附加情感控制) ----
POST   .../ip/voice-generate                      # IP 模式语音生成（自动匹配角色音色+情感）
```

---

## 五、新增 Task Types 与 Worker 扩展

### 5.1 新增任务类型

```typescript
// 在 src/lib/task/types.ts 的 TaskType 枚举中追加:

// ---- IP 资产生成 ----
IP_EXTRACT_FACE            = 'ip_extract_face'            // 面部特征提取
IP_REF_SHEET_TURNAROUND    = 'ip_ref_sheet_turnaround'    // 三视图生成
IP_REF_SHEET_EXPRESSION    = 'ip_ref_sheet_expression'    // 表情集生成
IP_REF_SHEET_POSE          = 'ip_ref_sheet_pose'          // 标准动作生成
IP_VARIANT_PREVIEW         = 'ip_variant_preview'         // 形态预设预览

// ---- IP 剧本处理 ----
IP_SCREENPLAY_REWRITE      = 'ip_screenplay_rewrite'      // IP 人设注入剧本改写
IP_SCREENPLAY_PARSE        = 'ip_screenplay_parse'        // 结构化拆分

// ---- IP 生成 (增强版) ----
IP_IMAGE_PANEL             = 'ip_image_panel'             // 面部一致性图像生成
IP_IMAGE_CHARACTER         = 'ip_image_character'         // IP 角色形象生成
IP_VOICE_LINE              = 'ip_voice_line'              // 情感化语音生成
```

### 5.2 Worker 分发策略

**不新建 Worker 进程**。复用现有四队列，通过 task type 前缀路由：

```
IMAGE queue:  IMAGE_PANEL / IMAGE_CHARACTER / IP_IMAGE_PANEL / IP_IMAGE_CHARACTER / IP_VARIANT_PREVIEW / IP_REF_SHEET_*
VIDEO queue:  (不变)
VOICE queue:  VOICE_LINE / VOICE_DESIGN / IP_VOICE_LINE
TEXT  queue:  (现有文本任务) / IP_SCREENPLAY_REWRITE / IP_SCREENPLAY_PARSE / IP_EXTRACT_FACE
```

在各 Worker 中增加 handler 分支即可：

```typescript
// src/lib/workers/image.worker.ts — 在 switch 中追加
case 'ip_image_panel':
  return handleIpImagePanel(job)      // src/lib/ip-mode/handlers/ip-image-panel.ts
case 'ip_ref_sheet_turnaround':
  return handleIpRefSheet(job, 'turnaround')
// ...
```

---

## 六、新增 Workflow 定义

### 6.1 IP 资产初始化工作流

```typescript
// src/lib/ip-mode/workflows/ip-asset-init.ts

const IP_ASSET_INIT_DEFINITION: WorkflowDefinition = {
  workflowType: 'IP_ASSET_INIT_RUN',
  orderedSteps: [
    {
      key: 'extract_face',
      dependsOn: [],
      retryable: true,
      artifactTypes: ['face_embedding', 'face_reference'],
      failureMode: 'fail_run',
    },
    {
      key: 'ref_sheet_turnaround',
      dependsOn: ['extract_face'],
      retryable: true,
      artifactTypes: ['ref_sheet_images'],
      failureMode: 'continue',     // 参考图失败不阻塞
    },
    {
      key: 'ref_sheet_expression',
      dependsOn: ['extract_face'],
      retryable: true,
      artifactTypes: ['ref_sheet_images'],
      failureMode: 'continue',
    },
    {
      key: 'ref_sheet_pose',
      dependsOn: ['extract_face'],
      retryable: true,
      artifactTypes: ['ref_sheet_images'],
      failureMode: 'continue',
    },
  ],
}
```

### 6.2 IP 剧本改写工作流

```typescript
// src/lib/ip-mode/workflows/ip-screenplay.ts

const IP_SCREENPLAY_DEFINITION: WorkflowDefinition = {
  workflowType: 'IP_SCREENPLAY_REWRITE_RUN',
  orderedSteps: [
    {
      key: 'inject_personas',        // 收集所有选角的人设数据
      dependsOn: [],
      retryable: false,
      artifactTypes: ['persona_context'],
      failureMode: 'fail_run',
    },
    {
      key: 'rewrite_screenplay',     // LLM 改写原始剧本
      dependsOn: ['inject_personas'],
      retryable: true,
      artifactTypes: ['rewritten_screenplay'],
      failureMode: 'fail_run',
    },
    {
      key: 'parse_segments',         // 结构化拆分
      dependsOn: ['rewrite_screenplay'],
      retryable: true,
      artifactTypes: ['structured_segments'],
      failureMode: 'fail_run',
    },
    {
      key: 'persist_ip_screenplay',  // 写入 IpScreenplaySegment
      dependsOn: ['parse_segments'],
      retryable: false,
      artifactTypes: [],
      failureMode: 'fail_run',
    },
  ],
}
```

---

## 七、四大核心需求的实现映射

### 需求 1：IP 形象设计工作台

```
┌─────────────────────────────────────────────────────────────┐
│  前端: src/components/ip-mode/IpWorkbench/                  │
│  ├── IpCharacterList.tsx          角色列表                   │
│  ├── IpCharacterEditor.tsx        角色编辑 (名称/设定/声音)  │
│  ├── IpFaceExtractor.tsx          面部特征提取 UI            │
│  ├── IpRefSheetGallery.tsx        参考图集画廊               │
│  └── IpVariantGrid.tsx            形态预设管理               │
│                                                             │
│  后端: src/lib/ip-mode/ip-asset/                            │
│  ├── create-ip-character.ts       创建 + 触发初始化工作流    │
│  ├── extract-face.ts              面部特征提取 handler       │
│  ├── ref-sheet-generator.ts       参考图集生成 handler       │
│  └── variant-manager.ts           形态预设管理               │
│                                                             │
│  数据: IpCharacter + IpCharacterVariant + IpReferenceSheet  │
│  API:  /api/ip-hub/characters/**                            │
└─────────────────────────────────────────────────────────────┘
```

**核心流程**：
1. 用户上传或 AI 生成角色参考图
2. 系统提取 `faceEmbedding` (面部特征向量) + 保存 `faceReferenceUrl`
3. 自动触发 `IP_ASSET_INIT_RUN` 工作流 → 并行生成三视图、表情集、动作参考
4. 用户补充软设定 (personality, backstory, speakingStyle)
5. 角色状态从 `draft` → `active`

**面部特征提取方案**：
- 方案 A：使用现有 Image model 的 vision 能力提取描述性特征 → 存为结构化 JSON
- 方案 B：对接专门的人脸识别模型 (如 InsightFace) → 存为 embedding 向量
- **推荐方案 A 起步**，低成本且与现有 ModelGateway 兼容

### 需求 2：固定音色绑定与情感控制

```
┌─────────────────────────────────────────────────────────────┐
│  前端: src/components/ip-mode/IpVoiceBinder/                │
│  ├── VoiceBindPanel.tsx            音色选择/录制面板         │
│  ├── EmotionConfigEditor.tsx       情感参数编辑器            │
│  └── VoicePreviewPlayer.tsx        试听 (带情感预览)         │
│                                                             │
│  后端: src/lib/ip-mode/ip-voice/                            │
│  ├── ip-voice-binder.ts           绑定/解绑逻辑             │
│  ├── emotion-text-parser.ts       情感标记解析器             │
│  └── ip-voice-generator.ts        情感化 TTS handler        │
│                                                             │
│  复用: src/lib/voice/ (不改动)                              │
│  复用: src/lib/providers/ (不改动)                          │
└─────────────────────────────────────────────────────────────┘
```

**情感化发音的实现路径**：

现有 voice 系统已支持 `emotionPrompt` 和 `emotionStrength` 参数。IP 模式的增强点在于：

```typescript
// src/lib/ip-mode/ip-voice/emotion-text-parser.ts

interface EmotionAnnotatedSegment {
  text: string
  emotion: 'neutral' | 'happy' | 'sad' | 'angry' | 'fearful' | 'surprised' | 'disgusted'
  intensity: number          // 0-1
  pauseBefore?: number       // 停顿毫秒
  emphasis?: string[]        // 重音词
}

/**
 * 解析带情感标记的剧本文本。
 * 输入: IpScreenplaySegment (已包含 emotionTag + emotionIntensity)
 * 输出: EmotionAnnotatedSegment[]
 * 
 * 解析策略:
 * 1. 如果 segment 已有 emotionTag → 直接使用
 * 2. 如果缺失 → 调用 LLM 从上下文推断情感
 * 3. 将 stageDirection 中的动作/表情映射为 TTS 参数
 */
function parseEmotionAnnotations(
  segment: IpScreenplaySegment,
  context: { prevSegments: IpScreenplaySegment[], character: IpCharacter }
): EmotionAnnotatedSegment[]
```

**音画绑定的自动匹配**：

```typescript
// IP 模式下的 voice-generate 增强流程:
async function generateIpVoiceLine(params: {
  projectId: string
  segmentId: string       // IpScreenplaySegment
}) {
  const segment = await getIpScreenplaySegment(segmentId)
  const casting = await getIpCasting(projectId, segment.ipCharacterId)
  const ipChar = await getIpCharacter(casting.ipCharacterId)
  
  // 自动解析情感
  const emotions = parseEmotionAnnotations(segment, context)
  
  // 使用 IP 角色绑定的音色 + 情感参数
  return generateVoiceLine({
    text: segment.content,
    voiceId: ipChar.voiceId,
    voiceType: ipChar.voiceType,
    customVoiceUrl: ipChar.customVoiceUrl,
    emotionPrompt: emotions[0].emotion,
    emotionStrength: emotions[0].intensity,
    // 复用现有 TTS 管线, 只是参数来源不同
  })
}
```

### 需求 3：剧本重写与多 IP 角色扮演注入

```
┌─────────────────────────────────────────────────────────────┐
│  前端: src/components/ip-mode/IpScreenplayEditor/           │
│  ├── CastingSelector.tsx          可视化选角面板             │
│  ├── PersonaInjectionPreview.tsx   人设注入预览              │
│  ├── RewriteProgressTracker.tsx    改写进度                  │
│  └── StructuredSegmentView.tsx     结构化结果查看器          │
│                                                             │
│  后端: src/lib/ip-mode/ip-screenplay/                       │
│  ├── persona-injector.ts          人设上下文构建             │
│  ├── ip-screenplay-rewriter.ts    LLM 改写主逻辑            │
│  ├── segment-parser.ts            结构化拆分解析器           │
│  └── casting-resolver.ts          选角 → 项目角色映射        │
│                                                             │
│  Prompts: lib/prompts/ip-mode/                              │
│  ├── ip_screenplay_rewrite.zh.txt                           │
│  ├── ip_screenplay_rewrite.en.txt                           │
│  ├── ip_segment_parse.zh.txt                                │
│  └── ip_segment_parse.en.txt                                │
└─────────────────────────────────────────────────────────────┘
```

**人设注入机制 — 与现有 story-to-script 的差异**：

| 维度 | 常规模式 (不变) | IP 模式 (新增) |
|-----|----------------|---------------|
| 角色来源 | LLM 分析原文提取 | 用户从 IP 库手动选角 |
| 人设深度 | `introduction` (1-2句) | `personality` + `backstory` + `speakingStyle` (多段) |
| 注入时机 | story-to-script 时 | **额外增加**一轮"改写"步骤 |
| 输出格式 | 自然语言剧本 | 结构化 `IpScreenplaySegment` |

```typescript
// src/lib/ip-mode/ip-screenplay/persona-injector.ts

function buildPersonaContext(castings: IpCastingWithCharacter[]): string {
  return castings.map(c => `
【角色：${c.ipCharacter.name}】
- 性格：${c.personalityOverride ?? c.ipCharacter.personality}
- 背景：${c.ipCharacter.backstory}
- 说话风格：${c.speakingStyleOverride ?? c.ipCharacter.speakingStyle}
- 在本剧中扮演：${c.castRole}
  `).join('\n---\n')
}
```

**结构化拆分的 Prompt 策略**：

```
你是一个专业的影视编剧。请将以下改写后的剧本严格拆分为结构化JSON数组。

每个元素必须是以下之一：
- { "type": "scene_desc", "content": "场景描述文字" }
- { "type": "dialogue", "characterId": "IP角色ID", "content": "台词", "emotion": "happy|sad|angry|...", "emotionIntensity": 0.8, "stageDirection": "微笑着说" }
- { "type": "action", "characterId": "IP角色ID", "content": "动作描述", "stageDirection": "缓缓转身" }
- { "type": "narration", "content": "旁白文字" }
- { "type": "transition", "content": "转场描述" }

每条 dialogue/action 必须关联到以下角色之一：
{{castingList}}
```

### 需求 4：核心特征全局复用与形态衍生

```
┌─────────────────────────────────────────────────────────────┐
│  前端: src/components/ip-mode/IpVariantManager/             │
│  ├── VariantCreator.tsx            新建形态预设              │
│  ├── VariantCard.tsx               预设卡片（含预览图）      │
│  └── FeatureLayerVisualizer.tsx    特征分层可视化            │
│                                                             │
│  后端: src/lib/ip-mode/ip-generation/                       │
│  ├── feature-decomposer.ts        特征解耦器                │
│  ├── ip-image-generator.ts        IP 增强图像生成            │
│  └── consistency-checker.ts       一致性校验                 │
└─────────────────────────────────────────────────────────────┘
```

**分层控制逻辑 — Prompt 组装策略**：

```typescript
// src/lib/ip-mode/ip-generation/feature-decomposer.ts

interface DecomposedPrompt {
  // 不可变层 (最高优先级, 来自 IP 资产)
  immutableFeatures: {
    faceDescription: string       // 来自 IpCharacter.faceReferenceUrl 的描述
    bodyArchetype: string         // 来自 IpCharacter.bodyArchetype
  }
  
  // 可变层 (来自当前剧本 prompt 或 variant 预设)
  mutableFeatures: {
    costume: string               // 来自 IpCharacterVariant 或当前 panel prompt
    hairstyle: string
    accessories: string
    environment: string           // 来自当前场景
  }
  
  // 剧本层 (来自当前分镜)
  sceneContext: {
    action: string
    emotion: string
    cameraAngle: string
    lighting: string
  }
}

function assembleIpImagePrompt(decomposed: DecomposedPrompt): string {
  // 不可变层放在 prompt 最前面 + 作为 negative prompt 的约束
  return [
    `[CHARACTER IDENTITY - DO NOT ALTER] ${decomposed.immutableFeatures.faceDescription}, ${decomposed.immutableFeatures.bodyArchetype}`,
    `[APPEARANCE] ${decomposed.mutableFeatures.costume}, ${decomposed.mutableFeatures.hairstyle}`,
    `[SCENE] ${decomposed.sceneContext.action}, ${decomposed.sceneContext.emotion}`,
    `[CAMERA] ${decomposed.sceneContext.cameraAngle}, ${decomposed.sceneContext.lighting}`,
  ].join('. ')
}
```

**与现有 Image Worker 的集成**：

```typescript
// src/lib/ip-mode/handlers/ip-image-panel.ts

async function handleIpImagePanel(job: Job) {
  const { panelId, ipCastingId } = job.data
  
  const panel = await getPanel(panelId)
  const casting = await getIpCastingWithCharacter(ipCastingId)
  const variant = casting.ipVariantId 
    ? await getVariant(casting.ipVariantId)
    : getDefaultVariant(casting.ipCharacter)
  
  // 特征解耦
  const decomposed = decomposeFeatures({
    ipCharacter: casting.ipCharacter,
    variant,
    panelPrompt: panel.imagePromptText,
    sceneContext: panel.photographyRules,
  })
  
  // 组装增强 prompt
  const enhancedPrompt = assembleIpImagePrompt(decomposed)
  
  // 附加面部参考图 (IP reference)
  const referenceImages = [
    casting.ipCharacter.faceReferenceUrl,
    ...getRefSheetUrls(casting.ipCharacter, 'turnaround'),
  ].filter(Boolean)
  
  // 调用现有 image generator, 只是 prompt 和 reference 不同
  return generateImage({
    prompt: enhancedPrompt,
    referenceImages,            // 面部一致性参考
    negativePrompt: `different face, wrong identity, ${panel.negativePrompt}`,
    // ...其余参数与常规模式一致
  })
}
```

---

## 八、前端状态流转设计

### 8.1 IP 模式 Context

```typescript
// src/contexts/ip-mode-context.tsx

interface IpModeState {
  // 全局 IP 资产 (独立于项目)
  ipCharacters: IpCharacter[]
  selectedIpCharacterId: string | null
  
  // 项目级 IP 状态
  ipModeEnabled: boolean
  castings: IpCasting[]
  screenplaySegments: Map<string, IpScreenplaySegment[]>  // clipId → segments
  
  // UI 状态
  workbenchOpen: boolean
  castingSelectorOpen: boolean
}

interface IpModeActions {
  // 资产管理
  createIpCharacter: (data: CreateIpCharacterInput) => Promise<IpCharacter>
  deleteIpCharacter: (id: string) => Promise<void>
  
  // 模式切换
  enableIpMode: (projectId: string) => Promise<void>
  disableIpMode: (projectId: string) => Promise<void>
  
  // 选角
  castCharacter: (projectId: string, ipCharacterId: string, variantId?: string) => Promise<void>
  removeCasting: (castingId: string) => Promise<void>
  
  // 剧本改写
  triggerScreenplayRewrite: (projectId: string) => Promise<void>
}
```

### 8.2 模式切换交互流

```
用户进入项目页面
  │
  ├── ipModeEnabled = false  →  显示常规 UI (完全不变)
  │
  └── ipModeEnabled = true   →  显示 IP 增强 UI
      │
      ├── 顶栏: [IP 模式已开启] + [选角管理] 按钮
      │
      ├── 角色列表: 显示已选角 IP 角色 (带头像+音色标记)
      │     替代常规的 NovelPromotionCharacter 列表
      │     ⚠ 常规角色数据仍保留, 仅 UI 层切换展示
      │
      ├── 剧本面板: 增加 [IP 改写] 按钮
      │     常规剧本 → IP 改写 → 结构化视图
      │
      ├── 分镜面板: 图像生成按钮走 IP 增强路径
      │     自动附加面部参考 + 特征锁定
      │
      └── 语音面板: 自动匹配 IP 音色 + 情感标记
            显示情感可视化 (喜怒哀乐强度条)
```

---

## 九、目录结构总结 (新增文件)

```
src/
  lib/
    ip-mode/                                    ← 核心新增目录
      ip-asset/
        create-ip-character.ts
        extract-face.ts
        ref-sheet-generator.ts
        variant-manager.ts
      ip-voice/
        ip-voice-binder.ts
        emotion-text-parser.ts
        ip-voice-generator.ts
      ip-screenplay/
        persona-injector.ts
        ip-screenplay-rewriter.ts
        segment-parser.ts
        casting-resolver.ts
      ip-generation/
        feature-decomposer.ts
        ip-image-generator.ts
        consistency-checker.ts
      handlers/                                 ← Worker handlers
        ip-image-panel.ts
        ip-image-character.ts
        ip-ref-sheet.ts
        ip-variant-preview.ts
        ip-screenplay-rewrite.ts
        ip-screenplay-parse.ts
        ip-voice-line.ts
        ip-extract-face.ts
      workflows/
        ip-asset-init.ts
        ip-screenplay.ts
      types.ts                                  ← IP 模式类型定义

  app/api/
    ip-hub/                                     ← IP 资产 API
      characters/
        route.ts                                # GET (list), POST (create)
        [id]/
          route.ts                              # GET, PATCH, DELETE
          extract-face/route.ts
          upload-face/route.ts
          ref-sheets/route.ts
          variants/
            route.ts
            [vid]/
              route.ts
              preview/route.ts
          voice/
            route.ts
            preview/route.ts
        upgrade-from-global/route.ts
    novel-promotion/[projectId]/
      ip/                                       ← 项目级 IP API
        enable/route.ts
        disable/route.ts
        cast/
          route.ts
          [castingId]/route.ts
        screenplay-rewrite/route.ts
        screenplay-segments/[clipId]/route.ts
        generate-image/route.ts
        regenerate-group/route.ts
        voice-generate/route.ts

  components/
    ip-mode/                                    ← 前端 UI
      IpWorkbench/
        IpCharacterList.tsx
        IpCharacterEditor.tsx
        IpFaceExtractor.tsx
        IpRefSheetGallery.tsx
        IpVariantGrid.tsx
      IpVoiceBinder/
        VoiceBindPanel.tsx
        EmotionConfigEditor.tsx
        VoicePreviewPlayer.tsx
      IpScreenplayEditor/
        CastingSelector.tsx
        PersonaInjectionPreview.tsx
        RewriteProgressTracker.tsx
        StructuredSegmentView.tsx
      IpVariantManager/
        VariantCreator.tsx
        VariantCard.tsx
        FeatureLayerVisualizer.tsx
      IpModeSwitcher.tsx

  contexts/
    ip-mode-context.tsx

  hooks/
    use-ip-assets.ts
    use-ip-mode.ts
    use-ip-castings.ts

lib/
  prompts/
    ip-mode/                                    ← IP 专用 Prompt 模板
      ip_screenplay_rewrite.zh.txt
      ip_screenplay_rewrite.en.txt
      ip_segment_parse.zh.txt
      ip_segment_parse.en.txt
      ip_persona_inject.zh.txt
      ip_persona_inject.en.txt
      ip_face_describe.zh.txt
      ip_face_describe.en.txt
      ip_ref_sheet_turnaround.zh.txt
      ip_ref_sheet_expression.zh.txt
      ip_ref_sheet_pose.zh.txt
```

---

## 十、解耦保障清单

| # | 保障措施 | 说明 |
|---|---------|------|
| 1 | **零修改现有 API** | 所有 IP 路由在的独立路径 (`/ip-hub/`, `/ip/`) |
| 2 | **零修改现有 Services** | `src/lib/novel-promotion/` 目录不做任何改动 |
| 3 | **零修改现有 DB 表** | 仅在 `NovelPromotionProject` 追加一个可选 boolean 字段 |
| 4 | **独立 Prisma Model** | 所有新表以 `Ip` 前缀命名，独立 migration |
| 5 | **复用基础设施** | Bull 队列、Worker 进程、ModelGateway、Storage 全部复用 |
| 6 | **前端条件渲染** | `ipModeEnabled` 标志控制 UI 分支，false 时完全等同于现有 |
| 7 | **渐进式 migration** | 数据库只做 additive migration，不改已有列/索引 |
| 8 | **Feature Flag** | 可通过环境变量 `IP_MODE_FEATURE_FLAG` 全局启停 IP 模式 |
| 9 | **独立测试** | `tests/unit/ip-mode/`, `tests/integration/ip-mode/` |
| 10 | **独立 Prompt 目录** | `lib/prompts/ip-mode/` 不影响现有 prompt 文件 |

---

## 十一、推荐实施顺序

```
Phase 1: 数据基础 (1-2 周)
  ├── Prisma model 定义 + migration
  ├── IP 资产 CRUD API (/api/ip-hub/)
  └── IpWorkbench 基础 UI

Phase 2: 核心能力 (2-3 周)
  ├── 面部特征提取 handler
  ├── 参考图集自动生成
  ├── 音色绑定 + 情感解析器
  └── IpVoiceBinder UI

Phase 3: 剧本引擎 (2-3 周)
  ├── 人设注入 + 剧本改写 workflow
  ├── 结构化拆分解析器
  ├── 选角系统 (IpCasting)
  └── IpScreenplayEditor UI

Phase 4: 生成增强 (2-3 周)
  ├── 特征解耦 + IP 图像生成 handler
  ├── IP 语音生成 handler (情感化)
  ├── 形态预设 + 衍生管理
  └── 全流程集成测试
```
