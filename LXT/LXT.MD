# LXT 剧本模式 — 实施记录

## 当前状态

LXT 剧本模式已集成到 workspace 工作台，作为 novel-promotion 的一个 stage 运行。

### 已完成

| 文件 | 状态 | 说明 |
|------|------|------|
| `src/app/[locale]/lxt-script/page.tsx` | ✅ 旧独立路由（保留） | 原始 4 步向导入口 |
| `src/components/lxt-script/LxtScriptWizard.tsx` | ✅ 旧 4 步向导（保留） | 独立页面的状态机 |
| `src/app/api/lxt-script/generate-script/route.ts` | ✅ **流式 SSE API** | 直接调用 `chatCompletionStream`，返回 reasoning + text SSE 流 |
| `src/app/[locale]/workspace/[projectId]/...LxtScriptStage.tsx` | ✅ **workspace stage 组件** | 左右双栏：左原文，右上思考过程 + 右下剧本输出 |
| `src/lib/workers/handlers/lxt-novel-to-script.ts` | ✅ BullMQ handler（已创建但不再被 route 使用） | 保留用于未来批量/后台场景 |
| `lib/prompts/lxt-script/novel_to_script.{zh,en}.txt` | ✅ Prompt 模板 | 旁白/角色台词格式 |
| `src/lib/prompt-i18n/prompt-ids.ts` + `catalog.ts` | ✅ Prompt 注册 | `LXT_NOVEL_TO_SCRIPT` |
| `src/lib/task/types.ts` | ✅ TaskType 注册 | `lxt_novel_to_script` |
| `src/lib/billing/task-policy.ts` | ✅ 计费注册 | BILLABLE_TASK_TYPES |
| `src/i18n.ts` | ✅ i18n 命名空间注册 | `lxtScript` namespace |
| `messages/{zh,en}/lxtScript.json` | ✅ 翻译文件 | 含 `stage.*` 所有 key |
| **Stage 3 — 分镜生成** | | |
| `prisma/schema.prisma` | ✅ 新增字段 | `shotListContent String? @db.Text` on `NovelPromotionEpisode` |
| `src/app/api/lxt-script/generate-storyboard/route.ts` | ✅ **流式 SSE API** | 读取 `srtContent` → 写入 `shotListContent` |
| `src/app/[locale]/workspace/[projectId]/...LxtStoryboardStage.tsx` | ✅ **workspace stage 组件** | 左侧剧本，右侧分镜流式输出 |
| `src/lib/workers/handlers/lxt-script-to-storyboard.ts` | ✅ BullMQ handler（备用） | 保留用于批量/后台场景 |
| `lib/prompts/lxt-script/script_to_storyboard.{zh,en}.txt` | ✅ Prompt 模板 | 5 条规则 + 严格分镜格式 |
| `src/lib/prompt-i18n/prompt-ids.ts` + `catalog.ts` | ✅ Prompt 注册 | `LXT_SCRIPT_TO_STORYBOARD` |
| `src/lib/task/types.ts` | ✅ TaskType 注册 | `lxt_script_to_storyboard` |
| `src/lib/billing/task-policy.ts` | ✅ 计费注册 | BILLABLE_TASK_TYPES |
| `messages/{zh,en}/lxtScript.json` | ✅ 分镜翻译 | `storyboard.*` 所有 key |
| `messages/{zh,en}/novel-promotion.json` | ✅ Stage 标签 | `lxtStoryboard` |
| `messages/{zh,en}/progress.json` + `profile.json` | ✅ 进度/用量标签 | `lxtScriptToStoryboard` |
| workspace 路由（page + stageContent + nav + data hook） | ✅ `lxt-storyboard` stage 完整接入 | VALID_STAGES / WorkspaceStageContent / nav / shotListContent |
| `tests/contracts/task-type-catalog.ts` + `tasktype-behavior-matrix.ts` | ✅ 合约测试 | `lxt_script_to_storyboard` 行 |

---

## 架构

### 流式 API（当前方案）

```
用户点击「生成剧本」
  → POST /api/lxt-script/generate-script
  → requireProjectAuth()
  → resolveAnalysisModel()
  → getPromptTemplate(LXT_NOVEL_TO_SCRIPT, locale)
  → chatCompletionStream() + ReadableStream<SSE>
    → onChunk(reasoning) → SSE: {"kind":"reasoning","delta":"..."}
    → onChunk(text)      → SSE: {"kind":"text","delta":"..."}
  → 完成后写 episode.srtContent
  → SSE: {"kind":"done"}
```

客户端 `LxtScriptStage.tsx` 用 `fetch` + `ReadableStream reader` 消费 SSE 流：
- `reasoning` chunk → 上半区实时追加（只读，自动滚动）
- `text` chunk → 下半区实时追加（生成中只读，完成后可编辑）

### UI 布局

```
┌──────────────────┬──────────────────┐
│                  │  思考过程（只读） │
│                  │  reasoning 流式  │
│     原文         ├──────────────────┤
│   （只读）       │  生成的剧本      │
│                  │  text 流式输出   │
│                  │  完成后可编辑    │
└──────────────────┴──────────────────┘
```

---

## 输出格式

```
旁白：在一片茂密的森林旁邊，住著溫柔的豬媽媽和她的兩個兒子。
豬媽媽：孩子們，千萬不可以走進旁邊的森林喔。
豬哥哥：弟弟，快醒醒。我們趁現在去森林裡探險吧，一定很好玩。
旁白：豬弟弟揉揉惺忪的睡眼，雖然覺得有點害怕。
```

---

## 文件变更清单（从初始骨架到当前）

```
新建：
  lib/prompts/lxt-script/novel_to_script.zh.txt
  lib/prompts/lxt-script/novel_to_script.en.txt
  src/lib/workers/handlers/lxt-novel-to-script.ts
  src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/LxtScriptStage.tsx

修改：
  src/app/api/lxt-script/generate-script/route.ts      ← 重写为流式 SSE（原为 BullMQ 队列）
  src/app/[locale]/workspace/[projectId]/page.tsx       ← VALID_STAGES 添加 'lxt-script'
  src/app/.../WorkspaceStageContent.tsx                 ← 路由到 LxtScriptStage
  src/app/.../hooks/useWorkspaceStageNavigation.ts      ← 导航项
  src/app/.../hooks/useWorkspaceEpisodeStageData.ts     ← 暴露 srtContent
  src/lib/task/types.ts                                 ← LXT_NOVEL_TO_SCRIPT
  src/lib/workers/text.worker.ts                        ← 注册 handler
  src/lib/llm-observe/task-policy.ts                    ← LLM_STANDARD_POLICY
  src/lib/task/intent.ts                                ← 'convert'
  src/lib/task/progress-message.ts                      ← progress key
  src/lib/billing/task-policy.ts                        ← BILLABLE_TASK_TYPES
  src/lib/prompt-i18n/prompt-ids.ts                     ← LXT_NOVEL_TO_SCRIPT
  src/lib/prompt-i18n/catalog.ts                        ← pathStem
  src/i18n.ts                                           ← lxtScript namespace
  messages/zh/lxtScript.json                            ← stage.* keys
  messages/en/lxtScript.json                            ← stage.* keys
  messages/{zh,en}/novel-promotion.json                 ← stages.lxtScript
  messages/{zh,en}/progress.json                        ← taskType.lxtNovelToScript
  messages/{zh,en}/profile.json                         ← lxt_novel_to_script
  tests/contracts/task-type-catalog.ts                  ← owner map
  tests/contracts/tasktype-behavior-matrix.ts           ← chain/api matrix
```

---

## 不在本次范围内

- ~~Step4（最终剧本）AI 接入~~ → **已规划，见 Stage 4**
- 剧本格式继续调整（旁白 vs 场景头 vs VO）— 根据用户反馈迭代
- 批量任务模式（多集同时生成）— 可复用已有 BullMQ handler

---

## Stage 3：生成分镜 — 落地计划

### 目标

将 Step2 输出的剧本（`srtContent`）拆解为 LXT 短剧分镜，每个分镜覆盖 5–15 秒，输出标准化分镜文本，存入 `episode.shotListContent`。

---

### 输出格式

```
分镜1
场景：森林旁
画面内容：中景，一片茂密的森林边缘，阳光透过树叶洒下斑驳光影
出场角色：无 角色行动：无
对白信息：画外音(旁白)：在一片茂密的森林旁边。

分镜2
场景：猪妈妈家
画面内容：中景，猪妈妈温柔地站在简陋的木屋前，两个小猪依偎在她身边
出场角色：猪妈妈、猪哥哥、猪弟弟 角色行动：猪妈妈站着，兄弟俩依偎着
对白信息：画外音(旁白)：住着温柔的猪妈妈和她的两个儿子。
```

---

### UI 布局

```
┌──────────────────┬──────────────────┐
│                  │  思考过程（只读） │
│                  │  reasoning 流式  │
│  剧本内容        ├──────────────────┤
│  (srtContent)    │  分镜输出        │
│  （只读）        │  text 流式输出   │
│                  │  完成后可编辑    │
└──────────────────┴──────────────────┘
```

> 左侧展示 Step2 生成的剧本（作为本步的"原文"参考），AI 以此为输入生成分镜。

---

### 数据模型变更

| 操作 | 位置 | 详情 |
|------|------|------|
| 新增字段 | `prisma/schema.prisma` — `NovelPromotionEpisode` | `shotListContent String? @db.Text` |
| 新增迁移 | `prisma/migrations/` | `add_shot_list_content` |

