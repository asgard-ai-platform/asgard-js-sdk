# REVIEW-071 Review: wire `deleteChannel` and retire `RESET_CHANNEL`

## Meta

- Task ID: `REVIEW-071`
- Status: `done`
- BUILD Task: `BUILD-071`
- Reviewed commit: `619dee5c7e239b525f2d3d5bc3374baec56307c2` (+ one follow-up: explicit `: void` on the two opening callbacks)
- Reviewed branch: `feat/91-delete-channel`

---

## §1 Static Code Review

Scope: the files listed in `BUILD-071 ## Coverage`. `tsc` / lint run project-wide.

### §1.1 Checklist

| Check item                                                               | Rule        | Result |
| ------------------------------------------------------------------------ | ----------- | ------ |
| `any` / `as any`                                                         | §1.1        | ✅     |
| `@ts-ignore` / `eslint-disable` used to bypass a type or lint error      | §1.2        | ✅     |
| `console.log` left in library code (not gated by a debug option)         | §1.3 / §7   | ✅     |
| Hardcoded API key / endpoint / namespace                                 | §1.4        | ✅     |
| Teardown for every RxJS subscription / EventSource / timer               | §1.5        | ✅     |
| `@asgard-js/react` imports core only through its public entry            | §1.6        | ✅     |
| `@asgard-js/core` free of `react` / `react-dom` / DOM                    | §1.6 / §2.1 | ✅     |
| Public-API change carries a `@deprecated` transition                     | §1.7        | ✅     |
| New public types / functions exported from the package entry             | §2.2        | ✅     |
| Type / enum prerequisites exist before first use                         | §2.3        | ✅     |
| Uses `botProviderEndpoint`, not the deprecated `endpoint`                | §2.4        | ✅     |
| Exported functions / methods declare explicit return types               | §3.1        | ✅     |
| Shared types centralized in core `src/types/`; no duplicate interfaces   | §3.2        | ✅     |
| React component props fully typed                                        | §4.1        | ✅     |
| No hardcoded colors in components                                        | §4.2        | ✅     |
| `react` / `react-dom` stay peerDependencies                              | §4.4        | ✅     |
| `@asgard-js/core` and `@asgard-js/react` share a version number          | §5          | ✅     |
| Repeated logic (≥2×) / types / JSX (≥3×) extracted                       | §6          | ✅     |
| No `setTimeout` mock delays, dead commented code, untracked TODO / FIXME | §7          | ✅     |

**19 ✅ / 0 ❌.**

Notes on the three that needed a judgement rather than a grep:

- **§1.7 — `Channel.reset()` now issues a `DELETE` it never used to.** The signature is unchanged and
  `RESET_CHANNEL` is retained + `@deprecated`, so nothing stops compiling; what changed is the wire, which
  is the ticket's stated deliverable (F-032 AC2). Recorded as a deliberate behavior change, the way
  TASK-003 recorded its §1.7 exemption. The one place it can surface as an error rather than a wire
  difference is a hand-rolled `IAsgardServiceClient` with no `deleteChannel` — see the Decisions section
  of BUILD-071, and note `useChannel` is typed against the concrete `AsgardServiceClient`, which always
  has the method.
- **§3.1** — `resetChannel` / `openChannel` were the only new callbacks without an explicit return type
  (inferred `void`). Annotated during review to match the file's own convention (`clearPromptSuggestion`,
  `deleteChannel`). Not a rule breach on its own (they are not exported functions; the exported shape is
  `UseChannelReturn`), fixed for consistency.
- **§6** — `resetChannel` and `openChannel` differ only in whether they delete first, so both are thin
  wrappers over one `startChannel(mode)`; the copy that would otherwise have been duplicated (conversation
  seeding, `onBeforeSendMessage`, the four SSE callbacks, channel adoption) exists once.

### §1.2 Mechanical Grep

```
### 1. any / as any            → 4 matches, all the English word "any" inside comments / test names
                                 (task-reducer.ts:41, subagent-reducer.spec.ts:126, paths.spec.ts:8,
                                 source-set-explorer.spec.tsx:587). No real `any`.
### 2. ts-ignore / eslint-disable → 18 matches, all pre-existing and all `no-console` next to a
                                 `debugMode` guard (plus two `no-explicit-any` in event-emitter, which
                                 predate this task). None in a file this task introduced, none bypassing
                                 a type error.
### 3. console.log (changed files) → 3 matches, all inside `if (this.debugMode)` / `if (client?.debugMode)`
                                 (client.ts:458, client.ts:507, use-channel.ts:524). Pre-existing;
                                 §1.3 explicitly permits debug-option-controlled logging.
### 4. core → react reverse dependency  → (empty)
### 5. react deep-import into core/src  → (empty)
### 6. hardcoded colors (changed react files) → 4 matches, all false positives: issue references
                                 (`#200`, `#387`, `#432`, `#409`) matching the hex pattern in comments.
