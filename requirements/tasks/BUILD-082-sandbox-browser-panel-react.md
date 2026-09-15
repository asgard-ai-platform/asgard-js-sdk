# BUILD-082 Sandbox browser panel and input forwarding in react

## Meta

- Task ID: `BUILD-082`
- Status: `done`
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

- [x] T1: Vendor `packages/react/src/lib/guacamole-keyboard.js` (Apache-2.0, license header intact) +
      `guacamole-keyboard.ts` type wrapper exposing `modifiers`, `onkeydown`, `onkeyup`, `listenTo`,
      `release`, `reset`. Confirm the lint config tolerates the vendored file without weakening package rules.
- [x] T2 (R1, R2): Add `packages/react/src/hooks/use-sandbox-browser-controller.ts` following
      `use-file-explorer-controller.ts` — nonce ref, `useMemo` identity, `openBrowser` / `closeBrowser` /
      `toggle` / `selectSandbox` / `requestBrowser`. Export from `hooks/index.ts`.
- [x] T3 (R9): Add `packages/react/src/components/sandbox-browser/coords.ts` — `toRemoteCoords` /
      `fromRemoteCoords` sharing one letterbox calculation, with their own unit spec.
- [x] T4 (R5–R16): Implement `packages/react/src/components/sandbox-browser/sandbox-browser-panel.tsx` with
      `chrome?: 'card' | 'flush'`, consuming the core transport. Port each spec §7 hazard and keep the
      prototype's rationale comment at the line it protects.
- [x] T5 (R17, R18): Add `sandbox-browser-panel.module.scss` + `--asg-sandbox-browser-*` theme tokens; add
      `sandboxBrowser.*` keys to all three locales.
- [x] T6 (R2, R3, R4): Add `SandboxBrowserArrivalBridge` + `ChatbotSandboxBrowserAside` in
      `packages/react/src/components/chatbot/chatbot-sandbox-browser.tsx`; wire `sandboxBrowser` prop, the
      aside mount, the header toggle, and the intent handler in `chatbot.tsx` / `chat-header-host.tsx`,
      preserving the UC-034 fallback in `dispatch-uri-action.ts`.
- [x] T7 (R1–R18): Export the public surface from the component sub-barrel and `components/index.ts`; add
      Vitest specs (controller nonce/identity, arrival bridge once-per-uri, fallback preserved, coordinate
      math, keyboard bound once, chord routing, stuck-key release coordinates, wheel throttle, clipboard
      fallback, i18n coverage). Reverse-verify each before calling the suite done.
- [x] T8: Add demo routes — `/sandbox-browser` (canvas `captureStream` mock, both widths side by side) and
      `/neko-lab` (real container transport, wire log, stuck-key panel computed from sent messages, unmapped-key
      list, and the 26-item checklist). Register in `app.tsx` + `layout.tsx` nav.
- [x] T9: Run `npm run lint:packages` + `npm run format:check` + `npm run typecheck` +
      `npm run build:core && npm run build:react` + `npm run test:packages`.
- [x] T10 (R20): Smoke check — start the neko container (spec §10.1), walk all 26 items of §10.2 on
      `/neko-lab`, then walk §10.3's five connection/integration items on the demo app. Capture screenshots
      for the handover document (not committed).

---

## Coverage

**Use Cases:** R1–R20. R1–R4 by Vitest; R5–R8 by Vitest plus the demo route; R9–R16 by Vitest plus a real
`ghcr.io/m1k1o/neko/chromium:3.1.4` container driven through `/neko-lab`; R17–R19 by the demo route at both
widths in three locales; R20 by the full gate plus both walkthroughs. See **Verification** for what the real
container confirmed and what still needs a person.

**Files**

`@asgard-js/react`:

