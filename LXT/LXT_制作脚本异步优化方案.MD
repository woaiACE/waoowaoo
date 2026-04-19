# LXT 制作脚本 — 异步并行推理优化方案（已并入主文档）

> 当前状态：本方案的核心能力已接入项目级 LXT 模式，并已在代码中完成主链路落地。  
> 请优先以 `LXT.MD` 顶部的“当前落地状态”以及实际代码为准；本文保留为详细设计草案与推演记录。  
> 已落地部分包括：异步任务提交、四阶段单镜流水线、`parseLxtShots()`、4 组 LXT Prompt 注册，以及最终制作脚本写回 `lxtEpisode.scriptContent`。

## 问题诊断（立项时的原始背景）

### 当时架构（旧：同步 SSE 直流）

```
用户点击「生成脚本」
  → POST /api/lxt-script/generate-final-script
  → 单次 LLM 调用（全量 prompt）
  → SSE 流实时返回 reasoning + text
  → 写入 episode.scriptContent
```

**核心瓶颈**：一个 20~50 镜头的分镜脚本，对应的 prompt 结构为：

```
{story}     ← novelText，数百字
{script}    ← srtContent，数百~千字
{storyboard} ← shotListContent，每镜 5 行 × 50 镜 ≈ 3000 行
```

| 风险项 | 表现 | 原因 |
|--------|------|------|
| 输出被截断 | 最后若干镜头缺失 | max_output_tokens 不足 |
| Vercel 超时 | 504 Gateway Timeout | SSE 连接超 60s |
| 推理质量下降 | 后半段格式混乱 | 超长上下文注意力衰减 |
| 导航中断失败 | 页面切走丢失进度 | 单次 SSE 流无持久化 |

---

## 复用目标：非 LXT 项目现有模式

项目中已有两套成熟的重量级异步 LLM 任务方案：

### 模式 A — 分块顺序推理（`analyze-global.ts`）

```typescript
// 将长文本分为 N 块，每块独立调用 LLM，进度实时上报
for (let i = 0; i < chunks.length; i++) {
  await reportTaskProgress(job, progress, { stage: 'chunk', message: `切片 ${i+1}/${chunks.length}` })
  const [resultA, resultB] = await Promise.all([
    executeAiTextStep({ action: 'analyze_characters', ... }),
    executeAiTextStep({ action: 'analyze_locations',  ... }),
  ])
  // 增量写入 / 累积
}
```

**复用点**：`reportTaskProgress` + `assertTaskActive` + `executeAiTextStep` + 循环累积 + 最终持久化

### 模式 B — 多阶段并行处理（`script-to-storyboard.ts`）

```typescript
// 多 clip 并发，每 clip 分 phase1 / phase2A+2B（并行）/ phase3
await mapWithConcurrency(clips, CONCURRENCY, async (clip) => {
  const phase1 = await runStep(phase1Prompt)        // 基础规划
  const [phase2A, phase2B] = await Promise.all([
    runStep(phase2CinematographyPrompt),             // 摄影规则（并行）
    runStep(phase2ActingPrompt),                     // 表演方向（并行）
  ])
  const phase3 = await runStep(phase3DetailPrompt)  // 细节精修（依赖前两阶段）
  return merge(phase1, phase2A, phase2B, phase3)
})
```

**复用点**：`mapWithConcurrency` 控制镜头级并发 + 阶段内 `Promise.all` 并行 + 步骤级原子重试

### 非 LXT 分镜的 Phase 3（`agent_storyboard_detail.zh.txt`）— 关键参考

这就是你记忆中的「动作细节补全」步骤。它的工作是对已有分镜结构做 **二次精修**，专门负责 `video_prompt` 的生成：
- 严格的**动态优先原则**：禁止纯静态描述，人物必须有动作词
- 用**年龄段+性别**替代角色名（视频模型不认识名字）
- 按 `scene_type`（daily/emotion/action/epic/suspense）选择镜头语言风格
- 特写镜头强制固定摄影机规则

### 基础设施

| 组件 | 用途 |
|------|------|
| `submitTask(...)` | 提交异步任务到 BullMQ，返回 `taskId` |
| `TASK_TYPE.*` | 任务类型注册 |
| `reportTaskProgress(job, pct, meta)` | 进度上报 |
| `assertTaskActive(job, stage)` | 任务取消检查 |
| `executeAiTextStep(...)` | 单步 LLM 调用 + 计费 + 日志 |
| `useTaskStatus(taskId)` / `useTaskList(...)` | 前端轮询任务状态与进度 |

---

## 优化方案设计

### 核心思路：单镜四阶段流水线（完整对标非 LXT 分镜架构）

每个镜头独立走完四个阶段，多镜头并发执行。最终组装保持与现有 6 字段格式完全一致。

```
shotListContent
   │
   ▼ parseLxtShots()
[镜头1, 镜头2, ..., 镜头50]
   │
   ▼ mapWithConcurrency(shots, CONCURRENCY=5)
   │
   每个镜头独立执行（串行阶段，并发镜头）:
   │
   ├─ Phase 1: 基础字段推理
   │    输入: 分镜原文 + story + script
   │    输出: { 镜头文案, 语音分镜, 音效, spatial_context(JSON) }
   │    作用: 轻量字段，同时产出供后续阶段共用的空间上下文结构
   │
   ├─ Phase 2A ──┐ （Promise.all 并行）
   │  图片提示词  │  输入: spatial_context + 分镜原文
   │             │  输出: "全局物理空间位置: ...；分镜图片布局：左上图片:...右下图片:..."
   │             │  专注: 4格分镜布局、摄影机位置、光影
   │             │
   ├─ Phase 2B ──┘
   │  表演弧线设计   输入: spatial_context + 分镜原文 + scene_type
   │               输出: JSON { frames: [{frame, camera, characters:[{role, position, acting}]}] }
   │               专注: 4帧动作弧线设计，角色空间定位与可视化表演（仿 agent_acting_direction）
   │
   ├─ Phase 3: 视频提示词合成（依赖 Phase 2B 表演弧线 JSON）
   │    输入: Phase 2B 表演弧线 JSON + spatial_context
   │    输出: "第一个镜头，..."（最终视频提示词）
   │    专注: 从结构化表演数据合成连贯视频文本，动态优先
   │    规则: 完整移植 agent_storyboard_detail.zh.txt，角色已在 Phase 2B 转为年龄性别
   │
   ▼ assembleShot(phase1, phase2A, phase3)
   │
   镜头N           ← 6字段格式不变
   镜头文案:...
   图片提示词:...
   视频提示词:...  ← 来自 Phase 3 精修结果
   景别:
   语音分镜:...
   音效:...
   │
   ▼ 按 shotIndex 有序拼接
   │
   ▼ prisma.lxtEpisode.update({ scriptContent })
```

