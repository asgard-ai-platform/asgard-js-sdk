# BUILD-001 Message Stream Assembly Robustness

## Meta

- Task ID: `BUILD-001`
- Status: `done`
- Issue: `https://github.com/asgard-ai-platform/asgard-sdk-pm/issues/11`
- Source spec: `references/asgard-sdk-pm/tracking/asgard-js-sdk/features/F-011-message-與-thinking-串流組裝健壯性.md` (UC-017, UC-018)
- Complexity: `M`

---

## Brief

Harden the `message.{start,delta,complete}` assembly in `@asgard-js/core`'s `conversation.ts` reducer so a skipped-prefix (`complete`-only), replayed, duplicated, or out-of-order frame stream never loses characters, gets stuck in typing, clears completed content, or crashes. `complete` is already self-sufficient today; the work is a terminal-state anti-rollback guard on `onMessageStart` / `onMessageDelta` plus lazy-init on `onMessageDelta` when no entry exists. Purely data-layer — no prototype/UI change.

**Already exists:** `packages/core/src/lib/conversation.ts` (`onMessageStart` / `onMessageDelta` / `onMessageComplete`); `onMessageComplete` already materializes terminal state unconditionally. Terminal marker available today = a bot message whose `eventType === EventType.MESSAGE_COMPLETE`.

**Out of scope:** the `thinking.{start,delta,complete}` family — the enum has no such events yet; per F-011 spec this robustness is built into the thinking handlers by **F-001**. This BUILD covers the **message family only**.

---

## Relevant Rules

Distilled from `FRONTEND_RULE_COMMON.md`; builder reads this table instead of the full corpus.

| §    | Rule (summary)                                                                                       |
| ---- | ---------------------------------------------------------------------------------------------------- |
| §1.1 | No `any` / `as any` — use precise types, generics, or `unknown` + narrowing                          |
| §1.2 | No `@ts-ignore` / `eslint-disable` to bypass type or lint errors                                     |
| §1.3 | No `console.log` left in library code                                                                |
| §1.5 | No new RxJS subscription here; keep the reducer pure (returns a new `Conversation`, no side effects) |
| §1.6 | Change stays in `@asgard-js/core`; no React/DOM import                                               |
| §1.7 | No public-API break — `Conversation` method signatures unchanged; behavior-only fix                  |
| §3.1 | Keep explicit return types (`: Conversation`) on the handlers                                        |
| §3.2 | Reuse existing `ConversationMessage` types; no duplicate/parallel type                               |
| §6   | Extract a small terminal-state predicate if the check repeats (used by both start and delta)         |
| §7   | No `setTimeout`, no `console.log`, no dead code, no untracked TODO                                   |

---

## Acceptance Criteria

EARS form. Each criterion maps to Implementation Tasks (→ T#).

- `R1` When `message.complete` arrives for a messageId that had no prior `start`/`delta`, the system shall materialize the terminal message (`isTyping=false`, text/template from the complete frame) without first showing a typing bubble. → T2, T4
- `R2` When `message.delta` arrives for a messageId that has no existing bot entry, the system shall lazily create the entry and set `typingText` to the delta text (instead of dropping the frame). → T2, T4
- `R3` When `message.start` arrives for a messageId already in the `complete` terminal state, the system shall ignore it — the completed content and `isTyping=false` are preserved (no reset to an empty typing bubble). → T3, T4
- `R4` When `message.delta` arrives for a messageId already in the `complete` terminal state, the system shall ignore it — `isTyping` stays `false`, terminal text is not overwritten, and no `"null…"` concatenation occurs. → T3, T4
- `R5` When a duplicate `message.complete` arrives for an already-complete messageId, the system shall remain in the same terminal state and shall not create a second message. → T3, T4
- `R6` Given any subset / out-of-order / duplicate combination of message frames, the reducer shall not throw. → T2, T3, T4
- `R7` (Smoke check) When the developer runs `npm run build:core` and the Vitest suite, the four sequences (complete-only / delta-before-start / start·delta-after-complete / duplicate-complete) shall pass with no build errors; and driving the react-demo mock SSE through a skip-to-complete + late-frame sequence shall render the message in its terminal state on screen without flicker. → T4, T5

---

## Implementation Tasks

Run in order; each task maps to the R# it satisfies.

- [x] T1 (R1–R6): Wrote failing Vitest specs first (TDD) in `conversation.spec.ts` covering the four sequences + normal flow; asserted terminal text, `isTyping`, single-message invariants. Red confirmed (3 fail / 4 pass).
- [x] T2 (R1, R2, R6): `onMessageDelta` — lazy-create the bot entry when none exists (accumulate from `''`); kept accumulation for existing typing entries.
- [x] T3 (R3, R4, R5): Added `isTerminalBotMessage` guard (bot message with `eventType === MESSAGE_COMPLETE`) to `onMessageStart` and `onMessageDelta` → ignore late frames; `onMessageComplete` left as-is (already idempotent, tests green).
- [x] T4 (R1–R6): TDD specs green (7/7); reducer stays pure, types precise (no `any`).
- [x] TN-1: `npm run lint:packages` ✅ · `npm run build:core` ✅ · `nx typecheck` ✅ · my changed files `prettier --check` ✅ (repo-wide `format:check` has pre-existing/submodule noise — out of scope, see REVIEW-001).
- [x] T5 (R7): Smoke — Vitest 7/7; drove react-demo mock SSE (localhost:4200) through a full start→28×delta→complete stream, rendered terminal bubble with 0 console errors (no regression). Edge sequences authoritatively covered by unit tests.

---

## Coverage

Use Cases: UC-017, UC-018 (R1–R7 — behavioral, unit-tested)
Files:

- `packages/core/src/lib/conversation.ts` — terminal anti-rollback guard on `onMessageStart`/`onMessageDelta`; `onMessageDelta` lazy-init; new `isTerminalBotMessage` helper.
- `packages/core/src/lib/conversation.spec.ts` — new; 7 Vitest specs (normal flow + the four required sequences + out-of-order storm).
- `packages/core/vite.config.ts` — added Vitest `test` block (enabling infra; core had no test target).
- `packages/core/tsconfig.lib.json` — exclude `src/**/*.spec.ts` from the library build (keep test files out of `dist`).

---

## Execution Log / Change Log

- 2026-07-12: BUILD task created from https://github.com/asgard-ai-platform/asgard-sdk-pm/issues/11 (Status: `draft`).
- 2026-07-12: Plan confirmed by user (Status: `draft → ready`); implementation started (Status: `ready → in-progress`).
- 2026-07-12: Implemented terminal guard + delta lazy-init; TDD specs 7/7 green; `lint:packages` / `build:core` / `typecheck` green; react-demo smoke (0 console errors) (Status: `in-progress → done`).
