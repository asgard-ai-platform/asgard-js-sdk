# BUILD-074 Close the remaining SSE error-guard gaps

## Meta

- Task ID: `BUILD-074`
- Status: `done`
- Issue: `https://github.com/asgard-ai-platform/asgard-js-sdk/issues/459`
- Source spec: the issue body, §1 and §3 — an internal defect report filed
  from BUILD-073's "Out of scope", not a PM tracking ticket. It carries the root cause, the entrance
  table and the suggested fix, so it is the spec. (Same shape as BUILD-072 / BUILD-073.)
- Complexity: `S`

---

## Brief

`use-channel` has five SSE entrances. After BUILD-073 four of them hand errors back to the consumer, and
two of those four route the handoff through `notify`. This closes the rest: `nudge` gets an error exit at
all, and `restoreChannel` and `sendMessage` get the throw-guard the reset and consent paths have. Every
entrance then reports the same way and guards the same way.

The guard is not defensive tidiness. `Channel.buildRunHandlers` (`packages/core/src/lib/channel.ts:509`)
runs `options?.onSseError?.(err)` **before** `this.settleRun()` and `reject(err)`, and `settleRun()` is
what calls `isConnecting$.next(false)` and returns `runStatus` to idle. A consumer callback that throws
therefore skips both: the run promise never settles **and** the channel never leaves the connecting
state, so the composer stays disabled for the life of the mount.

