# BUILD-082 Sandbox browser panel and input forwarding in react

## Meta

- Task ID: `BUILD-082`
- Status: `ready`
- Issue: `https://github.com/asgard-ai-platform/asgard-sdk-pm/issues/109`
- Source spec: `references/asgard-sdk-pm/tracking/asgard-js-sdk/features/F-035-sandbox-瀏覽器面板-sdk-內渲染-webrtc-與接管.md` (§7 / §8 / §10.2 of `references/asgard-sdk-pm/docs/spec/asgard-js-sdk/sandbox-browser.md`)
- Complexity: `L`
- Depends on: `BUILD-081` (the core transport it consumes)

---

## Brief

Build the **React half** of F-035: the panel the user actually watches and takes over, mirroring the File
Explorer three-piece pattern (F-021 / F-027). `useSandboxBrowserController()` holds placement-independent
behavior state (open / active sandbox / requested-browser nonce) so a host remount does not wipe it;
`<SandboxBrowserPanel>` renders the stage, the video, the control bar and the input plumbing;
`SandboxBrowserArrivalBridge` notifies on card arrival without forcing the panel open. `<Chatbot>` gains
`sandboxBrowser?: 'builtin' | 'off'` alongside the existing `fileExplorer` prop, a built-in aside, and a
header toggle — and when the host wires neither the prop nor `onSandboxOpenBrowser`, the UC-034 open-a-new-tab
fallback must still work untouched.

Most of the work is **input forwarding**, and per spec §7 almost none of its failure modes raise an error.
Coordinate conversion runs off `videoWidth` / `videoHeight` (not display size) and is gated on the video
having real dimensions, because `live` precedes non-zero dimensions by roughly a second and every click in
that window is silently dropped. Keyboard binding goes through the vendored Apache-2.0 Guacamole keyboard
attached by **callback ref** (it has `listenTo` and no unbind, so an effect keyed on changing state stacks
listeners and multiplies every keystroke). Text comes from IME output on a visible-during-composition
textarea sink, not from `keydown`. Printable characters chorded with Ctrl/Alt/Meta take the keysym path
because the browser eats them before `input` fires. Stuck keys are released on blur / pointerleave /
visibilitychange **at the last known pointer position**, never `(0,0)`. Clipboard gets all three routes
(push-on-enter, intercepted ⌘V, and an explicit button) plus a manual-paste fallback for when
`navigator.clipboard.readText()` is unavailable — which is the common case, not the exception.

Also ships two demo routes: `/sandbox-browser` on a canvas-`captureStream` mock, and `/neko-lab` — the real
local-container harness carrying the spec §10.2 26-item checklist, a wire log, and a stuck-key panel computed
**from sent wire messages**, since a stuck key is by definition one we sent `down` for and never sent `up`.

**Already exists:** BUILD-081's core transport and keysym module; `packages/react/src/hooks/use-file-explorer-controller.ts`
(controller shape + `useMemo` identity + nonce, :142/:156/:194); `packages/react/src/components/chatbot/chatbot-file-explorer.tsx`
(`FileExplorerArrivalBridge` :61, `ChatbotFileExplorerAside` :130); `packages/react/src/components/file-explorer/file-explorer-panel.tsx`
(`chrome?: 'card' | 'flush'` :64); `packages/react/src/components/chatbot/chatbot.tsx`
(`fileExplorer` prop :117, aside mount :652, bridge mount :519, intent handlers :358);
`chat-header/chat-header-host.tsx:92` (header action registration); `packages/react/src/utils/dispatch-uri-action.ts`
(`onSandboxOpenBrowser` + the UC-034 fallback :38); `packages/react/src/i18n.ts` (3-locale catalog);
`packages/react/src/components/file-explorer/icons.tsx` (inlined glyphs — no `lucide-react` dependency).
Reference implementation: `references/asgard-chat-kit-prototype/src/SandboxBrowserPanel.tsx`,
`useSandboxBrowserController.ts`, `lab/NekoLab.tsx`, `demo/browserMock.ts`.

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

