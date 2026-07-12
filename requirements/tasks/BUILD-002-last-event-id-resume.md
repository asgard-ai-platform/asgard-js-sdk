# BUILD-002 Last-Event-ID Resume (core enablement)

## Meta

- Task ID: `BUILD-002`
- Status: `done`
- Issue: `https://github.com/asgard-ai-platform/asgard-sdk-pm/issues/2`
- Source spec: `references/asgard-sdk-pm/tracking/asgard-js-sdk/features/F-002-last-event-id-斷線續傳.md` (UC-003, UC-004)
- Complexity: `M`

---

## Brief

Enable transparent mid-stream reconnect in `@asgard-js/core` by **stopping the SDK from suppressing** `@microsoft/fetch-event-source`'s native `Last-Event-ID` reconnect, and removing the pre-resume workaround that re-POSTs the run. Concretely: `create-sse-observable.ts` `onerror` gates on whether a cursor exists (an event with `id:` has been received) — with a cursor it lets the library reconnect natively (which replays the `last-event-id` header); without one it surfaces the error and does not reconnect. `client.ts` drops the RxJS `retry(3)` that re-issues the POST (duplicate dispatch). Verification is done by enhancing the react-demo mock SSE to emit `id:`, drop mid-stream, and resume from the cursor.

**Already exists:** `packages/core/src/lib/create-sse-observable.ts` (`onopen`/`onmessage`/`onerror`, `openWhenHidden: true`); `packages/core/src/lib/client.ts` (`fetchSse` pipe with `retry(3)`, `detach`); `apps/react-demo/src/mock-server/sse-mock.ts` (one-shot mock, no `id:`/resume).

**Out of scope (deferred to a follow-up cycle, per user decision 2026-07-12):**

- Removing `openWhenHidden: true` (background-tab bug #2 regression must be verified against a real backend first).
- Changing `detach` to a GET rejoin (evaluation; needs the backend rejoin endpoint).

---

## Relevant Rules

Distilled from `FRONTEND_RULE_COMMON.md`.

| §    | Rule (summary)                                                                                  |
| ---- | ----------------------------------------------------------------------------------------------- |
| §1.1 | No `any` / `as any`                                                                             |
| §1.2 | No `@ts-ignore` / `eslint-disable`                                                              |
| §1.3 | No `console.log` in library code                                                                |
| §1.5 | RxJS teardown preserved (`takeUntil(this.destroy$)`, `controller.abort()` on unsubscribe)       |
| §1.6 | Change stays in `@asgard-js/core` (+ react-demo mock); no React/DOM import into core            |
| §1.7 | No public-API break — `fetchSse` / `createSseObservable` signatures unchanged; `HttpError` kept |
| §3.1 | Explicit return types preserved                                                                 |
| §3.3 | RxJS: error still surfaces through the stream's error channel for the no-cursor case            |
| §7   | Remove the dead `retry(3)` workaround; no leftover commented code                               |

---

## Acceptance Criteria

- `R1` (UC-003) When the stream is established (200 + at least one event carrying `id:`) and the connection drops mid-stream, the system shall let `@microsoft/fetch-event-source` reconnect natively with `Last-Event-ID` and continue from the cursor — no thrown error, no re-POST. → T1, T2, T4
- `R2` (UC-004) When the connection fails before any cursor exists (pre-200, or no `id:` received yet), the system shall surface the error to the caller (`HttpError`/error preserved) and shall NOT auto re-POST the run. → T1, T3, T4
- `R3` When a transport error occurs, the SDK shall no longer re-issue the POST via RxJS `retry` (removed) — a run is never silently re-dispatched. → T3
- `R4` The SDK shall rely on the library's native `last-event-id` tracking (onerror does not `throw`/abort when a cursor exists); it shall not hand-roll cursor state. → T1
- `R5` A normal, uninterrupted stream shall still render `start → deltas → complete` with no behavior change (no regression). → T4, T5
- `R6` (Smoke) When the react-demo mock (enhanced to emit `id:`, drop mid-stream, and resume on `last-event-id`) is driven in the browser, the message shall resume from the cursor with no gap/duplication (UC-003), and a pre-cursor failure shall surface an error without re-dispatch (UC-004); `npm run build:core` green. → T5

---

## Implementation Tasks

- [x] T1 (R1, R2, R4): `create-sse-observable.ts` — added `hasCursor` (set when an incoming `EventSourceMessage` has a non-empty `id`); `onerror` now returns (native reconnect) when `hasCursor`, else `subscriber.error(err)` + `controller.abort()` + throw (surface, no reconnect).
- [x] T2 (R1): Confirmed via library source (`@microsoft/fetch-event-source` 2.0.1 `fetch.js:54` sets `headers['last-event-id']` on the shared headers, reused on reconnect) AND server-side log (reconnect POST carried `last-event-id='<msgId>:14'`). No manual cursor plumbing needed.
- [x] T3 (R2, R3): `client.ts` — removed `retry(3)` from the `fetchSse` pipe (and the now-unused `retry` import); kept `concatMap` delay + `takeUntil(this.destroy$)`.
- [x] T4 (R1, R2, R5): Enhanced `apps/react-demo/src/mock-server/sse-mock.ts` — emits `id: <messageId>:<idx>`; honors `Last-Event-ID` header → resume same messageId from cursor+1; keyword `斷線/續傳/drop/resume` drops mid-stream via `res.destroy()`; `fail/no-cursor` returns 500 pre-200; normal runs still complete.
- [x] TN-1: `npm run lint:packages` ✅ · `npm run build:core` ✅ · `prettier --check` on changed files ✅ · core Vitest (F-011) still 7/7 ✅.
- [x] T5 (R5, R6): Smoke on react-demo (`/history-scroll-bug`, mock mode). Server-side log proved: initial POST (no cursor) → mid-stream drop → **native reconnect with `last-event-id='…:14'`** → resume (UC-003); `fail` message → single 500 POST, **no re-POST** (UC-004). On screen the resumed message rendered complete (no gap/dup).

---

## Coverage

Use Cases: UC-003, UC-004 (R1–R6)
Files:

- `packages/core/src/lib/create-sse-observable.ts` — `hasCursor` tracking; cursor-gated `onerror` (native reconnect vs surface-and-stop).
- `packages/core/src/lib/client.ts` — removed `retry(3)` (+ unused `retry` import) from the `fetchSse` pipe.
- `apps/react-demo/src/mock-server/sse-mock.ts` — verification infra: `id:` cursors, `Last-Event-ID` resume, mid-stream drop + pre-200 fail triggers.

---

## Execution Log / Change Log

- 2026-07-12: BUILD task created from https://github.com/asgard-ai-platform/asgard-sdk-pm/issues/2; scope = core resume enablement only (openWhenHidden/detach deferred), verification via enhanced mock (user decisions) (Status: `draft`).
- 2026-07-12: Plan confirmed; implemented cursor-gated `onerror` + removed `retry(3)` + enhanced mock. lint/build green, F-011 tests still 7/7. Demo smoke proved UC-003 native resume (reconnect carried `last-event-id`) + UC-004 no re-POST. Removed temporary diagnostic log (Status: `in-progress → done`).
