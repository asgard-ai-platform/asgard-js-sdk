# REVIEW-081 Sandbox browser protocol layer in core

## Meta

- Task ID: `REVIEW-081`
- Status: `done`
- BUILD Task: `BUILD-081`
- Reviewed commit: `a4122262dde7c61e88a76782d2ef1824ecefb678` (working tree on top of it; the cycle is uncommitted at review time)
- Reviewed branch: `feat/109-sandbox-browser-panel`

---

## §1 Static Code Review

Scope: the ten files in `BUILD-081 ## Coverage`, all under `packages/core/src/`. `tsc` and lint run project-wide.

### §1.1 Checklist

| Check item                                                                   | Rule                           | Result                                 |
| ---------------------------------------------------------------------------- | ------------------------------ | -------------------------------------- |
| `any` / `as any`                                                             | FRONTEND_RULE_COMMON §1.1      | ✅                                     |
| `@ts-ignore` / `eslint-disable` used to bypass type or lint errors           | FRONTEND_RULE_COMMON §1.2      | ✅                                     |
| `console.log` left in library code (not debug-gated)                         | FRONTEND_RULE_COMMON §1.3 §7   | ✅                                     |
| Hardcoded API key / endpoint / namespace                                     | FRONTEND_RULE_COMMON §1.4      | ✅                                     |
| RxJS subscription / EventSource / timer teardown                             | FRONTEND_RULE_COMMON §1.5      | ✅ (after fix — see Findings 1)        |
| `@asgard-js/react` imports core only via its public entry                    | FRONTEND_RULE_COMMON §1.6      | ✅ (react untouched this cycle)        |
| `@asgard-js/core` imports `react` / `react-dom` / DOM API                    | FRONTEND_RULE_COMMON §1.6 §2.1 | ✅                                     |
| Public API change without a `@deprecated` transition                         | FRONTEND_RULE_COMMON §1.7      | ✅ (purely additive)                   |
| New public types / functions exported from the package entry (`export type`) | FRONTEND_RULE_COMMON §2.2      | ✅                                     |
| Message-template prerequisites (types / enum before component)               | FRONTEND_RULE_COMMON §2.3      | n/a — no template in this cycle        |
| Uses `botProviderEndpoint`, not the deprecated `endpoint`                    | FRONTEND_RULE_COMMON §2.4      | ✅                                     |
| Exported functions / methods declare explicit return types                   | FRONTEND_RULE_COMMON §3.1      | ✅                                     |
| Shared types centralized in core `src/types/`, no duplicate interfaces       | FRONTEND_RULE_COMMON §3.2      | ✅                                     |
| React component props fully typed                                            | FRONTEND_RULE_COMMON §4.1      | n/a — no react component               |
| Hardcoded color values in components                                         | FRONTEND_RULE_COMMON §4.2      | n/a — no component                     |
| `react` / `react-dom` stay peerDependencies                                  | FRONTEND_RULE_COMMON §4.4      | ✅ (unchanged)                         |
| core and react share the same version number                                 | FRONTEND_RULE_COMMON §5        | ✅ `0.3.84` / `0.3.84` / peer `0.3.84` |
| Repeated logic (≥2×) / types / JSX (≥3×) extracted                           | FRONTEND_RULE_COMMON §6        | ✅ — see note                          |
| `setTimeout` mock delays, dead commented code, stray TODO / FIXME            | FRONTEND_RULE_COMMON §7        | ✅                                     |

Notes on the two judgement calls:

- **§1.6 — `WebSocket` / `RTCPeerConnection` in core.** Not a violation. The rule forbids importing
  `react` / `react-dom` and reaching into the DOM tree; these are network APIs of the same kind core already
  uses (`fetch`, `EventSource`). The genuinely DOM-bound parts — coordinate conversion off
  `HTMLVideoElement.videoWidth`, and binding a keyboard to an element — were deliberately left out of core
  and belong to BUILD-082. Confirmed by grep g4: zero react/DOM imports anywhere in `packages/core/src/`.
- **§6 — the control gate.** `sendControlled` is one helper wrapping every `control/*` and `clipboard/*`
  send, rather than the same `if (host !== 'me')` repeated at eleven call sites. This is the pattern
  BUILD-079 arrived at for the same reason: the defect it prevents is an omission at _one_ of many sites.

### §1.2 Mechanical Grep

Run over the Coverage files (array-quoted — a bare `$F` silently expands to one non-existent path in zsh and
prints a fake all-clear; that has produced false greens twice before, in BUILD-072 and BUILD-078).

```bash
F=(packages/core/src/types/sandbox-browser.ts packages/core/src/types/index.ts \
   packages/core/src/lib/keysym.ts packages/core/src/lib/keysym.spec.ts \
   packages/core/src/lib/sandbox-browser-transport.ts packages/core/src/lib/sandbox-browser-transport.spec.ts \
   packages/core/src/lib/client.ts packages/core/src/lib/client.spec.ts \
   packages/core/src/lib/sandbox-channel-scope.spec.ts packages/core/src/index.ts)
```