> `srtContent`（Step2 剧本）已存在；`shotListContent` 为 Step3 分镜文本，与现有 `NovelPromotionStoryboard`（图片分镜）独立。

---

### 基础设施复用 vs 新增

| 组件 | 复用 / 新增 | 说明 |
|------|------------|------|
| `chatCompletionStream()` | ✅ 完全复用 | SSE 流式输出，与 Step2 相同 |
| `resolveAnalysisModel()` | ✅ 完全复用 | 模型解析逻辑不变 |
| `getPromptTemplate()` + `PROMPT_IDS` | ✅ 复用模式，新增 ID | 新增 `LXT_SCRIPT_TO_STORYBOARD` |
| `requireProjectAuth()` | ✅ 完全复用 | Auth 逻辑不变 |
| `apiHandler()` | ✅ 完全复用 | 错误包装不变 |
| Workspace stage 路由 | ✅ 复用模式，新增 stage | 已有 `lxt-script`，新增 `lxt-storyboard` |
| `GlassTextarea` + forwardRef auto-scroll | ✅ 完全复用 | UI 组件不变 |
| BullMQ handler 骨架 | ✅ 复用模式 | 参考 `lxt-novel-to-script.ts` 结构 |
| `ReadableStream<SSE>` client 消费模式 | ✅ 完全复用 | 参考 `LxtScriptStage.tsx` |
| Prisma 字段 | ❌ 新增 | `shotListContent` 写入 |
| Prompt 模板 | ❌ 新增 | `script_to_storyboard.{zh,en}.txt` |
| TaskType | ❌ 新增 | `LXT_SCRIPT_TO_STORYBOARD` |
| i18n keys | ❌ 新增 | `lxtScript.storyboard.*` |

---

### 文件变更清单

#### 新建

```
lib/prompts/lxt-script/script_to_storyboard.zh.txt   ← 分镜生成 Prompt（中文）
lib/prompts/lxt-script/script_to_storyboard.en.txt   ← 分镜生成 Prompt（英文）
src/lib/workers/handlers/lxt-script-to-storyboard.ts ← BullMQ handler（备用，不被 route 直接调用）
src/app/api/lxt-script/generate-storyboard/route.ts  ← 流式 SSE API（复用 generate-script 模式）
src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/LxtStoryboardStage.tsx
                                                      ← Workspace stage 组件（复用 LxtScriptStage 模式）
```

#### 修改

```
prisma/schema.prisma
  → NovelPromotionEpisode 新增 shotListContent String? @db.Text

src/lib/task/types.ts
  → 新增 LXT_SCRIPT_TO_STORYBOARD: 'lxt_script_to_storyboard'

src/lib/workers/text.worker.ts
  → 注册 lxt-script-to-storyboard handler

src/lib/llm-observe/task-policy.ts
  → LLM_STANDARD_POLICY 列表新增 LXT_SCRIPT_TO_STORYBOARD

src/lib/task/intent.ts
  → 新增 'convert' intent 映射

src/lib/task/progress-message.ts
  → 新增 progress key

src/lib/billing/task-policy.ts
  → BILLABLE_TASK_TYPES 新增 LXT_SCRIPT_TO_STORYBOARD

src/lib/prompt-i18n/prompt-ids.ts
  → 新增 LXT_SCRIPT_TO_STORYBOARD

src/lib/prompt-i18n/catalog.ts
  → 新增 pathStem: 'lxt-script/script_to_storyboard'

src/i18n.ts
  → lxtScript namespace 已注册，无需修改（key 直接加到 lxtScript.json）

messages/zh/lxtScript.json
  → 新增 storyboard.* keys（generateButton, generating, title, desc 等）

messages/en/lxtScript.json
  → 同上英文版

src/app/[locale]/workspace/[projectId]/page.tsx
  → VALID_STAGES 新增 'lxt-storyboard'

src/app/.../WorkspaceStageContent.tsx
  → 路由到 LxtStoryboardStage

src/app/.../hooks/useWorkspaceStageNavigation.ts
  → 新增 lxt-storyboard 导航项（Step3，在 lxt-script 之后）

src/app/.../hooks/useWorkspaceEpisodeStageData.ts
  → 暴露 shotListContent

tests/contracts/task-type-catalog.ts
  → 新增 LXT_SCRIPT_TO_STORYBOARD owner 映射

tests/contracts/tasktype-behavior-matrix.ts
  → 新增 chain/api matrix 行
```

---

### API 流程

```
用户点击「生成分镜」
  → POST /api/lxt-script/generate-storyboard
    body: { projectId, episodeId, model? }
  → requireProjectAuth(projectId)
  → episode = prisma.novelPromotionEpisode.findUnique
      select: { srtContent }           ← 使用剧本作为输入
  → resolveAnalysisModel(userId, body.model, ...)
  → getPromptTemplate(LXT_SCRIPT_TO_STORYBOARD, locale)
  → chatCompletionStream() + ReadableStream<SSE>
    → onChunk(reasoning) → SSE: {"kind":"reasoning","delta":"..."}
    → onChunk(text)      → SSE: {"kind":"text","delta":"..."}
  → 完成后：prisma.novelPromotionEpisode.update({ shotListContent: fullText })
  → SSE: {"kind":"done"}
```

---

### Prompt 完整设计（`script_to_storyboard.zh.txt`）

#### 逆推分析：从案例还原转换规律

以下通过对输入剧本 → 输出分镜的逐行映射，还原 AI 需要理解的规则体系：

**规则一：分镜划分粒度**

| 剧本句 | 分镜 | 说明 |
|--------|------|------|
| `旁白：在一片茂密的森林旁边。` | 分镜1 | 1句=1镜，场景建立 |
| `旁白：住着温柔的猪妈妈和她的两个儿子。` + `旁白：猪哥哥和猪弟弟。` | 分镜2（合并） | 语义连续可合为1镜 |
| `旁白：猪哥哥勇敢又充满好奇心。` | 分镜3 | 角色特质描写=独立镜 |
| `旁白：总是喜欢到处探险。` | 分镜4 | 行为描写=独立镜 |
| `旁白：猪弟弟却很胆小。` | 分镜5 | 对比角色=独立镜 |
| `旁白：小小的风吹草动都会让他紧张起来。` | 分镜6 | 情绪强化=独立镜+**特写** |

**合并条件**：同一场景、同一主体、语义为"补充说明前一句"时可合并（如 `猪哥哥和猪弟弟` 是对 `两个儿子` 的具名补充）

---

**规则二：景别选择逻辑**

| 情境 | 景别 | 案例 |
|------|------|------|
| 无角色，纯场景叙述 | **中景**（环境建立） | 分镜1：森林旁，无人物 |
| 多角色同框，关系/互动 | **中景** | 分镜2：猪妈妈+两兄弟 |
| 单角色，描写性格/习惯 | **近景** | 分镜3：猪哥哥望向远方 |
| 单角色，动作/行为 | **半身像** | 分镜4：猪哥哥准备出发 |
| 单角色，正面描写胆小 | **近景** | 分镜5：猪弟弟蜷缩 |
| 情绪特写（惊恐/喜悦/悲伤） | **特写** | 分镜6：猪弟弟惊恐倾听 |
| 多角色，共同行动 | **中景** | 分镜7/8：兄弟玩耍 |
| 角色对话，强调说话者 | **近景** | 分镜10：猪妈妈叮嘱 |

---

**规则三：场景推断逻辑**

AI 需根据内容语义推断场景标签，不照搬原文：

| 剧本内容 | 推断场景 | 推断依据 |
|----------|----------|----------|
| `在一片茂密的森林旁边` | 森林旁 | 直接描述 |
| `住着温柔的猪妈妈...` | 猪妈妈家 | "住" 暗示家宅 |
| `猪哥哥勇敢又充满好奇心` | 猪妈妈家 | 承接上文家宅场景 |
| `每天傍晚太阳下山时` | 猪妈妈家 | 日常场景，延续家 |
| `猪哥哥悄悄地摇醒了猪弟弟` | 猪兄弟卧室 | "夜晚"+"摇醒"→卧室 |
| `跟着哥哥溜出了家门` | 猪兄弟家外 | "溜出家门"→户外 |

---

**规则四：角色识别逻辑**

- 旁白句中**明确出现且有动作/状态描写**的角色 = 出场角色
- 旁白仅提及名字作为"说明对象"但无画面动作 = 不列为出场角色
- 对话行的说话者 = 必定出场

| 剧本句 | 出场角色判断 |
|--------|-------------|
| `在一片茂密的森林旁边` | 无（环境描述，无角色） |
| `住着温柔的猪妈妈和她的两个儿子` | 猪妈妈、猪哥哥、猪弟弟（"住着"暗示三人在场） |
| `猪哥哥勇敢又充满好奇心` | 猪哥哥（描写猪哥哥的特质，画面聚焦他） |
| `小小的风吹草动都会让他紧张起来` | 猪弟弟（"他"指猪弟弟，有情绪反应） |
| `猪妈妈：孩子们，千万不可以...` | 猪妈妈、猪哥哥、猪弟弟（说者+听众） |

---

**规则五：对白格式转换**

| 剧本格式 | 分镜对白格式 |
|----------|-------------|
| `旁白：xxx` | `画外音(旁白)：xxx` |
| `角色名：xxx`（日常台词） | `角色名(普通对话)：xxx` |
| 角色内心独白（心理描写转化） | `角色名(独白)：xxx` |
| 一个分镜多条对白 | 逐行列出，保持顺序 |