| File                                                                | Change                                                                                                            |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `src/vendor/guacamole-keyboard.js`                                  | new — upstream Apache-2.0 source, verbatim                                                                        |
| `src/vendor/guacamole-keyboard.d.ts`                                | new — hand-written types (upstream ships none; `modifiers` missing from third-party ones)                         |
| `src/vendor/index.ts`                                               | new — `createGuacamoleKeyboard()`                                                                                 |
| `src/vendor/README.md`                                              | new — what is vendored, why, and the lint/prettier exemptions                                                     |
| `src/hooks/use-sandbox-browser-controller.ts`                       | new — the controller                                                                                              |
| `src/hooks/use-sandbox-browser-controller.spec.ts`                  | new — 11 cases                                                                                                    |
| `src/hooks/index.ts`                                                | export it                                                                                                         |
| `src/components/sandbox-browser/coords.ts`                          | new — letterbox conversion both ways                                                                              |
| `src/components/sandbox-browser/coords.spec.ts`                     | new — 20 cases                                                                                                    |
| `src/components/sandbox-browser/sandbox-browser-panel.tsx`          | new — the panel                                                                                                   |
| `src/components/sandbox-browser/sandbox-browser-panel.spec.tsx`     | new — 30 cases                                                                                                    |
| `src/components/sandbox-browser/sandbox-browser-panel.module.scss`  | new — styles + `--asg-sandbox-browser-*` tokens                                                                   |
| `src/components/sandbox-browser/icons.tsx`                          | new — 5 inlined glyphs                                                                                            |
| `src/components/sandbox-browser/index.ts`                           | new — sub-barrel                                                                                                  |
| `src/components/index.ts`                                           | export the sub-barrel                                                                                             |
| `src/components/chatbot/chatbot-sandbox-browser.tsx`                | new — arrival bridge + built-in aside                                                                             |
| `src/components/chatbot/sandbox-browser-arrival-bridge.spec.tsx`    | new — 10 cases                                                                                                    |
| `src/components/chatbot/sandbox-browser-fallback.spec.tsx`          | new — 4 cases (UC-034 preserved)                                                                                  |
| `src/components/chatbot/chatbot.tsx`                                | `sandboxBrowser` / `autoRevealOnOpenBrowserCard` props, controller, handler, bridge + aside mounts, click routing |
| `src/components/chatbot/chatbot.module.scss`                        | `.chatbot__sandbox_browser_aside`                                                                                 |
| `src/components/chatbot/chat-header/chat-header-host.tsx`           | the header toggle action                                                                                          |
| `src/components/chatbot/chat-header/render-header-actions.spec.tsx` | updated for the two new required props                                                                            |
| `src/i18n.ts`                                                       | 27 `sandboxBrowser.*` / `header.sandboxBrowser` keys × 3 locales                                                  |
| `eslint.config.cjs`                                                 | ignore the vendored file                                                                                          |

Repo root: `.prettierignore` (same exemption).

`apps/react-demo`: `routes/sandbox-browser/{sandbox-browser.tsx,browser-mock.ts,sandbox-browser.module.scss,index.ts}`,
`routes/neko-lab/{neko-lab.tsx,neko-transport.ts,checklist.ts,neko-lab.module.scss,index.ts}`, plus `app.tsx`
and `components/layout/layout.tsx` registration.

`@asgard-js/core` is untouched — that was BUILD-081.

---

## Findings from the build

1. **`toRemoteCoords` forwarded `NaN`.** Found by a spec that failed for an unexpected reason. Every
   comparison against `NaN` is false, so a `NaN` coordinate passed the "inside the picture" range check and
   was sent; the remote reads the resulting `null` as the origin and jerks the pointer to the top-left
   corner. Now rejected explicitly with `Number.isFinite`, with five cases covering it.
2. **One spec passed for the wrong reason, and mutation testing caught it.** "Sends nothing while the
   picture has no dimensions" stayed green when the `videoReady` gate was removed, because the coordinate
   guard drops the event anyway. The gate's real job is to not _invite_ the click — so a second case now
   asserts the control bar is absent until the picture has dimensions, and that one does go red.
3. **React's `onPointerLeave` is synthesized from `pointerout`**, so dispatching a literal `pointerleave`
   reaches nothing — the stuck-key-on-leave case was silently testing nothing until the dispatcher was
   fixed. Same class of problem as jsdom having no `PointerEvent` at all, which drops `clientX` and made
   every coordinate `NaN` (which is how finding 1 surfaced).
4. **`aspect-ratio` on the frame means a 375px-wide panel shows a very small picture.** Not a defect — a
   1280×720 desktop in 375px is unreadable whatever the layout does, and spec §7.8 already records mobile as
   an unsolved design question. Recorded so it is not mistaken for a layout bug during acceptance.

---

## Verification

**Static gate** — all green:

```
npm run lint:packages     ✅  (the 5 remaining warnings are all pre-existing, none in this cycle's files)
npm run format:check      ✅
npm run typecheck         ✅  (core, react, react-demo)
npm run build:core        ✅
npm run build:react       ✅
npm run test:packages     ✅  core 415 · react 587
```

React went from 512 to 587: **75 new cases** (30 panel, 20 coords, 11 controller, 10 arrival bridge, 4 fallback).

