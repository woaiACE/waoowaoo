---
name: waoowaoo-testing
description: Testing patterns extracted from waoowaoo repository (Vitest + contract tests + integration tests)
version: 1.0.0
source: local-git-analysis
analyzed_commits: 50
generated: 2026-04-28
---

# waoowaoo Testing Patterns

Testing conventions, frameworks, and patterns for the waoowaoo project.

## Test Framework

**Vitest** (v2.x) is the sole test framework.

## Test Directory Structure

```
tests/
├── unit/                  # Unit tests for isolated functions/services
│   └── worker/            # Worker handler unit tests
├── integration/           # Integration tests
│   ├── api/
│   │   ├── contract/      # API route contract tests (every route has one)
│   │   ├── specific/      # Feature-specific API tests
│   │   └── helpers/       # API test utilities (call-route.ts)
│   └── billing/           # Billing system integration tests
├── contracts/             # Contract definitions (source of truth)
│   ├── route-catalog.ts           # All API routes catalog
│   ├── task-type-catalog.ts       # All task types catalog
│   ├── requirements-matrix.ts     # Requirements matrix
│   ├── route-behavior-matrix.ts   # Route behavior matrix
│   └── tasktype-behavior-matrix.ts # Task-type behavior matrix
├── concurrency/           # Concurrency tests (billing race conditions)
├── regression/            # Regression test suites
├── system/                # System-level tests
├── helpers/               # Shared test utilities
│   ├── auth.ts            # Auth helpers
│   ├── db-reset.ts        # Database reset
│   ├── prisma.ts          # Test Prisma client
│   ├── request.ts         # HTTP request helpers
│   ├── fixtures.ts        # Test fixtures
│   ├── billing-fixtures.ts
│   ├── assertions.ts
│   └── fakes/             # Fake implementations
│       ├── llm.ts         # Fake LLM service
│       ├── media.ts       # Fake media service
│       └── providers.ts   # Fake AI providers
└── setup/                 # Test setup (global configs)
```

## Test Naming

Tests describe behavior clearly:

```typescript
test('returns empty array when no markets match query', () => {})
test('throws error when API key is missing', () => {})
```

File naming:
- Test files: `*.test.ts` or `*.test.tsx`
- Contract definitions: `*-catalog.ts` (not test files, but relied on by tests)

## Contract-Driven Testing

Every API route must be registered in `tests/contracts/route-catalog.ts`. Contract tests validate:
- Route existence
- HTTP method
- Auth requirements
- Request/response shapes

```typescript
// tests/integration/api/contract/crud-routes.test.ts
// tests/integration/api/contract/direct-submit-routes.test.ts
```

To check route compliance:
```bash
npm run check:api-handler
```

## Test Fixtures & Helpers

Use the centralized helpers instead of inline setup:

```typescript
// BAD - inline
const client = new PrismaClient();
const user = await client.user.create({ ... });

// GOOD - use helpers
import { createTestUser } from '@/tests/helpers/auth';
import { getTestPrisma } from '@/tests/helpers/prisma';
```

Fake implementations for external services:
- `tests/helpers/fakes/llm.ts` — Fake LLM (avoid real API calls in tests)
- `tests/helpers/fakes/media.ts` — Fake media processing
- `tests/helpers/fakes/providers.ts` — Fake AI providers

## Key Patterns

1. **Contract First**: Define API surface in contract catalogs, test compliance
2. **Fakes over Mocks**: Prefer fake implementations of external services over mocking
3. **Integration > Unit**: Heavier investment in integration tests (especially API contracts)
4. **Database in Integration Tests**: Tests use a real test database, reset via `tests/helpers/db-reset.ts`
5. **Billing Concurrency**: Dedicated concurrency test for billing race conditions (`tests/concurrency/billing/`)

## Running Tests

```bash
npx vitest                          # All tests
npx vitest tests/unit               # Unit tests only
npx vitest tests/integration        # Integration tests
npx vitest --coverage               # With coverage
```