---

#### 完整 Prompt 文本

```
你是一名专业的 LXT 短剧分镜编导。请将以下剧本转换为标准的逐镜分镜脚本。

【转换规则】

1. 分镜划分
- 原则：每一个独立叙事句（旁白句或对话句）通常对应一个分镜
- 语义连续且为"补充说明"的相邻句可合并为一个分镜
- 每个分镜预估时长 5–15 秒，保持叙事节奏自然流畅
- 严禁跳过或省略任何对白句

2. 景别选择
- 无角色，纯场景环境叙述 → 中景（环境建立镜头）
- 多角色同框，展现关系或互动 → 中景
- 单角色，描写性格/习惯/状态 → 近景
- 单角色，展现动作/行为 → 半身像
- 情绪强烈（惊恐/悲伤/喜悦/震惊）→ 特写
- 角色对话，强调说话者 → 近景

3. 场景名称
- 根据叙事内容推断场景，不照搬原文
- 常见场景：森林旁、猪妈妈家、卧室、家门外、森林内等
- 同一连续场景可保持相同场景名

4. 角色识别
- 旁白中有实际动作/情绪/状态描写的角色 = 出场角色
- 仅被提及名字但无画面呈现的角色不列入
- 对话行的说话者必定出场
- 无角色时写：出场角色：无  角色行动：无

5. 对白格式转换
- `旁白：xxx` → `画外音(旁白)：xxx`
- `角色名：xxx` → `角色名(普通对话)：xxx`
- 心理独白 → `角色名(独白)：xxx`
- 一个分镜含多条对白时逐行列出

【输出格式（严格遵守，不得添加任何额外说明）】

分镜{N}
场景：{场景名称}
画面内容：{景别}，{画面描述：角色状态+动作+背景+光影/氛围}
出场角色：{角色1}、{角色2}  角色行动：{具体动作描述}
对白信息：{说话者(说话方式)：台词}

（每个分镜之间空一行，从分镜1开始连续输出至结束，不要添加开场白或总结语）

【剧本内容】

{script}
```

---

#### Prompt 变量说明

| 变量 | 来源 | 说明 |
|------|------|------|
| `{script}` | `episode.srtContent` | Step2 输出的"旁白/角色台词"格式剧本 |

---

### i18n 新增 Keys 规划

```json
// messages/zh/lxtScript.json（追加）
{
  "storyboard": {
    "title": "生成分镜",
    "description": "将剧本拆解为 LXT 短剧分镜脚本，每个分镜 5–15 秒",
    "generateButton": "生成分镜",
    "generating": "生成中...",
    "scriptLabel": "剧本",
    "scriptPlaceholder": "请先在上一步生成剧本...",
    "reasoningLabel": "思考过程",
    "reasoningPlaceholder": "AI 的推理过程将在此实时显示...",
    "outputLabel": "分镜输出",
    "outputPlaceholder": "AI 生成的分镜脚本将在此显示...",
    "noScript": "当前集尚未生成剧本，请先完成「生成剧本」步骤"
  }
}
```

---

### 实施顺序（建议）

```
1. prisma/schema.prisma + migration         → 数据模型
2. src/lib/task/types.ts + 注册表           → 基础设施（任务类型、计费、policy）
3. lib/prompts/lxt-script/script_to_storyboard.{zh,en}.txt  → Prompt 模板
4. src/lib/prompt-i18n/                     → Prompt 注册
5. src/app/api/lxt-script/generate-storyboard/route.ts       → API 端点
6. messages/{zh,en}/lxtScript.json          → i18n keys
7. LxtStoryboardStage.tsx                   → UI 组件
8. Workspace 路由接入（page.tsx, WorkspaceStageContent, hooks）
9. tests/contracts/                         → 合约测试
10. npx next build                          → 验证
```

---

## Stage 4：生成脚本 — 落地计划

### 目标

将分镜脚本（`shotListContent`）结合原文（`novelText`）与剧本（`srtContent`），生成供 AI 图生图 / TTS / 视频制作使用的完整制作脚本，存入 `episode.scriptContent`。

每个分镜对应一个镜头，每个镜头包含：
- **镜头文案**：TTS 朗读文案（说话者 + 情感语气 + 台词）
- **图片提示词**：全局空间定位 + 4 格分镜图片精细描述
- **视频提示词**：逐镜头动态叙述（4 段）
- **景别**：（留空，已融入图片提示词描述中）
- **语音分镜**：TTS 路由标记（旁白 / 角色名）
- **音效**：场景环境音建议

---

### 输出格式

```
镜头{N}
镜头文案:{说话者}-{情感}:{台词文本}
图片提示词:全局物理空间位置: {场景名称}, {角色/镜头位置描述}；分镜图片布局：左上图片:{景别}，{画面描述}。；右上图片:{景别}，{画面描述}。；左下图片:{景别}，{画面描述}。；右下图片:{景别}，{画面描述}。
视频提示词:第一个镜头，{镜头叙述}。第二个镜头，{镜头叙述}。第三个镜头，{镜头叙述}。最后一个镜头，{镜头叙述}。
景别:
语音分镜:{说话者标记}
音效:{环境声/动效描述}。
```

> 镜头之间空一行，从镜头1连续输出，不得添加开场白/总结语。

---

### UI 布局

```
┌──────────────────┬──────────────────┐
│                  │  思考过程（只读） │
│                  │  reasoning 流式  │
│   故事原文       ├──────────────────┤
│  (novelText)     │  脚本输出        │
│  （只读）        │  text 流式输出   │
│                  │  完成后可编辑    │
└──────────────────┴──────────────────┘
```

> 左侧展示原始故事文本（用户可随时对照上下文），AI 处理分镜后生成制作脚本。
> 若 `shotListContent` 为空，显示"请先完成分镜生成步骤"并提供跳转按钮。

---

### 数据模型变更

| 操作 | 位置 | 详情 |
|------|------|------|
| 新增字段 | `prisma/schema.prisma` — `NovelPromotionEpisode` | `scriptContent String? @db.Text` |

---

### 基础设施复用 vs 新增

| 组件 | 复用 / 新增 | 说明 |
|------|------------|------|
| `chatCompletionStream()` | ✅ 完全复用 | 同 Stage2/3 |
| `resolveAnalysisModel()` | ✅ 完全复用 | 同 Stage2/3 |
| `getPromptTemplate()` + `PROMPT_IDS` | ✅ 复用模式，新增 ID | 新增 `LXT_STORYBOARD_TO_SCRIPT` |
| `requireProjectAuth()` | ✅ 完全复用 | 同 Stage2/3 |
| `apiHandler()` | ✅ 完全复用 | 同 Stage2/3 |
| Workspace stage 路由 | ✅ 复用模式，新增 stage | 新增 `lxt-final-script` |
| UI 双栏布局（reasoning + output） | ✅ 复用模式 | 参考 `LxtStoryboardStage.tsx` |
| BullMQ handler 骨架 | ✅ 复用模式 | 参考 `lxt-script-to-storyboard.ts` |
| Prisma 字段 | ❌ 新增 | `scriptContent` 写入 |
| Prompt 模板 | ❌ 新增 | `storyboard_to_script.{zh,en}.txt` |
| TaskType | ❌ 新增 | `LXT_STORYBOARD_TO_SCRIPT` |
| i18n keys | ❌ 新增 | `lxtScript.finalScript.*` |

---

### 文件变更清单

#### 新建

```
lib/prompts/lxt-script/storyboard_to_script.zh.txt    ← 脚本生成 Prompt（中文）
lib/prompts/lxt-script/storyboard_to_script.en.txt    ← 脚本生成 Prompt（英文）
src/lib/workers/handlers/lxt-storyboard-to-script.ts  ← BullMQ handler（备用）
src/app/api/lxt-script/generate-final-script/route.ts ← 流式 SSE API
src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/LxtFinalScriptStage.tsx
                                                       ← Workspace stage 组件
```

#### 修改

```
prisma/schema.prisma
  → NovelPromotionEpisode 新增 scriptContent String? @db.Text

src/lib/task/types.ts
  → 新增 LXT_STORYBOARD_TO_SCRIPT: 'lxt_storyboard_to_script'

src/lib/workers/text.worker.ts
  → 注册 lxt-storyboard-to-script handler

src/lib/llm-observe/task-policy.ts
  → 新增 LXT_STORYBOARD_TO_SCRIPT: LLM_STANDARD_POLICY

src/lib/task/intent.ts
  → 新增 [LXT_STORYBOARD_TO_SCRIPT]: 'convert'

src/lib/task/progress-message.ts
  → 新增 progress key

src/lib/billing/task-policy.ts
  → BILLABLE_TASK_TYPES 新增 LXT_STORYBOARD_TO_SCRIPT
  → switch case 新增（fall through to buildTextTaskInfo）

src/lib/prompt-i18n/prompt-ids.ts
  → 新增 LXT_STORYBOARD_TO_SCRIPT: 'lxt_storyboard_to_script'

src/lib/prompt-i18n/catalog.ts
  → 新增 pathStem: 'lxt-script/storyboard_to_script', variableKeys: ['story', 'script', 'storyboard']

messages/zh/lxtScript.json
  → 新增 finalScript.* keys

messages/en/lxtScript.json
  → 同上英文版

messages/{zh,en}/novel-promotion.json
  → 新增 stages.lxtFinalScript 标签

messages/{zh,en}/progress.json
  → 新增 taskType.lxtStoryboardToScript

messages/{zh,en}/profile.json
  → 新增 lxt_storyboard_to_script

src/app/[locale]/workspace/[projectId]/page.tsx
  → VALID_STAGES 新增 'lxt-final-script'

src/app/.../WorkspaceStageContent.tsx
  → 路由到 LxtFinalScriptStage

src/app/.../hooks/useWorkspaceStageNavigation.ts
  → 新增 lxt-final-script nav 项（Step4，lxt-storyboard 之后）

src/app/.../hooks/useWorkspaceEpisodeStageData.ts
  → 暴露 scriptContent

tests/contracts/task-type-catalog.ts
  → 新增 LXT_STORYBOARD_TO_SCRIPT owner 映射

tests/contracts/tasktype-behavior-matrix.ts
  → 新增 chain/api matrix 行
```