### 7. setTimeout (changed package files) → 5 matches, all pre-existing real timers with teardown
                                 (force-stop timer + its `ReturnType` field, the client detach timer)
                                 and one `flush()` helper in a spec. No mock delays.
```

### §1.3 TypeScript and Lint

```
typecheck (npm run typecheck, core + react + react-demo): PASS
lint:packages:                                            PASS — 0 errors, 5 warnings
                                                          (all pre-existing, in files this task did not
                                                          touch: chat-composer aria, two exhaustive-deps,
                                                          a spec fragment, a spec `new Function`)
format:check:                                             PASS
build:core && build:react:                                PASS
```

### §1.4 Static Review Acceptance

- [x] All §1.1 items checked and marked
- [x] No ❌ violations to list
- [x] All §1.2 grep commands run and output recorded
- [x] Typecheck run — no TypeScript errors
- [x] Lint run — no ESLint errors

---

## §3 Functional Validation

Harness: core + react Vitest (`npm run test:packages`) and the react-demo at `http://localhost:5100`,
plus a direct contract check against the **dev backend** (the endpoint this task is built on is live
there, so the wire assumptions were verified rather than assumed).

### R# Result Matrix

| R#  | Description                                                                            | Result | Note                                                                                                                                                                                                                                                                                                                                              |
| --- | -------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | `client.deleteChannel` request shape; 2xx resolves, else rejects                       | Pass   | 4 Vitest cases (url + query + `X-API-KEY` + `DELETE`; url-encoding of the id; `500` → `HttpError` with `status`; network error rejects). Dev backend: `204` for an unknown id, `400 INVALID_ARGUMENT` with no `custom_channel_id`.                                                                                                                |
| R2  | Reset deletes first, then one `NONE` opening turn; no `RESET_CHANNEL`                  | Pass   | Vitest asserts ordering from inside the delete (`expect(sent).toEqual([])`). Browser wire log, four separate runs: `DELETE …/channel` → `POST /message/sse {"action":"NONE",…}`, nothing else.                                                                                                                                                    |
| R3  | `resetChannel({ text, payload })` carries both onto that turn                          | Pass   | 2 Vitest cases, including a function payload resolved through `resolvePayload`.                                                                                                                                                                                                                                                                   |
| R4  | Failed DELETE: no opening turn, channel + conversation intact                          | Pass   | Vitest: zero `fetchSse`, zero states-observer emissions, no channel handed out. Browser (`delete-channel-fail-demo`, mock `500`): wire shows only the failed DELETE, the transcript is byte-identical before/after, `onSseError` receives `HTTP 500`, and the next send goes through on the _same_ server-side channel (turn 3, deletes still 0). |
| R5  | Mount + metadata `404` + auto-reset opens with `NONE`, no delete; `200` still restores | Pass   | `/delete-channel` mount: `NONE`, zero DELETE. `/join-init` ②: `NONE`, zero DELETE, and exactly one opening POST across StrictMode's three metadata calls. `/join-init` ①: metadata `200` → `GET /message/sse` replay only, title seeded, no delete.                                                                                               |
| R6  | Reset still allowed while a consent is pending, delete first                           | Pass   | The rewritten `#411` spec drives a restored channel parked on a consent and asserts `deleteChannel` lands before the `NONE`.                                                                                                                                                                                                                      |
| R7  | Exposed `deleteChannel()` deletes only                                                 | Pass   | 3 Vitest cases (deletes, sends nothing, conversation identity unchanged; rejection propagates). Browser scenario ④: wire is `DELETE` → `POST /blob` → `POST /message/sse`, the reply reports the channel at "1 turn, deleted once", the blobId comes back listed, and the pre-delete transcript is still on screen.                               |
| R8  | `RESET_CHANNEL` deprecated, retained, and unused by the SDK                            | Pass   | Repo grep leaves only the `@deprecated` enum member plus documentation / test prose. The demo mock still _accepts_ it (`isOpeningTurn`) so an older consumer keeps working.                                                                                                                                                                       |
| R9  | `isResetting` holds through the whole teardown; no shorter timeout                     | Pass   | `delete-channel-slow-demo` (6 s mock teardown): wire gap `DELETE` → opening turn measured at 6004 ms; the reset button sampled every 800 ms is `disabled` from 0.8 s through 5.6 s and enabled again at 6.4 s.                                                                                                                                    |
| R10 | Opening run keeps `RunKind 'reset'`, stop-generation refuses it                        | Pass   | 2 Vitest cases in `stop-generation.spec` — both `Channel.open` and the run that follows a reset's delete report `kind: 'reset'`, and `stopGeneration()` issues zero suspend requests.                                                                                                                                                             |
| R11 | Existing consumers need no code change                                                 | Pass   | `autoResetChannel` unset → opens with `NONE`; `autoResetChannel={false}` → metadata only, zero SSE, zero DELETE. Public signatures unchanged; the only additions are optional.                                                                                                                                                                    |
| R12 | Build + demo walk at both widths                                                       | Pass   | Both shells render (measured 800 px and 375 px), no horizontal overflow. `/all-features` and `/docked-run-chrome` still auto-play their showcase on the opening turn and still fall through to the short ack on a later send — the two `isOpeningTurn` branches.                                                                                  |

