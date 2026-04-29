# Claude Code 命令参考 — waoowaoo 项目可用命令

> 更新时间：2026-04-28
> 本文档汇总了 everything-claude-code 插件中适用于本项目的命令、使用场景和调用方式。

---

## 1. 日常开发命令

### 1.1 代码质量

| 命令 | 使用场景 | 说明 |
|------|---------|------|
| `/code-review` | 写完代码后 | 自动审查代码质量、安全性、可维护性，标记 CRITICAL/HIGH/MEDIUM/LOW 问题 |
| `/security-review` | 涉及认证、支付、用户数据的代码 | 专注安全漏洞扫描（OWASP Top 10、密钥泄露、注入风险） |
| `/code-review:code-review` | 需要多人视角的复杂审查 | 启动多 agent 并行审查（安全 + 质量 + 一致性） |

**典型流程**：写完代码 → `/code-review` → 修复 CRITICAL/HIGH → 提交

### 1.2 测试

| 命令 | 使用场景 | 说明 |
|------|---------|------|
| `/everything-claude-code:tdd` | 新功能开发、bug 修复 | 强制执行 RED→GREEN→REFACTOR 循环，对接 Vitest |
| `/everything-claude-code:tdd-workflow` | 需要完整 TDD 流程指导 | 提供测试驱动开发的完整流程和最佳实践 |
| `/everything-claude-code:verify` | 提交前验证 | 确认测试覆盖率 ≥ 80%，运行 guard 检查 |

**自动可用脚本**（配置在 package.json）：
```bash
npm run test:behavior:full    # 行为测试（guards + unit + api + provider + chain）
npm run test:billing:coverage # 计费系统专项测试（含覆盖率）
npm run test:pr               # PR 前的全量回归测试
npm run check:test-coverage-guards  # 测试覆盖率守卫
```

### 1.3 构建与类型检查

| 命令 | 使用场景 | 说明 |
|------|---------|------|
| 自动 Hook | 每次编辑 .ts/.tsx 文件 | `npx eslint --fix` 自动执行 |
| 自动 Hook | 会话结束时 | `tsc --noEmit` 全量类型检查 |
| 自动 Hook | 会话结束时 | `npm run check:api-handler` API 路由契约验证 |

---

## 2. 架构与规划命令

### 2.1 功能规划

| 命令 | 使用场景 | 说明 |
|------|---------|------|
| `/everything-claude-code:plan` | 新功能、大型重构 | 产出实现计划（架构设计 + 任务分解 + 风险评估） |
| `/everything-claude-code:prp-plan` | 需要完整 PRD 的新功能 | 生成 PRD + 技术方案 + 实施路线图 |
| `/everything-claude-code:prp-prd` | 产品需求不清晰时 | 帮你梳理需求，产出产品需求文档 |
| `/everything-claude-code:prp-implement` | 按 PRD 逐步实现 | 按计划一步步实现功能 |

**典型流程**：
```
/add-feature 描述需求
  → /everything-claude-code:plan      # 生成技术方案
  → /everything-claude-code:prp-plan  # 生成完整 PRD + 实施计划
  → /everything-claude-code:prp-implement  # 逐步实现
  → /everything-claude-code:tdd       # TDD 开发
  → /code-review                      # 代码审查
```

### 2.2 架构决策

| 命令 | 使用场景 | 说明 |
|------|---------|------|
| `/everything-claude-code:architecture-decision-records` | 重大架构决策 | 生成 ADR（架构决策记录），记录决策背景和权衡 |
| `/everything-claude-code:hexagonal-architecture` | 设计新模块时 | 六边形架构（端口适配器）模式指导 |

---

## 3. 多 Agent 协作命令

### 3.1 并行任务

| 命令 | 使用场景 | 说明 |
|------|---------|------|
| `/everything-claude-code:orchestrate` | 复杂任务需要并行处理 | 将大任务拆分为多个子 agent 并行执行 |
| `/everything-claude-code:council` | 需要多角度分析 | 启动多个专家 agent 同时评审（安全 + 质量 + 性能 + 一致性） |
| `/everything-claude-code:agent-harness-construction` | 设计自动化流水线 | 构建自定义 agent 链条，适合本项目的 5 阶段 AI 短片生产 |

**项目特有场景**：
- **LXT 阶段开发**：用 `/everything-claude-code:council` 同时审查剧本生成、分镜生成、成片阶段的代码
- **Schema 变更**：并行审查 `prisma/schema.prisma` 变更的安全性、性能和向后兼容性
- **Prompt 迭代**：并行对比 prompt 效果，确保 zh/en 双语言 prompt 质量一致

### 3.2 Agent 管理

| 命令 | 使用场景 | 说明 |
|------|---------|------|
| `/everything-claude-code:devfleet` | 管理多个并行 agent | 大规模 agent 编排，适合多模块同时开发 |

---

## 4. 项目维护命令

### 4.1 代码清理