---

### API 流程

```
用户点击「生成脚本」
  → POST /api/lxt-script/generate-final-script
    body: { projectId, episodeId, model? }
  → requireProjectAuth(projectId)
  → episode = prisma.novelPromotionEpisode.findUnique
      select: { novelText, srtContent, shotListContent }
  → 校验 shotListContent 不为空（否则 ApiError INVALID_PARAMS）
  → resolveAnalysisModel(userId, body.model, projectAnalysisModel)
  → getPromptTemplate(LXT_STORYBOARD_TO_SCRIPT, locale)
  → prompt = template
      .replace('{story}', episode.novelText)
      .replace('{script}', episode.srtContent)
      .replace('{storyboard}', episode.shotListContent)
  → chatCompletionStream() + ReadableStream<SSE>
    → onChunk(reasoning) → SSE: {"kind":"reasoning","delta":"..."}
    → onChunk(text)      → SSE: {"kind":"text","delta":"..."}
  → 完成后：prisma.novelPromotionEpisode.update({ scriptContent: fullText })
  → SSE: {"kind":"done"}
```

---

### Prompt 完整设计（`storyboard_to_script.zh.txt`）

#### 逆推分析：输入 → 输出映射规则

**规则一：1:1 映射**

每个分镜对应一个镜头，不合并、不拆分：
- `分镜1` → `镜头1`
- `分镜2` → `镜头2`，以此类推

---

**规则二：镜头文案格式**

| 分镜对白信息 | 镜头文案格式 | 情感推断依据 |
|-------------|-------------|-------------|
| `画外音(旁白)：在一片茂密的森林旁边。` | `旁白-平静:在一片茂密的森林旁边。` | 开篇叙述 → 平静 |
| `画外音(旁白)：猪弟弟却很胆小。` | `旁白-平静:猪弟弟却很胆小。` | 客观描述 → 平静 |
| `猪妈妈(普通对话)：孩子们，千万不可以...` | `猪妈妈-担忧:孩子们，千万不可以走进旁边的森林喔。` | 叮嘱 / 警告 → 担忧 |
| `猪哥哥(普通对话)：弟弟，快醒醒。` | `猪哥哥-兴奋:弟弟，快醒醒。` | 悄声呼唤探险 → 兴奋 |

情感标签有限集：`平静` / `担忧` / `好奇` / `害怕` / `兴奋` / `温柔` / `严肃` / `惊讶` / `悲伤`

---

**规则三：图片提示词结构**

每个镜头的图片提示词分两部分：

**A. 全局物理空间定位**（一句话，描述摄影机 + 角色空间关系）：

| 分镜字段 | 图片提示词全局定位信息来源 |
|----------|--------------------------|
| `场景：猪妈妈家` | `全局物理空间位置: 猪妈妈家,` |
| `画面内容：中景，猪妈妈温柔地站在...` | `猪妈妈站画面中间偏前，面朝镜头；` + 其余角色位置 |
| `出场角色：猪妈妈、猪哥哥、猪弟弟` | 角色分配左/中/右位置 |
| `角色行动：猪妈妈站着，兄弟俩依偎着` | 动作/姿态融入定位描述 |

**B. 4 格分镜图片布局**（左上/右上/左下/右下，代表同一镜头内的 4 个时间切片）：

| 位置 | 内容要点 |
|------|---------|
| 左上 | 初始状态：角色刚进入构图，光线/姿态基础定格 |
| 右上 | 细微推进：角色有轻微动作变化（头部/视线/手势） |
| 左下 | 动作深化：情绪/动作更明显，距离感有变化 |
| 右下 | 定格落点：状态稳定，准备衔接下一镜头 |

每格描述项：`{景别}，场景为{场景名}，{时段与光线}。{角色位置与姿态}。{摄影机说明}`

---

**规则四：视频提示词结构**

4 段折叠叙述（对应4格图片的动态版本）：
```
第一个镜头，镜头{机位/运动}，{角色/场景状态}。
第二个镜头，镜头{机位/运动}，{变化}。
第三个镜头，镜头{机位/运动}，{深化}。
最后一个镜头，镜头{机位/运动}，{定格/衔接感}。
```

关键点：
- 始终说明"镜头是否移动"（固定 / 推近 / 轻微手持 / 跟随）
- 角色位置用画面方向描述（画面中间偏左 / 画面后景右侧 / 后景虚化）
- 结尾说明与下一镜头的衔接意图

---

**规则五：语音分镜标记**

| 对白信息 | 语音分镜输出 |
|---------|------------|
| `画外音(旁白)：xxx` | `旁白` |
| `猪妈妈(普通对话)：xxx` | `猪妈妈` |
| `猪哥哥(普通对话)：xxx` | `猪哥哥` |
| 多条对白（先旁后角色对话） | 取**最后**说话者；若有角色对话优先用角色名 |

---

**规则六：音效推断规则**

| 场景 / 时段 | 音效推断示例 |
|------------|-------------|
| 森林旁，白天 | `树叶被风吹动的沙沙声、远处鸟鸣、草叶轻摆的摩擦声` |
| 猪妈妈家，傍晚 | `夕阳余晖中鸟叫渐少、远处炊烟音效、木屋门口风声` |
| 卧室，夜晚 | `夜晚虫鸣声、细微呼吸声、被褥轻微摩擦声` |
| 家门外，深夜 | `夜风声、草地踩踏声、远处林鸣与枝叶颤动声` |
| 角色对话场景 | 在环境音基础上加：`衣料摩擦声、木板轻响、脚步声` |

---

#### 完整 Prompt 文本

```
你是一名专业的 LXT 短视频制作统筹，精通 AI 图生图 / TTS / 视频生成提示词工程。
请将以下分镜脚本转换为完整的制作脚本（镜头级别），用于驱动 AI 图像生成、TTS 配音与视频生成。

【任务说明】
- 输入包含：①故事原文（背景参考），②剧本（台词参考），③分镜脚本（主要输入）
- 每个分镜严格对应一个镜头，1:1 转换，不合并、不拆分、不省略
- 每个镜头产出以下 6 个字段，格式严格不变

【字段生成规则】

1. 镜头文案（TTS 文案）
   格式：{说话者}-{情感}:{台词}
   - 说话者来自分镜"对白信息"中的说话主体（旁白/角色名）
   - 情感从以下选择：平静 / 担忧 / 好奇 / 害怕 / 兴奋 / 温柔 / 严肃 / 惊讶 / 悲伤
   - 根据叙事上下文与故事原文判断情感，不要全部标"平静"
   - 直接输出台词，不加引号

2. 图片提示词
   分两部分拼接，中间用"；"分隔：
   
   A. 全局物理空间定位（必须包含以下所有信息）：
      "全局物理空间位置: {场景名称}, {摄影机朝向}；{每个出场角色的画面位置与姿态}；{摄影机运动说明}"
   
   B. 4 格分镜图片布局（"；分镜图片布局："开头，然后4格）：
      左上图片：{景别}，场景为{场景}，{时间/光线}。{角色姿态/画面构成详述}。{摄影机说明}。
      右上图片：{同景别}，{角色发生轻微变化}。{摄影机稳定说明}。
      左下图片：{同景别}，{动作/情绪深化}。{摄影机说明}。
      右下图片：{同景别}，{状态定格，衔接下一镜准备}。{摄影机说明}。

3. 视频提示词
   4 段顺序描述，每段开头固定为：第一个镜头 / 第二个镜头 / 第三个镜头 / 最后一个镜头
   每段格式："{开头}，{镜头机位与运动}，{角色/场景变化}。"
   注意：最后一段说明与下一镜头的视觉衔接意图

4. 景别
   留空（不填写任何内容，景别已融入图片提示词）

5. 语音分镜
   - 仅写说话者名称（旁白 或 角色名）
   - 若分镜含多条对白，优先取角色对话的说话者；若全为旁白，写"旁白"

6. 音效
   根据分镜的场景、时段、情绪，描述3–5种具体环境音或动效，末尾加句号
   风格参考：草叶摩擦声、木屋门板声、细微脚步声、远处鸟鸣、夜风声、虫鸣声

【输出格式（严格遵守，禁止输出任何额外内容）】

镜头{N}
镜头文案:{说话者}-{情感}:{台词}
图片提示词:{全局空间定位}；分镜图片布局：左上图片:{描述}。；右上图片:{描述}。；左下图片:{描述}。；右下图片:{描述}。
视频提示词:第一个镜头，{叙述}。第二个镜头，{叙述}。第三个镜头，{叙述}。最后一个镜头，{叙述}。
景别:
语音分镜:{说话者}
音效:{音效描述}。

（每个镜头之间空一行，从镜头1开始连续输出至最后一个镜头，不得添加开场白、序言、总结语）

【故事原文（背景参考）】

{story}

【剧本内容（台词参考）】

{script}

【分镜脚本（主要转换输入）】

{storyboard}
```

