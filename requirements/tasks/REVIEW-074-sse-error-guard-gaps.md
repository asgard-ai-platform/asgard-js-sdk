# REVIEW-074 Review: close the two remaining SSE error-guard gaps

## Meta

- Task ID: `REVIEW-074`
- Status: `done`
- BUILD Task: `BUILD-074`
- Reviewed commit: `5473ad37886ccbcc448a104c28628f06884b6095`
- Reviewed branch: `fix/459-sse-error-guards` (stacked on `fix/331-consent-sse-error`)

---

## §1 Static Code Review

Scan BUILD task `## Coverage` files against `FRONTEND_RULE_COMMON.md`. No server needed.

### §1.1 Checklist

Scope: the three files in BUILD-074 `## Coverage`. Nineteen items, **0 violations**, three adjudicated
(detail below the table).

| Check item                                                            | Rule      | Result |
| --------------------------------------------------------------------- | --------- | ------ |
| `any` / `as any`                                                      | §1.1      | ✅     |
| `@ts-ignore` / `eslint-disable` used to bypass a type or lint error   | §1.2      | ✅ ¹   |
| `console.log` left in library code (not debug-gated)                  | §1.3 §7   | ✅ ¹   |
| Hardcoded API key / endpoint / namespace                              | §1.4      | ✅     |
| Teardown for every RxJS subscription / EventSource / timer            | §1.5      | ✅ ²   |
| `@asgard-js/react` imports core through its public entry only         | §1.6      | ✅     |
| `@asgard-js/core` imports no `react` / `react-dom` / DOM              | §1.6 §2.1 | ✅ ³   |
| Public API change carries a `@deprecated` transition                  | §1.7      | ✅ ⁴   |
| New public types / functions exported from the package entry          | §2.2      | ✅ ⁴   |
| Template type + enum precede the react component                      | §2.3      | ✅ n/a |
| `botProviderEndpoint`, not the deprecated `endpoint`                  | §2.4      | ✅     |
| Explicit return types on exported functions / methods                 | §3.1      | ✅     |
| Shared types centralized; no duplicate interfaces                     | §3.2      | ✅ ⁵   |
| React component props fully typed                                     | §4.1      | ✅     |
| No hardcoded color values in components                               | §4.2      | ✅ ⁶   |
| `react` / `react-dom` stay peerDependencies                           | §4.4      | ✅     |
| core and react share one version number                               | §5        | ✅ ⁴   |
| Repeated logic (≥2×) / types / JSX (≥3×) extracted                    | §6        | ✅ ⁷   |
| `setTimeout` mock delays, dead commented code, untracked TODO / FIXME | §7        | ✅     |

¹ **Adjudicated.** The only `console.log` in the coverage set is `use-channel.ts:627`, inside an
`if (client?.debugMode)` guard with an `eslint-disable-next-line no-console` above it. Both lines come
from `d08e9779` (BUILD-072) and are outside this task's diff — `git show 5473ad37 | grep '^+'` returns no
`console.log`, no `eslint-disable`, no `@ts-ignore`, no `any`. Same adjudication as REVIEW-073.

² No new subscription, EventSource or timer. `notify` is a synchronous try/catch.

³ `@asgard-js/core` is untouched by this task — the whole change is in the react hook, the new spec and
the demo route.

⁴ No public API change. `nudge` / `sendMessage` / `restoreChannel` keep their signatures; `onSseError` and
`onAuthError` are existing props that now fire on one more path each. Nothing new is exported, so no
version implication.

⁵ `AuthShapedError` and `notify` are reused from BUILD-073 rather than re-declared — that is what kept
this change to three small handler blocks.

⁶ **Adjudicated.** Seven grep hits, all false positives: `#[0-9a-fA-F]{3,6}` matches the issue numbers
`#459` and `#331` in comments and in the demo's section title. No color literal anywhere. REVIEW-073
recorded the same false positive.

⁷ The three handler bodies are near-identical (`asAuthShapedError` → `notify(onAuthError)` →
`notify(onSseError)`), which reads like a §6 extraction candidate. Left inline **on purpose**: two of the
five entrances differ in their body (restore also calls `setChannel(null)`; `startChannel` also sets
`openingRunFailed` / `setIsResetting`), so a shared helper would cover three of five and need a callback
parameter for the rest. BUILD-073 Decision 3 already settled this for the predicate — only the test was
shared, not the tail.

### §1.2 Mechanical Grep

Run per file, each path quoted separately. (REVIEW-072 recorded a false green here from an unquoted file
list collapsing into one nonexistent path; every command below was run against one file at a time.)

