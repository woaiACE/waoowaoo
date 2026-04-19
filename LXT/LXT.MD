# LXT 模式 — 实际落地架构与阶段流程

> 更新时间：2026-04-19  
> 本文以当前仓库代码为准，说明 LXT 模式已经落地的架构、数据流、工作台组织方式，以及每个阶段的实际处理流程。  
> 旧的详细推演与优化草案，已转入《LXT_制作脚本异步优化方案.MD》作为补充参考。

---

## 1. 当前定位

LXT 已不再是挂靠在 novel-promotion 里的临时实验流程，而是一个可以在“创建项目”时直接选择的**独立项目模式**。

当前已经落地的核心能力如下：

1. **项目级模式切换**：创建项目时支持选择 `novel-promotion` 或 `lxt`
2. **独立数据模型**：LXT 使用 `LxtProject`、`LxtEpisode` 作为主数据载体
3. **独立工作台**：进入项目后，若 `project.mode === 'lxt'`，会进入专属的 `LxtWorkspace`
4. **三阶段闭环生产**：
   - `lxt-script`：原文 → 剧本
   - `lxt-storyboard`：剧本 → 分镜
   - `lxt-final-script`：分镜 → 制作脚本
5. **最终脚本阶段已异步化**：最重的阶段已从单次长 Prompt 改造成 BullMQ 后台任务 + 单镜并行流水线

---

## 2. 整体架构总览

### 2.1 架构主线

```text
创建项目（mode = lxt）
  → Project
  → LxtProject
  → 进入 /workspace/[projectId]
  → page.tsx 根据 project.mode 分流到 LxtWorkspace
  → 用户创建 / 选择 LxtEpisode
  → Stage 1：原文生成剧本（srtContent）
  → Stage 2：剧本生成分镜（shotListContent）
  → Stage 3：分镜生成制作脚本（scriptContent）
```

### 2.2 数据层

LXT 当前围绕三个核心实体组织：

| 实体 | 作用 | 关键字段 |
|------|------|----------|
| `Project` | 通用项目壳 | `mode` |
| `LxtProject` | LXT 项目配置 | `projectId`、`analysisModel` |
| `LxtEpisode` | LXT 单集内容载体 | `name`、`novelText`、`srtContent`、`shotListContent`、`scriptContent` |

### 2.3 运行层

LXT 的运行入口与职责分工如下：

| 层级 | 主要文件 | 作用 |
|------|----------|------|
| 项目创建页 | `src/app/[locale]/workspace/page.tsx` | 创建项目时选择 LXT 模式 |
| 项目详情页 | `src/app/[locale]/workspace/[projectId]/page.tsx` | 按 `project.mode` 分流到不同 workspace |
| LXT 工作台 | `src/app/[locale]/workspace/[projectId]/modes/lxt/LxtWorkspace.tsx` | 承载集列表与三阶段切换 |
| 数据上下文 | `LxtWorkspaceProvider.tsx` | 提供 `projectId`、`episodeId`、刷新方法 |
| 阶段运行时 | `LxtWorkspaceStageRuntimeContext.tsx` | 管理阶段跳转行为 |

---

## 3. 代码侧架构分层

### 3.1 项目与数据加载

#### 创建项目
- 用户在 workspace 首页创建项目
- 表单可选择模式：`novel-promotion` 或 `lxt`
- 后端由 `/api/projects` 处理
- 当 mode 为 `lxt` 时：
  - 创建 `Project`
  - 同步创建 `LxtProject`

#### 加载项目详情
- 前端进入 `/workspace/[projectId]`
- `/api/projects/[projectId]/data` 按 `project.mode` 返回不同数据：
  - `novel-promotion` → `novelPromotionData`
  - `lxt` → `lxtData.episodes`

### 3.2 LXT 集管理

LXT 集管理完全独立，使用以下接口：

| 接口 | 作用 |
|------|------|
| `GET /api/lxt/[projectId]/episodes` | 获取该项目所有集 |
| `POST /api/lxt/[projectId]/episodes` | 创建新集 |
| `GET /api/lxt/[projectId]/episodes/[episodeId]` | 获取单集详情 |
| `PATCH /api/lxt/[projectId]/episodes/[episodeId]` | 修改名称或阶段内容 |
| `DELETE /api/lxt/[projectId]/episodes/[episodeId]` | 删除集 |