---

### Prompt 变量说明

| 变量 | 数据来源 | 说明 |
|------|---------|------|
| `{story}` | `episode.novelText` | 原始故事，提供情感/场景背景参考 |
| `{script}` | `episode.srtContent` | 剧本台词，辅助情感判断 |
| `{storyboard}` | `episode.shotListContent` | 主要转换输入，每个分镜 → 一个镜头 |

---

### i18n 新增 Keys 规划

```json
// messages/zh/lxtScript.json（追加）
{
  "finalScript": {
    "title": "生成脚本",
    "description": "将分镜转换为 AI 图生图 / TTS / 视频提示词制作脚本",
    "generateButton": "生成脚本",
    "generating": "生成中...",
    "storyLabel": "故事原文",
    "storyPlaceholder": "故事原文将在此显示...",
    "reasoningLabel": "思考过程",
    "reasoningPlaceholder": "AI 的推理过程将在此实时显示...",
    "outputLabel": "脚本输出",
    "outputPlaceholder": "AI 生成的制作脚本将在此显示...",
    "noStoryboard": "当前集尚未生成分镜，请先完成「生成分镜」步骤",
    "goToStoryboardStage": "前往分镜生成"
  }
}
```

---

### 实施顺序（建议）

```
1. prisma/schema.prisma + npx prisma generate   → 数据模型（新增 scriptContent）
2. src/lib/task/types.ts + 注册表               → 基础设施（billing/llm-observe/intent/progress）
3. lib/prompts/lxt-script/storyboard_to_script.{zh,en}.txt  → Prompt 模板
4. src/lib/prompt-i18n/{prompt-ids,catalog}.ts  → Prompt 注册
5. src/lib/workers/handlers/lxt-storyboard-to-script.ts     → BullMQ handler（备用）
6. src/app/api/lxt-script/generate-final-script/route.ts    → 流式 SSE API
7. messages/{zh,en}/lxtScript.json              → i18n keys
8. messages/{zh,en}/{novel-promotion,progress,profile}.json → 其余 i18n keys
9. LxtFinalScriptStage.tsx                      → UI 组件
10. Workspace 路由（page.tsx / WorkspaceStageContent / hooks）
11. tests/contracts/                            → 合约测试
12. npx next build                              → 验证
```

---

## Stage 5：LXT 资产绑定与语音设计 — 规划

### 研究结论：现有资产基础设施分析

#### novel-promotion 资产流程（现有）

```
ANALYZE_NOVEL 任务
  → LLM 从小说文本提取角色/场景/道具
  → 写入 NovelPromotionCharacter / NovelPromotionLocation 表（项目级别）
  → 触发图片生成流水线（CharacterAppearance / LocationImage）
  → AssetsStage.tsx 展示：CharacterSection + LocationSection
  → VoiceSettings.tsx 为每个角色配置语音
  → character-voice API（PATCH/POST）写回 NovelPromotionCharacter.voiceId
```

#### LXT 模式的差异

| 维度 | Novel-Promotion | LXT 模式 |
|------|----------------|---------|
| **角色来源** | LLM 从文本提取（异步任务） | 正则从 `shotListContent` 提取（客户端即时） |
| **数据粒度** | 项目级（所有集共享） | 分集级（每集独立绑定） |
| **图片生成** | 全流水线（Task → BullMQ → 图片模型） | 不生成；直接引用全局资产库已有图片 |
| **资产获取** | 先提取后绑定全局（可选） | **先从全局资产库选，再绑定** |
| **场景处理** | `NovelPromotionLocation` + 图片生成 | 绑定全局 location，不生成图片 |
| **与现有代码的关系** | 核心路径 | **零侵入** — 独立表 + 独立 API |

#### 关键发现：不能复用 NovelPromotionCharacter 的原因

1. `NovelPromotionCharacter` 是**项目级**的；LXT 分集各自选不同角色组合
2. 使用同一张表会导致 LXT 角色与 novel-promotion 的 `ANALYZE_NOVEL` 结果混杂
3. `character-voice` API 写的是 `NovelPromotionCharacter.voiceId`，不适合 episode 粒度的绑定
4. `AssetsStage` 复杂度极高（角色档案、批量生成、图谱视图…），LXT 不需要这些

---

### 目标

将分镜脚本（`shotListContent`）中的角色和场景名称与**全局资产库**绑定，并为角色配置语音，为后续 AI 图生图 / TTS / 视频生成提供角色视觉和语音参考。

**阶段位置**：`lxt-storyboard` 之后，`lxt-final-script` 之前（Stage ID: `lxt-assets`）

---

### 数据模型设计

#### 新建表 `LxtAssetBinding`（仅 LXT 专用）

```prisma
model LxtAssetBinding {
  id               String   @id @default(uuid())
  episodeId        String
  kind             String   // 'character' | 'location'
  storyboardName   String   // 分镜中使用的名称（如"猪妈妈"、"森林旁"）
  globalAssetId    String?  // 绑定的全局资产 ID（GlobalCharacter.id 或 GlobalLocation.id）
  // 以下字段仅 kind='character' 时使用
  voiceId          String?
  voiceType        String?  // 'bailian' | 'fal' | 'custom' | 'indextts'
  customVoiceUrl   String?  @db.Text
  createdAt        DateTime @default(now())
  updatedAt        DateTime @default(now()) @updatedAt
  episode          NovelPromotionEpisode @relation(fields: [episodeId], references: [id], onDelete: Cascade)

  @@unique([episodeId, kind, storyboardName])
  @@index([episodeId])
  @@map("lxt_asset_bindings")
}
```

> `NovelPromotionEpisode` 同时追加反向关系字段：`lxtAssetBindings LxtAssetBinding[]`

#### 分镜名称提取逻辑（客户端正则，无需 API）

```typescript
// 从 shotListContent 提取角色名和场景名
function extractFromStoryboard(shotListContent: string) {
  const characterSet = new Set<string>()
  const locationSet = new Set<string>()

  // 提取角色：匹配"出场角色：xxx"，按"、"或"，"拆分，过滤"无"
  const charMatches = shotListContent.matchAll(/出场角色：([^\n角]+)/g)
  for (const match of charMatches) {
    match[1].split(/[、，,]/).map(s => s.trim())
      .filter(s => s && s !== '无')
      .forEach(name => characterSet.add(name))
  }

  // 提取场景：匹配"场景：xxx"
  const locMatches = shotListContent.matchAll(/场景：([^\n]+)/g)
  for (const match of locMatches) {
    const name = match[1].trim()
    if (name) locationSet.add(name)
  }

  return {
    characters: [...characterSet],
    locations: [...locationSet],
  }
}
```

---

### 新增 API 设计

| 路由 | 方法 | 说明 |
|------|------|------|
| `/api/lxt-script/[episodeId]/asset-bindings` | GET | 获取当前集所有绑定（含全局资产详情） |
| `/api/lxt-script/[episodeId]/asset-bindings` | POST | 批量 upsert 绑定（从分镜提取的名称列表） |
| `/api/lxt-script/[episodeId]/asset-bindings/[id]` | PATCH | 绑定/解绑全局资产（`globalAssetId`） |
| `/api/lxt-script/[episodeId]/asset-bindings/[id]/voice` | POST | AI 语音设计或上传自定义语音；保存到绑定记录 |

#### 复用的现有 API（直接调用，零修改）

| API | 用途 |
|-----|------|
| `GET /api/asset-hub/characters?folderId=...` | 全局角色列表（供选择器使用） |
| `GET /api/asset-hub/characters/[id]` | 已绑定角色详情（含图片） |
| `GET /api/asset-hub/voices` | 全局音色库列表 |
| BullMQ `voice-design.ts` handler | AI 语音设计任务（复用 handler，修改保存目标） |

---

### 复用 vs 新建分析

| 组件/逻辑 | 复用 / 新建 | 说明 |
|---------|-----------|------|
| `AssetsStage.tsx` | ❌ 不复用 | 项目级、含图片生成流水线，LXT 不需要 |
| `VoiceStage.tsx` | ❌ 不复用 | 依赖 `VoiceLine` 表 + `NP_VOICE_ANALYSIS` 任务 |
| `VoiceSettings.tsx` | ⚙️ 参考重写 | 提取音色设计/上传交互模式；新建 `LxtVoiceSettings.tsx` |
| `WorkspaceAssetLibraryModal` | ❌ 不复用 | 渲染完整 `AssetsStage`，LXT 只需轻量选择器 |
| 全局资产选择器 UI | ⚙️ 提取 | 从 `AssetsStage` 内部的 asset-picker 提取选择器模态框 |
| `requireProjectAuth()` | ✅ 复用 | Auth 逻辑不变 |
| `apiHandler()` | ✅ 复用 | 错误包装不变 |
| `chatCompletionStream()` + voice design handler | ✅ 复用 | 语音设计内核复用 |
| `/api/asset-hub/characters` GET | ✅ 复用 | 直接调用获取全局角色列表 |

---

### UI 布局