**关键参数**：
- `CONCURRENCY = 5`：同时处理 5 个镜头，50 镜头 ≈ 10 轮
- 每个镜头 = 4 次 LLM 调用（Phase 2A/2B 并行 + Phase 3 串行，耗时约等于 3 轮串行）
- Phase 3 输入极短（草稿 ~150 tokens），每镜只多 ~1.5s，总耗时增加约 15s

### 与非 LXT 分镜的对应关系

| 非 LXT Phase | LXT 对应 | 输出 |
|-------------|---------|------|
| Phase 1 分镜规划 | **Phase 1 基础字段** | 镜头文案 + 语音分镜 + 音效 + 空间上下文 |
| Phase 2A 摄影规则 | **Phase 2A 图片提示词** | 4格分镜布局 + 全局物理空间位置 |
| Phase 2B 表演方向 | **Phase 2B 表演弧线** | JSON：4帧 × N角色，含 position + 可视化 acting + 镜头运动建议 |
| Phase 3 细节精修 | **Phase 3 视频提示词精修** | 审视草稿 → 动态增强 → 最终视频提示词 |

---

## 实施计划

### Step 1：分镜解析工具

**新建** `src/lib/lxt/parse-shots.ts`

```typescript
export type LxtShot = {
  index: number    // 0-based
  label: string   // "分镜1"
  raw: string     // 该分镜完整文本块
}

/**
 * 将 shotListContent 按 "分镜N" 分隔符解析为有序数组
 */
export function parseLxtShots(shotListContent: string): LxtShot[] {
  const segments = shotListContent.split(/(?=^分镜\d+\s*\n)/m).filter(s => s.trim())
  return segments.map((raw, index) => ({
    index,
    label: `分镜${index + 1}`,
    raw: raw.trim(),
  }))
}
```

---

### Step 2：四套 Prompt 设计

#### Phase 1 Prompt — 基础字段推理

**新建** `lib/prompts/lxt-script/shot_phase1_base.zh.txt`

职责：从单个分镜文本推理出轻量字段，并输出结构化的空间上下文供后续阶段复用。

变量：`{story}`, `{script}`, `{shot}` （单个分镜文本）

**完整 Prompt 内容：**

```
你是专业的影视分镜分析师。根据单个分镜的原文，结合故事背景和剧本，推理出基础旁白/对话字段，并构建结构化空间上下文供后续阶段共用。

【镜头文案格式】
- 旁白-{情绪}:{内容}   ← 旁白、叙事画外音
- 对话-{角色名}:{内容} ← 角色台词
- 内心-{角色名}:{内容} ← 内心独白

【语音分镜类型】
旁白 | 对话 | 内心独白 | 混合

【音效设计规则】
- 与场景强相关，3-5 个声音元素
- 涵盖前景/背景/远处三个空间层次
- 具体而非抽象（"石板路上皮鞋踩踏的清脆回响" 优于 "脚步声"）

【spatial_context 字段说明】
- scene: 场景简称（如"书房"、"街头"、"战场"）
- time: 时段（白天/黄昏/夜晚/清晨/阴天）
- lighting: 光线特征（一句话，须含方向与质感）
- camera_direction: 建议摄影机朝向与来源位置
- characters: 出场角色列表，含姓名与画面位置（如"画面中央偏左"）
- framing: 画面构成（左中右/前后景各有什么元素）
- scene_type: daily | emotion | action | epic | suspense

【输出要求】
只输出 JSON，禁止任何 markdown 代码块标记：
{
  "镜头文案": "旁白-平静:在一片茂密的森林旁边。",
  "语音分镜": "旁白",
  "音效": "风穿过松林的低沉呼啸、远处溪流潺潺、偶有鸟鸣清越穿林而出、脚下枯枝轻折的脆响。",
  "spatial_context": {
    "scene": "森林旁",
    "time": "白天",
    "lighting": "自然阳光从树冠间筛落，形成斑驳流动的光影",
    "camera_direction": "镜头正对森林边缘，来自林缘空地方向",
    "characters": [],
    "framing": "画面左侧与中部为茂密树干与灌木，右侧留出林缘空地，天空隐约可见",
    "scene_type": "epic"
  }
}

【输入数据】

故事背景：
{story}

剧本：
{script}

当前分镜：
{shot}
```

> `spatial_context` 作为结构化中间件传给 Phase 2A/2B，避免两个并行 LLM 各自重新推断场景信息而产生不一致。

#### Phase 2A Prompt — 图片提示词

**新建** `lib/prompts/lxt-script/shot_phase2a_image.zh.txt`

职责：专注生成 `图片提示词` 字段，包含全局物理空间定位 + 4格分镜布局。

变量：`{shot}`, `{spatial_context_json}`

**完整 Prompt 内容：**

