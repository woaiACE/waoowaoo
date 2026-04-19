# LXT 资产库与按镜头成片 — 功能全链路落地计划

> 更新时间：2026-04-19  
> 基于代码实际状态撰写，完整覆盖资产库、LLM 增强、语音设计、按镜头成片与时间线导出。

---

## 一、当前已落地状态（截至 2026-04-19）

### 1.1 数据层

| 表 | 状态 | 说明 |
|----|------|------|
| `LxtProject` | ✅ 已落地 | `projectId`, `analysisModel` |
| `LxtEpisode` | ✅ 已落地 | `novelText`, `srtContent`, `shotListContent`, `scriptContent` |
| `LxtProjectAsset` | ✅ 已落地 | `kind / name / summary / voiceId / voiceType / customVoiceUrl / imageUrl`，`@@unique([lxtProjectId, kind, name])` |

### 1.2 API 层

| 路由 | 方法 | 状态 |
|------|------|------|
| `/api/lxt/[projectId]/assets` | GET | ✅ |
| `/api/lxt/[projectId]/assets` | POST（从分镜初始化） | ✅ |
| `/api/lxt/[projectId]/assets/[assetId]` | PATCH / DELETE | ✅ |
| `/api/lxt/[projectId]/assets/[assetId]/bind-global` | POST | ✅ |
| `/api/lxt/[projectId]/assets/[assetId]/voice` | PATCH | ✅ |
| `/api/lxt/[projectId]/assets/analyze` | POST（LLM 分析任务） | ✅ 刚实现 |

### 1.3 Worker 层

| Task Type | Handler | 状态 |
|-----------|---------|------|
| `lxt_novel_to_script` | `lxt-novel-to-script.ts` | ✅ |
| `lxt_script_to_storyboard` | `lxt-script-to-storyboard.ts` | ✅ |
| `lxt_storyboard_to_script` | `lxt-storyboard-to-script.ts` | ✅ 四阶段并行流水线 |
| `lxt_analyze_assets` | `lxt-analyze-assets.ts` | ✅ 刚实现 |

### 1.4 前端 UI 层

| 组件 / Hooks | 状态 |
|-------------|------|
| `LxtWorkspace.tsx`（4 个 stage tab） | ✅ lxt-script / lxt-storyboard / lxt-assets / lxt-final-script |
| `LxtAssetsStage.tsx` | ✅ 从分镜初始化 + ✨LLM 分析增强 + 任务进度追踪 |
| `LxtAssetCard.tsx` | ✅ 编辑 name/summary + 绑定全局资产 + 音色设置 |
| `AssetFilterBar`（复用通用模式） | ✅ 全部/角色/场景/道具筛选 |
| `AssetsStageStatusOverlays`（复用通用模式） | ✅ Toast + 分析中遮罩 |
| `useLxtAssets` + 5 个写操作 hooks | ✅ |
| `buildLxtAssetPromptContext()` | ✅ 已注入 lxt-storyboard-to-script 的制作脚本 Prompt |

### 1.5 关键联动已打通

> `lxt-assets` stage 的资产数据，已通过 `buildLxtAssetPromptContext()` 注入到 `LXT_STORYBOARD_TO_SCRIPT` 任务的四阶段 Prompt 中。  
> 即：先在资产库确认角色/场景/声音，后续制作脚本会自动带入这些信息。

---

## 二、待落地能力清单

```text
资产库增强
  A. AI 语音设计（voice-design 任务接入）
  B. 多 episode 资产分析支持（当前 LLM 只取第一集）

按镜头成片（全新 lxt-production stage）
  C. 制作脚本 → 镜头结构化（LxtShotPlan 表）
  D. 镜头资产绑定（LxtShotAssetRef 表）
  E. 单镜头 TTS 生成
  F. 单镜头图片生成
  G. 单镜头视频生成
  H. 镜头面板 UI（LxtProductionStage.tsx）

时间线总装与导出（lxt-editor stage）
  I. 镜头汇总为编辑器时间线（LxtEditorProject 表）
  J. 复用 VideoEditorStage，接 LXT 专用存储接口
  K. 渲染导出
```

---

## 三、资产库增强（Module A 收尾）

### 3.1 AI 语音设计接入

**目标**：在 `LxtAssetCard` 中触发 AI 语音设计任务，结果回填到 `LxtProjectAsset.voiceId`。

**方案**：复用现有 `/api/asset-hub/voice-design` 接口（全局 AI 声音设计）。