```
┌──────────────────────────────────────────────────────────────────────┐
│  LXT 资产绑定                          [重新从分镜提取]  进入脚本生成 → │
├──────────────────┬───────────────────────────────────────────────────┤
│                  │                                                    │
│  角色 (N 个)     │  当前选中角色：猪妈妈                              │
│  ─────────────   │  ┌──────────────────────────────────────────────┐ │
│  ◎ 猪妈妈 ✓绑定  │  │  全局角色  [从资产库选择] [解除绑定]          │ │
│  ○ 猪哥哥 · 未   │  │  头像: [图片]  名称: 白发老奶奶               │ │
│  ○ 猪弟弟 · 未   │  │  描述: "温柔的母亲形象..."                    │ │
│                  │  ├──────────────────────────────────────────────┤ │
│  场景 (M 个)     │  │  语音  [🔴 未配置]                            │ │
│  ─────────────   │  │  [AI 设计] [从音色库选] [上传自定义音频]       │ │
│  ○ 森林旁 · 未   │  │  [▶ 试听]                                     │ │
│  ◎ 猪妈妈家 ✓绑  │  └──────────────────────────────────────────────┘ │
│  ○ 猪兄弟卧室    │                                                    │
│  ○ 猪兄弟家外    │                                                    │
└──────────────────┴───────────────────────────────────────────────────┘
```

- 左侧：从 `shotListContent` 提取的角色/场景名列表（分组），点击切换右侧详情
- 右侧：绑定详情面板
  - 若 `kind='character'`：全局角色绑定 + 语音设计区
  - 若 `kind='location'`：全局场景绑定（仅绑定，无语音）

---

### 工作流

```
用户进入 lxt-assets stage
  → 读取 episode.lxtAssetBindings（GET /api/lxt-script/[episodeId]/asset-bindings）
  → 若为空 / 分镜有更新：
      客户端正则提取角色名+场景名
      → POST /api/lxt-script/[episodeId]/asset-bindings（批量 upsert）
  → 渲染绑定列表（默认选中第一项）

用户点击 [从资产库选择]
  → 弹出全局资产选择器 Modal（新建轻量组件，内部调用 /api/asset-hub/characters）
  → 用户选择 → PATCH /api/lxt-script/[episodeId]/asset-bindings/[id]
      { globalAssetId: "xxx" }
  → UI 刷新：显示已绑定角色头像和名称

用户点击 [AI 设计] 语音
  → POST /api/lxt-script/[episodeId]/asset-bindings/[id]/voice
      { voicePrompt, previewText }
  → BullMQ VOICE_DESIGN 任务（复用 voice-design handler）
  → 完成后写入 LxtAssetBinding.voiceId / voiceType
  → UI 刷新：显示 [▶ 试听] 按钮

用户点击 [进入脚本生成]
  → 跳转到 lxt-final-script stage
```

---

### 文件变更清单

#### 新建

```
prisma/schema.prisma
  → LxtAssetBinding model（新建表）

src/app/api/lxt-script/[episodeId]/asset-bindings/route.ts
  → GET（获取绑定列表，含全局资产详情）
  → POST（批量 upsert 角色/场景名称 → LxtAssetBinding）

src/app/api/lxt-script/[episodeId]/asset-bindings/[id]/route.ts
  → PATCH（绑定/解绑全局资产 globalAssetId）

src/app/api/lxt-script/[episodeId]/asset-bindings/[id]/voice/route.ts
  → POST（AI 语音设计 / 上传自定义音频）

src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/LxtAssetsStage.tsx
  → 主 UI 组件（左侧列表 + 右侧详情面板）

src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/lxt-assets/
  → LxtAssetList.tsx           ← 角色/场景名称列表（左侧）
  → LxtAssetBindingPanel.tsx   ← 绑定详情面板（右侧）
  → LxtVoiceSettings.tsx       ← 语音设计区（参考 VoiceSettings.tsx）
  → GlobalAssetPicker.tsx      ← 轻量全局资产选择器 Modal
  → useExtractFromStoryboard.ts ← 正则提取 hook
  → useAssetBindings.ts        ← API 交互 hook
```

#### 修改

```
prisma/schema.prisma
  → NovelPromotionEpisode 追加反向关系：lxtAssetBindings LxtAssetBinding[]

src/app/[locale]/workspace/[projectId]/page.tsx
  → VALID_STAGES 新增 'lxt-assets'

src/app/.../WorkspaceStageContent.tsx
  → 新增 {currentStage === 'lxt-assets' && <LxtAssetsStage />}

src/app/.../hooks/useWorkspaceStageNavigation.ts
  → 新增 lxt-assets 导航项（位于 lxt-storyboard 之后，lxt-final-script 之前）
  → getStageStatus('lxt-assets')：有绑定 → 'ready'，无 → 'active'

messages/zh/lxtScript.json
  → 新增 assets.* keys（title, description, extractButton,
     characterLabel, locationLabel, bindButton, unbindButton,
     voiceDesign, voiceFromLibrary, voiceUpload, voicePlay,
     notBound, bound, noStoryboard, goToStoryboardStage）

messages/en/lxtScript.json
  → 同上英文版

messages/zh/novel-promotion.json
  → 新增 "lxtAssets": "LXT 资产绑定"

messages/en/novel-promotion.json
  → 新增 "lxtAssets": "LXT Assets"
```

---

### 对现有代码的零侵入保证

| 现有文件 | 是否修改 | 说明 |
|----------|---------|------|
| `AssetsStage.tsx` | ❌ | 不动 |
| `VoiceStage.tsx` / `voice-stage-runtime-core.tsx` | ❌ | 不动 |
| `NovelPromotionCharacter` 表 | ❌ | 不动 |
| `NovelPromotionLocation` 表 | ❌ | 不动 |
| `ANALYZE_NOVEL` 任务流 | ❌ | 不动 |
| `character-voice` / `speaker-voice` API | ❌ | 不动 |
| `WorkspaceAssetLibraryModal` | ❌ | 不动 |

唯一修改的现有文件：
- `page.tsx`（VALID_STAGES 追加，纯追加操作）
- `WorkspaceStageContent.tsx`（追加条件分支）
- `useWorkspaceStageNavigation.ts`（追加 nav 项）
- `messages/` JSON 文件（追加 key）
- `prisma/schema.prisma`（追加新表 + episode 反向关系）

---

### 实施顺序

```
1. prisma/schema.prisma                           → 新增 LxtAssetBinding 表
   + NovelPromotionEpisode 反向关系
   → npx prisma generate（杀掉 node 进程后执行）

2. src/app/api/lxt-script/[episodeId]/asset-bindings/route.ts
   → GET + POST

3. src/app/api/lxt-script/[episodeId]/asset-bindings/[id]/route.ts
   → PATCH

4. src/app/api/lxt-script/[episodeId]/asset-bindings/[id]/voice/route.ts
   → POST（调用 VOICE_DESIGN BullMQ 任务，写回 LxtAssetBinding）

5. src/app/.../lxt-assets/useExtractFromStoryboard.ts
   → 正则提取逻辑（纯函数 + hook）

6. src/app/.../lxt-assets/useAssetBindings.ts
   → API 交互 hook（GET/POST/PATCH）

7. src/app/.../lxt-assets/GlobalAssetPicker.tsx
   → 轻量全局资产选择器 Modal

8. src/app/.../lxt-assets/LxtVoiceSettings.tsx
   → 参考 VoiceSettings.tsx，重写为操作 LxtAssetBinding 的版本

9. src/app/.../lxt-assets/LxtAssetList.tsx + LxtAssetBindingPanel.tsx

10. src/app/.../components/LxtAssetsStage.tsx
    → 组合 LxtAssetList + LxtAssetBindingPanel

11. messages/{zh,en}/lxtScript.json + novel-promotion.json
    → i18n keys

12. Workspace 路由接入
    → page.tsx / WorkspaceStageContent / useWorkspaceStageNavigation

13. npx next build                               → 验证
```

---

## LXT 独立化 — 架构方案（规划）

### 背景与动机

当前 LXT 寄生在 `novel-promotion` 工作台内：
- 创建项目时无论选什么，都会创建 `NovelPromotionProject` 记录
- LXT 的 Stage 数据存在 `NovelPromotionEpisode`（srtContent / shotListContent / scriptContent）
- LXT API 路由通过 `prisma.novelPromotionEpisode` 和 `prisma.novelPromotionProject` 读写
- LXT stages 与 novel-promotion stages 在同一个 workspace 中，逻辑上"混搭"

目标：
- **创建项目时可选模式**：通用模式（novel-promotion）或 LXT 模式
- **LXT 使用独立表**，不污染 `NovelPromotionProject` / `NovelPromotionEpisode`
- **两种模式互不干扰**，现有 novel-promotion 项目不受任何影响
- **最大化复用基础设施**（Auth、SSE 流式、BullMQ、UsageCost 计费均不变）

---

### 现有耦合点分析

| 耦合点 | 文件 | 描述 |
|--------|------|------|
| 项目创建 | `POST /api/projects` | 始终创建 `NovelPromotionProject`，无 mode 分支 |
| episode 数据 | `NovelPromotionEpisode` | LXT 的 srtContent/shotListContent/scriptContent 存于此 |
| LXT API 读写 | `generate-script/storyboard/final-script` routes | 通过 `prisma.novelPromotionEpisode` 读写 |
| LXT 模型配置 | 同上 3 个 routes | 通过 `prisma.novelPromotionProject.analysisModel` 读取 |
| workspace 主页 | `page.tsx` | 始终渲染 `NovelPromotionWorkspace`，无模式判断 |
| 项目列表统计 | `GET /api/projects` | `novelProjects` 统计查询假设所有项目都是 novel-promotion |
| 项目数据 API | `GET /api/projects/[id]/data` | 只查 `novelPromotionData`，LXT 项目也用此结果 |

