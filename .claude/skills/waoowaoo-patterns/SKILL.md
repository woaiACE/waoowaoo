---
name: waoowaoo-patterns
description: Coding patterns extracted from waoowaoo repository (AI short-drama production platform)
version: 1.0.0
source: local-git-analysis
analyzed_commits: 50
generated: 2026-04-28
---

# waoowaoo Patterns

Core coding patterns, commit conventions, and architecture for the waoowaoo AI short-drama production platform.

## Commit Conventions

Follow **Conventional Commits** with scopes:

```
<type>(<scope>): <description>
```

**Types** (priority order by frequency):
- `feat:` — New features (59% of commits)
- `fix:` — Bug fixes (24%)
- `refactor:` — Code restructuring
- `chore:` — Maintenance tasks
- `docs:` — Documentation
- `build:` — Build system changes

**Scopes** (most to least common):
- `lxt` — LXT mode (AI short-drama pipeline)
- `panel-prompt`, `storyboard`, `asset-gen` — Asset generation
- `ip-mode`, `ai-write`, `editor` — Feature modules
- `relation-graph`, `novel-promotion`, `embedding` — Data features
- `test` — Test-only changes

**Examples from the repo:**
```
feat(lxt): Seedance 2.0 video generation + storyboard quality overhaul
fix(lxt): fix final-film image generation UX and settings stability
refactor: optimize LXT asset library UI to match common mode
chore: align verify hooks for local non-docker env
build: use safe prisma generate wrapper to handle Windows DLL file lock
```

Chinese descriptions in commit messages are acceptable.

## Code Architecture

```
src/
├── app/
│   ├── [locale]/               # Next.js App Router (i18n prefix)
│   │   ├── layout.tsx          # Root layout
│   │   ├── providers.tsx       # Client providers
│   │   ├── page.tsx            # Home page
│   │   ├── workspace/          # Main workspace
│   │   │   └── [projectId]/
│   │   │       └── modes/      # Mode-specific UIs (lxt, novel-promotion, etc.)
│   │   ├── auth/               # Authentication pages
│   │   ├── home/               # Dashboard
│   │   └── profile/            # User profile
│   └── api/                    # API route handlers (Next.js route.ts)
├── components/                 # React components organized by feature
│   ├── ui/                     # Shared UI primitives
│   ├── shared/                 # Cross-feature components
│   ├── ai-elements/            # AI-specific components
│   └── <feature>/              # Feature-specific components
├── lib/                        # Core business logic (organized by domain)
│   ├── workers/                # Background job workers (Bull queue)
│   │   ├── index.ts            # Worker entry
│   │   └── handlers/           # Per-task-type handlers
│   ├── task/                   # Task type definitions and intent
│   ├── prompt-i18n/            # Multi-language prompt templates
│   ├── billing/                # Task billing and credits
│   ├── lxt/                    # LXT mode core logic
│   ├── voice/                  # Voice/TTS
│   ├── video/                  # Video generation
│   ├── image-generation/       # Image generation
│   ├── embedding/              # Vector embeddings & RAG
│   └── ...                     # Other domain modules
├── i18n/                       # i18n routing and navigation config
├── types/                      # Shared TypeScript types
└── assets/                     # Static assets
```

**Key rules:**
- Import alias: `@/` → `./src/`
- Feature folders in `src/lib/` contain self-contained domain logic
- Components follow PascalCase, hooks follow `use*` prefix
- API routes are Next.js route handlers under `src/app/api/`

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14+ (App Router, Turbopack) |
| Language | TypeScript (strict mode) |
| ORM | Prisma (`prisma/schema.prisma`) |
| Jobs | Bull queue (Redis-backed) |
| Testing | Vitest |
| i18n | Custom message catalogs (`messages/{en,zh}/`) |
| Runtime | Node >= 18.18 |

## Key Workflows

### Adding a New API Route
1. Create `src/app/api/<feature>/<endpoint>/route.ts`
2. Update `tests/contracts/route-catalog.ts` with the new route
3. Add contract test in `tests/integration/api/contract/`
4. Test with `npm run check:api-handler`

### Schema Changes
1. Modify `prisma/schema.prisma` (PascalCase model names + `@@map` for table names)
2. Run `prisma generate` via `node scripts/prisma-generate-safe.mjs`
3. Update related types and handlers

### Adding a New Task Type
1. Define in `src/lib/task/types.ts`
2. Add handler in `src/lib/workers/handlers/`
3. Update `src/lib/task/intent.ts` for routing
4. Update `src/lib/billing/task-policy.ts` for credit costing
5. Update `tests/contracts/task-type-catalog.ts`

### i18n
- User-facing messages: `messages/{en,zh}/*.json`
- Prompt templates: `src/lib/prompt-i18n/catalog.ts` + `src/lib/prompt-i18n/prompt-ids.ts`

## Development Commands

```bash
npm run dev              # Full dev (Next.js + worker + watchdog + board)
npm run dev:next         # Next.js dev server only (Turbopack)
npm run dev:worker       # Worker process only
npm run build            # Production build
npm run check:api-handler # Validate API route contracts
npm run storage:init     # Initialize storage buckets
```