```
### g1  ': any\b|<any>|as any'                → (no output)  ✅
### g2  '@ts-ignore|@ts-nocheck|eslint-disable'
packages/core/src/lib/client.ts:88          // eslint-disable-next-line no-console
packages/core/src/lib/client.ts:520,526,569,575   // eslint-disable-next-line no-console
### g3  'console\.log'
packages/core/src/lib/client.ts:521         console.log('[AsgardServiceClient] File upload response:', result);
packages/core/src/lib/client.ts:570         console.log('[AsgardServiceClient] Channel Home download response:', …);
### g4  core → react / react-dom              → (no output)  ✅
### g5  react → '@asgard-js/core/src'         → (no output)  ✅
### g6  'setTimeout'
packages/core/src/lib/sandbox-browser-transport.ts:133   const timer = setTimeout(
packages/core/src/lib/client.ts:57,457      (pre-existing detach timer)
### g7  'TODO|FIXME'                          → (no output)  ✅
```

All three non-empty results were adjudicated rather than waved through:

- **g2 / g3 in `client.ts` are entirely pre-existing.** Verified with
  `git diff packages/core/src/lib/client.ts | grep '^+' | grep -E 'console\.log|eslint-disable'` → empty.
  This cycle's diff in that file adds one method and one type import and introduces no new hit. They are
  also already debug-gated (`if (this.debugMode)`), which is what §1.3 asks for.
- **g6 in `sandbox-browser-transport.ts:133` is a real connection timeout, not a simulated delay.** §7
  prohibits `setTimeout` used to fake streaming or API latency. This one bounds how long the socket may sit
  un-opened, and is cleared on both the resolve and the reject path. `client.ts:57/457` are pre-existing.

### §1.3 TypeScript and Lint

```
npm run lint:packages   PASS — Successfully ran target lint for 2 projects
npm run format:check    PASS — All matched files use Prettier code style!
npm run typecheck       PASS — Successfully ran target typecheck for 3 projects (core, react, react-demo)
npm run build:core      PASS — ✓ built in 2.00s
npm run build:react     PASS — ✓ built in 1.73s
```

### §1.4 Static Review Acceptance

- [x] All §1.1 items checked and marked ✅ / ❌ / n/a
- [x] All ❌ violations listed with file path and line number (one found, fixed — Findings 1)
- [x] All §1.2 grep commands run and output pasted
- [x] `npm run typecheck` run — no TypeScript errors
- [x] `npm run lint:packages` run — no ESLint errors

---

## §3 Functional Validation

`Coverage.Use Cases` lists R1–R15, so §3 runs. SDK functional acceptance is Vitest first, then a live
exercise of the built artifact (`REVIEW_RULE.md §3`) — here, the built core ESM driven from a Playwright
Chromium against a local `ghcr.io/m1k1o/neko/chromium:3.1.4` container (spec §10.1, host port 18090).

### R# Result Matrix

| R#  | Description                                                                                        | Result | Note                                                                                                                             |
| --- | -------------------------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------- |
| R1  | `createSandboxBrowserSession` POSTs `…/browser/session` with scope + auth, unwraps either envelope | Pass   | `client.spec.ts` — url, method, `X-API-KEY`, `{data:{…}}` and bare body; `sandbox-channel-scope.spec.ts` for `custom_channel_id` |
| R2  | Non-2xx throws `HttpError`; a half-credential throws instead of resolving                          | Pass   | 4 cases incl. `it.each` over missing token / wsUrl / both                                                                        |
| R3  | The new relay is in the `RELAYS` guard table                                                       | Pass   | Reverse-verified: removing the row turns the coverage test red, naming the method                                                |
| R4  | `charToKeysym` / `keyToKeysym` rules and the `null` for unknown                                    | Pass   | 16 cases incl. the `0xFF` boundary and an astral code point                                                                      |
| R5  | macOS modifier remap, identity elsewhere                                                           | Pass   | 5 remaps + identity, both platform branches                                                                                      |
| R6  | Wheel inverted, `deltaMode` converted, clamped to ±10                                              | Pass   | 6 cases; reverse-verified by removing the inversion (4 red)                                                                      |
| R7  | Token on the query string, `signal/request`, answers the server offer, 10 s heartbeat              | Pass   | Unit + **live**: real `signal/provide` answered, handshake completed                                                             |
| R8  | Early `signal/candidate` buffered and flushed after `setRemoteDescription`                         | Pass   | Reverse-verified: dropping the buffer turns 2 cases red                                                                          |
| R9  | `control/host` read against own session id → `me` / `agent` / `none`                               | Pass   | Unit; **field shape confirmed live** — real `system/init` carries `control_host: { id: "", has_host: false }`                    |
| R10 | No control traffic while not the host                                                              | Pass   | Reverse-verified: removing the gate turns 2 cases red                                                                            |
| R11 | One keydown/keyup pair per **code point** for text; caller keysym passed through                   | Pass   | Reverse-verified: switching to `split('')` turns the astral case red                                                             |
| R12 | Cursor frame decoded big-endian; wrong opcode / short frame ignored                                | Pass   | 4 cases                                                                                                                          |
| R13 | `close()` clears the heartbeat, closes the peer connection and the socket                          | Pass   | 4 cases; **extended during this review** — see Findings 1                                                                        |
| R14 | Deprecated `endpoint` still derives the url; no-endpoint client cannot be constructed              | Pass   | Criterion was amended during build to state what actually holds                                                                  |
| R15 | Smoke: build + tests green; live stream and control grant against a real container                 | Pass   | See below                                                                                                                        |

