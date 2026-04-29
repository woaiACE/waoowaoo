# Karpathy Guidelines — Examples

Real-world examples showing what LLMs commonly do wrong and how to fix them.

---

## 1. Think Before Coding

### Example 1: Hidden Assumptions

**User Request:** "Add a feature to export user data"

**Wrong approach** — silently assumes:
- Exporting ALL users (no pagination/privacy consideration)
- A file location without asking
- Which fields to include
- CSV fieldnames without checking data structure

**Right approach** — lists clarifying questions:
- Scope: all users or filtered set?
- Format: download in browser, background job, or API?
- Fields: which specific fields? Any privacy-sensitive ones?
- Volume: how many users? (impacts approach)

Suggests "an API endpoint that returns paginated JSON" as simplest path.

### Example 2: Multiple Interpretations

**User Request:** "Make the search faster"

**Wrong** — immediately adds caching, database indexes, and async processing.

**Right** — breaks "faster" into three distinct meanings:
- Response time (under 100ms) → indexes + caching
- Handling more concurrent searches → async + connection pooling
- Faster perceived speed → progressive loading

States current baseline ("~500ms for typical queries") and asks which aspect matters.

---

## 2. Simplicity First

### Example 1: Over-abstraction

**User Request:** "Add a function to calculate discount"

**Overengineered** — abstract base classes, strategy pattern, enum, protocol, dataclass, DiscountCalculator class. "30+ lines of setup for a simple calculation."

**Simple** — single function: `amount * (percent / 100)` with a docstring.

Add complexity only when multiple discount types are actually needed.

### Example 2: Speculative Features

**User Request:** "Save user preferences to database"

**Overengineered** — PreferenceManager with caching, validation, merging, notifications nobody asked for.

**Simple** — single SQL update. Add caching/validation/merging "later if needed."

---

## 3. Surgical Changes

### Example 1: Drive-by Refactoring

**User Request:** "Fix the bug where empty emails crash the validator"

**Wrong diff** — "improves" email validation beyond the fix, adds username validation (min length, alphanumeric), changes comments, adds docstring.

**Surgical diff** — changes only the specific lines handling empty/whitespace emails and fixing the `@` check. "Only changed: The specific lines that fix empty email handling."

### Example 2: Style Drift

**User Request:** "Add logging to the upload function"

**Wrong** — changes quote style from `''` to `""`, adds type hints and docstring, reformats whitespace, changes boolean return logic.

**Surgical** — matches existing style: single quotes, no type hints, same boolean pattern. "Matched: Single quotes, no type hints, existing boolean pattern."

---

## 4. Goal-Driven Execution

### Example 1: Vague vs. Verifiable

**User Request:** "Fix the authentication system"

**Vague** — "review code, identify issues, make improvements, test" — no clear success criteria.

**Verifiable** — asks "what specific issue?" Proposes concrete scenario: users staying logged in after password change. Plan: write reproducing test → implement session invalidation → check edge cases → verify no regressions.

### Example 2: Multi-Step with Verification

**User Request:** "Add rate limiting to the API"

**Wrong** — implements everything in one 300-line commit.

**Right** — breaks into independently verifiable steps:
1. Basic in-memory limiting → verify with unit test
2. Middleware extraction → verify existing tests pass
3. Redis backend → verify with integration test
4. Configuration → verify with config test

Asks "Start with step 1?"

### Example 3: Test-First Verification

**User Request:** "The sorting breaks when there are duplicate scores"

**Wrong** — immediately changes sort logic without confirming the bug.

**Right** — first writes a reproducing test for inconsistent ordering with duplicate scores, runs it multiple times to confirm failure, then applies stable sort with `key=lambda x: (-x['score'], x['name'])`.

---

## Anti-Patterns Summary

| Principle | Anti-Pattern | Fix |
|-----------|-------------|-----|
| Think Before Coding | Silently assumes file format, fields, scope | List assumptions explicitly, ask |
| Simplicity First | Strategy pattern for single discount calculation | One function until complexity is actually needed |
| Surgical Changes | Reformats quotes, adds type hints while fixing bug | Only change lines that fix the reported issue |
| Goal-Driven | "I'll review and improve the code" | Write test for bug X → make it pass → verify |

## Key Insight

The "overcomplicated" examples follow proper design patterns and best practices, but the timing is wrong — complexity is added before it's needed, making code harder to understand, introducing bugs, taking longer, and complicating testing.

The simple versions are easier to understand, faster to implement, easier to test, and can be refactored later when complexity is actually needed.

> Good code is code that solves today's problem simply, not tomorrow's problem prematurely.