```
你是专业的影视分镜摄影师（Photography Supervisor）。根据分镜原文和场景上下文，设计这个分镜的4格关键帧图布局。

【4格分镜结构】
同一分镜的4格图代表镜头从开始到结束的4个关键帧：
- 左上：镜头起始状态
- 右上：动作/情节推进
- 左下：情绪/动作高潮
- 右下：镜头结束，衔接下一个分镜

【核心规则】
1. 4格必须保持同景别、同摄影机位（视觉连贯性）
2. 格与格之间只有细节递进（人物姿态/光影/前景元素的微小变化）
3. 特写镜头必须固定摄影机，禁止写任何运动词
4. 全局物理空间位置说明放在最前面，包含摄影机与场景相对位置
5. 禁止在4格之间改变摄影机角度或景别

【景别词库——影视全谱】
大远景/极远景（ELS）：渺小人物置于宏大环境，建立史诗规模感，常用于开篇或章节转场
远景（LS）：人物全身可见，交代环境背景与人物空间关系
全景（FS）：人物从头到脚含周围空间，展示完整体态与行动
中远景/美式景别（MLS）：人物大腿以上，展示腰线以上行动感与姿态
中景（MS）：人物腰部以上，对话与日常互动的标准景别
中近景（MCU）：人物胸部以上，增强情绪可读性，情绪戏主力
近景/特写（CU）：肩部以上面部，精准捕捉情绪变化
大特写（BCU）：眼睛/嘴唇/手部/道具局部，极度情绪强调
极端特写（ECU）：单只眼睛/泪滴/指尖，情绪引爆时刻
双人镜头（Two-Shot）：两角色同框，关系张力与互动呈现
越肩镜头（OTS）：摄影机在一角色肩后拍对面，对话/对峙标配
插入镜头（Insert）：道具/关键细节特写，强调叙事信息
反应镜头（Reaction）：角色对事件/对话的情绪反应
空镜/环境镜头（Establishing）：无人物，纯场景情绪渲染与过渡

【视角词库——影视全谱】
平视/水平角度（Eye Level）：最自然，平等关系，日常场景标配
低角度/仰拍30-60°（Low Angle）：英雄感、威压感、崇高感，人物显得更强大
极低角度/虫视<15°（Worm's Eye）：极度威慑，主角爆发/反派登场特写
高角度/俯拍30-60°（High Angle）：渺小感、俯视、掌控者与被支配者关系
极高角度/鸟瞰>60°（Bird's Eye）：全局感、命运俯视、强调孤立渺小
航拍/上帝视角90°垂直（Aerial Top）：史诗规模建立，地图式空间感
越肩角度（Over-the-Shoulder）：对话双方切换，传达亲密或对抗
主观视角/第一人称（POV）：代入感最强，角色所见即观众所见
反主观视角（Reverse POV）：被注视者反看，窥视感与被觉察的压迫
侧面/正侧角度（Profile）：轮廓美感，行走/凝视/对峙的古典构图
背面镜头（Back Shot）：神秘感、目的地感，角色朝向未知前方
荷兰角/斜构图±15-45°（Dutch Angle）：心理失衡、不安、扭曲的世界观
斜侧3/4角度（3/4 Shot）：最具立体感的人脸角度，情绪叙事最常用

【摄影机运动词库（4格内保持同一运动模式）】
平移与推拉：
  横移跟随（Dolly Track）：水平跟随人物移动，稳定流畅，生活感
  推镜头（Dolly In）：向主体缓缓靠近，情绪酝酿与聚焦
  拉镜头（Dolly Out）：远离主体，孤立感、揭示更大背景
  缓推至近景：从中景平滑推至近景，情绪递进标配
  急推（Smash Zoom）：瞬间推近，震惊、冲击或惊吓时刻
  急拉（Quick Pull）：瞬间拉远，揭示或危机扩展
垂直运动：
  上升（Crane Up/Rise）：从人物升至全景，结束感/宏大感
  下降（Crane Down/Lower）：从全景降至人物，进入/聚焦感
  俯冲（Swoop/Dive）：快速向下压进，冲击与压迫
  平稳升至大远景：缓缓升起展示全景规模，史诗建立
跟随运动：
  稳定跟随（Steadicam）：如幽灵般流畅跟随，无感知沉浸感
  手持跟随（Handheld Follow）：纪录片真实感，紧张临场
  手持晃动（Handheld Shake）：混乱、紧迫、战场现场感
  背后跟拍（Over-shoulder Track）：神秘感、尾随与追踪
环绕运动：
  环绕/轨道（Orbit/Arc Shot）：围绕主体旋转，展示张力与关系
  慢速环绕（Slow Arc）：情绪峰值，史诗/深情时刻
  快速环绕（Whip Orbit）：能量爆发，动作高潮
固定与特殊：
  固定（Static）：凝固的凝视，沉默，内心独白时刻
  甩镜（Whip Pan）：场景快速转换，能量爆发
  变焦推进（Zoom In）：视角收窄，心理压迫聚焦
  变焦拉远（Zoom Out）：视角扩展，揭示更大语境
  希区柯克变焦（Dolly Zoom）：推镜+拉焦同时进行，空间扭曲，心理崩塌

【场景类型摄影风格参考——影视级】
daily（日常/生活）：
  景别：中景、中近景、近景交替，偶用越肩切换
  视角：平视为主，越肩角度对话切换
  运动：缓推 | 稳定跟随 | 轻微手持 | 固定（静态对话）
  光线：自然软光，室内环境光，无过度戏剧阴影
  构图：黄金分割，人物不居正中，生活化留白

emotion（情感/抒情/悲剧）：
  景别：近景、特写为主，情绪顶点用大特写
  视角：平视 | 微仰（给予同情）| 微俯（表现无力感）
  运动：极缓推（近乎察觉不到的推镜）| 缓慢环绕 | 缓拉（距离与失去感）| 固定凝视
  光线：侧光突出轮廓，逆光剪影，柔焦虚化背景，泪光折射
  构图：大量留白表孤独，前景虚化增层次，对称表平静

action（动作/打斗/追逐）：
  景别：中景-全景（全身动作）与特写（冲击瞬间）快速交替
  视角：仰拍（爆发力）| 俯拍（混战全局）| 手持低角度
  运动：手持晃动 | 急推急拉 | 快速跟随 | 慢动作固定（高光瞬间）
  光线：硬光强对比，爆炸/火焰动态光，逆光剪影动作感
  构图：对角线增张力，动体靠近画面边缘制造出框紧张感

epic（史诗/宏大/仪式）：
  景别：大远景（宏观建立）与中景（人物仪式感）交替
  视角：航拍俯视 | 低角度仰拍（英雄感）| 极低角度
  运动：缓缓升起 | 俯冲而下 | 缓慢环绕 | 长焦固定（压缩空间突出群体）
  光线：丁达尔光（耶稣光）| 日出/日落黄金时刻 | 逆光剪影
  构图：人物极小置于宏大背景，天际线1/3处，左右对称显庄严

suspense（悬疑/惊悚/心理）：
  景别：近景 | 特写（异常细节）| 主观视角交替
  视角：荷兰角 | 极低角度（威胁感）| 主观POV
  运动：缓慢推进（心理压迫）| 突然急推（惊吓触发）| 固定（令人不安的静止）| 慢速摇镜
  光线：强硬侧光/背光，大面积阴影，一束来源明确的光，暗处有运动
  构图：主体置于画面边缘（失衡感），暗区填满画面，遮挡物制造窥视感

【输出格式】
直接输出图片提示词文本，不含字段标签、引号、markdown：
全局物理空间位置: {场景简称}, {摄影机位置与朝向说明}；分镜图片布局：左上图片:{景别}，{时间光线}，{构图描述}，{人物状态与位置}，{摄影机}；右上图片:{景别}，{细节推进变化}，{摄影机}；左下图片:{景别}，{高潮细节}，{摄影机}；右下图片:{景别}，{结束收束状态}，{摄影机}。

【输入数据】

当前分镜：
{shot}

场景上下文：
{spatial_context_json}
```