---

### 目标架构

```
Project (projects 表)
  ├── mode: 'novel-promotion' | 'lxt'       ← 新增字段（默认 'novel-promotion'）
  ├── novelPromotionData?: NovelPromotionProject  ← mode='novel-promotion' 时存在
  └── lxtData?:            LxtProject            ← mode='lxt' 时存在（新建）

LxtProject (lxt_projects 表) — 新建
  ├── projectId  String @unique
  ├── analysisModel String?
  └── episodes   LxtEpisode[]

LxtEpisode (lxt_episodes 表) — 新建
  ├── lxtProjectId  String
  ├── episodeNumber Int
  ├── name          String
  ├── novelText     String? @db.Text    ← 原文（Step 1 输入）
  ├── srtContent    String? @db.Text    ← 剧本（Stage 2 输出）
  ├── shotListContent String? @db.Text  ← 分镜（Stage 3 输出）
  └── scriptContent String? @db.Text    ← 脚本（Stage 4 输出）
```

**现有 `NovelPromotionProject` / `NovelPromotionEpisode` 不做任何修改。**

---

### 迁移策略（存量数据）

- 所有**已有项目**（含当前寄生在 NP 中的 LXT 数据）的 `mode` 字段默认为 `'novel-promotion'`
- 已有的 LXT stage 数据（存在 `NovelPromotionEpisode` 中）**继续保留**，旧有项目继续正常工作
- 新建 LXT 模式项目才使用 `LxtProject` / `LxtEpisode` 新表
- 无需数据迁移脚本，**零风险上线**

---

### 数据模型变更

#### `Project` 表新增字段

```prisma
model Project {
  id                 String                 @id @default(uuid())
  name               String
  description        String?                @db.Text
  userId             String
  mode               String                 @default("novel-promotion")  // ← 新增
  createdAt          DateTime               @default(now())
  updatedAt          DateTime               @default(now()) @updatedAt
  lastAccessedAt     DateTime?
  novelPromotionData NovelPromotionProject?
  lxtData            LxtProject?                                          // ← 新增
  user               User                   @relation(fields: [userId], references: [id], onDelete: Cascade)
  usageCosts         UsageCost[]

  @@index([userId])
  @@map("projects")
}
```

#### 新建 `LxtProject` 表

```prisma
model LxtProject {
  id            String       @id @default(uuid())
  projectId     String       @unique
  analysisModel String?
  createdAt     DateTime     @default(now())
  updatedAt     DateTime     @default(now()) @updatedAt
  project       Project      @relation(fields: [projectId], references: [id], onDelete: Cascade)
  episodes      LxtEpisode[]

  @@map("lxt_projects")
}
```

#### 新建 `LxtEpisode` 表

```prisma
model LxtEpisode {
  id              String     @id @default(uuid())
  lxtProjectId    String
  episodeNumber   Int
  name            String
  novelText       String?    @db.Text
  srtContent      String?    @db.Text
  shotListContent String?    @db.Text
  scriptContent   String?    @db.Text
  createdAt       DateTime   @default(now())
  updatedAt       DateTime   @default(now()) @updatedAt
  lxtProject      LxtProject @relation(fields: [lxtProjectId], references: [id], onDelete: Cascade)

  @@unique([lxtProjectId, episodeNumber])
  @@index([lxtProjectId])
  @@map("lxt_episodes")
}
```

---

### 复用 vs 新建分析

| 基础设施 | 复用 / 新建 | 说明 |
|---------|-----------|------|
| `requireProjectAuth()` / `requireUserAuth()` | ✅ 完全复用 | Auth 逻辑不变 |
| `apiHandler()` / `ApiError` | ✅ 完全复用 | 错误包装不变 |
| `chatCompletionStream()` | ✅ 完全复用 | SSE 内核不变 |
| `resolveAnalysisModel()` | ✅ 复用模式 | 改为从 `LxtProject.analysisModel` 读取 |
| `UsageCost` 计费表 | ✅ 完全复用 | 仍关联 `projectId`，不变 |
| BullMQ handlers | ✅ 完全复用 | handler 只操作 episode 数据，换表即可 |
| `WorkspaceHeaderShell` | ✅ 完全复用 | LXT workspace 继续使用这个 header |
| `WorkspaceStageContent` | ✅ 复用模式 | LXT workspace 只渲染 lxt-* stage 组件 |
| `WorkspaceStageRuntimeProvider` | ✅ 完全复用 | stage runtime 不感知数据来源 |
| `NovelPromotionWorkspace.tsx` | ⚙️ 保留原样 | NP 模式不变；LXT 新建 `LxtWorkspace.tsx` |
| `POST /api/projects` | ⚙️ 新增 mode 分支 | mode='lxt' 时创建 LxtProject，否则原逻辑 |
| `GET /api/projects` (listing) | ⚙️ 扩展统计 | 并行查 LXT 集数，合并到 stats |
| `GET /api/projects/[id]/data` | ⚙️ 扩展 | mode='lxt' 时查 lxtData；mode='novel-promotion' 时原逻辑 |
| `generate-script` / `generate-storyboard` / `generate-final-script` routes | ⚙️ 换表 | 从 `NovelPromotionEpisode` 改为 `LxtEpisode` |
| LXT episode CRUD | ❌ 全新 | `POST/PATCH/DELETE /api/lxt/[projectId]/episodes` |
| `LxtWorkspace.tsx` | ❌ 全新 | LXT 工作台根组件（复用 NP workspace shell 结构） |
| `LxtWorkspaceProvider.tsx` | ❌ 全新 | 提供 episodeId、onRefresh 等 context |
| `useWorkspaceEpisodeStageData` (LXT 版) | ❌ 全新 | 读取 LxtEpisode 数据（或扩展原 hook 支持 LXT） |
| 工作台 page.tsx 模式路由 | ⚙️ 新增条件分支 | `project.mode === 'lxt'` → 渲染 `LxtWorkspace` |
| 创建项目弹窗 | ⚙️ 新增模式选择 UI | 两个选项：通用模式 / LXT 模式 |

---

### 新建 API 设计

#### LXT Episode CRUD

| 路由 | 方法 | 说明 |
|------|------|------|
| `/api/lxt/[projectId]/episodes` | POST | 创建 LxtEpisode |
| `/api/lxt/[projectId]/episodes/[episodeId]` | PATCH | 重命名集（name） |
| `/api/lxt/[projectId]/episodes/[episodeId]` | DELETE | 删除集 |
| `/api/lxt/[projectId]/episodes/[episodeId]` | GET | 获取单集详情 |

#### LXT 生成 API（换表）

原有的 3 个 generate-* routes 改为操作 `LxtEpisode` 而非 `NovelPromotionEpisode`：

```typescript
// 修改前（generate-script/route.ts）
const episode = await prisma.novelPromotionEpisode.findUnique({ where: { id: episodeId } })
const novelData = await prisma.novelPromotionProject.findUnique({ where: { projectId } })
// ...
await prisma.novelPromotionEpisode.update({ where: { id: episodeId }, data: { srtContent } })

// 修改后
const episode = await prisma.lxtEpisode.findUnique({ where: { id: episodeId } })
const lxtProject = await prisma.lxtProject.findUnique({ where: { projectId } })
// ...
await prisma.lxtEpisode.update({ where: { id: episodeId }, data: { srtContent } })
```

> **注意**：仅当 `project.mode === 'lxt'` 时调用这些 routes；mode 校验在 auth 后加一行即可。

---

### UI 变更详情

#### 1. 创建项目弹窗（`/workspace/page.tsx`）

新增模式选择区域：

```
┌─────────────────────────────────────────────────────┐
│  项目名称：[___________]                             │
│  描述：    [___________]                             │
│                                                     │
│  选择模式：                                          │
│  ┌──────────────────┐  ┌──────────────────────────┐ │
│  │  📖 通用模式     │  │  🎬 LXT 短剧模式         │ │
│  │  (默认)          │  │                          │ │
│  │  AI 分镜、图片、 │  │  小说→剧本→分镜→脚本     │ │
│  │  视频、配音全流程│  │  轻量化 AI 短剧制作流程  │ │
│  └──────────────────┘  └──────────────────────────┘ │
│                                                     │
│  [取消]  [创建项目]                                 │
└─────────────────────────────────────────────────────┘
```

- 默认选中"通用模式"（保持现有行为）
- 选 LXT 模式后，POST `/api/projects` body 中携带 `mode: 'lxt'`

#### 2. 项目列表卡片

在项目卡片左上角显示模式徽章：
- 通用模式：不显示（保持现有外观不变）
- LXT 模式：小徽章 `🎬 LXT`

#### 3. workspace 主页（`/workspace/[projectId]/page.tsx`）

```typescript
// 现有：始终渲染 NovelPromotionWorkspace
<NovelPromotionWorkspace ... />

// 修改后：读取 project.mode 分发
{project.mode === 'lxt' ? (
  <LxtWorkspace
    project={project}
    projectId={projectId}
    lxtEpisodes={lxtEpisodes}
    selectedEpisodeId={selectedEpisodeId}
    ...
  />
) : (
  <NovelPromotionWorkspace ... />  // 原逻辑不变
)}
```

