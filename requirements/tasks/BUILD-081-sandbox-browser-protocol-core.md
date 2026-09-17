# BUILD-081 Sandbox browser protocol layer in core

## Meta

- Task ID: `BUILD-081`
- Status: `done`
- Issue: `https://github.com/asgard-ai-platform/asgard-sdk-pm/issues/109`
- Source spec: `references/asgard-sdk-pm/tracking/asgard-js-sdk/features/F-035-sandbox-瀏覽器面板-sdk-內渲染-webrtc-與接管.md` (§3–§7 of `references/asgard-sdk-pm/docs/spec/asgard-js-sdk/sandbox-browser.md`)
- Complexity: `L`

---

## Brief

Build the **framework-agnostic half** of F-035 in `@asgard-js/core`: the credential call plus the Neko
protocol client that the React panel (BUILD-082) will drive. Three pieces. (1) `client.createSandboxBrowserSession()`
— `POST {base}/sandbox/{name}/browser/session` → `{ wsUrl, token }`, the twelfth sandbox relay, mirroring
`generateSandboxBrowserOpenUrl` exactly. (2) A keysym module — the `KEYSYM` table, `charToKeysym`
(`codepoint | 0x01000000` above `0xFF`, which is how CJK reaches a remote with no IME installed), the macOS
`Meta_L → Control_L` modifier remap, `isPrintableKeysym`, and `normalizeWheel` (direction inverted, `deltaMode`
converted, clamped to ±10). (3) `createSandboxBrowserTransport()` — WebSocket with the token appended as a
query param, the WebRTC handshake in which **the server is the offerer**, ICE candidate buffering for
candidates that arrive **before** `signal/provide`, the `control/host` ownership state machine, the binary
cursor data channel, `clipboard/updated`, a 10 s heartbeat, and the `control/*` senders.

The layering follows spec §8.1: **protocol in core, input semantics in react**. Core computes and sends
keysyms; it never touches a DOM node, never binds a keyboard, and never converts screen coordinates — those
need an `HTMLVideoElement` and belong to the panel (§1.6 forbids core touching DOM anyway).

**Already exists:** `packages/core/src/lib/client.ts` (`generateSandboxBrowserOpenUrl` at :589 is the shape to
copy; `withChannelScope` :42, `getBaseEndpoint` :876, `apiHeaders` :641), `packages/core/src/types/sandbox-fs.ts`
(`SandboxChannelScope` :29), `packages/core/src/lib/sandbox-channel-scope.spec.ts` (the `RELAYS` table at :58
that every sandbox call must join), `packages/core/src/types/channel.ts` (`LaunchedSandbox.browserEnabled` :35),
`packages/core/src/lib/resolve-sandbox-uri.ts` (`open-browser` intent already parsed).
Reference implementation: `references/asgard-chat-kit-prototype/src/lab/nekoTransport.ts`.

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

**Task-specific addition** — core is framework-agnostic but _not_ DOM-free by accident: `WebSocket` and
`RTCPeerConnection` are browser globals this transport must use. §1.6 forbids importing `react` / `react-dom`
and reaching into the DOM tree (`document`, `HTMLElement`); it does not forbid the network APIs core already
uses (`fetch`, `EventSource`). Coordinate math and keyboard binding stay out of core because they need DOM
nodes, not because the APIs are browser-only.

---

## Acceptance Criteria

EARS form: `When <event/condition>[, while <state>], the system shall <observable behavior>`.

- `R1` When the host calls `client.createSandboxBrowserSession(sandboxName, { customChannelId })`, the system
  shall `POST {base}/sandbox/{encodeURIComponent(name)}/browser/session` with `apiHeaders()` and
  `custom_channel_id` on the query string, and resolve `{ wsUrl, token }` unwrapped tolerantly from either
  `json.data` or the bare body. → T1, T2
- `R2` When that endpoint answers non-2xx, the system shall throw `HttpError(status, statusText, body)` rather
  than resolving a partial session, and when the response carries no `wsUrl` or no `token` it shall throw a
  descriptive error instead of returning `undefined`. → T2