#### Phase 2B Prompt — 表演弧线设计（仿 agent_acting_direction）

**新建** `lib/prompts/lxt-script/shot_phase2b_acting_arc.zh.txt`

职责：先分析分镜情绪走向，再设计4帧连贯的角色表演弧线与空间定位。输出结构化 JSON，供 Phase 3 合成视频提示词文本。

变量：`{shot}`, `{spatial_context_json}`, `{scene_type}`

> 与非 LXT 的 `agent_acting_direction` 对应关系：非 LXT 按**分镜组**输出，LXT 按**单分镜4帧**输出。**保留角色原始姓名**，年龄段+性别替换由 Phase 3 统一处理。

**完整 Prompt 内容：**

```
你是专业的表演指导（Acting Director）与空间调度师。你的任务是为单个分镜设计4帧的角色表演弧线与空间定位。

【核心职责】
先分析整个分镜的情绪走向与动作方向，再设计连贯的4帧表演弧线。每帧是前帧的自然延续，形成完整的动作序列，而非4个独立静止画面。

【4帧结构定义】
- frame 1: 入镜状态（动作起点，角色进入或初始姿态）
- frame 2: 动作发展（情节推进，情绪开始外显）
- frame 3: 情绪/动作高潮（核心表达，最强表演时刻）
- frame 4: 收束动势（动作收尾，暗示将进入下一分镜的开端）

【表演描述规范】
每帧每角色用一句话（20-40字）描述：
位置 + 情绪/意图（可见行为化）+ 具体动作 + 视线/朝向

【⚠️ 关键规则】
1. **保留角色原始姓名**，禁止替换为年龄段+性别（替换由 Phase 3 统一处理）
2. 禁止抽象情绪词（悲伤/愤怒/紧张）→ 只描述可见的身体行为
3. 4帧动作必须连贯，frame N 的结束动势是 frame N+1 的自然起点
4. 位置要精确：画面左侧/右侧/中央/前景/背景/画面外入画/画面外退出
5. 多角色时每帧须标注所有角色的位置与动作，体现互动空间关系


【scene_type 表演风格匹配——影视级】
daily（日常/生活）：
  能量级：低至中，内敛自然；节奏平稳，微动作主导
  表演细节：手部自然状态（插兜/按杯/翻书），呼吸可见，真实微笑带眼角纹，说话时有自然手势
  情绪弧线：基准情绪小幅波动，4帧内有轻微情绪升温或冷却
  典型姿态：站立放松重心偏移 | 随意落座 | 漫步 | 将视线投向窗外 | 手持物品互动

emotion（情感/抒情/悲剧）：
  能量级：中至高，情绪引爆点在 frame 3
  表演细节：眼神先于身体说话，眼眶先湿润/嘴唇先护动，泪水沿鼻翼滑落路径可描述
  情绪弧线：压抑 → 挣扎 → 崩溃/释放 → 余震收束
  典型姿态：扶墙缓缓滑落 | 双手捂脸 | 抬头让泪水不落 | 握紧对方手臂 | 背对对方肘部颤抖

action（动作/打斗/追逐/战斗）：
  能量级：高至极高，爆发性；节奏快，每帧动作有明显位移与重心变化
  表演细节：重心变化明确（前冲/侧跳/后翻），武器道具状态（握紧/挥出/脱手），碰撞后形变（弓背/踉跄/倒地），表情夸张且短促
  情绪弧线：备战蓄力 → 爆发冲击 → 高潮一击 → 结果确认
  典型姿态：低蹄蓄力 | 腾空跃起 | 格挡反击 | 倒地挣扎 | 胜利直立

epic（史诗/仪式/宏大）：
  能量级：中，重仪式感而非爆发；节奏慢，每帧变化小但气场极强
  表演细节：姿态端正挺拔，动作幅度大但缓慢有力（缓缓举起/庄重转身），服装随风配合动势
  情绪弧线：凝视等待 → 宣示举动 → 顶点时刻 → 收束庄重注视
  典型姿态：登高处俯瞰 | 缓缓拔剑/举旗 | 大幅度转身迎风矗立 | 单膝跪下 | 昂首凝视远方

suspense（悬疑/惊悚/心理）：
  能量级：中低，克制中积聚爆发感；节奏不均匀，前慢后急
  表演细节：微动作放大（吞咽/缩肩/抖眼皮而非转头），眼神快速扫视后定格，突然僵止或急退
  情绪弧线：警觉探查 → 发现异常 → 惊吓/威胁确认 → 逃避/对峙决策
  典型姿态：贴墙缓步 | 踮低屏息 | 缓缓回头僵在原地 | 突然后退一步 | 慢慢举起双手

【镜头运动建议（供 Phase 3 使用）——影视级完整版】
daily（日常）：
  情绪平稳：固定 | 缓推（向说话者推近）| 稳定跟随（走动时）
  日常质感：轻微手持 | 缓拉（揭示环境）| 越肩切换（对话双方）

emotion（情感）：
  酝酿阶段：固定凝视 | 极缓推进（近乎察觉不到的慢推）
  情绪释放：缓推至大特写 | 缓慢环绕（孤独感）| 缓拉（距离感/失去感）
  余震收束：固定凝视 | 极缓拉远（渺小与孤立）

action（动作）：
  备战开场：稳定低角度固定 | 慢速侧面横移（展示人物体格）
  爆发动作：手持跟随晃动 | 急推（冲击瞬间）| 急拉（爆炸波及效果）
  高光一击：慢动作低角度仰拍固定 | 时间凝固近景固定
  追逐场景：背后跟拍 | 侧面平行跟随 | 手持晃动（临场感）

epic（史诗）：
  宏观建立：航拍俯冲至人物（由远景推至人物）| 缓缓升起（人物升至大远景）
  仪式时刻：慢速环绕 | 长焦固定（压缩空间突出人物）
  顶点时刻：极缓推至面部近景 | 固定仰拍（庄严凝视）

suspense（悬疑）：
  探查阶段：主观视角跟随（摄影机=角色眼睛）| 缓慢手持推进
  惊吓瞬间：突然急推 | 反主观急速切换 | 荷兰角固定
  对峙凝视：固定近景（令人窒息的静止）| 极缓推进（心理压迫递增）

【表演词库参考——影视级完整版】

▸ 头部与颈部
转头 | 缓缓回头 | 猛然回头 | 点头 | 微微颔首 | 抬头仰望 | 低头垂眸 |
侧头倾听 | 仰头向天 | 摇头 | 缩颈 | 昂首挺胸 | 歪头（思考/困惑）

▸ 面部精细表情
眉峰深锁 | 单眉微扬（疑惑）| 眉梢下垂（悲悯）| 眼眸微眯 | 眼睛睁圆 |
瞳孔急速收缩 | 眼神游移不定 | 目光如炬直视 | 眼眶潮红泡光 |
嘴角微勾 | 嘴角拧紧成线 | 嘴唇微张 | 双唇轻颤 | 和住下唇 |
鼻翼微张（愤怒/激动）| 鼻子轻皱（厌恶）| 嘴角努力上扬又塌落

▸ 手部与手臂
手指轻颤 | 握紧拳头（关节发白）| 松开拳头五指舒展 |
手指有节奏地敲击（不耐烦）| 抚摸/抚平衣物 | 轻轻触碰物品 |
猛然拍桌 | 缓缓举起 | 单手指向前方/斜上方 |
双手交握置于身前（恭顺/紧张）| 双手背后（权威/从容）|
手臂伸出拦截 | 肘部支撑身体 | 单臂抬起遥指

▸ 身体与躯干
身体前倾（靠近/专注）| 身体后仰（轻松/抵触）| 身体侧转（引导视线）|
肩膀耸起（防御）| 肩膀向后扩张（自信/宣示）| 肩膀下沉塌陷（疲惫/沮丧）|
弓背（痛苦）| 俯身（靠近/威胁）| 起身（决意/反应）|
横向侧移半步（回避）| 踢住脚步重心前移

▸ 步伐与移动
缓步走向前方 | 大步流星迈进 | 快步走向出口 |
踉跄后退 | 向后急退一步僵止 | 踮手踮脚靠近 |
侧身贴墙移动 | 蹲低潜行 | 腾空跃起 | 踏步冲出 | 急转身面向

▸ 情感爆发（影视级高强度）
撞墙/摘门/扫落桌上物品（失控）| 单膝跪地 | 双腿发软缓缓跌坐 |
双手扑上抓住对方衣领 | 将对方推开 | 猛然上前回抱 |
张嘴无声（极度震惊）| 整个人向后踉跄半步 | 身体酥软（哭泣）

▸ 克制与内敛（影视级细腻微表演）
咽下一口气 | 轻轻闭眼再睁开 | 深吸一口气后缓慢呼出 |
将视线从对方移开一秒后移回 | 手指微微收紧又松开 |
嘴角努力上扬又塌落 | 单手轻按胸口

【输出格式】
只输出 JSON，禁止 markdown 代码块标记：
{
  "scene_type": "daily",
  "frames": [
    {
      "frame": 1,
      "camera": "缓缓推近",
      "characters": [
        {
          "role": "李明",
          "position": "画面中央偏左",
          "acting": "站姿放松左手插兜，嘴角轻扬侧头看向画面右侧，右脚轻轻往前踏出半步"
        }
      ]
    },
    {
      "frame": 2,
      "camera": "缓缓推近",
      "characters": [
        {
          "role": "李明",
          "position": "画面中央",
          "acting": "身体微微前倾双手自然垂放，嘴唇微张正在说话，目光直视前方"
        }
      ]
    },
    {
      "frame": 3,
      "camera": "缓推至近景",
      "characters": [
        {
          "role": "李明",
          "position": "画面中央",
          "acting": "眉头轻皱嘴角抿紧，右手缓缓抬起指向右侧，身体重心前移，眼神坚定"
        }
      ]
    },
    {
      "frame": 4,
      "camera": "固定",
      "characters": [
        {
          "role": "李明",
          "position": "画面中央偏右",
          "acting": "手臂放下转身向右，侧脸朝向镜头方向，步伐迈出画面边缘，留有动势"
        }
      ]
    }
  ]
}

【输入数据】

当前分镜：
{shot}

场景上下文（含角色列表与画面构成）：
{spatial_context_json}

场景类型：{scene_type}
```