**Two documented exceptions for this task** (both flagged for REVIEW-082 so they are not read as violations):

- **§1.2 / §4.2 — the vendored Guacamole keyboard.** `packages/react/src/lib/guacamole-keyboard.js` is
  upstream Apache-2.0 third-party source carried verbatim (the same file the official neko client uses) and
  keeps its `/* eslint-disable */` header. It is not our code being exempted from the rules; it is a vendored
  dependency we chose not to pull whole from npm (`guacamole-common-js` is a namespace bundle and the react
  vite build externalizes only four modules, so the entire Guacamole client would land in `dist`). A hand-written
  `guacamole-keyboard.ts` wrapper supplies the types, including the `modifiers` field upstream's `d.ts` omits.
- **§4.2 — the dark stage.** The video stage is deliberately dark in both themes (it is a video surface, like
  every conferencing app), so it cannot simply inherit `--asg-color-surface`. It still must not hardcode
  literals: add `--asg-sandbox-browser-*` custom properties with dark defaults, wired through the existing
  theme priority (props theme > bot provider annotations > default theme).

---

## Acceptance Criteria

EARS form: `When <event/condition>[, while <state>], the system shall <observable behavior>`.

**Controller and placement (mirrors F-021 / F-027)**

- `R1` When the host calls `controller.requestBrowser(sandboxName)`, the system shall open the panel, select
  that sandbox, and bump a nonce so a repeat request for the **same** sandbox re-triggers the connection; and
  the controller object shall be `useMemo`-stable so a consumer's dependency array is not defeated (#427). → T2
- `R2` While `sandboxBrowser="off"`, the system shall still route card intents through the controller so a
  host-placed `<SandboxBrowserPanel>` receives them, and shall not mount the built-in aside. → T2, T6
- `R3` When a `sandbox://<name>/open-browser` card arrives in the conversation, the arrival bridge shall
  notify the controller exactly once per `(messageId, uri)` and shall **not** force the panel open when the
  host has opted out of auto-reveal (notify-not-force). → T6
- `R4` When the host wires **neither** `sandboxBrowser="builtin"` **nor** `onSandboxOpenBrowser`, clicking the
  card shall still perform the UC-034 behavior — `generateSandboxBrowserOpenUrl` then open a new tab —
  unchanged. → T6, T10

**Connection and control (spec §10.3)**

- `R5` When the panel connects, it shall render the sandbox browser's **live** stream in a `<video>` element,
  and shall show a connecting overlay until the stream is live, a failure overlay with a retry control on
  error, and an empty state when the channel has no `browserEnabled` sandbox. → T4
- `R6` While nobody has taken over, the panel shall default to **read-only viewing**; taking over shall be an
  explicit action, shall be visually unmistakable while active, and shall offer a visible way to let go. → T4
- `R7` While the client does not hold control, the panel shall send no control event; and when
  `control/request` draws no `control/host` response within a timeout, the panel shall say so — the server
  rejects silently and reports nothing to the client (spec §6). → T4
- `R8` When the connection drops, the system shall obtain a **new** session (re-calling the endpoint, not
  reusing the dead token) and restore the picture (spec §7.10). → T4

**Input forwarding (spec §7 / §10.2 — verified on a real container, not a mock)**

- `R9` When the pointer moves over the frame, coordinates shall be derived from `videoWidth`/`videoHeight`
  letterbox math; a pointer over a black bar shall send nothing; and no pointer event shall be sent until the
  video reports non-zero dimensions, so the **first** click after takeover lands instead of being silently
  dropped (§7.1). → T3, T4
- `R10` When the keyboard is bound, it shall be attached by callback ref to the textarea sink exactly once per
  node — never in an effect keyed on changing status, which stacks listeners and sends every keystroke N times
  while only one `keyup` returns (§7.2). → T4