**新增**：  
- `/api/lxt/[projectId]/assets/[assetId]/voice-design` — POST，提交 voice-design 任务，`voiceSource = 'lxt'`，任务完成后写回 `lxtProjectAsset.voiceId`  
- `LxtAssetCard.tsx` 中增加"AI 设计声音"按钮，绑定上述路由 + `useTaskStatus` 追踪

**不需要新建**：`voice-design` 任务本身已存在，只需新建 LXT 专属路由作为参数适配器。

### 3.2 多 Episode 支持

当前 `lxt-analyze-assets.ts` handler 只取 `findFirst`（第一集）。后续改为：
- `payload.episodeId` 指定时分析指定集
- 未指定时遍历所有有 `shotListContent` 的集，合并内容分析（注意截断 30,000 字限制）

**优先级**：P1，首版 MVP 先用单集。

---

## 四、LLM 资产提取链路（已实现参考文档）

> 本节记录 `LXT_ANALYZE_ASSETS` 的实现细节，代码已落地，可直接参考。

### 4.1 整体流程

```text
用户点击 ✨ LLM 分析增强
  → POST /api/lxt/[projectId]/assets/analyze
  → submitTask(LXT_ANALYZE_ASSETS, { projectId })
  → handleLxtAnalyzeAssetsTask()
    ├── novelText + shotListContent 合并（双源，上限 30,000 字）
    ├── 读取已有 LxtProjectAsset 名单（注入 Prompt 去重）
    ├── Promise.all 三路并行 LLM
    │   ├── NP_AGENT_CHARACTER_PROFILE → { characters: [...] }
    │   ├── NP_SELECT_LOCATION → { locations: [...] }
    │   └── NP_SELECT_PROP → { props: [...] }
    ├── safeParseJsonObject 解析
    └── upsert LxtProjectAsset（@@unique 天然去重，不覆盖用户已编辑 summary）
  → 前端 useTaskStatus 订阅，完成后自动 refetch
```

### 4.2 复用的 Prompt

| Prompt ID | 文件路径 | 变量 |
|-----------|---------|------|
| `NP_AGENT_CHARACTER_PROFILE` | `novel-promotion/agent_character_profile` | `input`, `characters_lib_info` |
| `NP_SELECT_LOCATION` | `novel-promotion/agent_select_location` | `input`, `locations_lib_name` |
| `NP_SELECT_PROP` | `novel-promotion/agent_select_prop` | `input`, `props_lib_name` |

### 4.3 后续增强点

| 编号 | 内容 | 优先级 |
|------|------|--------|
| 4.3.1 | 多 episode 合并分析 | P1 |
| 4.3.2 | 自动触发（进入 lxt-assets 时静默后台分析） | P2 |
| 4.3.3 | 增量分析（`updatedAt` 判断，只分析新集） | P2 |

---

## 五、按镜头成片（Module B — lxt-production）

### 5.1 目标

把 `episode.scriptContent`（已生成的制作脚本文本）转成"逐镜头可执行生产面板"，让每个镜头都能独立生成 TTS / 图片 / 视频，并追踪各自状态。

### 5.2 新增数据表

#### `LxtShotPlan` — 镜头主表（绑定 `LxtEpisode`）

```prisma
model LxtShotPlan {
  id            String     @id @default(uuid())
  episodeId     String
  shotIndex     Int        // 0-based
  shotLabel     String     // "镜头1"

  // 由 scriptContent 解析填充
  shotCopy      String?    @db.Text   // 镜头文案（旁白或台词）
  imagePrompt   String?    @db.Text
  videoPrompt   String?    @db.Text
  voiceRoute    String?                // "旁白" | 角色名
  cameraSize    String?
  audioCue      String?    @db.Text

  // TTS
  ttsText       String?    @db.Text
  ttsStatus     String     @default("idle")  // idle|queued|processing|completed|failed
  ttsUrl        String?    @db.Text
  ttsMediaId    String?
  ttsTaskId     String?

  // 图片
  imageStatus   String     @default("idle")
  imageUrl      String?    @db.Text
  imageMediaId  String?
  imageTaskId   String?

  // 视频
  videoStatus   String     @default("idle")
  videoUrl      String?    @db.Text
  videoMediaId  String?
  videoTaskId   String?

  status        String     @default("draft")  // draft|ready|partial|completed|failed
  createdAt     DateTime   @default(now())
  updatedAt     DateTime   @default(now()) @updatedAt

  episode       LxtEpisode       @relation(fields: [episodeId], references: [id], onDelete: Cascade)
  assetRefs     LxtShotAssetRef[]

  @@unique([episodeId, shotIndex])
  @@index([episodeId])
  @@map("lxt_shot_plans")
}
```

#### `LxtShotAssetRef` — 镜头资产绑定表

