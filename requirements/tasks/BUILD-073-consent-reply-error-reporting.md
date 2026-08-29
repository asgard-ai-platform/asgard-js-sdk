# BUILD-073 Report consent reply failures through onSseError

## Meta

- Task ID: `BUILD-073`
- Status: `done`
- Issue: `https://github.com/asgard-ai-platform/asgard-freyr-pm/issues/331`
- Source spec: the issue body — a cross-team defect report filed from the consuming app, not a PM
  tracking ticket. It carries root cause, the suggested fix, and the acceptance condition, so it is
  the spec. (Same shape as BUILD-067 / BUILD-072, which also worked from an issue body.)
- Complexity: `S`

---

## Brief

Answering a tool-call consent prompt was the one SSE entrance with no error exit. `use-channel` handed
`Channel.replyToolCallConsents` a handlers object containing only `onSseMessage`, so core's
`options?.onSseError?.(err)` was an optional call on a missing key — a refused reply produced no
consumer callback, no log, nothing. Core does also `reject()` the run promise, but the built-in
`ToolCallConsentGate` dispatches the reply as `void submit(...)`, so that second exit was closed too.
The consuming app therefore could not surface a 403 / 400 on this path by any means short of replacing
the consent UI. This wires the handler up the way `sendMessage` / `reset` / `restore` already do, and
catches the rejection in the gate.