| 命令 | 使用场景 | 说明 |
|------|---------|------|
| `/everything-claude-code:prune` | 清理死代码和未使用依赖 | 自动检测并移除无用的代码、导入、依赖 |
| `/everything-claude-code:code-simplifier` | 重复代码、过度抽象 | 简化代码结构，保持一致性 |
| `/everything-claude-code:refactor-cleaner` | 大规模清理 | 系统性地清理和重构代码库 |

### 4.2 文档与技能

| 命令 | 使用场景 | 说明 |
|------|---------|------|
| `/everything-claude-code:docs` | 更新项目文档 | 自动更新 README、CODEMAP 等文档 |
| `/everything-claude-code:doc-updater` | 定期维护文档 | 保持项目文档与代码同步 |
| `/skill-create` | 从 git 历史提取模式 | 分析提交历史，生成 SKILL.md 和 instincts |
| `/everything-claude-code:skill-create` | 创建自定义技能 | 为特定工作流创建专属技能文件 |
| `/everything-claude-code:skill-health` | 检查技能健康状态 | 审查技能是否过期、冲突或需要更新 |

### 4.3 上下文管理

| 命令 | 使用场景 | 说明 |
|------|---------|------|
| `/everything-claude-code:context-budget` | 大型任务开始前 | 评估当前上下文窗口余量，决定是否需要拆分任务 |
| `/everything-claude-code:save-session` | 重要会话结束时 | 保存会话摘要、决策和关键发现 |
| `/everything-claude-code:resume-session` | 继续之前的工作 | 恢复保存的会话上下文 |
| `/everything-claude-code:sessions` | 查看历史会话 | 列出所有保存的会话 |

**建议**：每个 LXT 阶段开发完成后执行 `/everything-claude-code:save-session`，方便下次继续。

---

## 5. instincts 与持续学习

| 命令 | 使用场景 | 说明 |
|------|---------|------|
| `/everything-claude-code:instinct-status` | 查看已学习的模式 | 显示所有 instincts 及其触发条件和置信度 |
| `/everything-claude-code:instinct-import` | 导入新 instincts | 将 YAML instinct 文件加载到学习系统 |
| `/everything-claude-code:evolve` | 聚类 instincts 为技能 | 将相关 instincts 自动合并为完整技能 |
| `/everything-claude-code:rules-distill` | 从对话中提取规则 | 分析对话历史，提炼为项目规则或 instincts |

**当前已配置的 instincts**（`.claude/instincts/`）：
- `commit-convention.yml` — 提交时自动使用 Conventional Commits
- `api-route-contract.yml` — 新增 API 时注册到 route-catalog
- `prisma-schema.yml` — 修改 schema 时使用安全脚本
- `test-organization.yml` — 写测试时遵循项目结构
- `task-type-workflow.yml` — 新增任务类型时走 5 步流程
- `i18n-pattern.yml` — 添加文案时同步 zh/en 双语言

---

## 6. 本项目专属工作流

### 6.1 LXT 阶段开发流

```
/add-lxt-stage 描述新阶段需求
  → /everything-claude-code:plan      # 技术方案
  → /everything-claude-code:tdd       # TDD 开发
  → /code-review                      # 代码审查
  → /everything-claude-code:verify    # 验证测试覆盖
  → npm run check:api-handler         # 验证路由契约
  → /everything-claude-code:save-session  # 保存会话
```

### 6.2 Schema 变更流

```
修改 prisma/schema.prisma
  → node scripts/prisma-generate-safe.mjs  # 安全生成（Windows DLL 锁）
  → 更新 types、handlers
  → /code-review                      # 审查变更
  → /everything-claude-code:verify    # 验证测试
```

### 6.3 Prompt 迭代流

```
修改 src/lib/prompt-i18n/catalog.ts
  → 更新 prompt-ids.ts
  → npm run check:prompt-i18n         # Prompt i18n 守卫
  → npm run check:prompt-ab-regression # A/B 回归测试
  → /everything-claude-code:council   # 多角度评审 prompt 质量
```

---

## 7. 自动 Hook 配置摘要

当前已启用的自动 hooks（`.claude/settings.json`）：

| Hook 类型 | 触发条件 | 执行操作 |
|----------|---------|---------|
| PostToolUse | Write/Edit 文件 | `eslint --fix` 自动格式化 |
| Stop | 会话结束 | 代码审查提醒 |
| Stop | 会话结束 | `tsc --noEmit` 类型检查 |
| Stop | 会话结束 | `npm run check:api-handler` 路由契约验证 |

---

## 8. 快速参考卡

**开发新功能最简路径**：
```
/plan → /tdd → /code-review → /verify
```

**修复 Bug 最简路径**：
```
/tdd → /code-review → /verify
```

**大规模重构最简路径**：
```
/plan → /orchestrate (并行) → /code-review → /verify → /save-session
```

**PR 前最简路径**：
```
/code-review → /security-review → /verify → git commit
```

---

*本文档基于 everything-claude-code 插件能力总结，适用 waoowaoo v0.4.1+*