- `R11` When a printable character is typed **with** Ctrl / Alt / Meta / Hyper held (Shift excluded), it shall
  take the keysym path and be released immediately afterwards, so ⌘A / ⌘C / ⌘Z arrive and ⌘L does not repeat
  every 50 ms; without a modifier it shall be released from the keyboard's pressed set and allowed through to
  the text path (§7.3). → T4
- `R12` When text is composed with an IME, the composed string shall be sent from `compositionend` (not
  `keydown`), and **while composing** the sink shall be visible at the last click position with its width
  measured in pixels via canvas `measureText` — not in `ch` units, which are half a CJK glyph wide (§7.4 / §7.4.1). → T4
- `R13` When focus is lost, the pointer leaves the frame, the tab is hidden, or control is lost, the system
  shall release every key and mouse button it actually sent `down` for — at the **last known pointer
  position**, never `(0,0)`, which the remote reads as a drag to the top-left corner (§7.5). → T4
- `R14` When the wheel is used, the panel shall throttle to one message per 100 ms and send the core-normalized
  delta, so scrolling down scrolls the remote down and one notch is one notch (§7.6). → T4
- `R15` When the client holds control, the local clipboard shall be pushed to the remote on takeover and on
  pointer enter; ⌘V / Ctrl+V shall be intercepted into `control/paste`; an explicit paste button shall do the
  same; and when `readText()` is unavailable or denied the system shall offer a manual paste field instead of
  failing silently. `clipboard/updated` shall be written back to the local clipboard (§7.7). → T4
- `R16` While viewing (not controlling), the panel shall draw the remote X11 cursor from the data channel; and
  while controlling it shall keep the local cursor visible rather than hiding it (§7.8). → T4

**Presentation and integration**

- `R17` When any user-facing string is rendered, it shall come from `t()` with keys added to all three locales
  (`en-US` / `zh-TW` / `ja-JP`) in `packages/react/src/i18n.ts`; no literal UI text in JSX. → T5
- `R18` When the panel is styled, it shall use a `.module.scss` file and `--asg-*` custom properties, with the
  stage's deliberately-dark surface expressed as themeable `--asg-sandbox-browser-*` tokens rather than hex
  literals in the component. → T5
- `R19` When the shell is rendered at both the default 375 px widget width and a full-bleed wide mount, the
  panel shall lay out correctly at both, side by side on the demo route (`/prompt-suggestion` is the
  reference). → T9

**Smoke**

- `R20` (Smoke check) When the developer runs `npm run build:core && npm run build:react`,
  `npm run test:packages`, and walks `/sandbox-browser` and `/neko-lab` (`npm run serve:react-demo -- -- --port 5100`)
  against a local `ghcr.io/m1k1o/neko/chromium:3.1.4` container, the system shall pass every spec and **all 26
  items of spec §10.2** with no build errors. → T9, T10

---

## Implementation Tasks

Run in order; each task maps to the R# it satisfies.

- [ ] T1: Vendor `packages/react/src/lib/guacamole-keyboard.js` (Apache-2.0, license header intact) +
      `guacamole-keyboard.ts` type wrapper exposing `modifiers`, `onkeydown`, `onkeyup`, `listenTo`,
      `release`, `reset`. Confirm the lint config tolerates the vendored file without weakening package rules.
- [ ] T2 (R1, R2): Add `packages/react/src/hooks/use-sandbox-browser-controller.ts` following
      `use-file-explorer-controller.ts` — nonce ref, `useMemo` identity, `openBrowser` / `closeBrowser` /
      `toggle` / `selectSandbox` / `requestBrowser`. Export from `hooks/index.ts`.
- [ ] T3 (R9): Add `packages/react/src/components/sandbox-browser/coords.ts` — `toRemoteCoords` /
      `fromRemoteCoords` sharing one letterbox calculation, with their own unit spec.
- [ ] T4 (R5–R16): Implement `packages/react/src/components/sandbox-browser/sandbox-browser-panel.tsx` with
      `chrome?: 'card' | 'flush'`, consuming the core transport. Port each spec §7 hazard and keep the
      prototype's rationale comment at the line it protects.