---

#### Phase 3 Prompt — 视频提示词合成

**新建** `lib/prompts/lxt-script/shot_phase3_video_refine.zh.txt`

职责：接收 Phase 2B 的结构化表演弧线 JSON，合成一段空间精确、动作连贯的最终视频提示词。**完整移植 `agent_storyboard_detail.zh.txt` 的全套规则**。

变量：`{acting_arc_json}`, `{spatial_context_json}`, `{scene_type}`

> 与旧方案（看草稿文本精修）的核心差异：Phase 3 从**结构化数据**出发，每帧的角色位置和动作已经由 Phase 2B 精确设计好，Phase 3 只需按格式合成文本并添加场景氛围词汇——不再需要"发现静态就修改"的纠错逻辑，而是直接从高质量原料组织语言。

**完整 Prompt 内容：**

```
你是顶级视频提示词撰写师。根据4帧表演弧线数据，合成一段结构完整、动作连贯的视频提示词。

【核心原则：动态优先】
视频不能僵硬！每个镜头描述必须包含"动"的元素：
- 人物必须有动作词（走、转、抬、挥、低、靠近、后退……）
- 镜头必须有运动词（特写镜头除外，必须固定）
- 前后帧的动作要有连贯动势，上一帧的结束动势延续到下一帧起点

【组合规则】
1. 将4帧表演数据按「第一个镜头 / 第二个镜头 / 第三个镜头 / 最后一个镜头」结构组合
2. 每个镜头描述 = 角色位置 + 表演动作 + 镜头运动 + 关键环境元素（简短点缀）
3. 使用 acting_arc_json 中各帧的 camera 字段作为镜头运动基础，可根据节奏微调
4. 多角色时须体现角色间的空间互动关系（谁在左谁在右，互相靠近还是拉开）

【scene_type 补强规则——影视级完整版】

daily（日常）：
  氛围细节词库：端起茶杯/整理衣领/轻叹一口气/随手拨弄物品/回头望了一眼/若无其事地开口
  光影描述：漫射自然光/暖调室内灯光/窗边侧光/下午阳光斜射/阴天柔和散光
  环境音暗示（点缀）：背景人声嗡嗡/远处车声/风吹枝叶/键盘敲击声
  镜头词（完整）：固定 | 缓缓推近 | 轻轻跟随移动 | 越肩切换视角 | 微微手持晃动
  禁止：宏大空间感词汇/史诗性光线描述/过度夸张的表情词

emotion（情感）：
  氛围细节词库：眼眶泛红/嘴唇轻颤/睫毛颤动/泪光闪烁/颤抖的声线/咬紧下唇/将头深深埋下
  光影描述：单侧侧逆光（勾勒轮廓）/窗外风景虚化成光斑/阴暗中一束光落在脸上/雨水顺玻璃流下
  环境音暗示（点缀）：远处轻柔背景音乐/雨声/寂静无声
  镜头词（完整）：极缓推近至大特写 | 缓缓拉远（失去感）| 缓慢环绕（孤独感）| 固定凝视
  禁止：动作场景词汇/宏大场面描述

action（动作）：
  氛围细节词库：猛然/疾速/爆发/腾空/衣袍飞扬/灰尘扬起/碎石迸溅/金属撞击声/喘息急促
  光影描述：强烈顶光/闪光灯效果/逆光剪影/快速光影切换/爆炸火光映照
  环境音暗示（点缀）：沉重撞击音效/急促呼吸/破空声/金属碰撞
  镜头词（完整）：手持跟随晃动 | 急速推近（冲击瞬间）| 急速拉远（爆炸波及）| 低角度仰拍固定
  禁止：安静从容的描述/缓慢镜头词/细腻情绪词

epic（史诗）：
  氛围细节词库：漫天/苍穹/大地/天际线/万里江山/烽火/旌旗猎猎/山河壮阔/历史洪流
  光影描述：日出/日落逆光金边/丁达尔光束穿云/仰拍天空大光比/宏大蓝调暮色
  空间构图：人物位于画面下方或边缘（渺小感）/宏观环境填满画面/对称庄严构图
  镜头词（完整）：航拍俯冲至人物 | 缓缓升起（人物升至大远景）| 缓慢环绕 | 长焦压缩固定
  禁止：生活化琐碎细节/快速晃动镜头/现代感词汇

suspense（悬疑）：
  氛围细节词库：阴影拉长/脚步声放大/呼吸声清晰/心跳如鼓/背后寒意/颈后汗毛竖起/灯光忽明忽暗
  光影描述：单点硬光投射浓重阴影/局部照明其余全暗/逆光轮廓无法辨认/绿/蓝冷调环境光
  视角暗示：主观视角跟随/被注视感/偷窥构图/荷兰角倾斜
  镜头词（完整）：主观视角缓缓推进 | 突然急推（惊吓瞬间）| 固定近景（令人窒息的静止）| 极缓推进（心理压迫递增）
  禁止：温暖色调/欢快活跃动作词/宽广开放空间描述

【年龄段+性别替换规则（本步执行）】
acting_arc_json 中的 role 字段为角色原始姓名，输出前必须全部替换为年龄段+性别描述：
- 少年/少女：约10-16岁
- 年轻男子/年轻女子：约17-30岁
- 中年男子/中年女子：约31-50岁
- 老年男子/老年女子：50岁以上
角色年龄信息见 spatial_context_json 中的 characters 字段，若无年龄信息则根据剧情语境推断。

【⚠️ 强制规则】
1. **禁止出现角色原始姓名**，必须全部替换为年龄段+性别后再输出
2. 禁止纯静态描述（无动作词的句子必须补动作词）
   ❌ "年轻男子站在门口，表情严肃，镜头固定"
   ✅ "年轻男子推开门迈步走进，眉头轻皱环顾四周，镜头手持跟随"
3. 特写镜头必须写"固定镜头"，禁止任何镜头运动词
4. 对话场景必须包含"正在说话"
5. 回忆/旁白/内心独白 → 展示叙述内容中的实际动作场景，禁止静止发呆
6. 禁止出现与场景无关的内容

【输出格式】
直接输出视频提示词文本，不含字段标签、markdown、引号：
第一个镜头，{描述}。第二个镜头，{描述}。第三个镜头，{描述}。最后一个镜头，{描述}。

【输入数据】

4帧表演弧线（Phase 2B 输出）：
{acting_arc_json}

场景上下文：
{spatial_context_json}

场景类型：{scene_type}
```

