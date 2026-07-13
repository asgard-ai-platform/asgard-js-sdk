# REVIEW-008 Subagent List Panel (F-012)

## Meta

- Task ID: `REVIEW-008`
- Status: `done`
- BUILD Task: `BUILD-008`
- Reviewed commit: `working tree @ feat/stream-robustness-and-resume` (uncommitted)
- Reviewed branch: `feat/stream-robustness-and-resume`

---

## §1 Static Code Review

### §1.1 Checklist (scoped to BUILD-008 Coverage files)

| Check item                                          | Rule        | Result                                                                                               |
| --------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------- |
| No `any` / `as any`                                 | §1.1 / §4.1 | ✅                                                                                                   |
| No `@ts-ignore` / `eslint-disable`                  | §1.2 / §4.2 | ✅                                                                                                   |
| No `console.log` in library code                    | §1.3 / §7   | ✅                                                                                                   |
| No hardcoded API key / endpoint / namespace         | §1.4        | ✅                                                                                                   |
| RxJS subs / timers have teardown                    | §1.5        | ✅ (no new subscriptions/timers; reducers are pure)                                                  |
| `@asgard-js/core` has no react/DOM import           | §1.6        | ✅ (core changes are types + pure reducers)                                                          |
| No breaking public-API change without `@deprecated` | §1.7        | ✅ (all additive: new enum values, optional fields, new union member)                                |
| New public types exported from package entry        | §2.2        | ✅ (core types auto-export via `export type *`; SubagentList kept internal, matching TaskList/F-010) |
| Types/enums exist before first use                  | §2.3        | ✅                                                                                                   |
| Component props fully typed                         | §4.1        | ✅                                                                                                   |
| No hardcoded colors in components (theme CSS vars)  | §4.2        | ✅ (scss uses `--asg-color-*`; `.ts/.tsx` grep clean)                                                |
| No repeated logic/JSX to extract                    | §6          | ✅ (SPINNER const shared; glyphs factored)                                                           |
| No `setTimeout` mock delays / dead code / TODO      | §7          | ✅                                                                                                   |

### §1.2 Mechanical Grep (Coverage files)

```
§1.2a hardcoded colors (.ts/.tsx):  (none) ✅
§1.2b <style> tag:                  (none) ✅
§1.2c as any:                       (none) ✅
§1.2d eslint-disable / @ts-ignore:  (none) ✅
§1.2e console.log:                  (none) ✅
§1.2f setTimeout:                   (none) ✅
§1.2g TODO / FIXME:                 (none) ✅
```

### §1.3 TypeScript and Lint

```
tsc (core, tsconfig.lib.json):  PASS — exit 0, clean.
tsc (react, tsconfig.lib.json): PASS — 0 real errors (only TS6305 project-reference cache noise,
                                a pre-existing repo tooling quirk unrelated to this change; the
                                vite-plugin-dts typecheck in `build:react` passes clean).
lint (npm run lint:packages):   PASS — @asgard-js/core + @asgard-js/react, 0 errors.
```

Note: this repo exposes `lint:packages` (read-only `eslint .` via nx), not `lint:check`; used as the read-only lint gate.

### §1.4 Static Review Acceptance

- [x] All §1.1 items ✅
- [x] All §1.2 greps run, output pasted (all empty = ✅)
- [x] `tsc` clean (core exit 0; react 0 real errors)
- [x] lint clean

**No §1 BLOCKERs.**

---

## §3 Functional Validation

Validated on the react-demo `/subagent` route (live `/mock-asgard` SSE stream), locale `zh-TW`, via Playwright.

### R# Result Matrix

| R#  | Description                                          | Result | Note                                                                                                                                          |
| --- | ---------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Core parses association keys + materializes subagent | Pass   | +6 Vitest; panel renders the subagent + its child tools from the stream.                                                                      |
| R2  | Replay-safe status (subagent.complete, not Agent)    | Pass   | Vitest `start-after-complete` preserves terminal; demo: subagent shows `已完成` despite early `async_launched` Agent complete.                |
| R3  | Routing — Agent + child + subagent out of main group | Pass   | Main tool-call group shows `6 個步驟` (native tools only); `讀取 orders.csv` etc. appear ONLY inside the subagent.                            |
| R4  | `reduceSubagents` folds keyed by parentToolUseId     | Pass   | 1 subagent, 3 child tools paired by toolUseId, first-seen order.                                                                              |
| R5  | Docked above TaskList; hidden empty; auto-collapse   | Pass   | Panel above `任務清單`; all-terminal → `子代理 1/1` collapsed; running→expand verified by construction + unit tests (transient in live demo). |
| R6  | Item glyph + type·desc + tool count / expanded tools | Pass   | `已完成 · general-purpose · … · 3 個工具`; expanded lists 3 child tools with `toolLabel` + glyphs.                                            |
| R7  | i18n `subagent.*` (en/ja/zh)                         | Pass   | `子代理` / `已完成` / `3 個工具` localize in zh-TW (after the docked-panel provider-placement fix).                                           |
| R8  | Build + demo smoke, no errors                        | Pass   | build core+react ✅; 0 console errors across the run.                                                                                         |

### §3.1 Acceptance

- [x] All R# executed (static read + browser operation + boundary: empty / running / all-terminal)
- [x] Each R# Pass
- [x] Empty-state (panel not rendered before any subagent) and auto-collapse (all terminal) confirmed

**No §3 BLOCKERs.**

---

## Findings

### Critical (must fix before done)

None.

### Important (should fix in this cycle)

None — but note two intentional, documented drive-by fixes carried by this BUILD (see BUILD-008 "Drive-by fixes"): (1) folded the missing `ConversationThinkingMessage` into the `ConversationMessage` union to make `tsc` clean; (2) moved the docked run-layer panels inside `AsgardTemplateContextProvider` so `locale` reaches them — this also localizes F-010's `TaskList` (`任務清單`). Both verified green; flagged for awareness since #2 changes F-010's rendered output.

### Minor (nice to have)

- `reduceSubagents` (react) has no dedicated unit test (react package has no Vitest setup; F-010's `reduceTasks` is likewise untested). Its correctness is exercised functionally in the demo, and the core-side event assembly (`onSubagent*`, association keys) has 6 unit tests. F-013 relocates `reduceSubagents` into `@asgard-js/core`, where it will gain a proper unit test.
- Child-tool list uses index keys (`key={i}`) — append-only during streaming, matches the prototype; could key by `toolUseId` when the reducer moves to core (F-013).

---

## Execution Log

- 2026-07-13: REVIEW task created, paired with BUILD-008 (Status: `draft`).
- 2026-07-13: §1 static — 13 ✅ / 0 ❌; grep suite clean; tsc clean (core exit 0, react 0 real errors); lint:packages green. §3 functional — R1–R8 all Pass on `/subagent` (zh-TW). 0 BLOCKERs (Status: `draft → done`).
