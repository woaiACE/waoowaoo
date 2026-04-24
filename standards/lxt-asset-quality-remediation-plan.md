# LXT Asset Quality Remediation Plan

## Context

This document defines a cross-device executable remediation plan for LXT asset inference quality.
It is written for both humans and AI agents. Any agent running on another machine should be able to:

1. understand current failure modes,
2. run the same validation workflow,
3. implement improvements in the same order,
4. apply release and rollback gates consistently.

## Scope

The plan targets three recurring defects in LXT asset generation:

1. prop assets incorrectly absorb character clothing concepts,
2. character description pipeline falls back to legacy too often,
3. location prompts mix multiple time periods in one output.

## Root Cause Analysis

### R1. Prop/Costume Boundary Collapse

Symptoms:

- prop assets include clothing-like entities (e.g. coat, overalls),
- downstream prop descriptions inherit role-wear semantics.

Root causes:

- upstream analyze-prop extraction lacks hard exclusion for wearable terms,
- no explicit reassignment rule from prop candidate to character outfit anchor,
- downstream prompt constraints cannot reliably recover from wrong asset type.

### R2. Character Stage3 Fallback Rate Too High

Symptoms:

- non-human pipeline executes Stage1/2A/2B/2C but still enters legacy fallback,
- final text intermittently contains humanized phrasing or duplicated anchors.

Root causes:

- post-render gate is stricter than upstream normalization stability,
- anchor domains (head/hair vs outfit) can still contaminate each other,
- unknown segment overflow and duplication are not fully absorbed before Stage3 gate.

### R3. Multi-Time-Period Location Drift

Symptoms:

- one location output contains conflicting periods (e.g. dusk + midnight),
- lighting/color system becomes internally inconsistent.

Root causes:

- analyze-location extraction allows multiple periods in a single asset unit,
- no canonical split rule for multi-time evidence into separate location assets.

## Quality Goals

Target quality level: from ~6.5/10 to >=8.5/10.

Primary metrics (AB baseline against prior prompt snapshot):

- `prop_clothes_leak_rate` < 5%
- `location_multi_time_conflict_rate` = 0%
- `character_duplicate_phrase_rate` < 3%
- `nonhuman_legacy_fallback_rate` < 20%

Release guard:

- if any core metric regresses >5% versus baseline, rollback immediately.

## Execution Plan

### Phase 1 - Upstream Prop Extraction Hard Filter (P0)

Files:

- `lib/prompts/lxt-asset/lxt_analyze_prop_select.zh.txt`
- `lib/prompts/lxt-asset/lxt_analyze_prop_select.en.txt`

Actions:

1. add hard denylist for wearable terms (coat, overalls, shirt, dress, shoes, socks, etc.),
2. add conversion rule: wearable candidates must be redirected to character outfit/profile anchors,
3. force output to physical props only (independent manipulable objects).

Done criteria:

- no wearable-only assets emitted as prop in sampled runs.

### Phase 2 - Single-Period Location Canonicalization (P0)

Files:

- `lib/prompts/lxt-asset/lxt_analyze_location_select.zh.txt`
- `lib/prompts/lxt-asset/lxt_analyze_location_select.en.txt`

Actions:

1. enforce one time period per location output unit,
2. when source evidence includes multiple periods, split into separate location assets by period suffix,
3. keep one lighting/color system per output.

Done criteria:

- zero multi-period conflicts in sampled location outputs.

### Phase 3 - Character Pipeline Stabilization (P1)

Files:

- `src/lib/lxt/character-description-pipeline.ts`
- `src/lib/lxt/character-description-schema.ts`
- `src/lib/lxt/character-description-renderer.ts`

Actions:

1. add explicit `stage3_fail_reason` categories for observability,
2. tighten anchor domain separation (head/hair tokens excluded from outfit anchors),
3. strengthen deterministic dedupe before gate evaluation,
4. reduce unknown-overflow before fallback.

Done criteria:

- measurable reduction in `nonhuman_legacy_fallback_rate`,
- duplicate phrase recurrence controlled below target.

### Phase 4 - Prompt Lexicon Densification (P1)

Files:

- `lib/prompts/lxt-asset/lxt_nh_stage2b_user.zh.txt`
- `lib/prompts/lxt-asset/lxt_character_nonhuman_legacy.zh.txt`

Actions:

1. add slot-based outfit lexicon similar to high-density image prompt style,
2. hard ban repeated anchor emission across adjacent zones,
3. require canonical output order with minimal unknown placeholders.

Done criteria:

- tighter outfit anchor retention with lower repetition.

### Phase 5 - AB Automation + Rollback (P0)

Files:

- `scripts/lxt-asset-ab-eval.ts` (new)
- `lib/prompts/lxt-asset/README.txt`

Actions:

1. script computes the four core metrics from generated outputs,
2. compare against baseline snapshot,
3. apply release gate and rollback trigger automatically.

Done criteria:

- one-command reproducible evaluation available across devices.

## Verification Protocol

1. fixed input story + fixed storyboard sample set (minimum 10 runs per branch),
2. run baseline (old snapshot) and candidate (current prompts),
3. output metric report in machine-readable JSON and markdown summary,
4. block release when threshold violated.

## Rollback Protocol

Priority order:

1. toggle environment rollback flag for analyze assets chain,
2. revert latest prompt set in `lxt-asset`,
3. keep observability instrumentation intact for postmortem.

## Ownership

Implementation owner: LXT asset pipeline maintainers.

Operational owner: whoever runs release validation on the active branch.

## Notes For AI Agents

When executing this plan on another device:

1. preserve phase order (Phase 1/2 before Phase 3/4),
2. do not skip AB metrics,
3. do not release when any core metric regresses >5%,
4. prefer prompt-layer fixes first, then minimal code-layer stabilization.