```prisma
model LxtShotAssetRef {
  id                String          @id @default(uuid())
  shotPlanId        String
  lxtProjectAssetId String
  role              String          // primary_character | secondary_character | location | prop
  createdAt         DateTime        @default(now())

  shotPlan          LxtShotPlan     @relation(fields: [shotPlanId], references: [id], onDelete: Cascade)
  lxtProjectAsset   LxtProjectAsset @relation(fields: [lxtProjectAssetId], references: [id], onDelete: Cascade)

  @@index([shotPlanId])
  @@index([lxtProjectAssetId])
  @@map("lxt_shot_asset_refs")
}
```

**Prisma schema 联动修改**：
- `LxtEpisode` 增加 `shotPlans LxtShotPlan[]`
- `LxtProjectAsset` 增加 `shotRefs LxtShotAssetRef[]`

### 5.3 制作脚本解析

**新建文件**：`src/lib/lxt/parse-final-script.ts`

`scriptContent` 当前输出格式稳定：

```text
镜头1
镜头文案:...
图片提示词:...
视频提示词:...
景别:...
语音分镜:...（格式为"角色名-情绪:台词"或"旁白-情绪:文案"）
音效:...
```

解析函数签名：

```typescript
export interface LxtScriptShot {
  index: number
  label: string           // "镜头1"
  shotCopy: string        // 镜头文案
  imagePrompt: string
  videoPrompt: string
  cameraSize: string
  voiceRoute: string      // "旁白" | 角色名（从"语音分镜"字段取第一个说话者）
  ttsText: string         // 台词文本（去掉角色前缀）
  audioCue: string
}

export function parseLxtFinalScript(scriptContent: string): LxtScriptShot[]
```

**入口时机**：用户进入 `lxt-production` stage，系统检测 `scriptContent` 存在时自动调用，`upsert LxtShotPlan`（按 `episodeId + shotIndex` 唯一键，保留用户已编辑内容）。

### 5.4 新增 Task 类型

在 `src/lib/task/types.ts` 中追加：

```typescript
LXT_PARSE_SCRIPT:         'lxt_parse_script',          // scriptContent → LxtShotPlan
LXT_GENERATE_SHOT_TTS:    'lxt_generate_shot_tts',      // 单镜头 TTS
LXT_GENERATE_SHOT_IMAGE:  'lxt_generate_shot_image',    // 单镜头图片
LXT_GENERATE_SHOT_VIDEO:  'lxt_generate_shot_video',    // 单镜头视频
```

### 5.5 API 路由

| 路由 | 方法 | 作用 |
|------|------|------|
| `/api/lxt/[projectId]/shots` | GET | 获取本集镜头列表（含资产绑定） |
| `/api/lxt/[projectId]/shots` | POST | 从 scriptContent 初始化 / 重新同步 LxtShotPlan |
| `/api/lxt/[projectId]/shots/[shotId]` | PATCH | 修改提示词、voiceRoute 等字段 |
| `/api/lxt/[projectId]/shots/[shotId]/generate-tts` | POST | 提交 TTS 任务 |
| `/api/lxt/[projectId]/shots/[shotId]/generate-image` | POST | 提交图片生成任务 |
| `/api/lxt/[projectId]/shots/[shotId]/generate-video` | POST | 提交视频生成任务 |
| `/api/lxt/[projectId]/shots/batch-generate` | POST | 批量提交（全集 TTS / 全集图片 / 全集视频） |

### 5.6 前端 UI — `LxtProductionStage.tsx`

**布局**：左侧镜头缩略列表（index + 状态色块），右侧当前镜头详情面板。

**每个镜头面板包含**：
- 镜头文案（可编辑）
- 图片提示词（可编辑）
- 视频提示词（可编辑）
- 当前绑定角色 / 场景（从 `LxtProjectAsset` 中选）
- 语音分配（`voiceRoute` + 对应 `voiceId`）
- TTS 文本（可微调）
- 三个生成按钮：`[生成 TTS]`  `[生成图片]`  `[生成视频]`
- 各自状态 badge（idle / 排队中 / 生成中 / 完成 / 失败 + 重试）

**批量操作区**（顶部 action bar）：
- `[全部 TTS]`  `[全部图片]`  `[全部视频]` — 批量提交，内部分批控制并发
- 总进度展示（N/M 已完成）

### 5.7 生成链路说明

#### TTS 生成
- 输入：`shotPlan.ttsText`、`voiceRoute` 对应角色的 `voiceId`（来自 `LxtProjectAsset`）
- 复用：现有 TTS / voice generation 基础设施
- 回填：`ttsUrl`, `ttsMediaId`, `ttsStatus = completed`