**Already exists:** `use-channel.ts` (`sendMessage`'s `onSseError` + `onAuthError` split, and
`startChannel`'s local `notify` throw-guard, both reused here), `tool-call-consent-gate.tsx`
(`submit`'s `try/finally`, `submittingProcessIdRef`, the effect that seeds `queue` from
`pendingConsent`), `Channel.replyToolCallConsents` (already restores `pendingConsent` on failure —
#410 / PR #414 — which until now had no effect on screen).

---

## Acceptance Criteria

- `R1` When a consent reply run fails, the system shall pass the error to the consumer's `onSseError`,
  the same as a send. → T2
- `R2` When that error carries the auth / bot-provider shape, the system shall mirror it to
  `onAuthError` before `onSseError`, the same as a send. → T2
- `R3` When a consent reply fails, the system shall not leave the rejection unhandled — the gate
  dispatches it fire-and-forget, so an escaped rejection is invisible outside the browser console. → T3
- `R4` When a consent reply fails and core restores `pendingConsent`, the system shall put the card
  back on screen so the answer can be given again. → T3, T4
- `R5` When the consumer's own `onSseError` throws, the system shall still settle the run — core
  notifies before it resolves, so an unguarded throw latches the gate's in-flight marker and silently
  kills every later reply. → T2
- `R6` When a refused batch needs no user input (every call `alreadyAllowed`), the system shall not
  resubmit it — auto-advance would otherwise trade the same rejected reply forever. → T4
- `R7` (Smoke check) When a `RESPONSE_TOOL_CALL_CONSENT` round trip is refused with a 403 against the
  dev consent bot, the system shall log the error through the demo's `onSseError`, leave the card
  answerable, and complete normally once the refusal is lifted — with no build errors and no uncaught
  rejection in the console. → T6, T7

---

## Implementation Tasks

- [x] T1 (R1, R2): `use-channel.ts` — extract `asAuthShapedError()`; the predicate + cast was written
      out at three call sites and this task adds a fourth.
- [x] T2 (R1, R2, R5): `use-channel.ts` — give `replyToolCallConsents` the same `onSseError` the send
      path has, routed through `notify` (hoisted out of `startChannel` to hook scope) so a throwing
      consumer callback cannot leave the run unsettled.
- [x] T3 (R3, R4): `tool-call-consent-gate.tsx` — `catch` the rejection instead of letting it escape
      `void submit(...)`, and record the refused batch.
- [x] T4 (R4, R6): `tool-call-consent-gate.tsx` — key the seeding effect on the refused batch as well,
      and stop auto-advance from resubmitting one.
- [x] T5 (R1–R6): Vitest driving the real `useChannel` against a scripted client; each written to fail
      first, and each fix reverted once to confirm which cases it holds up.
- [x] T6: `apps/react-demo` — log `onSseError` / `onAuthError` on the consent route; without it the
      route has no way to show the thing being fixed.
- [x] T7 (R7): Browser walk against the dev consent bot with the reply refused at the network layer.
      Screenshots stay local.
- [x] T8: `npm run lint:packages` + `format:check` + `typecheck` + `build:core && build:react` +
      `test:packages`.

---

## Decisions (settled here, not in the issue)

1. **The gate catches but renders nothing.** The error's exit is `onSseError`; the consumer decides how
   to present it. `@asgard-js/react` has no error surface of its own, and inventing one here would be a
   banner consumers cannot theme away. This is also what the issue proposes as the minimum fix.
2. **`notify` on this path, not a bare call.** Core reports through the handler _before_ `settleRun()`
   and `reject()`, so a consumer callback that throws leaves the promise forever pending — and here the
   consequence is permanent: the gate releases `submittingProcessIdRef` in `finally`, which never runs.
   `sendMessage` has the same exposure and is **left alone** — out of scope, noted below.
3. **The auth-shape predicate is extracted, the three existing call sites are not otherwise touched.**
   The reset path wraps `onAuthError` and `onSseError` in separate `notify` calls on purpose (a
   throwing `onAuthError` must not swallow `onSseError`), so the tail is not shared — only the test.
4. **R4 is narrower than it first looked.** The card-restore gap needs the failure to land in the same
   React batch as the optimistic clear — a transport that fails synchronously. A real HTTP 403 arrives
   in a later render and the existing seeding effect re-fires unaided; the browser walk confirmed the
   card returns on `main` too. The fix is kept because the window is real and closing it costs one
   state key, but it is not what the issue was reporting.

---

## Coverage

Use Cases: R1, R2, R3, R4, R5, R6 (Vitest); R7 (browser walk, dev consent bot)

Files:

- `packages/react/src/hooks/use-channel.ts` (react)
- `packages/react/src/components/tool-call-consent/tool-call-consent-gate.tsx` (react)
- `packages/react/src/context/asgard-service-context.tsx` (react — comment only; it documented the gap
  as permanent)
- `packages/react/src/components/tool-call-consent/consent-reply-error.spec.tsx` (react, new)
- `apps/react-demo/src/app/routes/tool-call-consent/tool-call-consent.tsx` (demo)
- `apps/react-demo/src/app/routes/tool-call-consent/tool-call-consent.module.scss` (demo)

---

## Out of scope (found here, not fixed here)

- **`nudge` has the same missing handler.** `use-channel.ts` passes it only `onSseMessage`. A nudge is
  invisible by design, so a failed one is silent by design too — but the consumer still cannot know.
- **`onAuthError` never fires from the first-party client.** Nothing in `@asgard-js/core` constructs
  `{ isAuthError, isBotProviderError }`; a live 403 arrives as a plain `HTTP 403: Forbidden` and only
  `onSseError` sees it (confirmed in the browser). The predicate is dead against `AsgardServiceClient`
  on all four paths, and has been since before this task. R2 pins the consistency, not a live route.
- **`sendMessage` reports without the throw-guard.** Same "core notifies before it settles" exposure as
  R5; its caller is the composer rather than the gate, so the consequence is different, and changing it
  would be an unrequested behavior change on the busiest path in the SDK.

---

## Execution Log / Change Log

- 2026-08-30: BUILD task created from asgard-ai-platform/asgard-freyr-pm#331 (Status: `draft → ready →
in-progress`). Written after implementation began — the investigation that answered "is this ours?"
  produced the plan, and the R# were agreed before any source change.
- 2026-08-30: R1–R6 pinned by failing Vitest first (all six red on `main`), then implemented; each of
  the five pieces reverted individually to confirm which cases it holds up. R7 walked in the browser
  against the dev consent bot with the reply refused at the network layer, before and after.
- 2026-08-30: §1 + §3 reviewed via REVIEW-073 — 0 blockers, 3 Minor findings (Status: `in-progress → done`).