**Reverse verification** — each hazard's spec was confirmed to catch it by mutating the panel and checking
that exactly the right cases went red, then restoring:

| Mutation                                                          | Red                                                                         |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Release a held button at `(0,0)` instead of the last position     | 1 — `releases a held button at the last known position`                     |
| Gate interactivity on `status` alone, ignoring picture dimensions | 1 — `does not offer the controls until the picture actually has dimensions` |
| Send `keyup` unconditionally                                      | 1 — `sends keyup only for keys it actually sent a keydown for`              |
| Let a chorded printable take the text path                        | 2 — the chord case and the keyup-tracking case                              |

**Demo route `/sandbox-browser`** (mock, both widths, three locales), walked in a real browser:

- Two panels side by side, wide (consumer mount) and 375px (SDK default) — both render, both connect
- Watching vs controlling is unmistakable: breathing primary glow vs a plain hairline, blue dot vs green dot
- Taking over on one panel left the other untouched (independent controllers)
- Clicking the remote's verification-code field and typing **`123456` landed in it** — a full round trip
  through the production coordinate conversion, IME sink and text path
- Empty state, error overlay with retry, and the `ja-JP` / `zh-TW` / `en-US` switch all correct
- Zero console errors

**Neko lab `/neko-lab`** against a real `chromium:3.1.4` container — the part a mock cannot reach:

| §10.2 item                   | Result | Evidence                                                                               |
| ---------------------------- | ------ | -------------------------------------------------------------------------------------- |
| 接管後第一下點擊就有效       | ✅     | The address bar (a ~48px target in a 720px picture) responded to the first click       |
| 滑鼠點擊命中目標             | ✅     | Same                                                                                   |
| 按住左鍵拖曳可以選取文字     | ✅     | A contiguous block of article text selected                                            |
| 右鍵叫出的是**遠端**的選單   | ✅     | Chromium's own menu appeared; the local one was suppressed                             |
| 滾輪往下捲，遠端**也**往下捲 | ✅     | Article top → References, then back to the top on the reverse                          |
| 捲一格的距離是合理的         | ✅     | Ten notches moved about a screenful each, not to the end                               |
| 輸入英數字                   | ✅     | `example.com` and `en.wikipedia.org/wiki/WebRTC` both typed correctly                  |
| Enter                        | ✅     | Navigation fired                                                                       |
| Tab / Esc / 方向鍵           | ✅     | Each reached the wire as a keysym; the remote menu closed on Esc                       |
| F5 重新整理                  | ✅     | The remote page reloaded                                                               |
| ⌘/Ctrl + A 全選              | ✅     | The URL was replaced cleanly, so the chord took the keysym path                        |
| 「遠端還按著的鍵」是空的     | ✅     | Empty after every run; 6 keydown/6 keyup and 3 buttondown/3 buttonup, exactly balanced |

Also observed: hovering a remote link raised Wikipedia's preview popup, which is the `control/move` path
working end to end.

🔴 **Fourteen of the twenty-six items still need a person**, and this is the reason the handover document
exists. None of them can be driven from an automation harness:

- **Cursors (2)** — "watching shows _another person's_ cursor" needs a second session holding control;
  "controlling shows your own" is a visual judgement.
- **Corners and fullscreen (2)** — clicking the four extremes and re-checking coordinates after entering
  fullscreen.
- **Shift-held tab switch (1)** — the exact gesture that reproduces macOS suppressing `keyup`.
- **Chinese (2)** — the pre-edit must be _visible_ while composing, and the composed text must reach the
  remote. A real IME cannot be driven by a harness, and this pair is the difference between Chinese working
  and not.
- **Clipboard (6)** — all six need a real OS clipboard and its permission prompts.

Everything else not covered:

- **The real asgard-core `browser/session` endpoint has still never been called.** The lab uses neko's own
  login; the demo uses a mock. §10.3's five connection/integration items need a dev backend with a
  browser-enabled sandbox, which is still unconfirmed to exist.
- **No consumer app has mounted this**; `npm pack` into Mimir / Sindri has not been done.

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
- 2026-09-15: BUILD-081 / REVIEW-081 closed and committed (`a7e929b3`); implementation started (Status: `ready → in-progress`).
- 2026-09-15: T1–T10 complete. R1–R20 satisfied; gate green (core 415 / react 587); 75 new react cases with four mutation-based reverse verifications; both demo routes walked in a real browser, and twelve of the §10.2 items confirmed against a real neko container (fourteen need a person — see Verification) (Status: `in-progress → done`).
