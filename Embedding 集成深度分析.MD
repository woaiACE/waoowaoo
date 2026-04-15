
## Embedding 集成分析

> 最后更新：2026-04-15 · 覆盖 12 个独立环节 · 第一期+第二期已全部落地

---

### 架构概览

Embedding 在本项目中扮演三个架构角色：

| 角色 | 定位 | 状态 |
|------|------|------|
| **Entity Resolver**（语义资产注册表） | 解决 LLM 生成侧名称创意多变 vs 系统检索侧精确字符串匹配的根本矛盾 | ✅ 已落地 |
| **Pipeline RAG**（流水线上下文过滤） | 每个 clip 只注入相关角色介绍，替代全量注入 | ✅ 已落地 |
| **Cross-modal Bridge**（跨模态桥接） | 文字↔图像语义统一空间，需多模态 embedding | 📋 远期规划 |

**核心原理**：角色档案 → embed → 内存向量索引 → cosine search 兜底字符串匹配失败的场景。

---

### 已落地基础设施

| 文件 | 职责 |
|------|------|
| `src/lib/embedding/service.ts` | `embedText` / `embedBatch`：封装 LM Studio `/v1/embeddings` + 静默降级 |
| `src/lib/embedding/cosine.ts` | `cosineSimilarity` / `findBestMatch`：内存向量运算，零外部依赖 |
| `src/lib/embedding/character-index.ts` | `buildCharacterIndex` / `resolveCharacterByEmbedding`：项目角色向量索引 |
| `src/lib/embedding/resolve-embed-config.ts` | `resolveEmbedConfig(userId)`：从 `userPreference.customProviders` + LM Studio API 自动发现 embedding 模型 |

**向量不持久化**——仅在 worker 任务生命周期内使用，角色 <1000 时内存 cosine 无性能问题。

**降级策略**：未配置 embedding 模型 → `resolveEmbedConfig` 返回 `null` → 完全走字符串匹配，行为与修改前一致。

---

### 已落地环节总览（A/B/D/E/F/H + 3 Bug Fix）

#### 注入点 A — 全局分析跨块角色去重 ✅

**改动文件**：`analyze-global.ts`、`analyze-global-persist.ts`

任务启动时批量 embed 已有角色库，新 chunk 分析出新角色时 embed 其 introduction，与库内向量 cosine 比较，相似度 > 0.82 判定为同一角色路由到 update。解决长篇小说跨 chunk 称谓漂移导致的重复档案积累。

#### 注入点 B — story-to-script 角色去重 ✅

**改动文件**：`story-to-script-helpers.ts`、`story-to-script.ts`

`persistAnalyzedCharacters` 新增 `preResolvedMap` 预计算路径——事务外批量 embed，事务内零 HTTP（修复 Bug 2）。与 A 联合彻底终结重复档案。

#### 注入点 D — 分镜角色名预归一化 ✅

**改动文件**：`script-to-storyboard/orchestrator.ts`、`storyboard-phases.ts`、`script-to-storyboard-atomic-retry.ts`

orchestrator 入口层通过 `resolveClipCharacterNames` 做角色名预归一化，`characterNameMatches` 同步函数签名不变，Phase 1/2a/2b/3 共 6 处调用点均受益。

#### 注入点 E — panel 生图角色查找 fallback ✅

**改动文件**：`image-task-handler-shared.ts`、`panel-image-task-handler.ts`、`panel-variant-task-handler.ts`

新增 `findCharacterByNameWithEmbedding` async 版本（阈值 0.78），精确匹配失败后语义兜底，解决名称漂移导致的参考图/描述丢失。

#### 环节 F — clip 级角色介绍过滤 ✅

**改动文件**：`asset-prompt-context.ts`、`storyboard-phases.ts`、`script-to-storyboard/orchestrator.ts`、`script-to-storyboard-atomic-retry.ts`

不依赖 embedding，利用已有 `clipCharacters` 结构化过滤。新增 `getFilteredCharactersIntroduction` 辅助函数，分镜 3 处高优调用点改用按 clip 过滤。10+ 角色项目 token 节省 30~60%。

**未修改的调用点（合法全量）**：`ai-story-expand.ts`（项目级）、`voice-analyze.ts`（项目级）、`clips-build.ts`（批量模板）、`screenplay-convert.ts`（一次性构建）、`story-to-script/orchestrator.ts`（分割需全量）、`story-to-script.ts`（重试用存档）。

#### 环节 H — story-expand 项目上下文注入 ✅

**改动文件**：前端链 `ConfigStage` → `NovelInputStage` → `AiWriteModal` → `useAiStoryExpandStream`，API `route.ts`，Worker `ai-story-expand.ts`，`catalog.ts`，zh/en 双语 prompt 模板

通过 `{project_context_block}` 模板变量注入项目 `globalAssetText` + 角色介绍。无 projectId 时跳过，查询失败时降级为空字符串。

#### Bug Fix 记录