LXT 的所有阶段产物都写在 `LxtEpisode` 上，不再复用 `NovelPromotionEpisode`。

---

## 4. 当前阶段设计与流程

当前工作台中，正式启用的阶段共有 3 个。

---

## Stage 0：项目创建与集管理

### 目标
让用户从一开始就进入 LXT 专用流程，而不是先进入 novel-promotion 再绕路。

### 流程

```text
用户创建项目
  → 选择 LXT 模式
  → 后端创建 Project + LxtProject
  → 进入项目详情页
  → page.tsx 判断 mode === 'lxt'
  → 渲染 LxtWorkspace
  → 用户在左侧创建 / 选择某一集
```

### 当前前端表现
- 左侧为 LXT 集列表
- 支持新建、切换、删除集
- 右侧为阶段内容面板
- 当前阶段页签固定为：
  - `lxt-script`
  - `lxt-storyboard`
  - `lxt-final-script`

---

## Stage 1：原文 → 剧本

### 目标
把用户输入或编辑后的原文，转成可用于后续分镜拆解的剧本内容，写入 `srtContent`。

### 输入
- `LxtEpisode.novelText`
- 可选附加指令 `instruction`

### 输出
- `LxtEpisode.srtContent`

### 触发入口
前端组件：`src/app/[locale]/workspace/[projectId]/modes/lxt/components/LxtScriptStage.tsx`

### 后端接口
`POST /api/lxt-script/generate-script`

### 实际处理流程

```text
用户点击「生成剧本」
  → 前端调用 /api/lxt-script/generate-script
  → 鉴权 requireProjectAuthLight(projectId)
  → 读取 lxtEpisode.novelText
  → 读取 lxtProject.analysisModel
  → 加载 Prompt：LXT_NOVEL_TO_SCRIPT
  → chatCompletionStream 流式生成 reasoning + text
  → 生成完成后写回 lxtEpisode.srtContent
```

### 前端展示方式
- 左侧：原文，可直接编辑并保存回 `novelText`
- 右上：AI 思考过程（reasoning）
- 右下：生成的剧本文本（可编辑）

### 当前特点
- 该阶段仍采用**直接 SSE 流式返回**方案
- 优点是交互直观、实现简单
- 适合中等长度文本，不需要后台任务化

---

## Stage 2：剧本 → 分镜

### 目标
根据 Stage 1 生成的剧本，拆解为逐镜分镜脚本，写入 `shotListContent`。

### 输入
- `LxtEpisode.srtContent`

### 输出
- `LxtEpisode.shotListContent`

### 触发入口
前端组件：`src/app/[locale]/workspace/[projectId]/modes/lxt/components/LxtStoryboardStage.tsx`

### 后端接口
`POST /api/lxt-script/generate-storyboard`

### 实际处理流程

```text
用户点击「生成分镜」
  → 前端调用 /api/lxt-script/generate-storyboard
  → 鉴权 requireProjectAuthLight(projectId)
  → 读取 lxtEpisode.srtContent
  → 读取 lxtProject.analysisModel
  → 加载 Prompt：LXT_SCRIPT_TO_STORYBOARD
  → chatCompletionStream 流式生成 reasoning + text
  → 生成完成后写回 lxtEpisode.shotListContent
```

### 前端展示方式
- 左侧：剧本内容（只读）
- 右上：思考过程
- 右下：分镜输出（可编辑）

### 当前特点
- 该阶段同样是**前台 SSE 流式方案**
- 当前已足够支撑 LXT 生产闭环
- 若后续分镜规模继续增大，可再升级为后台任务模式

---

## Stage 3：分镜 → 制作脚本

### 目标
把分镜脚本进一步转换成完整制作脚本，供后续 AI 图生图、TTS、视频生成使用，写入 `scriptContent`。

### 输入
- `LxtEpisode.novelText`
- `LxtEpisode.srtContent`
- `LxtEpisode.shotListContent`

### 输出
- `LxtEpisode.scriptContent`