---

### Step 3：Worker Handler 重写

**修改** `src/lib/workers/handlers/lxt-storyboard-to-script.ts`

```typescript
import { parseLxtShots } from '@/lib/lxt/parse-shots'
import { mapWithConcurrency } from '@/lib/async/map-with-concurrency'

const CONCURRENCY = 5

export async function handleLxtStoryboardToScriptTask(job: Job<TaskJobData>) {
  // ... (加载 episode, project, 解析模型 — 不变)

  // 1. 解析分镜
  const shots = parseLxtShots(episode.shotListContent)
  if (shots.length === 0) throw new Error('No shots found in storyboard content')
  const totalShots = shots.length

  const templates = {
    phase1: getPromptTemplate(PROMPT_IDS.LXT_SHOT_PHASE1_BASE, locale),
    phase2a: getPromptTemplate(PROMPT_IDS.LXT_SHOT_PHASE2A_IMAGE, locale),
    phase2b: getPromptTemplate(PROMPT_IDS.LXT_SHOT_PHASE2B_ACTING_ARC, locale),
    phase3: getPromptTemplate(PROMPT_IDS.LXT_SHOT_PHASE3_VIDEO_REFINE, locale),
  }

  await reportTaskProgress(job, 5, {
    stage: 'lxt_final_script_parse',
    stageLabel: `解析分镜：共 ${totalShots} 个镜头`,
    displayMode: 'detail',
  })

  let completedShots = 0

  // 2. 并发处理每个镜头（每镜独立走 3 阶段）
  const shotResults = await mapWithConcurrency(
    shots,
    CONCURRENCY,
    async (shot) => {
      await assertTaskActive(job, `lxt_shot:${shot.index}`)

      // Phase 1: 基础字段
      const p1Result = await executeAiTextStep({
        userId: job.data.userId,
        model: analysisModel,
        messages: [{ role: 'user', content: templates.phase1
          .replace('{story}', episode.novelText || '')
          .replace('{script}', episode.srtContent || '')
          .replace('{shot}', shot.raw)
        }],
        action: 'lxt_shot_phase1_base',
        projectId,
        meta: { stepId: `shot_${shot.index}_p1`, stepTitle: `Phase1 镜头${shot.index + 1}/${totalShots}`, stepIndex: shot.index * 3 + 1, stepTotal: totalShots * 3 },
      })

      let p1Json: Record<string, string> = {}
      try { p1Json = JSON.parse(p1Result.text) } catch { /* fallback below */ }

      const spatialContextJson = JSON.stringify(p1Json['spatial_context'] ?? {})
      const sceneType = (p1Json['spatial_context'] as any)?.scene_type ?? 'daily'
      const emotion = (p1Json['镜头文案'] ?? '').match(/-(.+?):/) ?.[1] ?? '平静'

      // Phase 2A + 2B 并行（图片提示词 + 视频初稿）
      const [p2aResult, p2bResult] = await Promise.all([
        executeAiTextStep({
          userId: job.data.userId,
          model: analysisModel,
          messages: [{ role: 'user', content: templates.phase2a
            .replace('{shot}', shot.raw)
            .replace('{spatial_context_json}', spatialContextJson)
          }],
          action: 'lxt_shot_phase2a_image',
          projectId,
          meta: { stepId: `shot_${shot.index}_p2a`, stepTitle: `Phase2A 图片提示词 镜头${shot.index + 1}`, stepIndex: shot.index * 4 + 2, stepTotal: totalShots * 4 },
        }),
        executeAiTextStep({
          userId: job.data.userId,
          model: analysisModel,
          messages: [{ role: 'user', content: templates.phase2b
            .replace('{shot}', shot.raw)
            .replace('{spatial_context_json}', spatialContextJson)
            .replace('{scene_type}', sceneType)
          }],
          action: 'lxt_shot_phase2b_acting_arc',
          projectId,
          meta: { stepId: `shot_${shot.index}_p2b`, stepTitle: `Phase2B 表演弧线 镜头${shot.index + 1}`, stepIndex: shot.index * 4 + 3, stepTotal: totalShots * 4 },
        }),
      ])

      // Phase 3: 视频提示词合成（串行，依赖 Phase 2B 表演弧线 JSON）
      const p3Result = await executeAiTextStep({
        userId: job.data.userId,
        model: analysisModel,
        messages: [{ role: 'user', content: templates.phase3
          .replace('{acting_arc_json}', p2bResult.text.trim())
          .replace('{spatial_context_json}', spatialContextJson)
          .replace('{scene_type}', sceneType)
        }],
        action: 'lxt_shot_phase3_video_refine',
        projectId,
        meta: { stepId: `shot_${shot.index}_p3`, stepTitle: `Phase3 视频合成 镜头${shot.index + 1}`, stepIndex: shot.index * 4 + 4, stepTotal: totalShots * 4 },
      })

      completedShots++
      const progress = 10 + Math.floor((completedShots / totalShots) * 82)
      await reportTaskProgress(job, progress, {
        stage: 'lxt_final_script_generate',
        stageLabel: `生成脚本：${completedShots}/${totalShots} 镜头`,
        displayMode: 'detail',
      })

      // 组装 6 字段（格式不变，视频提示词用 Phase 3 精修结果）
      return {
        index: shot.index,
        text: [
          `镜头${shot.index + 1}`,
          `镜头文案:${p1Json['镜头文案'] ?? ''}`,
          `图片提示词:${p2aResult.text.trim()}`,
          `视频提示词:${p3Result.text.trim()}`,
          `景别:`,
          `语音分镜:${p1Json['语音分镜'] ?? ''}`,
          `音效:${p1Json['音效'] ?? ''}`,
        ].join('\n'),
      }
    }
  )

  // 3. 按 shotIndex 有序组装
  const scriptContent = shotResults
    .sort((a, b) => a.index - b.index)
    .map(r => r.text)
    .join('\n\n')

  if (!scriptContent) throw new Error('All shots returned empty output')

  // 4. 写回 DB
  await reportTaskProgress(job, 96, {
    stage: 'lxt_final_script_save',
    stageLabel: '保存制作脚本',
    displayMode: 'detail',
  })

  await prisma.lxtEpisode.update({
    where: { id: episodeId },
    data: { scriptContent },
  })

  return { episodeId, totalShots }
}
```