**Already exists:** `use-channel.ts` — `asAuthShapedError()` and the hook-scope `notify()` (both added by
BUILD-073, and both reused verbatim here); `packages/react/src/components/tool-call-consent/consent-reply-error.spec.tsx`
(the scripted-client harness this task's spec is modeled on); `apps/react-demo/src/app/routes/nudge-payload/`
(a nudge route with a log panel already wired for `onBeforeSendMessage`).

---

## Relevant Rules

Distilled from `FRONTEND_RULE_COMMON.md`; builder reads this table instead of the full corpus.

| §    | Rule (summary)                                                                                                            |
| ---- | ------------------------------------------------------------------------------------------------------------------------- |
| §1.1 | No `any` / `as any` — use precise types, generics, or `unknown` + narrowing                                               |
| §1.2 | No `@ts-ignore` / `eslint-disable` to bypass type or lint errors                                                          |
| §1.3 | No `console.log` left in library code (gate behind an explicit debug option if needed)                                    |
| §1.4 | No hardcoded API key / endpoint / namespace — pass via `config`                                                           |
| §1.5 | Every RxJS subscription / EventSource / timer has teardown (`takeUntil` / `unsubscribe` / `useEffect` cleanup)            |
| §1.6 | `@asgard-js/core` never imports `react` / `react-dom` / DOM; react imports core via its public entry only (no `core/src`) |
| §1.7 | No breaking public-API change without `@deprecated` transition                                                            |
| §2.2 | New public types / functions / components exported from the package entry with explicit `export type`                     |
| §2.3 | Template type (`core/src/types/sse-response.ts`) + enum (`core/src/constants/enum.ts`) exist before the react component   |
| §2.4 | Use `botProviderEndpoint`, not the deprecated `endpoint`                                                                  |
| §3.1 | Exported functions / methods declare explicit return types                                                                |
| §3.2 | Shared types centralized in `core/src/types/`; no duplicate interfaces across files                                       |
| §4.1 | React component props fully typed (no `any`)                                                                              |
| §4.2 | No hardcoded color values in components — theme via CSS variables / theme context                                         |
| §4.4 | `react` / `react-dom` stay peerDependencies (not bundled)                                                                 |
| §5   | `@asgard-js/core` and `@asgard-js/react` keep the same version number                                                     |
| §6   | After implementation: extract repeated logic (≥2×), duplicate types, repeated JSX (≥3×)                                   |
| §7   | No `setTimeout` mock delays, no `console.log`, no dead commented code, no untracked TODO / FIXME                          |

---

## Acceptance Criteria

- `R1` When a nudge run fails, the system shall pass the error to the consumer's `onSseError` — today the
  handlers object given to `Channel.nudge` holds only `delayTime` and `onSseMessage`, so core's
  `options?.onSseError?.(err)` is an optional call on a missing key and the failure reaches no one. → T1
- `R2` When a failing nudge's error carries the auth / bot-provider shape, the system shall mirror it to
  `onAuthError` before `onSseError`, the same as every other entrance. → T1
- `R3` When the consumer's own `onSseError` or `onAuthError` throws on the nudge path, the system shall
  still settle the run rather than leave the channel connecting. → T1
- `R4` When the consumer's own callback throws on the restore path, the system shall still settle the run.
  Core calls the handler before `settleRun()`, so today the throw leaves `isConnecting` latched true,
  `Channel.restore`'s promise unsettled, and therefore its own `catch` / `channel.close()` cleanup
  unreached — the input never unlocks. → T2
- `R5` When the consumer's own callback throws on the send path, the system shall still settle the run —
  the same latch as R4, on the entrance the built-in composer uses for every message. → T3
- `R6` When any of the three entrances fails **without** a throwing consumer callback, the system shall
  behave exactly as it does today: the error still reaches `onSseError`, and the run still settles. The
  guard must not change the success path or the ordinary-failure path. → T1, T2, T3
- `R7` (Smoke check) When a nudge is refused with a 403 against the dev bot on the react-demo
  `/nudge-payload` route (`npm run serve:react-demo -- -- --port 5100`), the system shall log the error
  through the demo's `onSseError` and leave the composer usable — with `npm run build:core && npm run
build:react` clean and no uncaught rejection in the console. → T5, T6

## Implementation Tasks

Run in order; each task maps to the R# it satisfies.

- [x] T1 (R1, R2, R3, R6): `use-channel.ts` — give `nudge` the same `onSseError` the send path has,
      routed through `notify`, with the `asAuthShapedError` split ahead of it.
- [x] T2 (R4, R6): `use-channel.ts` — route `restoreChannel`'s `onAuthError` / `onSseError` through
      `notify`, in two separate calls (a throwing `onAuthError` must not swallow `onSseError`, per
      BUILD-073 Decision 3).
- [x] T3 (R5, R6): `use-channel.ts` — same for `sendMessage`.
- [x] T4 (R1–R6): `packages/react/src/hooks/sse-error-exits.spec.tsx` (new) — Vitest driving the real
      `useChannel` against a scripted client, each case written to fail first, and each fix reverted once
      to confirm which cases it holds up.
- [x] T5 (R7): `apps/react-demo` — log `onSseError` / `onAuthError` on the `/nudge-payload` route; the
      route has a log panel but currently records only `onBeforeSendMessage`, so it cannot show the thing
      being fixed.
- [x] T6 (R7): Browser walk against the dev bot with the nudge POST refused at the network layer.
      Screenshots stay local.
- [x] T7: `npm run lint:packages` + `format:check` + `typecheck` + `build:core && build:react` +
      `test:packages`.

## Decisions (settled here, not in the issue)

1. **Branch stacks on `fix/331-consent-sse-error`, not on `main`.** Both helpers this task reuses —
   hook-scope `notify` and `asAuthShapedError` — were introduced by PR #458 and do not exist on `main`
   (`asAuthShapedError` greps to 0 there; `notify` is a local inside `startChannel`). Branching from
   `main` would mean re-implementing both and colliding with #458 on the same lines of the same file.
2. **`nudge` reports but renders nothing.** Its silence on screen is the design (an invisible turn must
   stay invisible); what was missing is the consumer's ability to know at all. Handing the error to
   `onSseError` is the whole fix — presentation is the consumer's call, as in BUILD-073 Decision 1.
3. **The issue's stated consequences for §3 were wrong, and this task records the correction.** #459 §3
   says a throwing callback on `sendMessage` yields "an unhandled rejection, not a wedge" and that
   `restoreChannel`'s outer `catch {}` "happens to swallow it". Reading core says otherwise: the throw
   pre-empts `reject(err)`, so nothing ever rejects — the promise simply never settles, no `catch`
   anywhere runs, and `isConnecting` stays true. Both paths wedge, permanently, and identically. That
   removed the reason BUILD-073 gave for leaving `sendMessage` alone ("the consequence is different"), so
   `sendMessage` was folded into this task rather than left for a third cycle. R4 / R5 are written against
   the corrected behavior, and T4 proves it before T2 and T3 change anything.

---

## Coverage

Use Cases: R1, R2, R3, R4, R5, R6 (Vitest); R7 (browser walk, dev bot with the nudge POST refused 403)

Files:

- `packages/react/src/hooks/use-channel.ts` (react)
- `packages/react/src/hooks/sse-error-exits.spec.tsx` (react, new)
- `apps/react-demo/src/app/routes/nudge-payload/nudge-payload.tsx` (demo)

---

## Execution Log / Change Log

- 2026-08-30: BUILD task created from asgard-ai-platform/asgard-js-sdk#459 (Status: `draft`).
- 2026-08-31: scope extended to `sendMessage` after reading core showed its exposure is identical, not
  milder as #459 claimed (Status: `draft → ready → in-progress`).
- 2026-08-31: R1–R6 pinned by failing Vitest first (R1–R5 red, R6 green as the control), then
  implemented. R3 was vacuous on the first pass — with no handler wired there is nothing to throw, so
  "the run still settled" passed for the wrong reason; it now counts the callback as well. Each of the
  three fixes reverted individually: nudge → R1/R2/R3 red, restore → R4 red, send → R5 red, R6 never.
- 2026-08-31: R7 walked in the browser at 1440×900 against the dev bot on `/nudge-payload`, with the
  NUDGE POST refused 403 by a fetch patch. Before the fix: 0 lines in the error panel. After: `onSseError
· HTTP 403: Forbidden`, composer still enabled, no uncaught rejection (the only console error is the
  metadata gate's expected 404). Lifting the refusal, the next nudge goes out normally.
- 2026-08-31: the R7 walk found a defect in this task's own new code — the demo error panel's empty-state
  hint claimed the dev backend refuses the nudge turn, and the first click disproved it (two nudges
  succeeded; the 403 had to be forced at the network layer). Reworded to describe how to produce a
  failure rather than predict one. The stale premise it was copied from (`nudge-payload.tsx:15` / `:72`,
  BUG-005) is pre-existing and left alone — recorded as REVIEW-074 Minor 2.
- 2026-08-31: lint 0 errors (5 pre-existing warnings, `--skip-nx-cache`), format clean, typecheck 3
  projects, both builds exit 0, full suite 689 green (core 275 / react 414, +6) (Status: `in-progress →
done`).