### 触发入口
前端组件：`src/app/[locale]/workspace/[projectId]/modes/lxt/components/LxtFinalScriptStage.tsx`

### 当前运行模式
这一阶段已经不是普通的单次 SSE 文本返回，而是：

- **前端使用 Run Stream** 挂接运行时
- **服务端提交 BullMQ 任务**
- **Worker 在后台分镜并行处理**
- **前端通过阶段卡片实时查看进度**

### 前端调用链

当前 workspace 主要通过：
- Hook：`useLxtFinalScriptRunStream()`
- 端点：`POST /api/lxt-script/[projectId]/generate-stream`

该接口会通过运行时基础设施提交 `TASK_TYPE.LXT_STORYBOARD_TO_SCRIPT`，并把任务过程以流的方式同步给前端。

另外，仓库里也保留了：
- `POST /api/lxt-script/generate-final-script`

它本质上也是**异步任务提交端点**，可视为兼容或备用入口。

---

## 5. 最终脚本阶段的后台流水线

最终脚本阶段是当前 LXT 架构中最关键、也最重的一段链路。

### 5.1 为什么要异步化

旧方案的问题是：
- 单次 Prompt 太长
- 大量分镜容易截断
- 前台请求容易超时
- 页面切换会影响体验

因此当前实现已改为：
- 单镜拆分
- 限并发处理
- 任务级进度回传
- 完成后再统一写回数据库

### 5.2 Worker 主流程

主处理函数：
`src/lib/workers/handlers/lxt-storyboard-to-script.ts`

整体流程如下：

```text
提交任务
  → Worker 读取 lxtProject.analysisModel
  → Worker 读取 lxtEpisode.novelText / srtContent / shotListContent
  → parseLxtShots() 将分镜按“分镜N”拆成 shots[]
  → mapWithConcurrency(shots, 5) 并行处理
  → 每个镜头独立走 4 个阶段
  → 汇总为最终 scriptContent
  → 回写 lxtEpisode.scriptContent
```

### 5.3 单镜四阶段流水线

每个镜头都独立执行以下阶段：

| 阶段 | Prompt | 作用 | 输出 |
|------|--------|------|------|
| Phase 1 | `LXT_SHOT_PHASE1_BASE` | 基础字段推理 | 镜头文案、语音分镜、音效、`spatial_context` |
| Phase 2A | `LXT_SHOT_PHASE2A_IMAGE` | 图片提示词生成 | 图片提示词 |
| Phase 2B | `LXT_SHOT_PHASE2B_ACTING_ARC` | 表演弧线设计 | 结构化动作 / 角色调度 JSON |
| Phase 3 | `LXT_SHOT_PHASE3_VIDEO_REFINE` | 视频提示词合成 | 视频提示词 |

### 5.4 并发模型

当前常量：
- `CONCURRENCY = 5`

含义：
- 同时最多处理 5 个镜头
- 每个镜头内部仍保留顺序依赖
- 其中 Phase 2A 与 Phase 2B 会并行执行

### 5.5 最终组装格式

Worker 会把每镜结果组装成固定的 6 字段文本：

```text
镜头N
镜头文案:...
图片提示词:...
视频提示词:...
景别:
语音分镜:...
音效:...
```

这保证了下游消费格式稳定，不因为生成策略升级而影响使用方。

---

## 6. 前端在最终脚本阶段的体验设计

最终脚本阶段对应的 UI 不再是简单的“左文本 + 右文本”，而是具备运行时感知能力的任务视图。

### 当前表现
- 展示统一的阶段流卡片 `LLMStageStreamCard`
- 实时看到 4 类进度：
  - 分析推理
  - 图片提示词
  - 表演指导
  - 视频合成
- 支持最小化、恢复、停止任务
- 任务完成后恢复为结果编辑视图

### 当前优势
- 页面刷新或短暂离开后，任务更容易恢复
- 用户能明确知道正在跑哪一步
- 比单纯 SSE 文本更适合长任务

---

## 7. 当前 Prompt 组织方式

LXT 已在 `src/lib/prompt-i18n/catalog.ts` 中完成注册，当前主要 Prompt 包括：