---

### Step 4：API Route 改为异步提交

**修改** `src/app/api/lxt-script/generate-final-script/route.ts`

```typescript
// 原来：同步 SSE 流式返回
// 新：提交 BullMQ 任务，返回 { taskId }

export const POST = apiHandler(async (request: NextRequest) => {
  const body = await request.json().catch(() => ({}))
  // ... 参数验证 & 鉴权（不变）

  const result = await submitTask({
    userId: session.user.id,
    locale,
    projectId,
    episodeId,
    type: TASK_TYPE.LXT_STORYBOARD_TO_SCRIPT,
    targetType: 'lxt_episode',
    targetId: episodeId,
    payload: { episodeId, model: body.model },
    dedupeKey: `lxt_storyboard_to_script:${episodeId}`,
  })

  return NextResponse.json({ taskId: result.task.id, deduped: result.deduped })
})
```

---

### Step 5：前端 LxtFinalScriptStage.tsx 改造

**当前**：SSE 流模式（`reasoning` + `scriptText` 实时更新）

**新**：异步任务模式（提交 → 轮询进度 → 完成后加载结果）

```typescript
// 状态机
type GenerationPhase =
  | 'idle'              // 未开始
  | 'submitting'        // 正在提交任务
  | 'queued'            // 已提交，等待 worker
  | 'processing'        // worker 处理中
  | 'completed'         // 完成
  | 'failed'            // 失败

const [phase, setPhase] = useState<GenerationPhase>('idle')
const [taskId, setTaskId] = useState<string | null>(null)
const [progress, setProgress] = useState<number>(0)
const [progressMessage, setProgressMessage] = useState('')

// 提交任务
const handleGenerate = async () => {
  setPhase('submitting')
  const res = await apiFetch('/api/lxt-script/generate-final-script', { method: 'POST', ... })
  const { taskId } = await res.json()
  setTaskId(taskId)
  setPhase('queued')
}

// 轮询任务状态（复用 useTaskList hook）
const { data: tasks } = useTaskList({
  projectId,
  type: ['lxt_storyboard_to_script'],
  targetId: episodeId,
  statuses: ['queued', 'processing', 'completed', 'failed'],
  enabled: phase === 'queued' || phase === 'processing',
  refetchInterval: (data) => {
    const task = data?.find(t => t.id === taskId)
    return task?.status === 'completed' || task?.status === 'failed' ? false : 3000
  },
})

// 监听任务状态变化
useEffect(() => {
  const task = tasks?.find(t => t.id === taskId)
  if (!task) return
  setProgress(task.progress ?? 0)
  if (task.status === 'processing') setPhase('processing')
  if (task.status === 'completed') {
    setPhase('completed')
    onRefresh({ scope: 'all' })  // 刷新 episode 数据，加载 scriptContent
  }
  if (task.status === 'failed') {
    setPhase('failed')
    setError(task.errorMessage || '生成失败')
  }
}, [tasks, taskId])
```

