# REVIEW-009 Framework-agnostic derived-state store (F-013)

## Meta

- Task ID: `REVIEW-009`
- Status: `done`
- BUILD Task: `BUILD-009`
- Reviewed commit: `working tree @ feat/stream-robustness-and-resume` (uncommitted)
- Reviewed branch: `feat/stream-robustness-and-resume`

---

## §1 Static Code Review

### §1.1 Checklist (scoped to BUILD-009 Coverage files)

| Check item                                          | Rule        | Result                                                                                                                                          |
| --------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| No `any` / `as any`                                 | §1.1 / §4.1 | ✅                                                                                                                                              |
| No `@ts-ignore` / `eslint-disable`                  | §1.2 / §4.2 | ✅ (the one `eslint-disable no-console` in `use-channel.ts` is pre-existing)                                                                    |
| No `console.log` in library code                    | §1.3 / §7   | ✅ (pre-existing debug log gated behind `client?.debugMode`; not from F-013)                                                                    |
| RxJS subs / timers have teardown                    | §1.5        | ✅ (`derivedSubscription` + `tasks$`/`subagents$` completed in `close()`)                                                                       |
| `@asgard-js/core` has no react/DOM import           | §1.6        | ✅ (derived-state + Channel are framework-neutral; hooks live in react)                                                                         |
| No breaking public-API change without `@deprecated` | §1.7        | ✅ (additive: new store getters, ChannelStates fields, hooks; the relocated symbols were never in react's public barrel — now public from core) |
| New public types/functions exported from entry      | §2.2        | ✅ (core exports reducers/predicates/types + `ReactiveStore`; react exports hooks)                                                              |
| No duplicate types across files                     | §3.2        | ✅ (reducers/types de-duplicated — single source in core)                                                                                       |
| Component props / hooks fully typed                 | §4.1        | ✅                                                                                                                                              |
| No hardcoded colors in components                   | §4.2        | ✅ (demo mirror uses `--asg-color-*`)                                                                                                           |
| No repeated logic (≥2×) after relocation            | §6          | ✅ (react components now import from core; local copies removed)                                                                                |
| No `setTimeout` mock / dead code / TODO             | §7          | ✅                                                                                                                                              |

### §1.2 Mechanical Grep (Coverage files)

```
as any:                       (none) ✅
eslint-disable / @ts-ignore:  use-channel.ts:251 (pre-existing, debug-gated) — not from F-013
console.log:                  use-channel.ts:252 (pre-existing, gated on client?.debugMode)
setTimeout:                   (none) ✅
hardcoded colors (.ts/.tsx):  (none) ✅
```

### §1.3 TypeScript and Lint

```
tsc (core):   PASS — exit 0, clean (no circular-import issues; type-only edge types/channel ↔ lib/derived-state).
tsc (react):  PASS — 0 real errors (only TS6305 project-ref cache noise).
lint:packages: PASS — @asgard-js/core + @asgard-js/react, 0 errors.
```

### §1.4 Static Review Acceptance

- [x] All §1.1 items ✅ (one pre-existing debug log noted, out of scope)
- [x] §1.2 greps run; only the pre-existing debug log surfaces
- [x] `tsc` clean; lint clean

**No §1 BLOCKERs.**

---

## §3 Functional Validation

Validated on the react-demo `/subagent` route (live `/mock-asgard` SSE stream), locale `zh-TW`.

### R# Result Matrix

| R#  | Description                                             | Result | Note                                                                                                                                                                   |
| --- | ------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Reducers in core, immutable refs                        | Pass   | +7 Vitest (reduceTasks/reduceSubagents relocated); built-in panels still render fed by core reducers.                                                                  |
| R2  | ChannelStates gains tasks/subagents                     | Pass   | `combineLatest([isConnecting$, conversation$, tasks$, subagents$])` → `statesObserver`; type + build verified.                                                         |
| R3  | Per-slice store, distinctUntilChanged                   | Pass   | Vitest: a `message.delta` leaves `reduceTasks`/`reduceSubagents` structurally equal ⇒ `distinctUntilChanged(deepEqual)` blocks the re-emit; a real change is detected. |
| R4  | Framework-agnostic contract (getSnapshot/subscribe/obs) | Pass   | `channel.tasks`/`channel.subagents` `ReactiveStore`; `close()` tears down.                                                                                             |
| R5  | React adapter via useSyncExternalStore                  | Pass   | `<DerivedStateMirror>` shows `useTaskList() → 1/3 tasks · useSubagents() → 1/1 subagents`, matching the panels.                                                        |
| R6  | No delta event                                          | Pass   | Only the store (snapshot + notify) added; no "listChanged" event.                                                                                                      |
| R7  | Framework docs                                          | Pass   | `docs/derived-state-stores.md` — React / Vue / Svelte / Angular-RxJS / vanilla.                                                                                        |
| R8  | Build + demo smoke                                      | Pass   | build core+react ✅; hooks reflect live state; 0 console errors.                                                                                                       |

### §3.1 Acceptance

- [x] All R# executed (static read + browser operation)
- [x] Each R# Pass
- [x] Boundary: in-chatbot panels unchanged; hooks return `[]` in preview mode (documented)

**No §3 BLOCKERs.**

---

## Findings

### Critical (must fix before done)

None.

### Important (should fix in this cycle)

None.

### Minor (nice to have)

- `useTaskList()`/`useSubagents()` reflect the live channel and return `[]` in preview mode (no channel). Documented in `docs/derived-state-stores.md` and the hook JSDoc; consumers using preview mode reduce from `messages` directly. Acceptable — preview mode is a static-display path.
- The seed value in the `Channel` constructor and the first derived emission carry structurally-equal content with distinct references (one redundant emit at subscribe time). Harmless (single mount-time render); could be `skip`-guarded if it ever matters.

## Execution Log

- 2026-07-13: REVIEW task created, paired with BUILD-009 (Status: `draft`).
- 2026-07-13: §1 static — 12 ✅ / 0 ❌ (one pre-existing debug log noted, out of scope); tsc clean (core exit 0, react 0 real errors); lint green. §3 functional — R1–R8 all Pass on `/subagent`. 0 BLOCKERs (Status: `draft → done`).