```
§1.1 any / as any                    → (empty)
§1.2 ts-ignore / eslint-disable      → use-channel.ts:626  // eslint-disable-next-line no-console   [adjudicated ¹]
§1.3 console.log                     → use-channel.ts:627  console.log(                             [adjudicated ¹]
§1.6 core imports react              → (empty)
§1.6 react reaches into core/src     → (empty)
§4.2 hardcoded colors                → 7 hits, all `#459` / `#331` issue numbers                     [adjudicated ⁶]
§7 setTimeout                        → (empty)
```

### §1.3 TypeScript and Lint

`npm run lint:check` does not exist in this repo; `npm run lint:packages` is the equivalent, and
`npm run typecheck` is the gate that actually fails on a type error (see AGENTS.md — the vite builds
report type errors on stdout and still exit 0).

```
typecheck:      PASS — Successfully ran target typecheck for 3 projects
lint:packages:  PASS — 0 errors, 5 warnings (--skip-nx-cache; all five pre-existing and in files
                outside this task's Coverage: source-set-explorer/file-view.tsx,
                file-explorer/per-source-view-state.spec.tsx, canvas-runtime-behavior.spec.ts)
format:check:   PASS — All matched files use Prettier code style
build:          PASS — build:core exit 0, build:react exit 0
tests:          PASS — 689 green (core 275 / react 414), +6 from this task
```

### §1.4 Static Review Acceptance

- [x] All §1.1 items checked and marked
- [x] Zero violations; three adjudications documented with file path and line number
- [x] All §1.2 grep commands run per file and output pasted
- [x] `npm run typecheck` run — no TypeScript errors
- [x] `npm run lint:packages --skip-nx-cache` run — no ESLint errors

---

## §3 Functional Validation

### R# Result Matrix

| R#  | Description                                                     | Result | Note                                                                                                                    |
| --- | --------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------- |
| R1  | A failed nudge reaches the consumer's `onSseError`              | Pass   | Vitest; reverting the nudge handler turns this red                                                                      |
| R2  | An auth-shaped nudge failure is mirrored to `onAuthError` first | Pass   | Vitest only — the shape is injected. Core never constructs it, so no live route exercises this; see Findings 1          |
| R3  | A throwing callback on the nudge path still settles the run     | Pass   | Vitest; asserts the callback ran **and** the run settled — the first draft passed vacuously, see Execution Log          |
| R4  | A throwing callback on the restore path still settles the run   | Pass   | Vitest; red before the fix with `isConnecting` latched true                                                             |
| R5  | A throwing callback on the send path still settles the run      | Pass   | Vitest; same latch, on the composer's own entrance                                                                      |
| R6  | An ordinary failure behaves exactly as before                   | Pass   | Control — green before and after all three fixes; never red in any revert                                               |
| R7  | Browser: a 403-refused nudge logs through `onSseError`          | Pass   | 1440×900, dev bot, `/nudge-payload`. Before: 0 error lines. After: `onSseError · HTTP 403: Forbidden`, composer enabled |

### §3.1 Acceptance

- [x] All R# executed
- [x] Each R# marked Pass / Fail / Blocked
- [x] No e2e spec covers this route; validated by Vitest + a browser walk instead
- [x] Boundary conditions confirmed: the no-throw path (R6) and recovery after the refusal is lifted
      (the next nudge goes out normally, error panel gains no new line)

---

## Findings

### Critical (must fix before done)

None.

### Important (should fix in this cycle)

None.

### Minor (nice to have)

1. **`onAuthError` is still dead against the first-party client.** The browser walk re-confirmed it: a
   live 403 arrived as a plain `HTTP 403: Forbidden`, `asAuthShapedError` returned null, and only
   `onSseError` fired. R2 pins that nudge now applies the same rule as the other entrances, not that a
   403 reaches `onAuthError`. Tracked as #459 §2, which asks for a decision (populate it or deprecate it)
   rather than an implementation — deliberately out of this task.
2. **The demo route still carries the stale BUG-005 premise.** `nudge-payload.tsx:15` and `:72` state
   that the backend rejects a NUDGE turn; the walk showed two consecutive nudges succeeding against the
   dev bot, which is why the 403 had to be forced at the network layer. The comment is pre-existing and
   conditional ("on a channel that has been chatted with"), so it was left alone — but a reader following
   it will expect a failure that does not come.

---

## Execution Log

- 2026-08-31: REVIEW task created, paired with BUILD-074 (Status: `draft`).
- 2026-08-31: §1 static review — 19 items, 0 violations, 3 adjudicated (debug-gated `console.log` and its
  `eslint-disable` from BUILD-072; issue numbers matched by the color grep). Greps run one file at a time
  to avoid REVIEW-072's unquoted-list false green. typecheck / lint / format / build / tests all green
  (Status: `draft → in-progress`).
- 2026-08-31: §3 functional — R1–R7 all Pass. Each of the three fixes reverted individually to confirm
  coverage (nudge → R1/R2/R3, restore → R4, send → R5; R6 never red). **The first revert run was itself
  invalid** and worth recording: the revert patterns matched two places each (restore's indentation is
  identical to `startChannel`'s, and nudge's handler shape is identical to the consent path's), so
  `replace(..., 1)` silently reverted the wrong, pre-existing block and no test went red — which reads
  exactly like "the test does not cover this". Re-run anchored on the `#459` comments, asserting a single
  match. **One defect found and fixed in this cycle**, in this task's own new code: the hint text added to
  the demo's error panel asserted that the dev backend refuses the nudge turn, which the walk disproved on
  its first click; reworded to describe how to produce a failure instead of predicting one. Two Minor
  findings, neither blocking (Status: `in-progress → done`).