### Dev-backend contract check (beyond the demo mock)

Run against `…/bot-provider/…` on dev with a throwaway channel id:

```
metadata            → 404   (does not exist)
POST action=NONE    → 200, streams a run
metadata            → 200   (exists)
DELETE /channel     → 204   in 0.78 s
metadata            → 404   (blank slate again)
DELETE /channel     → 204   (idempotent)
RESET_CHANNEL + blobIds → 400 INVALID_ARGUMENT
    "action RESET_CHANNEL cannot carry blobIds: the reset deletes every blob uploaded to the channel
     before the message is dispatched … DELETE /channel first, then upload and send with action NONE"
```

That is exactly the sequence `Channel.reset` now performs, and the last line is the backend guard that
makes the retirement mandatory rather than cosmetic.

### §3.1 Acceptance

- [x] Every R# executed (static read + browser operation + boundary conditions)
- [x] Each R# marked with its evidence
- [x] No e2e spec exists for this SDK; Vitest + demo used instead (per REVIEW_RULE §3)
- [x] Boundary conditions confirmed: failed teardown, slow teardown, idempotent second delete, missing
      query parameter, a client without `deleteChannel`, and two resets inside one tick

---

## Findings

### Critical (must fix before done)

None.

### Important (should fix in this cycle)

**Fixed during BUILD, recorded here because it was found by review-grade probing rather than by the plan.**
Three synchronous clicks on the reset button produced three `DELETE`s and three opening turns: the
header's `if (isResetting) return;` reads React state, and all three clicks saw the stale `false`. The
shape is pre-existing, but F-032 changes what the loser does — before, a duplicate reset was a second
harmless welcome run; now its `DELETE` can land after the winner has opened the new conversation and
destroy it. Closed with a `useRef` guard in `startChannel` (a ref does not lag within a tick), a
fail-before/pass-after test, and a re-measurement in the browser: three synchronous clicks now produce
one `DELETE` and one opening turn.

### Minor (nice to have)

1. **The reset button's `busy` state still lags by one render.** The ref guard makes a duplicate reset a
   no-op, but for the ~60 s a real Sandbox teardown can take, the button only becomes visibly `disabled`
   once React commits. Measured at under 800 ms here; on a slow consumer it is a window where the control
   looks live and does nothing. Cosmetic, out of scope for this ticket.
2. **A failed opening run still leaves an unhandled rejection path in consumer code.** `startChannel` now
   catches it (it has to, to restore `isConnecting` after a failed delete), which incidentally removed the
   unhandled promise rejection that a failed reset used to produce. Worth noting because it is a
   behavior change nobody asked for — a strictly better one, but undocumented in the ticket.
3. **`Channel.open` is new public API and the READMEs describe it, but no consumer uses it directly.**
   It exists because the react mount path needs "open without deleting". If it stays unused by consumers
   for a few releases, consider whether it should have been internal.

---

## Execution Log

- 2026-08-28: REVIEW task created, paired with BUILD-071 (Status: `draft`).
- 2026-08-28: §1 Static review run (Status: `draft → in-progress`) — 19 ✅ / 0 ❌; typecheck / lint / format / build all green; the seven mechanical greps produced only pre-existing or false-positive matches. One §3.1 consistency fix applied (explicit `: void` on the two opening callbacks).
- 2026-08-28: §3 Functional validation complete — R1–R12 all Pass, on 665 Vitest cases (core 275 / react 391) plus a browser walk of `/delete-channel` × 4 scenarios × 2 widths and regression walks of `/join-init`, `/all-features`, `/docked-run-chrome`; contract re-verified end to end against the dev backend. 0 BLOCKERs (Status: `in-progress → done`).