- [ ] T5 (R17, R18): Add `sandbox-browser-panel.module.scss` + `--asg-sandbox-browser-*` theme tokens; add
      `sandboxBrowser.*` keys to all three locales.
- [ ] T6 (R2, R3, R4): Add `SandboxBrowserArrivalBridge` + `ChatbotSandboxBrowserAside` in
      `packages/react/src/components/chatbot/chatbot-sandbox-browser.tsx`; wire `sandboxBrowser` prop, the
      aside mount, the header toggle, and the intent handler in `chatbot.tsx` / `chat-header-host.tsx`,
      preserving the UC-034 fallback in `dispatch-uri-action.ts`.
- [ ] T7 (R1–R18): Export the public surface from the component sub-barrel and `components/index.ts`; add
      Vitest specs (controller nonce/identity, arrival bridge once-per-uri, fallback preserved, coordinate
      math, keyboard bound once, chord routing, stuck-key release coordinates, wheel throttle, clipboard
      fallback, i18n coverage). Reverse-verify each before calling the suite done.
- [ ] T8: Add demo routes — `/sandbox-browser` (canvas `captureStream` mock, both widths side by side) and
      `/neko-lab` (real container transport, wire log, stuck-key panel computed from sent messages, unmapped-key
      list, and the 26-item checklist). Register in `app.tsx` + `layout.tsx` nav.
- [ ] T9: Run `npm run lint:packages` + `npm run format:check` + `npm run typecheck` +
      `npm run build:core && npm run build:react` + `npm run test:packages`.
- [ ] T10 (R20): Smoke check — start the neko container (spec §10.1), walk all 26 items of §10.2 on
      `/neko-lab`, then walk §10.3's five connection/integration items on the demo app. Capture screenshots
      for the handover document (not committed).

---

## Coverage

Use Cases: [filled during build]
Files: [filled during build]

---

## Open Decisions

Recorded at plan time; revisit if the build contradicts them.

1. **Control ownership is _not_ in the controller.** It is connection state: offline means no control, and a
   reconnect has the server re-declare it (`control/host`). Holding a copy in the controller creates a shadow
   value that can disagree with the server — and the worst failure this panel has is a UI that believes it has
   control while the user clicks at nothing. The panel owns it; the transport's reported host is the only truth.
2. **`sandboxBrowser` is a new `'builtin' | 'off'` prop, not a mode on `fileExplorer`.** They are independent
   asides and a channel can want either, both, or neither.
3. **The stage stays dark in light theme**, expressed as theme tokens. A video surface that inherits a light
   page background reads as a broken player.
4. **Audio, quality switching, multi-user cursors and drag-and-drop upload are out of scope** — spec §9. The
   `<video>` stays `muted`.

---

## Blocking Prerequisites

Both are verification prerequisites, not implementation ones — implementation can proceed without them.

- **Local Docker daemon.** §10.2's 26 items need `ghcr.io/m1k1o/neko/chromium:3.1.4` running locally; the
  daemon was not running when this plan was written. Spec §10.1 lists five setup hazards (single mux port,
  space-separated `NAT1TO1`, `NEKO_SERVER_CORS`, host port ≠ 8080, that exact image tag).
- **A browser-enabled sandbox on a real backend.** §10.3 must run against asgard-core dev. The demo `.env`
  carries five bot-provider endpoints; whether any of them drives an agent that calls `open_sandbox_browser`
  is unconfirmed. If none does, §10.3 is blocked on a bot configured with a browser-enabled blueprint, and
  that gap gets stated plainly rather than papered over with the mock.

---

## Execution Log / Change Log

- 2026-09-15: BUILD task created from https://github.com/asgard-ai-platform/asgard-sdk-pm/issues/109 (Status: `draft`).
- 2026-09-15: Plan confirmed by the user (Status: `draft → ready`). Queued behind BUILD-081.