#### 4. LxtWorkspace.tsx（新建）

比 `NovelPromotionWorkspace.tsx` 简单得多：
- 无 SmartImportWizard（LXT 手动创建集）
- 无 GlobalAnalysis 按钮
- 无 artStyle / characterModel / locationModel 等模型配置（只有 analysisModel）
- stages 只展示 `lxt-script → lxt-storyboard → lxt-final-script`
- episode CRUD 调用 `/api/lxt/[projectId]/episodes`（新建 API）

复用的 workspace 组件：
- `WorkspaceHeaderShell`（header 外壳）
- `WorkspaceStageContent`（stage 内容路由，LXT stages 已存在）
- `WorkspaceStageRuntimeProvider`（stage runtime）
- 个别 stage 组件：`LxtScriptStage` / `LxtStoryboardStage` / `LxtFinalScriptStage`

---

### 文件变更清单

#### 新建

```
prisma/schema.prisma
  → model LxtProject { ... }
  → model LxtEpisode { ... }
  → Project.mode 字段
  → Project.lxtData 关系

prisma/migrations/
  → 新迁移：add_lxt_mode_and_tables

src/app/api/lxt/[projectId]/episodes/route.ts
  → POST（创建 LxtEpisode）

src/app/api/lxt/[projectId]/episodes/[episodeId]/route.ts
  → GET（单集详情）/ PATCH（重命名）/ DELETE

src/app/[locale]/workspace/[projectId]/modes/lxt/
  → LxtWorkspace.tsx                  ← LXT 工作台根组件
  → LxtWorkspaceProvider.tsx          ← Context（episodeId, onRefresh 等）
  → hooks/
      → useLxtEpisodeData.ts          ← 读取 LxtEpisode 数据
      → useLxtEpisodeCrud.ts          ← CRUD hook（create/rename/delete）
      → useLxtStageNavigation.ts      ← LXT 专属 stage nav（只含 lxt-* stages）
  → components/
      → LxtEpisodeList.tsx            ← 集列表侧边栏（无导入向导）
```

#### 修改

```
prisma/schema.prisma
  → Project 追加 mode / lxtData（已含于上方）

src/app/api/projects/route.ts
  → POST：接收 mode 参数；mode='lxt' 时创建 LxtProject，跳过 NovelPromotionProject 创建
  → GET：统计查询扩展 LXT 集数（并行查 lxtProjects，合并 episodes count）

src/app/api/projects/[projectId]/data/route.ts
  → 读取 project.mode；mode='lxt' 时查 lxtData.episodes 返回；否则保持原逻辑

src/app/api/lxt-script/generate-script/route.ts
  → episode 从 prisma.lxtEpisode 读取（而非 novelPromotionEpisode）
  → 模型从 prisma.lxtProject 读取（而非 novelPromotionProject）
  → 结果写回 prisma.lxtEpisode

src/app/api/lxt-script/generate-storyboard/route.ts
  → 同上，换表

src/app/api/lxt-script/generate-final-script/route.ts
  → 同上，换表

src/app/[locale]/workspace/[projectId]/page.tsx
  → 读取 project.mode
  → mode='lxt' 时渲染 LxtWorkspace；否则原逻辑（含 SmartImportWizard 判断等不变）
  → LXT 的 episode 操作改用 /api/lxt/[projectId]/episodes

src/app/[locale]/workspace/page.tsx
  → 创建项目弹窗新增模式选择 UI（通用模式 / LXT 模式）
  → POST /api/projects body 携带 mode

messages/zh/workspace.json（或对应 namespace）
  → 新增 createModal.modeLabel / modeNovelPromotion / modeLxt 等 key

messages/en/workspace.json
  → 同上英文版
```

---

### 对现有代码的零侵入保证

| 现有路径 | 是否修改 | 说明 |
|---------|---------|------|
| `NovelPromotionProject` 表 | ❌ | 不动 |
| `NovelPromotionEpisode` 表 | ❌ | 不动（存量 LXT 数据继续保留） |
| `NovelPromotionWorkspace.tsx` 及其所有子组件 | ❌ | 不动 |
| novel-promotion 所有 stage 组件（AssetsStage/VoiceStage 等）| ❌ | 不动 |
| novel-promotion 所有 API routes（`/api/novel-promotion/*`）| ❌ | 不动 |
| BullMQ worker 和 handler（ANALYZE_NOVEL / VOICE_ANALYZE 等）| ❌ | 不动 |
| `SmartImportWizard` | ❌ | 不动 |
| 现有项目数据 | ❌ | 默认 mode='novel-promotion'，零影响 |

**只有 5 个现有文件被改动**：
1. `prisma/schema.prisma`（追加字段+表）
2. `POST /api/projects`（增加 mode 分支）
3. `GET /api/projects`（增加 LXT 统计）
4. `GET /api/projects/[id]/data`（增加 mode='lxt' 分支）
5. `workspace/[projectId]/page.tsx`（增加 mode 路由分支）
6. `workspace/page.tsx`（增加弹窗模式选择 UI）
7. `generate-script/storyboard/final-script`（3 个 routes 换表，逻辑不变）

---

### 实施顺序（建议）

```
1. prisma/schema.prisma
   → 追加 Project.mode / Project.lxtData
   → 新建 model LxtProject + model LxtEpisode
   → npx prisma migrate dev --name add_lxt_mode_and_tables
   → npx prisma generate

2. src/app/api/lxt/[projectId]/episodes/route.ts（POST）
   src/app/api/lxt/[projectId]/episodes/[episodeId]/route.ts（GET/PATCH/DELETE）
   → LxtEpisode CRUD API

3. src/app/api/projects/route.ts POST
   → 接收 mode 参数，mode='lxt' 时 create LxtProject

4. src/app/api/projects/[projectId]/data/route.ts
   → mode='lxt' 分支：返回 lxtData.episodes

5. src/app/api/projects/route.ts GET
   → 统计扩展：并行查 lxtProjects，合并 episode 数

6. src/app/api/lxt-script/generate-script/route.ts
   src/app/api/lxt-script/generate-storyboard/route.ts
   src/app/api/lxt-script/generate-final-script/route.ts
   → 3 个 routes 统一换表：novelPromotionEpisode → lxtEpisode
                              novelPromotionProject → lxtProject

7. src/app/[locale]/workspace/[projectId]/modes/lxt/
   → LxtWorkspaceProvider.tsx
   → hooks/useLxtEpisodeData.ts
   → hooks/useLxtEpisodeCrud.ts
   → hooks/useLxtStageNavigation.ts
   → components/LxtEpisodeList.tsx

8. src/app/[locale]/workspace/[projectId]/modes/lxt/LxtWorkspace.tsx
   → 组合 WorkspaceHeaderShell + stage nav + LxtEpisodeList + WorkspaceStageContent

9. src/app/[locale]/workspace/[projectId]/page.tsx
   → mode='lxt' → <LxtWorkspace />；其余不变

10. src/app/[locale]/workspace/page.tsx
    → 创建弹窗增加模式选择 UI
    → POST body 携带 mode

11. messages/{zh,en}/ 相关 JSON
    → 新增 workspace 弹窗 mode 相关 key

12. npx next build                    → 验证
```

---

### 潜在风险与注意事项

1. **存量 LXT 数据去向**：现有项目的 LXT 数据（`NovelPromotionEpisode.srtContent` 等）随项目继续以 `novel-promotion` 模式工作，不迁移，不删除。用户若要切换到纯 LXT 模式，需要新建项目。

2. **generate-* API 向后兼容**：生成 API 改为操作 `LxtEpisode` 后，传入的 `episodeId` 必须是 `LxtEpisode.id`。旧有 NP 项目不应调用这些新 routes（workspace 模式路由隔离保证了这点）。

3. **UsageCost 继续关联 projectId**：计费逻辑不变，`LxtProject` 和 `NovelPromotionProject` 都隶属于同一个 `Project`，`UsageCost` 关联 `projectId` 不需要改动。

4. **WorkspaceStageContent 共用**：`WorkspaceStageContent.tsx` 中已存在 lxt-* stage 的 case 分支（`LxtScriptStage`/`LxtStoryboardStage`/`LxtFinalScriptStage`），LxtWorkspace 可直接复用，无需修改这些组件。

5. **LxtWorkspace 不含 LXT stage 5（资产绑定）**：Stage 5 计划中 `LxtAssetBinding` 关联的是 `NovelPromotionEpisode`；独立化后需改为关联 `LxtEpisode`。实现 Stage 5 时需同步调整。

---

### 后续扩展说明

**道具（Prop）绑定**
分镜格式目前无专用"道具"字段。如需道具绑定，可在分镜 Prompt 中增加"道具："字段，并在 `LxtAssetBinding.kind` 中加入 `'prop'` 支持。不在本次范围内。

**绑定数据用途**
`LxtAssetBinding` 的绑定结果可在以下场景使用：
- `lxt-final-script` 生成时：将绑定角色的外貌描述注入 Prompt，提升图片提示词的角色一致性
- 未来 AI 图生图阶段：将 `globalAssetId` 对应的图片作为 `referenceImages` 注入图片生成模型
- TTS 阶段：直接使用 `voiceId` 驱动语音合成，无需再次语音设计
