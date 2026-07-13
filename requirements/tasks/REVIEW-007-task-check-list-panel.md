# REVIEW-007 Task Check List Panel (F-010)

## Meta

- Task ID: `REVIEW-007`
- Status: `done`
- BUILD Task: `BUILD-007`
- Reviewed branch: `feat/stream-robustness-and-resume`

## §1 Static Code Review

- No `any`/`@ts-ignore`/`eslint-disable`/`console.log`. ✅
- `reduceTasks` is pure (no side effects, folds over arrival order) → replay-safe; `str()` helper narrows `unknown` without casts. ✅
- Task routing is additive: `isTaskTool` only _removes_ TaskCreate/TaskUpdate from the existing group; no change to tool-call rendering for other tools. ✅
- `TaskList` is run-level live state read from `messages` (same pattern as `RunningIndicator`), returns `null` when empty — no layout when there are no tasks. ✅
- INFERRED CONTRACT (parameter-based read until `sidecar` lands, EXT-002) documented at the reducer and in BUILD-007; matches the spec's `parameter.status` fallback. ✅
- i18n via existing `t(locale, ...)`; `task.*` keys added for en/ja/zh; backend content (subject/activeForm/description) not localized. ✅
- lint:packages ✅ · build:core + build:react ✅.

**§1: 0 violations.**

## §3 Functional Validation

| R#                             | Result | Note                                                                                        |
| ------------------------------ | ------ | ------------------------------------------------------------------------------------------- |
| R1 routing out of group        | Pass   | TaskCreate/TaskUpdate do not render as tool-call rows; folded into the tray                 |
| R2 reduce fold + order         | Pass   | 3 create events → 3 rows in create order; TaskUpdate mutates existing by id (no new row)    |
| R3 position / visibility       | Pass   | docked above seam; hidden when empty                                                        |
| R4 three states + label expand | Pass   | completed green check, in_progress amber spinner + activeForm, pending hollow; desc expands |
| R5 i18n title                  | Pass   | "TASKS · 3" (en); localized via `t`                                                         |
| R6 unknown status              | Pass   | falls through to neutral pending-style glyph, no crash                                      |
| R7 build + demo smoke          | Pass   | builds + lint green, 0 console errors, 2 screenshots                                        |

**§3: all Pass.** Screenshots: `.github/screenshots/f010-task-list/{collapsed,expanded}.png`.

## Findings

None. Note: `sidecar`-first read and moving the reducer into core are intentionally deferred — the former to EXT-002 (backend contract), the latter to F-013 (framework-agnostic store).

## Execution Log

- 2026-07-13: §1 0 violations; §3 R1–R7 Pass (Playwright + build + lint + 2 screenshots). 0 BLOCKERs (Status: `draft → done`).
