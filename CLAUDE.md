<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **waoowaoo** (22799 symbols, 40316 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/waoowaoo/context` | Codebase overview, check index freshness |
| `gitnexus://repo/waoowaoo/clusters` | All functional areas |
| `gitnexus://repo/waoowaoo/processes` | All execution flows |
| `gitnexus://repo/waoowaoo/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |
| Work in the Hooks area (389 symbols) | `.claude/skills/generated/hooks/SKILL.md` |
| Work in the Handlers area (382 symbols) | `.claude/skills/generated/handlers/SKILL.md` |
| Work in the Mutations area (210 symbols) | `.claude/skills/generated/mutations/SKILL.md` |
| Work in the Scripts area (152 symbols) | `.claude/skills/generated/scripts/SKILL.md` |
| Work in the Task area (114 symbols) | `.claude/skills/generated/task/SKILL.md` |
| Work in the Llm area (103 symbols) | `.claude/skills/generated/llm/SKILL.md` |
| Work in the Billing area (99 symbols) | `.claude/skills/generated/billing/SKILL.md` |
| Work in the Services area (89 symbols) | `.claude/skills/generated/services/SKILL.md` |
| Work in the Media area (78 symbols) | `.claude/skills/generated/media/SKILL.md` |
| Work in the Generators area (76 symbols) | `.claude/skills/generated/generators/SKILL.md` |
| Work in the Migrations area (76 symbols) | `.claude/skills/generated/migrations/SKILL.md` |
| Work in the Components area (74 symbols) | `.claude/skills/generated/components/SKILL.md` |
| Work in the Run-stream area (72 symbols) | `.claude/skills/generated/run-stream/SKILL.md` |
| Work in the Assets area (71 symbols) | `.claude/skills/generated/assets/SKILL.md` |
| Work in the Guards area (68 symbols) | `.claude/skills/generated/guards/SKILL.md` |
| Work in the Logging area (67 symbols) | `.claude/skills/generated/logging/SKILL.md` |
| Work in the Ui area (60 symbols) | `.claude/skills/generated/ui/SKILL.md` |
| Work in the Api-config area (60 symbols) | `.claude/skills/generated/api-config/SKILL.md` |
| Work in the Run-runtime area (59 symbols) | `.claude/skills/generated/run-runtime/SKILL.md` |
| Work in the Providers area (52 symbols) | `.claude/skills/generated/providers/SKILL.md` |

<!-- gitnexus:end -->