### R15 evidence (live, against a real Neko container)

- `ontrack` reached with a real `MediaStream` carrying `audio,video`
- video element `1280×720`, `readyState 4`, `paused false` — the remote Chromium desktop genuinely renders
- status sequence `connecting → live`, exactly one `live`
- `requestControl()` → `control/host` → `me`
- received wire order: `system/init → signal/provide → ice/state → control/host`
- zero console errors
- re-run after the Findings 1 fix: unchanged

Observed live and carried forward to BUILD-082: **`videoWidth` is 0 at the moment `live` is reported** and
only reaches 1280 about a second later — spec §7.1's "first click is silently dropped" hazard, confirmed in
the wild rather than taken on faith.

### §3.1 Acceptance

- [x] All R# in `Coverage.Use Cases` executed
- [x] Each R# marked Pass / Fail / Blocked
- [x] No e2e spec exists for this package; the live container exercise stands in (`REVIEW_RULE.md §3`)
- [x] Boundary conditions confirmed: credential failure, socket error, socket timeout, unparseable frame,
      unknown event, missing keysym, short cursor frame, empty host id, post-`close()` sends

---

## Findings

### Critical (must fix before done)

1. **§1.5 — a failed `connect()` leaked the socket it opened.** `packages/core/src/lib/sandbox-browser-transport.ts`.
   When the open promise rejected (socket error, or the 8 s timeout), the function threw without closing the
   socket. The caller receives no session object, so nothing else could ever close it: the socket stayed
   pending, or connected moments later and lived for the rest of the page — and the retry path stacks
   another one on every attempt, which is exactly what the reconnection flow in BUILD-082 will do.

   **Fixed within this cycle** (per `REVIEW_RULE.md §3`, a finding routes back to the BUILD task): the open
   await is now wrapped so both failure paths mark the connection closed and call `socket.close()` before
   rethrowing. Two regression cases were written **first and observed red** (`closes the socket it opened
when the connection fails`, `closes the socket when the open times out, too`), then green after the fix.
   Full gate and the live smoke re-run afterwards: unchanged.

### Important (should fix in this cycle)

None.

### Minor (nice to have)

1. **`OPEN_TIMEOUT_MS` is not configurable.** 8 s is the prototype's figure and fine for a dev network, but
   a consumer on a slow mobile link cannot raise it. Not changed now — adding an option before anybody has
   asked is speculative, and `SandboxBrowserTransportOptions` can take one without a breaking change.
2. **`has_host` in `system/init` is ignored.** The transport reads `control_host.id` only, which matches
   `control/host`'s `host_id` semantics and is sufficient (empty id ⇒ nobody). Noted because the live
   payload carries both fields, so a future reader may wonder why one is unused.

---

## Not covered

Stated here rather than left implied, and carried into BUILD-082:

- **The real asgard-core `browser/session` endpoint has never been called.** `createSandboxBrowserSession`
  is verified against mocked `fetch`; the live exercise used neko's own `/api/login` as its credential
  source, which proves the transport but not the relay.
- **The 26-item input checklist (spec §10.2) is out of scope here** — it needs the panel, and is BUILD-082's
  acceptance carrier. This cycle pins the wire format, not what a keystroke does on arrival.
- **No consumer imports any of this yet**; BUILD-082 is the first.

---

## Execution Log

- 2026-09-15: REVIEW task created, paired with BUILD-081 (Status: `draft`).
- 2026-09-15: BUILD-081 reached `done`; review unblocked (Status: `draft → ready`).
- 2026-09-15: §1 static review run (Status: `ready → in-progress`). 17 applicable checklist items ✅,
  3 n/a; 7 greps run, 3 non-empty results adjudicated (all pre-existing or legitimate). One Critical
  finding: a socket leaked on failed connect — regression tests written red first, fixed, re-verified.
- 2026-09-15: §3 functional validation complete — R1–R15 all Pass (core 415 / react 512 tests; six
  mutation-based reverse verifications; live stream + control grant against a real Neko container).
  Zero BLOCKERs remain (Status: `in-progress → done`).
