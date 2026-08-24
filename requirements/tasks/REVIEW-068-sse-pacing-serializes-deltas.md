# REVIEW-068 Review: SSE pacing no longer serializes stream deltas

## Meta

- Task ID: `REVIEW-068`
- Status: `done`
- BUILD Task: `BUILD-068`
- Reviewed commit: `1df298933beaab3269d829a0a94524ae8d7e9faa` (+ the R6 error-path case added during this review)
- Reviewed branch: `fix/87-sse-pacing-serializes-deltas`

> Procedure per `.claude/skills/feature-workflow/REVIEW_RULE.md` (§1 static → §3 functional). Note the
> generic `_review_template.md` §1.1 table is a Next.js-app checklist and does not apply to this repo;
> REVIEW_RULE's SDK table is the one used below.

---

## §1 Static Code Review

Scope: BUILD-068 `## Coverage` files.

### §1.1 Checklist

| Check item                                                        | Rule      | Result                                                                                                                                                                                                              |
| ----------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `any` / `as any`                                                  | §1.1      | ✅ none                                                                                                                                                                                                             |
| `@ts-ignore` / `eslint-disable` to bypass errors                  | §1.2      | ✅ none                                                                                                                                                                                                             |
| `console.log` left in library code                                | §1.3 §7   | ✅ none                                                                                                                                                                                                             |
| Hardcoded API key / endpoint / namespace                          | §1.4      | ✅ none (spec fixtures use `example.com` placeholders passed via `config`)                                                                                                                                          |
| RxJS / EventSource / timer teardown                               | §1.5      | ✅ `takeUntil(destroy$)` retained after `bufferTime`, so the buffer interval is torn down with the run; asserted by the close case                                                                                  |
| react imports core via public entry only                          | §1.6      | ✅ none                                                                                                                                                                                                             |
| core imports react / react-dom / DOM                              | §1.6 §2.1 | ✅ none                                                                                                                                                                                                             |
| Public API change without `@deprecated`                           | §1.7      | ✅ no signature change. `FetchSseOptions.delayTime` keeps its name, type and default (50); its meaning shifts from per-frame delay to batch window — a timing-only change, documented in the type's new doc comment |
| New public types / functions exported from entry                  | §2.2      | ✅ n/a — no new public surface; `DEFAULT_SSE_BATCH_WINDOW_MS` is module-private by design                                                                                                                           |
| Message-template prerequisites                                    | §2.3      | ✅ n/a — no template added                                                                                                                                                                                          |
| Uses `botProviderEndpoint`                                        | §2.4      | ✅ yes                                                                                                                                                                                                              |
| Explicit return types on exported functions                       | §3.1      | ✅ spec helpers all annotated; no exported function added                                                                                                                                                           |
| Shared types centralized in core `src/types/`                     | §3.2      | ✅ `delayTime` stays a single declaration on `FetchSseOptions`; the react props reference it rather than redefining a shape                                                                                         |
| React props fully typed                                           | §4.1      | ✅ `delayTime?: number` on both `AsgardServiceContextProviderProps` and `UseChannelProps`                                                                                                                           |
| Hardcoded color values in components                              | §4.2      | ✅ none — the one grep hit is `#409` in a pre-existing comment (an issue number, not a color)                                                                                                                       |
| react / react-dom stay peerDependencies                           | §4.4      | ✅ untouched                                                                                                                                                                                                        |
| core and react share a version number                             | §5        | ✅ both 0.3.71, unchanged (no release in this cycle)                                                                                                                                                                |
| Repeated logic / types / JSX extracted                            | §6        | ✅ the coalescing helper written mid-build was deleted rather than left unused; `delayTime` is threaded, not duplicated                                                                                             |
| `setTimeout` mock delays, dead commented code, stray TODO / FIXME | §7        | ✅ none. Note this task **removes** the closest thing the repo had to a mock delay                                                                                                                                  |

### §1.2 Mechanical Grep

Scope: the five `Coverage.Files`, plus the two package-wide boundary greps.

```
any / as any                         → (empty) ✅
ts-ignore / ts-nocheck / eslint-disable → (empty) ✅
console.log                          → (empty) ✅
setTimeout                           → (empty) ✅
core → react reverse dependency      → (empty) ✅
react → @asgard-js/core/src deep import → (empty) ✅
hardcoded color values               → asgard-service-context.tsx:353  "// #409 — a *refusal* never opens…"
                                       false positive: issue number in a pre-existing comment ✅
```

### §1.4 Build / Lint / Format

```
lint:packages: PASS — Successfully ran target lint for 2 projects
format:check:  PASS — All matched files use Prettier code style!
typecheck:     PASS — Successfully ran target typecheck for 3 projects
build:         PASS — build:core ✅, build:react ✅
```

> ⚠️ `format:check` only passes if `packages/*/out-tsc/**/*.js` is cleared first. `out-tsc` is in
> `.gitignore` but **not** in `.prettierignore` (which lists `dist/`), so anyone who runs
> `npm run typecheck` and then `format:check` sees 31 style failures in generated output. Pre-existing,
> unrelated to this task, not fixed here — logged under Findings (Minor).