| Prompt ID | 用途 |
|-----------|------|
| `LXT_NOVEL_TO_SCRIPT` | 原文转剧本 |
| `LXT_SCRIPT_TO_STORYBOARD` | 剧本转分镜 |
| `LXT_STORYBOARD_TO_SCRIPT` | 旧版整段分镜转制作脚本 Prompt |
| `LXT_SHOT_PHASE1_BASE` | 单镜基础字段推理 |
| `LXT_SHOT_PHASE2A_IMAGE` | 单镜图片提示词 |
| `LXT_SHOT_PHASE2B_ACTING_ARC` | 单镜表演弧线 |
| `LXT_SHOT_PHASE3_VIDEO_REFINE` | 单镜视频提示词精修 |

其中，当前真正支撑异步化升级的关键，是后四个“单镜 Prompt”。

---

## 8. 当前核心文件索引

### 项目模式与数据入口
- `prisma/schema.prisma`
- `src/app/api/projects/route.ts`
- `src/app/api/projects/[projectId]/data/route.ts`
- `src/app/[locale]/workspace/page.tsx`
- `src/app/[locale]/workspace/[projectId]/page.tsx`

### LXT 工作台
- `src/app/[locale]/workspace/[projectId]/modes/lxt/LxtWorkspace.tsx`
- `src/app/[locale]/workspace/[projectId]/modes/lxt/LxtWorkspaceProvider.tsx`
- `src/app/[locale]/workspace/[projectId]/modes/lxt/LxtWorkspaceStageRuntimeContext.tsx`

### 阶段组件
- `src/app/[locale]/workspace/[projectId]/modes/lxt/components/LxtScriptStage.tsx`
- `src/app/[locale]/workspace/[projectId]/modes/lxt/components/LxtStoryboardStage.tsx`
- `src/app/[locale]/workspace/[projectId]/modes/lxt/components/LxtFinalScriptStage.tsx`

### 后端接口与任务
- `src/app/api/lxt/[projectId]/episodes/route.ts`
- `src/app/api/lxt/[projectId]/episodes/[episodeId]/route.ts`
- `src/app/api/lxt-script/generate-script/route.ts`
- `src/app/api/lxt-script/generate-storyboard/route.ts`
- `src/app/api/lxt-script/[projectId]/generate-stream/route.ts`
- `src/app/api/lxt-script/generate-final-script/route.ts`
- `src/lib/workers/handlers/lxt-storyboard-to-script.ts`
- `src/lib/lxt/parse-shots.ts`

---

## 9. 当前状态总结

### 已落地
- LXT 项目级模式选择
- `Project.mode` 分流
- `LxtProject` / `LxtEpisode` 独立表
- LXT 专属 workspace
- LXT 集 CRUD
- 原文 → 剧本
- 剧本 → 分镜
- 分镜 → 制作脚本（后台异步 + 单镜并行）

### 尚未落地
- `lxt-assets` 资产绑定 stage
- 角色 / 场景绑定与语音设计
- Stage 1 / Stage 2 的任务化改造

---

## 10. 后续演进方向

按照当前代码状态，LXT 下一步最自然的演进方向是：

1. **补齐 lxt-assets 阶段**
   - 角色 / 场景绑定
   - 语音设计
   - 为后续图片与视频生成提供一致性输入

2. **统一 Stage 1 / Stage 2 的任务运行模型**
   - 与最终脚本阶段对齐
   - 进一步提升长任务稳定性

3. **继续增强单镜提示词质量**
   - 更稳定的动态视频提示词
   - 更强的角色空间一致性
   - 更适配下游图像 / 视频模型的结构化输出

---

## 11. 结论

LXT 当前已经完成了从“概念流程”到“可实际生产使用的独立模式”的关键跃迁：

- **入口独立**：项目创建即可选择 LXT
- **数据独立**：不再依赖 `NovelPromotionEpisode` 作为主存储
- **工作台独立**：拥有自己的集管理与阶段切换
- **链路闭环**：已经具备原文、剧本、分镜、制作脚本的完整生产流程
- **关键重任务已异步化**：最终脚本生成稳定性与扩展性明显提升

如果继续沿当前架构演进，LXT 将可以自然扩展到完整的“短剧制作流水线”。