#### 图片生成
- 输入：`shotPlan.imagePrompt`、可选角色参考图 `imageUrl`
- 复用：现有图片生成 + media 上传链路
- 回填：`imageUrl`, `imageMediaId`, `imageStatus = completed`

#### 视频生成
- 输入：`shotPlan.videoPrompt`、可选 `imageUrl` 作为首帧
- 复用：现有视频生成链路
- 回填：`videoUrl`, `videoMediaId`, `videoStatus = completed`

#### 并发建议
| 类型 | 建议并发 |
|------|---------|
| TTS | 4–8 |
| 图片 | 2–4 |
| 视频 | 1–2 |

---

## 六、时间线总装与导出（Module C — lxt-editor）

### 6.1 新增数据表

```prisma
model LxtEditorProject {
  id             String     @id @default(uuid())
  episodeId      String     @unique
  projectData    String     @db.Text   // VideoEditorProject JSON
  renderStatus   String?
  renderTaskId   String?
  renderProgress Int?
  renderError    String?    @db.Text
  outputUrl      String?    @db.Text
  createdAt      DateTime   @default(now())
  updatedAt      DateTime   @default(now()) @updatedAt

  episode        LxtEpisode @relation(fields: [episodeId], references: [id], onDelete: Cascade)

  @@map("lxt_editor_projects")
}
```

### 6.2 API 路由

| 路由 | 方法 | 作用 |
|------|------|------|
| `/api/lxt/[projectId]/editor` | GET / PUT | 读写编辑器时间线数据 |
| `/api/lxt/[projectId]/editor/build` | POST | 从 `LxtShotPlan` 自动拼装初始时间线 |
| `/api/lxt/[projectId]/editor/render` | POST | 提交渲染任务 |

### 6.3 时间线拼装

**新建**：`src/lib/lxt/build-timeline.ts`

```typescript
// 把已完成的 LxtShotPlan 列表转成 VideoEditorProject 的 panels + voiceLines
export function buildTimelineFromShotPlans(shots: LxtShotPlan[]): VideoEditorProjectData
```

**复用**：
- `VideoEditorStage` UI — 直接复用，不新建
- `useEditorActions` 内部存储接口 — 需新建 `/api/lxt/.../editor` 作为 LXT 专用存储端点
- 渲染任务 — 复用现有 render 基础设施，新建 LXT render 路由适配

### 6.4 前端 — `LxtEditorStage.tsx`

进入条件：本集至少有一个镜头 `status = completed`。

功能：
1. "一键拼装时间线"按钮 → 调用 `/editor/build`
2. 渲染后自动进入 `VideoEditorStage`（复用）
3. 手动调整完成后触发最终渲染

---

## 七、新增 stage 接入 LxtWorkspace

### 7.1 新增两个 stage

```typescript
// 当前
const LXT_STAGES = ['lxt-script', 'lxt-storyboard', 'lxt-assets', 'lxt-final-script'] as const

// 目标
const LXT_STAGES = [
  'lxt-script',
  'lxt-storyboard',
  'lxt-assets',
  'lxt-final-script',
  'lxt-production',   // 新增
  'lxt-editor',       // 新增
] as const
```

### 7.2 LxtWorkspace.tsx 改动

- 导入 `LxtProductionStage` 和 `LxtEditorStage`
- 在 tab 渲染区追加两个新 stage 的 tab 与 Panel
- 不改动现有 4 个 stage 的任何逻辑

---

## 八、实施优先级与顺序

| 阶段 | 内容 | 优先级 | 前置条件 |
|------|------|--------|---------|
| **M-A1** | AI 语音设计接入 `/assets/[assetId]/voice-design` | P1 | 已有全局 voice-design 任务 |
| **M-A2** | 多 episode LLM 分析支持 | P1 | lxt-analyze-assets.ts 已存在 |
| **M-B1** | Prisma 迁移：`LxtShotPlan` + `LxtShotAssetRef` | **P0** | 无 |
| **M-B2** | `parse-final-script.ts` 解析工具 | **P0** | M-B1 |
| **M-B3** | `/api/lxt/[projectId]/shots` GET + POST 路由 | **P0** | M-B1/B2 |
| **M-B4** | `LxtProductionStage.tsx` 初版（列表 + 详情面板） | **P0** | M-B3 |
| **M-B5** | 单镜头 TTS 生成路由 + worker handler | P1 | M-B4 |
| **M-B6** | 单镜头图片生成路由 + worker handler | P1 | M-B4 |
| **M-B7** | 单镜头视频生成路由 + worker handler | P1 | M-B4 |
| **M-B8** | 批量生成 + 进度汇总 | P2 | M-B5/B6/B7 |
| **M-C1** | `LxtEditorProject` 表 + migration | P1 | M-B7 |
| **M-C2** | `build-timeline.ts` 拼装工具 | P1 | M-C1 |
| **M-C3** | `/api/lxt/[projectId]/editor` 路由 | P1 | M-C2 |
| **M-C4** | `LxtEditorStage.tsx` + LxtWorkspace 接入 | P2 | M-C3 |

