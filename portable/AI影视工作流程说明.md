# 原始小说文本（用户输入）

        │
        ▼
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  阶段 1 ▎ 配置 (config)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  · 上传小说文本（按集拆分或整本）
  · 配置 AI 提供商 API Key
  · 选定视频模型 / 图像模型 / LLM / TTS
  · 设置内容轨道 (contentTrack) + 工作流模式 (workflowProfile)
        │
        ▼
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  阶段 2 ▎ 小说分析 (analyze-novel)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  LLM 并行分析三类资产：
  ├── 📋 角色分析 (analyze_characters)
  │       提取姓名、性格、外貌描述
  ├── 🏛️ 场景/地点分析 (analyze_locations)
  │       提取场景名称、氛围、视觉特征
  └── 🎩 道具分析 (analyze_props)
          提取关键道具外观描述

+ 全局分析 (analyze-global) → 情节分段、人物动机、内容轨道标签
        │
        ▼
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  阶段 3 ▎ 资产制作 (assets)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Worker: image.worker.ts
  ├── 🧑 角色肖像生成 (character-image-task-handler)
  │       → 图像模型生成角色参考图
  ├── 🏞️ 场景概念图生成 (location-image-task-handler)
  │       → 图像模型生成场景参考图
  └── 🎨 资产Hub设计 (asset-hub-ai-design)
          → 可微调、变体生成
        │
        ▼
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  阶段 4 ▎ 剧本生成 (story-to-script)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Worker: text.worker.ts
  · LLM：小说文本 → 分镜剧本
  · 涵盖：对白、旁白、动作指令、情绪标注
  · 按集处理 (episode-split)
  · 可选剧本格式转换 (screenplay-convert)
        │
        ▼
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  阶段 5 ▎ 分镜生成 (script-to-storyboard)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Worker: text.worker.ts
  · LLM：剧本 → 每帧分镜描述
  · 包含：镜头类型、构图、角色位置、画面指令
  · 写入 数据库 Panel 记录
        │
        ▼
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  阶段 6 ▎ 分镜图生成 (storyboard images)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Worker: image.worker.ts
  · 图像模型：分镜描述 → 单帧插画
  · prompt 由 shot-ai-prompt 系列模块组装：
  │   ├── 角色外貌描述注入
  │   ├── 场景描述注入
  │   └── 镜头语言描述
  · 支持变体生成 (panel-variant-task-handler)
  · 所有图像 URL 经 normalizeToBase64ForGeneration() 规范化
        │
        ▼
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  阶段 7 ▎ 配音 (voice)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Worker: voice.worker.ts
  ├── 🔍 配音分析 (voice-analyze)
  │       LLM 提取每帧对白台词 + 说话角色
  ├── 🎭 声音设计 (voice-design)
  │       为每个角色分配 TTS 声线
  └── 🔊 TTS 生成
          → 音频文件上传 MinIO/COS
          台词文本 → 角色声音 .wav/.mp3
        │
        ▼
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  阶段 8 ▎ 视频生成 (videos)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Worker: video.worker.ts
  · 图生视频（Image-to-Video）
  · 支持的模型（部分）：
  │   ├── Kling v2/v3 (快手)
  │   ├── Doubao Seedance 1.5 (字节，支持同步音效)
  │   ├── Vidu Q2 (支持同步音效)
  │   ├── Wan 2.5 (fal)
  │   ├── Veo 3.1 (Google, via fal)
  │   └── Sora 2 (OpenAI, via fal) ← ⚠️ 当前无音效能力
  · 长视频外部轮询：waitExternalResult() 保持心跳
        │
        ▼
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  阶段 9 ▎ 口型同步 (lip-sync)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Worker: video.worker.ts (lipsync handler)
  · 输入：视频片段 + TTS 音频
  · 支持提供商：Fal / Vidu / Bailian (阿里云)
  · 输出：嘴型对齐的合成视频
        │
        ▼
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  阶段 10 ▎ 片段剪辑 & 最终导出
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  · clips-build：LLM 决定片段切分时间点
  · Remotion v4 渲染引擎组合：
  │   ├── 视频片段
  │   ├── 音轨（TTS/BGM）
  │   └── 字幕叠加
  · 输出：最终 .mp4 短剧视频