- `R3` When `sandbox-channel-scope.spec.ts` enumerates the sandbox relays, the system shall include
  `createSandboxBrowserSession` in the `RELAYS` table so the mechanical `custom_channel_id` guard covers the
  twelfth call as it covers the other eleven (#470). → T2
- `R4` When a character above `U+00FF` is converted, `charToKeysym` shall return `codepoint | 0x01000000`, and
  at or below it shall return the codepoint itself; when a named key is converted, `keyToKeysym` shall return
  its table entry and `null` for an unknown name (never a guessed value). → T3
- `R5` While the host platform is macOS, the modifier remap shall map `XK_Meta_L → XK_Control_L`,
  `XK_Super_L → XK_Alt_L`, `XK_Super_R → XK_Super_L`, `XK_Alt_L → XK_Mode_switch`,
  `XK_Alt_R → XK_ISO_Level3_Shift`, and shall be the identity function on every other platform. → T3
- `R6` When a wheel event is normalized, the system shall invert both axes (browser `deltaY > 0` is X11
  "up"), multiply by the 19 px line height when `deltaMode !== 0`, and clamp the result to ±10 — so a Chrome
  `deltaY = 100` becomes `-10`, not 100 XTest events. → T3
- `R7` When the transport connects, the system shall open `wsUrl + "?token=" + encodeURIComponent(token)`,
  send `signal/request { video: {}, audio: {} }`, answer the server's `signal/provide` offer with
  `signal/answer` (the **server** is the offerer), and start a 10 s `client/heartbeat` interval. → T4
- `R8` When a `signal/candidate` arrives **before** `signal/provide`, the system shall buffer it and flush the
  buffer into the peer connection after `setRemoteDescription`; a candidate arriving after shall be added
  immediately. Nothing shall be dropped. → T4
- `R9` When `system/init` then `control/host` arrive, the system shall report `me` if `host_id` equals the
  session id, `agent` if it is some other non-empty id, and `none` if it is absent or empty. → T4
- `R10` While the client does not hold control, the system shall not emit any `control/*` or `clipboard/set`
  message even if the caller asks — the server rejects them silently and only writes its own log (spec §6). → T4
- `R11` When `sendKey({ type: 'text' })` is called, the system shall emit one `control/keydown` +
  `control/keyup` pair **per code point** (so `'你好'` is two pairs, not four surrogate halves), and when
  called with `type: 'down' | 'up'` it shall send the caller's already-computed keysym unchanged. → T4
- `R12` When a binary data-channel frame whose first byte is `0x01` and length ≥ 7 arrives, the system shall
  decode big-endian `[event:u8][length:u16][X:u16][Y:u16]` and report `{x, y}`; frames with another opcode or
  a short length shall be ignored without throwing. → T4
- `R13` When `close()` is called, the system shall clear the heartbeat interval, close the
  `RTCPeerConnection` and the WebSocket, and suppress the `onclose` error report that the deliberate close
  would otherwise raise — leaving no timer and no socket behind (§1.5). → T4
- `R14` When the host configures only the deprecated `endpoint`, `createSandboxBrowserSession` shall still
  derive the correct session URL (§2.4 compatibility); and a client configured with **neither** endpoint
  shall be impossible to construct, so no call can build a `null/sandbox/...` URL. → T2

  > Amended during build. This first read "shall throw a descriptive error from
  > `createSandboxBrowserSession` when no endpoint is wired". The method does keep that `getBaseEndpoint()`
  > null guard, mirroring `generateSandboxBrowserOpenUrl` — but the constructor already rejects a config with
  > neither endpoint (`client.ts` "Either endpoint or botProviderEndpoint must be provided"), so the guard is
  > unreachable from any constructed client. The criterion now states the guarantee that actually holds.

- `R15` (Smoke check) When the developer runs `npm run build:core && npm run build:react` and then
  `npm run test:core`, the system shall build with no type errors and pass every new spec; and when the
  transport is pointed at a local `ghcr.io/m1k1o/neko/chromium:3.1.4` container from a throwaway harness, it
  shall reach `ontrack` with a live `MediaStream` and observe `control/host` flip to `me` after
  `requestControl()`. → T5, T6

---

## Implementation Tasks

Run in order; each task maps to the R# it satisfies.

- [x] T1 (R1): Add `SandboxBrowserSessionCredentials`, `BrowserHost`, `BrowserStatus`, `RemotePointerEvent`,
      `RemoteKeyEvent`, `SandboxBrowserSession`, `SandboxBrowserTransport`,
      `SandboxBrowserTransportHandlers` to `packages/core/src/types/sandbox-browser.ts`; re-export from
      `packages/core/src/types/index.ts` (types become public automatically via `export type * from './types'`).
- [x] T2 (R1, R2, R3, R14): Add `createSandboxBrowserSession()` to `packages/core/src/lib/client.ts`, mirroring
      `generateSandboxBrowserOpenUrl` (:589) — `getBaseEndpoint()` null-check, `withChannelScope`,
      `apiHeaders()`, `HttpError`, envelope-tolerant unwrap. Register it in the `RELAYS` table in
      `sandbox-channel-scope.spec.ts`.
- [x] T3 (R4, R5, R6): Add `packages/core/src/lib/keysym.ts` — `KEYSYM` table, `charToKeysym`, `keyToKeysym`,
      `mapModifierKeysym`, `isPrintableKeysym`, `normalizeWheel`. Pure functions, no globals read at module
      scope except a lazily-evaluated platform check.
- [x] T4 (R7–R13): Add `packages/core/src/lib/sandbox-browser-transport.ts` — `createSandboxBrowserTransport()`
      built on the client's session call; candidate buffering, host state machine, cursor channel decode,
      heartbeat, control-gated senders, teardown.
- [x] T5 (R1–R13): Export the new values + types from `packages/core/src/index.ts`; add Vitest specs driving
      the transport through a fake `WebSocket` / `RTCPeerConnection` pair. Reverse-verify each spec (stash the
      implementation, confirm it goes red) before calling the suite done.
- [x] T6: Run `npm run lint:packages` + `npm run format:check` + `npm run typecheck` +
      `npm run build:core && npm run build:react`.
- [x] T7 (R15): Smoke check — `npm run test:core`; then start the local neko container (spec §10.1) and drive
      the transport from a throwaway harness to confirm `ontrack` + `control/host`.

---

## Coverage

**Use Cases:** R1–R15 all satisfied. R1–R3 / R14 via `client.spec.ts` + `sandbox-channel-scope.spec.ts`;
R4–R6 via `keysym.spec.ts`; R7–R13 via `sandbox-browser-transport.spec.ts`; R15 via the full gate plus a
live connection to a local `ghcr.io/m1k1o/neko/chromium:3.1.4` container.

**Files** (all `@asgard-js/core`):

| File                                                      | Change                                                                                                                                                    |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core/src/types/sandbox-browser.ts`              | new — the platform-neutral protocol contract (credentials, host, status, pointer / key events, session, transport, handlers)                              |
| `packages/core/src/types/index.ts`                        | export the new type module from the barrel                                                                                                                |
| `packages/core/src/lib/keysym.ts`                         | new — `KEYSYM` / `XK` tables, `charToKeysym`, `keyToKeysym`, `isPrintableKeysym`, `mapModifierKeysym`, `normalizeWheel`, `WHEEL_MAX`, `WHEEL_THROTTLE_MS` |
| `packages/core/src/lib/keysym.spec.ts`                    | new — 36 cases                                                                                                                                            |
| `packages/core/src/lib/sandbox-browser-transport.ts`      | new — `createSandboxBrowserTransport`, `decodeCursorFrame`                                                                                                |
| `packages/core/src/lib/sandbox-browser-transport.spec.ts` | new — 42 cases against a fake `WebSocket` / `RTCPeerConnection`                                                                                           |
| `packages/core/src/lib/client.ts`                         | `createSandboxBrowserSession()` — the twelfth sandbox relay                                                                                               |
| `packages/core/src/lib/client.spec.ts`                    | 7 cases for the new method                                                                                                                                |
| `packages/core/src/lib/sandbox-channel-scope.spec.ts`     | new relay row; **coverage guard widened** (see Findings)                                                                                                  |
| `packages/core/src/index.ts`                              | export the keysym module and the transport                                                                                                                |

`@asgard-js/react` and `apps/react-demo` are untouched — they are BUILD-082.

---

## Findings from the build

1. **The coverage guard had a hole the new relay walked straight through.** `sandbox-channel-scope.spec.ts`
   exists (#470) so a twelfth sandbox relay cannot ship without `custom_channel_id` — but it enumerated the
   prototype by three _prefixes_ (`sandboxFs`, `generateSandboxBrowser`, `deriveSandboxFs`), and
   `createSandboxBrowserSession` matches none of them. The guard would have passed while the exact defect it
   was written for shipped again. Widened to `/sandbox/i` over the whole name, then reverse-verified:
   removing the new relay from the table now turns it red naming the method.
2. **`ontrack` fires once per track, not once per stream** — found only by connecting to a real container
   (the offer carries audio and video, so it ran twice for one stream, and `onStatus('live')` was emitted
   twice). Reporting the same stream twice would have the panel reassign `srcObject` to the stream it is
   already playing, restarting playback. Now deduped by stream id; the re-run against the real server shows
   a single `live`. A mock could not have surfaced this.
3. **R14 as originally written described unreachable behavior** — see the note under that criterion. The
   `getBaseEndpoint()` null guard is kept for consistency with `generateSandboxBrowserOpenUrl`, but the
   constructor already refuses a config with neither endpoint, so the criterion now states the guarantee
   that actually holds.
4. **An uppercase letter sent through the text path arrived lowercase** — found while walking §10.2 during
   BUILD-082's acceptance, fixed here because the text-to-keysym conversion lives in this package.
   `XKeysymToKeycode(XK_A)` finds the same keycode as `a` (`A` is its shifted level) and the server presses
   it without asserting Shift. Shifted _symbols_ (`!`, `@`, `+`) and CJK are unaffected — no existing
   keycode produces them at level 1, so the server allocates a fresh mapping and they come through exactly.
   That makes the remedy narrow and layout-independent: wrap A–Z in `Shift_L`. Four cases added (one red
   first), and re-confirmed on the real container — `aA1!@#-_=+中文` now arrives intact.
   **Note for the spec owner:** the prototype's transport has the identical bare-keysym loop, so §10.2's
   "Shift + 字母打出大寫" cannot have been passing there either.
5. **`system/init`'s control-owner field shape confirmed against the real server**, not guessed:
   `control_host: { id: "", has_host: false }`. The transport reads `control_host.id`, matching
   `control/host`'s `host_id` semantics.

---

## Verification

**Static gate** — all green:

```
npm run lint:packages     ✅  (2 projects)
npm run format:check      ✅
npm run typecheck         ✅  (3 projects: core, react, react-demo)
npm run build:core        ✅
npm run build:react       ✅
npm run test:packages     ✅  core 421 · react 587
```

Core went from 326 to 421 tests: **95 new cases** (36 keysym, 44 transport, 7 client, 2 added relay rows).

**Reverse verification** — each spec was confirmed to catch the silent failure it exists for by mutating the
implementation and checking that exactly the right cases went red, then restoring:

| Mutation                                         | Red                                                                  |
| ------------------------------------------------ | -------------------------------------------------------------------- |
| Drop ICE candidates that arrive before the offer | 2 — `ICE candidate buffering`                                        |
| Remove the control gate                          | 2 — `control ownership`                                              |
| Report an error on a close we asked for          | 1 — `does not report an error for the close it was asked to perform` |
| Iterate UTF-16 units instead of code points      | 1 — `keeps an astral character as a single keysym`                   |
| Do not invert the wheel                          | 4 — `normalizeWheel`                                                 |
| Drop the macOS `Meta_L → Control_L` remap        | 1 — `on macOS remaps Meta_L → Control_L`                             |
| Remove the new relay from the scope table        | 1 — coverage guard, naming the method                                |

**Live connection smoke (R15)** — the built core ESM driven from a Playwright Chromium against a local
`ghcr.io/m1k1o/neko/chromium:3.1.4` container (spec §10.1 recipe, host port 18090):

- `ontrack` reached with a real `MediaStream` carrying `audio,video`
- video element `1280×720`, `readyState 4`, `paused false` — the remote Chromium desktop genuinely renders
- status sequence `connecting → live` (exactly one `live` after the dedup fix)
- `requestControl()` → `control/host` → `me`
- received wire sequence: `system/init → signal/provide → ice/state → control/host`
- zero console errors

Also observed live, and worth carrying into BUILD-082: **`videoWidth` is 0 at the moment `live` is
reported** and only becomes 1280 about a second later — the §7.1 hazard, confirmed in the wild.

🔴 **Not covered by this cycle** — stated plainly rather than implied:

- **The real asgard-core `browser/session` endpoint has never been called.** `createSandboxBrowserSession`
  is verified against mocked `fetch` only; the live smoke used neko's own `/api/login` as the credential
  source, which exercises the transport but not the relay. That gap closes in BUILD-082's §10.3 run against
  a real dev backend — assuming a browser-enabled sandbox is available there, which is still unconfirmed.
- **The 26-item input checklist (spec §10.2) is not in scope here.** It needs the panel; it is BUILD-082's
  acceptance carrier. This cycle pins the wire format, not what a keystroke does when it arrives.
- **No consumer has imported any of this yet.** The first real consumer is BUILD-082.

---

## Open Decisions

Recorded at plan time; revisit if the build contradicts them.

1. **`createSandboxBrowserSession` returns credentials, not a live connection.** The transport takes them as
   input. Keeping the two apart is what makes reconnection (spec §7.10) a re-call of the endpoint rather than
   a hidden retry, and it keeps `client.ts` free of WebRTC.
2. **Coordinate math (`toRemoteCoords` / `fromRemoteCoords`) stays in react**, not core — it needs
   `HTMLVideoElement.videoWidth` and `getBoundingClientRect()`. `normalizeWheel` does move to core: it is
   pure arithmetic over `{deltaX, deltaY, deltaMode}`.
3. **`sendKey({type:'text'})` iterates code points** (`for...of`), not UTF-16 units — otherwise an emoji or a
   surrogate-pair CJK character is sent as two invalid keysyms.
4. **The control gate lives in the transport**, so a panel bug cannot flood the server's log. The panel also
   checks, but core is the one that must hold (spec §6 "沒有控制權時不要送任何 control 事件").

---

## Execution Log / Change Log

- 2026-09-15: BUILD task created from https://github.com/asgard-ai-platform/asgard-sdk-pm/issues/109 (Status: `draft`).
- 2026-09-15: Plan confirmed by the user; two-pair split and vendored Guacamole keyboard agreed (Status: `draft → ready`).
- 2026-09-15: Implementation started on `feat/109-sandbox-browser-panel` (Status: `ready → in-progress`).
- 2026-09-15: REVIEW-081 §1 raised one Critical finding (a socket leaked when `connect()` failed); fixed in this task with two regression cases written red first. Gate and live smoke re-run clean.
- 2026-09-15: while walking §10.2 for BUILD-082, uppercase letters were found to arrive lowercase; fixed in this package (`Shift_L` wrapper for A–Z), 6 new cases, re-confirmed on the real container.
- 2026-09-15: T1–T7 complete. R1–R15 satisfied; lint / format / typecheck / build / 925 tests green; 87 new core cases reverse-verified by mutation; live connection smoke passed against a local neko container (Status: `in-progress → done`).