### §1.5 Static Review Acceptance

- [x] All §1.1 items checked and reported
- [x] No ❌ violations (nothing to list)
- [x] All §1.2 greps run and output pasted
- [x] `npm run lint:packages` clean
- [x] `build:core` + `build:react` green

---

## §3 Functional Validation

### R# Result Matrix

| R#  | Description                                                                         | Result                   | Note                                                                                                                                                                                                                                                                                   |
| --- | ----------------------------------------------------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | ~~Coalesce adjacent same-message deltas~~                                           | —                        | Withdrawn during build; out of scope. Rationale in BUILD-068 `## Brief`                                                                                                                                                                                                                |
| R2  | Every frame delivered individually, in original order                               | **Pass**                 | `sse-pacing.spec.ts` — `['a','b','c']` in, same out via `onSseMessage`. Fails on the old pipeline (`['a']`)                                                                                                                                                                            |
| R3  | Added latency bounded by one window, not N × delayTime                              | **Pass**                 | 372 frames delivered after advancing a single 50ms window. Old pipeline: 1 frame, needing 18.6s for the rest                                                                                                                                                                           |
| R4  | `onSseMessage` receives every frame unmodified                                      | **Pass**                 | Static: `next` passes the untouched object. Test: 372 calls, and the ordered-content case reads its payload back                                                                                                                                                                       |
| R5  | `delayTime` reaches core from react; `0` removes the wait                           | **Pass (partial basis)** | Core half proven by test (199ms → nothing, 200ms → delivered; `0` delivers on the next tick). React→core hop verified by static read + typecheck across all five `FetchSseOptions` objects and their dep arrays, **not** by an automated test — see Findings (Minor)                   |
| R6  | complete / error / unsubscribe all settle without leaking or emitting post-teardown | **Pass**                 | Three cases: completion flushes the open window (1 frame + `onSseCompleted`); `close()` drops it; `error` surfaces once, drops the window, no completion. The error case was **added during this review** — BUILD-068 had named the error path in R6 but only covered two of the three |
| R7  | Existing core + react suites unchanged and green                                    | **Pass**                 | 611 passed (258 core / 353 react); no existing spec modified                                                                                                                                                                                                                           |
| R8  | Browser smoke on react-demo `/canvas-card`, script 「畫」                           | **Pass**                 | Before: 113s elapsed, html 658/2602, skeleton never lifted. After: html 2602/2602 and drawing ended at **9s**, skeleton lifted at 5s, canvas visually complete (pipeline row, three metric tiles, bar row). 9s tracks the mock's own wire schedule (372 × 25ms ≈ 9.3s)                 |

### §3.3 Acceptance

- [x] Every R# in Coverage executed (static read → test/demo → boundary)
- [x] Each marked with its basis
- [x] Vitest run and green
- [x] Boundary conditions confirmed: completion flush, user-initiated close, transport error, empty window (filtered), `detached` short-circuit

---

## Findings

### Critical (must fix before done)

None.

### Important (should fix in this cycle)

None.

### Minor (nice to have)

1. **No automated coverage for the react→core `delayTime` hop (R5).** The value is threaded through five `FetchSseOptions` objects in `use-channel.ts`; a future refactor could drop one of them and only static reading would catch it. A provider-level test asserting the value reaches the client would close this.
2. **`out-tsc` missing from `.prettierignore`.** `npm run typecheck` emits `packages/core/out-tsc/**/*.js`, which then fails `format:check` (31 files). `.gitignore` covers `out-tsc`; `.prettierignore` covers `dist/` but not `out-tsc/`. Pre-existing and unrelated to this task, so not touched.
3. **Absolute browser latency figures are not obtainable in this harness.** Chrome clamps timers to ~1Hz in a hidden tab (measured: a 50ms `setTimeout` fires every ~1000ms), and a CDP-driven tab reports `visibilityState: "hidden"`. R8's before/after ratio is valid because both runs shared those conditions, but a foreground-tab pass is still outstanding and is the right place to confirm the real user-facing number.

---

## Execution Log

- 2026-08-24: REVIEW task created, paired with BUILD-068 (Status: `draft`).
- 2026-08-24: BUILD-068 reached `done`; review scope is its `## Coverage` (Status: `draft → ready`).
- 2026-08-24: §1 static — 19 checklist items ✅ / 0 ❌; 7 greps run, 1 false positive explained; lint / format / typecheck / build all PASS (Status: `ready → in-progress`).
- 2026-08-24: §3 functional — R2, R3, R4, R6, R7, R8 Pass; R5 Pass on a partial basis (no test for the react→core hop); R1 withdrawn. One gap found and closed during review: R6's error path had no test, so a third teardown case was added (6 cases total, all green). 3 Minor findings, 0 BLOCKERs (Status: `in-progress → done`).
