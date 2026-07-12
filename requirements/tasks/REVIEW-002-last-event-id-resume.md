# REVIEW-002 Last-Event-ID Resume (core enablement)

## Meta

- Task ID: `REVIEW-002`
- Status: `done`
- BUILD Task: `BUILD-002`
- Reviewed commit: `working tree (pre-commit)`
- Reviewed branch: `fix/f-011-message-stream-robustness`

---

## §1 Static Code Review

Scope (BUILD-002 `## Coverage` Files): `packages/core/src/lib/create-sse-observable.ts`, `packages/core/src/lib/client.ts`, `apps/react-demo/src/mock-server/sse-mock.ts`.

### §1.1 Checklist

| Check item                                                              | Rule          | Result                                                                              |
| ----------------------------------------------------------------------- | ------------- | ----------------------------------------------------------------------------------- |
| `any` / `as any`                                                        | FRC §1.1      | ✅                                                                                  |
| `@ts-ignore` / `eslint-disable` (in the F-002 change)                   | FRC §1.2      | ✅ (temp diagnostic log removed)                                                    |
| `console.log` introduced by F-002                                       | FRC §1.3 §7   | ✅ (none added; see Minor for pre-existing)                                         |
| hardcoded API key / endpoint / namespace                                | FRC §1.4      | ✅                                                                                  |
| RxJS teardown intact (`takeUntil(this.destroy$)`, abort on unsubscribe) | FRC §1.5      | ✅ (pipe still tears down; `onerror` no-cursor path aborts)                         |
| `@asgard-js/core` importing `react` / `react-dom` / DOM                 | FRC §1.6 §2.1 | ✅ (grep clean)                                                                     |
| public API break                                                        | FRC §1.7      | ✅ (`createSseObservable` / `fetchSse` signatures unchanged; `HttpError` preserved) |
| explicit return types                                                   | FRC §3.1      | ✅                                                                                  |
| error surfaces through the stream error channel (no-cursor)             | FRC §3.3      | ✅ (`subscriber.error(err)` retained for the no-cursor path)                        |
| dead workaround removed                                                 | FRC §7        | ✅ (`retry(3)` and unused `retry` import removed)                                   |

### §1.2 Mechanical Grep

```
core files (create-sse-observable.ts, client.ts):
  any / as any            → (no match) ✅
  core imports react/dom  → (no match) ✅
  retry(                  → only the explanatory comment remains; retry(3) removed ✅
mock (sse-mock.ts):
  console.log             → (no match; temp diagnostic removed) ✅
  eslint-disable          → (no match) ✅
```

### §1.3 Build / Lint

```
npm run lint:packages   → PASS
npm run build:core      → PASS
core Vitest (F-011)     → 7/7 PASS (F-002 change did not regress F-011)
```

### §1.4 Static Review Acceptance

- [x] §1.1 items checked (✅ / N/A, 0 ❌ introduced by F-002)
- [x] §1.2 greps run
- [x] `npm run lint:packages` — no errors
- [x] `npm run build:core` — green

**§1 result: ✅ 0 violations introduced by F-002. 0 BLOCKERs.**

---

## §3 Functional Validation

Harness: react-demo `/history-scroll-bug` (mock mode), verified with a temporary server-side log on the mock (removed after).

### R# Result Matrix

| R#  | Description                                             | Result | Note                                                                                                                                                  |
| --- | ------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | UC-003 transparent resume after mid-stream drop         | Pass   | Server log: initial POST (no cursor) → drop → reconnect POST **carried `last-event-id='…:14'`** → resumed. Rendered message complete, no gap/dup.     |
| R2  | UC-004 no re-POST when no cursor (pre-200 failure)      | Pass   | `fail` message → single 500 POST, **no reconnect** (error surfaced via `HttpError`).                                                                  |
| R3  | `retry(3)` removed — no silent re-dispatch              | Pass   | Removed from `fetchSse` pipe; no RxJS-level re-POST observed.                                                                                         |
| R4  | Native `Last-Event-ID` tracking (no hand-rolled cursor) | Pass   | `@microsoft/fetch-event-source` 2.0.1 sets `headers['last-event-id']` on the shared headers (source `fetch.js:54`); confirmed forwarded on reconnect. |
| R5  | No regression on a normal, uninterrupted stream         | Pass   | Normal runs complete start→delta→complete; F-011 Vitest 7/7 green.                                                                                    |
| R6  | Smoke — enhanced mock resume + build                    | Pass   | build:core green; browser resume + no-cursor scenarios both behaved per spec.                                                                         |

### §3.1 Acceptance

- [x] All R# executed (server-log + on-screen)
- [x] Each R# Pass
- [x] Boundary: mid-stream drop, pre-200 failure both exercised
- Note: the `ERR_INCOMPLETE_CHUNKED_ENCODING` console entry during the resume demo is the simulated drop (`res.destroy()`) itself, absorbed by the native reconnect — not an SDK error.

**§3 result: ✅ all R# Pass, 0 BLOCKERs.**

---

## Findings

### Critical (must fix before done)

None.

### Important (should fix in this cycle)

None.

### Minor (nice to have)

- **Pre-existing (out of F-002 scope):** `client.ts` `uploadFile` / CWD-download methods contain `console.log` debug statements (lines ~238–293) guarded by `eslint-disable no-console`. Untouched by F-002 (which only changed the import line and the `fetchSse` pipe). Candidate for a separate cleanup — a `config.debug`-gated logger — but not introduced or required by this cycle.
- **Deferred by design:** `openWhenHidden: true` removal and `detach` → GET rejoin (F-002 spec items) were scoped out of this cycle pending real-backend regression verification of the background-tab bug.

---

## Execution Log

- 2026-07-12: REVIEW task created, paired with BUILD-002 (Status: `draft`).
- 2026-07-12: §1 static — 0 violations introduced (lint ✅, build ✅, greps clean; pre-existing client.ts logging noted as Minor/out-of-scope); §3 functional — R1–R6 Pass (server-log-proven native resume + no-redispatch). 0 BLOCKERs (Status: `draft → done`).