---

## 九、文件改动清单

### 新建文件

```text
prisma/schema.prisma
  + LxtShotPlan
  + LxtShotAssetRef
  + LxtEditorProject
  + LxtEpisode 追加 shotPlans 反向关联
  + LxtProjectAsset 追加 shotRefs 反向关联

src/lib/lxt/parse-final-script.ts
src/lib/lxt/build-timeline.ts

src/lib/task/types.ts
  + LXT_PARSE_SCRIPT
  + LXT_GENERATE_SHOT_TTS
  + LXT_GENERATE_SHOT_IMAGE
  + LXT_GENERATE_SHOT_VIDEO

src/lib/workers/handlers/lxt-parse-script.ts
src/lib/workers/handlers/lxt-generate-shot-tts.ts
src/lib/workers/handlers/lxt-generate-shot-image.ts
src/lib/workers/handlers/lxt-generate-shot-video.ts

src/lib/query/hooks/useLxtShots.ts

src/app/api/lxt/[projectId]/assets/[assetId]/voice-design/route.ts
src/app/api/lxt/[projectId]/shots/route.ts
src/app/api/lxt/[projectId]/shots/[shotId]/route.ts
src/app/api/lxt/[projectId]/shots/[shotId]/generate-tts/route.ts
src/app/api/lxt/[projectId]/shots/[shotId]/generate-image/route.ts
src/app/api/lxt/[projectId]/shots/[shotId]/generate-video/route.ts
src/app/api/lxt/[projectId]/shots/batch-generate/route.ts
src/app/api/lxt/[projectId]/editor/route.ts
src/app/api/lxt/[projectId]/editor/build/route.ts
src/app/api/lxt/[projectId]/editor/render/route.ts

src/app/[locale]/workspace/[projectId]/modes/lxt/components/LxtProductionStage.tsx
src/app/[locale]/workspace/[projectId]/modes/lxt/components/LxtEditorStage.tsx
```

### 修改文件

```text
prisma/schema.prisma
  → LxtEpisode 追加 shotPlans LxtShotPlan[]
  → LxtProjectAsset 追加 shotRefs LxtShotAssetRef[]

src/lib/task/types.ts
  → 追加 4 个新 Task 类型枚举

src/lib/workers/text.worker.ts
  → 注册 4 个新 case

src/app/[locale]/workspace/[projectId]/modes/lxt/LxtWorkspace.tsx
  → LXT_STAGES 追加 lxt-production / lxt-editor
  → 导入并渲染两个新 stage 组件
```

---

## 十、验收标准

### Module A（资产库）完整验收
- [ ] 进入 `lxt-assets`，"从分镜初始化"正确提取角色 / 场景 / 道具
- [ ] 点击"✨ LLM 分析增强"，任务进度实时显示，完成后资产列表更新含 summary
- [ ] 可绑定全局资产（GlobalAssetPicker）
- [ ] 可设置 voiceId / voiceType / customVoiceUrl
- [ ] AI 语音设计任务完成后 voiceId 自动回填

### Module B（按镜头成片）完整验收
- [ ] 进入 `lxt-production`，`scriptContent` 自动解析为镜头列表（N 条，与脚本行数对齐）
- [ ] 每镜头可编辑提示词、voiceRoute
- [ ] 点击"生成 TTS"：任务提交、进度显示、完成后 `ttsUrl` 可播放
- [ ] 点击"生成图片"：任务提交、完成后图片显示
- [ ] 点击"生成视频"：任务提交、完成后视频可预览
- [ ] 单镜头失败不影响其他镜头，可独立重试

### Module C（时间线）完整验收
- [ ] 所有镜头完成后，"一键拼装时间线"生成 `LxtEditorProject`
- [ ] 进入 VideoEditorStage 可正常加载时间线
- [ ] 渲染导出后 `outputUrl` 可下载

### 不回归验收
- [ ] 现有 4 个 LXT stage 功能不受影响
- [ ] 通用模式（novel-promotion）不受影响
- [ ] asset-hub、voice-design、video-editor 现有功能不受影响