**进度 UI**（替换 reasoning 区域）：

```tsx
{(phase === 'queued' || phase === 'processing') && (
  <div className="flex flex-col gap-3 p-4 glass-surface rounded-xl">
    <div className="flex items-center justify-between">
      <span className="text-sm font-medium text-[var(--glass-text-primary)]">
        {phase === 'queued' ? '等待处理...' : `脚本生成中 (${progress}%)`}
      </span>
      <span className="text-xs text-[var(--glass-text-tertiary)]">{progressMessage}</span>
    </div>
    <div className="h-2 rounded-full bg-[var(--glass-bg-muted)] overflow-hidden">
      <div
        className="h-full rounded-full bg-[var(--glass-accent-from)] transition-all duration-500"
        style={{ width: `${progress}%` }}
      />
    </div>
    <p className="text-xs text-[var(--glass-text-secondary)]">
      后台处理中，可以自由切换页面或集数，完成后自动填充结果
    </p>
  </div>
)}
```

---

## 文件变更清单

### 新建

```
src/lib/lxt/parse-shots.ts
  ← parseLxtShots()

lib/prompts/lxt-script/shot_phase1_base.zh.txt
  ← Phase 1：基础字段推理（镜头文案 + 语音分镜 + 音效 + spatial_context JSON）

lib/prompts/lxt-script/shot_phase1_base.en.txt

lib/prompts/lxt-script/shot_phase2a_image.zh.txt
  ← Phase 2A：图片提示词专项（全局物理空间 + 4格分镜布局）

lib/prompts/lxt-script/shot_phase2a_image.en.txt

lib/prompts/lxt-script/shot_phase2b_acting_arc.zh.txt
  ← Phase 2B：表演弧线设计（4帧 × N角色 JSON，仿 agent_acting_direction）

lib/prompts/lxt-script/shot_phase2b_acting_arc.en.txt

lib/prompts/lxt-script/shot_phase3_video_refine.zh.txt
  ← Phase 3：视频提示词合成（从 Phase 2B 表演弧线 JSON 合成文本，完整移植 agent_storyboard_detail 动态优先规则）

lib/prompts/lxt-script/shot_phase3_video_refine.en.txt
```

### 修改

```
src/lib/prompt-i18n/prompt-ids.ts
  → 新增 LXT_SHOT_PHASE1_BASE, LXT_SHOT_PHASE2A_IMAGE, LXT_SHOT_PHASE2B_ACTING_ARC, LXT_SHOT_PHASE3_VIDEO_REFINE

src/lib/prompt-i18n/catalog.ts
  → 注册上述 4 个 prompt ID 及其 variableKeys

src/lib/workers/handlers/lxt-storyboard-to-script.ts
  → 完整替换为三阶段流水线逻辑（见 Step 3）

src/app/api/lxt-script/generate-final-script/route.ts
  → 从 SSE 流改为 submitTask，返回 { taskId }

src/app/[locale]/workspace/[projectId]/modes/lxt/components/LxtFinalScriptStage.tsx
  → 从 SSE 消费模式改为任务轮询模式（见 Step 5）
```

### 保持不变

```
lib/prompts/lxt-script/storyboard_to_script.zh.txt  ← 原 prompt 保留，不删除
最终 scriptContent 6字段文本格式                      ← 完全不变
```

---

## 性能对比

| 指标 | 当前（单次 SSE） | 优化后（三阶段流水线） |
|------|----------------|---------------------|
| LLM 调用次数（50镜头） | 1次 | 50×4=200次（Phase 2A/2B 并行，实际≈50×3轮） |
| 单次 prompt 大小 | ~6000 tokens 输入 | Phase 1 ~400t / Phase 2A ~600t / Phase 2B ~500t / Phase 3 ~300t |
| 50 镜头预计耗时 | 3–5 分钟（单流，易超时） | 约 65–120 秒（5 并发，每镜 3 轮，Phase 3 多 ~15s） |
| 超时风险 | 高（Vercel 60s 限制） | 无（BullMQ 后台任务） |
| 截断风险 | 高 | 无（每次 LLM 只输出一个字段） |
| 图片提示词质量 | 一次性推理，容易草率 | Phase 2A 专注，摄影机规则完整 |
| 视频提示词质量 | 无动态优先约束 | Phase 2B 设计4帧连贯动作弧线（JSON），Phase 3 从结构化数据合成，空间精确、动作连贯 |
| 字段一致性 | 天然一致（同次输出） | spatial_context 结构体桥接，确保各阶段描述同一场景 |
| 页面切换 | 中断，数据丢失 | 无影响，后台持续运行 |

---

## 实施顺序

```
1. src/lib/lxt/parse-shots.ts                                      → 工具函数
2. lib/prompts/lxt-script/shot_phase1_base.{zh,en}.txt             → Phase 1 prompt
3. lib/prompts/lxt-script/shot_phase2a_image.{zh,en}.txt           → Phase 2A prompt
4. lib/prompts/lxt-script/shot_phase2b_acting_arc.{zh,en}.txt     → Phase 2B prompt（表演弧线 JSON，仿 agent_acting_direction）
5. lib/prompts/lxt-script/shot_phase3_video_refine.{zh,en}.txt     → Phase 3 prompt（动态精修，移植 agent_storyboard_detail）
6. src/lib/prompt-i18n/{prompt-ids,catalog}.ts                     → 注册 4 个新 prompt ID
7. src/lib/workers/handlers/lxt-storyboard-to-script.ts            → Worker 四阶段改造
8. src/app/api/lxt-script/generate-final-script/route.ts           → API 改异步
9. LxtFinalScriptStage.tsx                                         → 前端改轮询模式
10. npx tsc --noEmit                                               → TypeScript 验证
```

---

## 未来扩展（不在当前范围）

- **镜头级原子重试**：参照 `StoryboardRetryTarget`，允许单镜头某阶段（Phase 1/2A/2B/3）失败后只重跑该阶段，已成功阶段结果直接复用（需将 spatial_context 和 Phase 2B 草稿持久化为中间字段）
- **进度 WebSocket**：将 `reportTaskProgress` 通过 SSE/WS 推送到前端（替代轮询）
- **并发限制自适应**：根据用户账户等级动态调整 `CONCURRENCY`（复用 `getUserWorkflowConcurrencyConfig`）
- **spatial_context 持久化**：Phase 1 结果存入 DB 的中间字段，支持仅重跑 Phase 2A 或 2B