| Bug | 位置 | 修复 |
|-----|------|------|
| aliasExists 命中时 existingChar 返回 undefined | `analyze-global-persist.ts` | `existingChar` 查找扩展为名称+别名交集全路径匹配 |
| `prisma.$transaction` 内发起 HTTP 请求 | `story-to-script.ts` | 事务外预计算 `preResolvedMap`，事务内零 HTTP |
| resolved.aliases 未去重写入重复别名 | `story-to-script-helpers.ts` | `mergedAliases` 按 toLowerCase 去重后写入 |

---

### 阈值策略

| 场景 | 阈值 | 说明 |
|------|------|------|
| 角色去重（A/B） | 0.82 | 宁可漏判不误判 |
| 角色查找（D/E） | 0.78 | 查找容错更高 |
| 跨项目复用（未来 K） | 0.90 | 严格，避免跨项目污染 |

---

### 用户配置

用户只需在「AI 服务配置 → LM Studio」选一个 embedding 模型（如 `Qwen3 Embedding 0.6B`），保存即可。未配置则完全退化到原有字符串匹配行为。

---

### 待实现环节

#### 环节 G — voice 台词分析角色过滤（优先级：中）

**文件**：`src/lib/workers/handlers/voice-analyze.ts`

当前 `buildCharactersIntroduction(characters)` 全量注入 voice prompt。voice 分析是在 SRT 分段中识别发言人，每段通常只含 1~3 个角色，注入 20 个角色介绍会干扰发言人归属。

**方案**：voice 分析前，对每个 SRT 文本段 embed，检索最可能出现的角色 Top-3，只注入这 3 个角色的介绍。

#### 环节 C — 片段边界 L4 语义匹配（优先级：低）

**文件**：`src/lib/novel-promotion/story-to-script/clip-matching.ts`

当前三级匹配（L1 精确→L2 标准化→L3 Levenshtein）。L4 在 `matchBoundary` 末尾增加 embed-based 语义匹配，解决 LLM 同义词改写导致的边界失败。

**缺点**：需预先对全文做分句 embedding，成本较高，仅对少数边界失败 clip 有收益。

#### 环节 I — shot prompt 资产智能联想（优先级：低）

**文件**：`src/lib/workers/handlers/shot-ai-prompt-shot.ts`

用户修改镜头 prompt 时自动从角色库 embedding 检索关联资产，免手动选择。需前端配合，工程量较大。

#### 低优先级环节（J/K/L）

| 环节 | 简述 | 优先级 |
|------|------|--------|
| J — appearance 描述风格一致性 | embed 同项目角色描述作为 style examples | 低（角色少时收益有限） |
| K — 全局库跨项目复用 | 新建角色时 cosine 搜索 GlobalCharacter 库推荐导入 | 低（需 Global 索引） |
| L — 角色关系名称对齐 | 关系中人名 embed 后规范化再存储 | 低（下游用途待定） |

---

### 风险与降级

所有修改都是「字符串匹配未命中时才触发」的兜底逻辑，原有行为完整保留。

| 风险 | 自动降级 |
|------|---------|
| 未配置 embedding 模型 | `resolveEmbedConfig` → `null` → 纯字符串匹配 |
| Embedding API 超时/报错 | catch → `null` → 字符串匹配 |
| 向量维度不一致（换模型） | `cosineSimilarity` → 0 → 不匹配 |
| 阈值过低误合并 | 需手动拆分（极端情况） |
| 阈值过高漏检 | 新建额外记录（等同现状，安全） |

---

### 完整工作流数据流图

```
[阶段0] ai-story-expand ✅ 环节H
  └─ handleAiStoryExpandTask → 注入 {project_context_block}

[阶段1] analyze-global ✅ 环节A
  └─ handleAnalyzeGlobalTask
       ├─ buildCharacterIndex（批量 embed 已有角色）
       └─ persistAnalyzeGlobalChunk: 字符串匹配 → embedding 语义兜底

[阶段2] story-to-script ✅ 环节B
  ├─ persistAnalyzedCharacters: preResolvedMap 预计算 + 语义兜底
  ├─ clip-matching: L1→L2→L3（L4 语义匹配待实现）
  └─ 逐片段剧本转换: 全量 buildCharactersIntroduction

[阶段3] script-to-storyboard ✅ 环节D+F
  └─ orchestrator: resolveClipCharacterNames 预归一化
       ├─ Phase 1~3: characterNameMatches（已被预归一化覆盖）
       └─ getFilteredCharactersIntroduction: clip 级角色过滤

[阶段3扩展] voice-analyze ❌ 环节G 待实现
  └─ 全量 buildCharactersIntroduction（待 Top-K 过滤）

[阶段4] panel-image / panel-variant ✅ 环节E
  └─ findCharacterByNameWithEmbedding: 语义 fallback

[shot-ai 系列] ❌ 环节I/J 待实现
[Asset Hub] ❌ 环节K 待实现
```