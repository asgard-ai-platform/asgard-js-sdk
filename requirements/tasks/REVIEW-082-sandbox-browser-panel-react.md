# REVIEW-082 Sandbox browser panel and input forwarding in react

## Meta

- Task ID: `REVIEW-082`
- Status: `done`
- BUILD Task: `BUILD-082`
- Reviewed commit: on top of `a7e929b3` (BUILD-081); this cycle is uncommitted at review time
- Reviewed branch: `feat/109-sandbox-browser-panel`

---

## §1 Static Code Review

Scope: the files in `BUILD-082 ## Coverage`. `tsc` and lint run project-wide.

### §1.1 Checklist

| Check item                                                         | Rule                           | Result                                |
| ------------------------------------------------------------------ | ------------------------------ | ------------------------------------- |
| `any` / `as any`                                                   | FRONTEND_RULE_COMMON §1.1      | ✅                                    |
| `@ts-ignore` / `eslint-disable` used to bypass type or lint errors | FRONTEND_RULE_COMMON §1.2      | ✅ — see note 1                       |
| `console.log` left in library code                                 | FRONTEND_RULE_COMMON §1.3 §7   | ✅                                    |
| Hardcoded API key / endpoint / namespace                           | FRONTEND_RULE_COMMON §1.4      | ✅                                    |
| RxJS subscription / EventSource / timer teardown                   | FRONTEND_RULE_COMMON §1.5      | ✅ — see note 2                       |
| `@asgard-js/react` imports core only via its public entry          | FRONTEND_RULE_COMMON §1.6      | ✅                                    |
| `@asgard-js/core` imports `react` / `react-dom` / DOM API          | FRONTEND_RULE_COMMON §1.6 §2.1 | ✅                                    |
| Public API change without a `@deprecated` transition               | FRONTEND_RULE_COMMON §1.7      | ✅ — see note 3                       |
| New public types / components exported from the package entry      | FRONTEND_RULE_COMMON §2.2      | ✅                                    |
| Message-template prerequisites                                     | FRONTEND_RULE_COMMON §2.3      | n/a — no template                     |
| Uses `botProviderEndpoint`, not the deprecated `endpoint`          | FRONTEND_RULE_COMMON §2.4      | ✅                                    |
| Exported functions / methods declare explicit return types         | FRONTEND_RULE_COMMON §3.1      | ✅                                    |
| Shared types centralized in core `src/types/`, no duplicates       | FRONTEND_RULE_COMMON §3.2      | ✅                                    |
| React component props fully typed                                  | FRONTEND_RULE_COMMON §4.1      | ✅                                    |
| Hardcoded colour values in components                              | FRONTEND_RULE_COMMON §4.2      | ✅ — see note 4                       |
| `react` / `react-dom` stay peerDependencies                        | FRONTEND_RULE_COMMON §4.4      | ✅ — no new dependency at all         |
| core and react share the same version number                       | FRONTEND_RULE_COMMON §5        | ✅ `0.3.84` both                      |
| Repeated logic (≥2×) / types / JSX (≥3×) extracted                 | FRONTEND_RULE_COMMON §6        | ✅ — see note 5                       |
| `setTimeout` mock delays, dead commented code, stray TODO / FIXME  | FRONTEND_RULE_COMMON §7        | ✅ — see note 2                       |
| All user-facing text via `t()`, synced to all three locales        | FRONTEND_RULE_COMMON §5.3      | ✅ 27 keys × 3                        |
| Both widths verified (375px and full-bleed)                        | FRONTEND_RULE_COMMON §4.3+     | ✅ side by side on `/sandbox-browser` |

Five judgement calls, stated rather than waved through:

1. **The vendored Guacamole keyboard is not an `eslint-disable` in our code.** `src/vendor/guacamole-keyboard.js`
   is upstream Apache-2.0 source carried verbatim; it is excluded at the **config** level
   (`packages/react/eslint.config.cjs`, `.prettierignore`) rather than by an in-file pragma, and the
   exclusion names that one file. Keeping it byte-identical is what makes it diffable against a future
   upstream release. Its types are hand-written in a sibling `.d.ts`, which is ours and is fully linted.
   `src/vendor/README.md` records all of this. Grep g2 over the coverage files returns nothing.
2. **The one `setTimeout` is a real timeout, not a simulated delay.** `sandbox-browser-panel.tsx:405` bounds
   how long the panel waits for `control/host` after asking — which exists precisely because a refused
   request produces no reply at all (spec §6). It is cleared in the effect's cleanup. The panel's other
   teardowns were checked individually: the connection effect closes the session and guards with `disposed`,
   the blur/visibility effect removes both listeners _and_ releases held input, and the keyboard is detached
   by the callback ref when the node goes.
3. **Purely additive.** `sandboxBrowser` defaults to `'off'` and `autoRevealOnOpenBrowserCard` to `false`, so
   an existing consumer's behavior is byte-for-byte unchanged. The one behavioral edit to an existing path —
   routing `onSandboxOpenBrowser` through the new handler — is covered by its own spec file; see §3 R4.
4. **The two hex values in `icons.tsx` are CSS-variable fallbacks** (`var(--asg-sandbox-browser-cursor-fill, #fff)`),
   which is the pattern every `.module.scss` in this package already uses. The third grep hit is the string
   `#470` inside a comment. The stage's deliberately-dark palette is expressed as eight
   `--asg-sandbox-browser-*` tokens rather than literals, so a consumer can restyle it.
5. **`collectUris` is duplicated between the two arrival bridges, deliberately.** §6 targets repeated
   _logic_; this is repeated _shape_ — four lines of object walking — and the two bridges scan for different
   intents and have no reason to change together. Recorded in the file. Extract on the third.

### §1.2 Mechanical Grep

Array-quoted (`"${F[@]}"`), because a bare `$F` collapses to one non-existent path in zsh and prints a fake
all-clear — that has produced false greens twice before.

```
g1  ': any\b|<any>|as any'            → (no output)  ✅
g2  '@ts-ignore|@ts-nocheck|eslint-disable'  → (no output)  ✅
g3  'console\.log'                    → (no output)  ✅
g4  core → react / react-dom          → (no output)  ✅
g5  react → '@asgard-js/core/src'     → (no output)  ✅
g6  '#[0-9a-fA-F]{3,6}|rgba('
    icons.tsx:96   fill="var(--asg-sandbox-browser-cursor-fill, #fff)"      ← variable fallback
    icons.tsx:97   stroke="var(--asg-sandbox-browser-cursor-stroke, #111)"  ← variable fallback
    chatbot-sandbox-browser.tsx:107  "…(`SandboxChannelScope`, #470)…"      ← issue number in a comment
g7  'setTimeout'
    sandbox-browser-panel.tsx:405  const timer = setTimeout(…)              ← the control-request timeout
g8  'TODO|FIXME'                      → (no output)  ✅
g9  literal CJK in JSX                → (no output)  ✅  every string goes through t()
```

### §1.3 TypeScript and Lint

```
npm run lint:packages   PASS — Successfully ran target lint for 2 projects
npm run format:check    PASS — All matched files use Prettier code style!
npm run typecheck       PASS — 3 projects (core, react, react-demo)
npm run build:core      PASS
npm run build:react     PASS
```

Lint reports 5 warnings project-wide; each was traced and **all five are pre-existing** (chat-composer aria,
two file-view `exhaustive-deps`, a useless fragment in an older spec, `no-new-func` in the canvas spec).
None is in a file this cycle touched.

### §1.4 Static Review Acceptance

- [x] All §1.1 items checked and marked
- [x] No ❌ violations
- [x] All §1.2 greps run and output pasted, with every non-empty result adjudicated
- [x] `npm run typecheck` — clean
- [x] `npm run lint:packages` — clean

---

## §3 Functional Validation

### R# Result Matrix

| R#  | Description                                                                    | Result         | Note                                                                                                                                     |
| --- | ------------------------------------------------------------------------------ | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | `requestBrowser` opens / selects / bumps the nonce; controller identity stable | Pass           | 11 controller cases incl. identity across renders                                                                                        |
| R2  | `sandboxBrowser="off"` still routes intents, mounts no aside                   | Pass           | Controller cases + the `builtinSandboxBrowser` gate                                                                                      |
| R3  | Arrival bridge fires once per (message, uri), notify-not-force                 | Pass           | 10 cases; the mock replaces the conversation object per render, as the real store does                                                   |
| R4  | UC-034 new-tab fallback preserved when nothing is wired                        | Pass           | 4 dedicated cases: fallback, target override, defer-to-host, and never opening the raw `sandbox://` uri                                  |
| R5  | Live picture; connecting / error / empty states                                | Pass           | Demo route walked; all three seen                                                                                                        |
| R6  | Read-only by default; takeover explicit and visible; a way out                 | Pass           | Watching shows a breathing glow and "Take over"; controlling shows a hairline, a green dot and "Stop controlling"                        |
| R7  | No control events without control; timeout on silence                          | Pass           | Unit (no traffic while watching) + a timeout case; the gate also exists in core                                                          |
| R8  | Reconnect obtains a **new** session                                            | Pass           | Retry bumps `retryNonce` → the effect re-runs → `transport.connect` → `createSession` again (core spec proves credentials are re-minted) |
| R9  | Coordinates from `videoWidth`, black bars dropped, no events before dimensions | Pass           | 20 coord cases + panel cases; **confirmed live** — a ~48px address bar hit on the first click                                            |
| R10 | Keyboard bound exactly once                                                    | Pass           | Reverse-verified; binds once across connect → live → control → host changes                                                              |
| R11 | Chorded printables take the keysym path and release                            | Pass           | Reverse-verified; **confirmed live** — Ctrl+A replaced the URL cleanly                                                                   |
| R12 | IME text from `compositionend`; sink visible while composing                   | Pass (partial) | Unit cases pass; **the visible-pre-edit half needs a person** — see below                                                                |
| R13 | Release held input at the last position, never `(0,0)`                         | Pass           | Reverse-verified; **confirmed live** — 6/6 keys and 3/3 buttons balanced, held panel empty                                               |
| R14 | Wheel throttled and normalized                                                 | Pass           | Unit; **confirmed live** — remote scrolled down then back up                                                                             |
| R15 | Clipboard: push, chord, button, and a manual fallback                          | Pass (partial) | Unit cases pass; **all six §10.2 clipboard items need a person**                                                                         |
| R16 | Remote cursor drawn while watching; local cursor kept                          | Pass (partial) | Code path unit-covered; **needs a second session to see live**                                                                           |
| R17 | Every string via `t()`, three locales                                          | Pass           | 27 keys × 3; switched live on the demo route                                                                                             |
| R18 | `.module.scss` + `--asg-*` tokens                                              | Pass           | §1 g6                                                                                                                                    |
| R19 | Both widths                                                                    | Pass           | Rendered side by side; both usable                                                                                                       |
| R20 | Build + tests + both routes walked                                             | Pass           | See below                                                                                                                                |

### Live evidence against a real container

Twelve §10.2 items confirmed against `ghcr.io/m1k1o/neko/chromium:3.1.4`: first-click accuracy, click
targeting, drag-select, the **remote** context menu (local one suppressed), scroll direction both ways,
scroll magnitude, alphanumeric input, Enter, Tab / Esc / arrows, F5 reload, Ctrl+A, and an empty held-key
panel with exactly balanced down/up counts throughout. The strongest single piece: typing a URL and pressing
Enter navigated the remote browser, which exercises coordinates, a modifier chord, eleven printable keysyms
and a function key in one gesture.

### §3.1 Acceptance

- [x] Every R# executed and marked
- [x] Boundary conditions: empty state, connection error + retry, no-dimensions window, letterbox bars,
      not-in-control, post-release double-release, empty composition
- [x] No e2e suite exists for this package; the demo routes and the container stand in (`REVIEW_RULE.md §3`)

---

## Findings

### Critical (must fix before done)

None. Two defects were found _during_ the build and fixed there (a `NaN` coordinate escaping the range
check, and a spec that passed for the wrong reason) — both are recorded in `BUILD-082 ## Findings`.

### Important (should fix in this cycle)

None.

### Minor (nice to have)

1. **`CONTROL_REQUEST_TIMEOUT_MS` is fixed at 4 s.** Fine for a dev network; a consumer on a slow link
   cannot raise it. Not made configurable on speculation — the prop can be added without a breaking change.
2. **At 375px the picture is small.** Inherent to showing a 1280×720 desktop in that width, and spec §7.8
   already records mobile as an unsolved design problem. Noted so acceptance does not read it as a bug.
3. **The wire log in `/neko-lab` shows `control/request` twice**, once from the panel's `onLog` and once
   from the transport's `onWire`. Cosmetic, lab-only.

---

## Not covered

**Fourteen of the twenty-six §10.2 items still need a person at the keyboard** — none is automatable:
the two cursor items (one needs a second session holding control), the four-corner and post-fullscreen
coordinate checks, the Shift-held tab switch, both Chinese items (a real IME cannot be driven by a harness,
and the _visible pre-edit_ is the difference between Chinese being usable and not), and all six clipboard
items (real OS clipboard plus its permission prompts).

Also still open, unchanged from BUILD-081:

- **The real asgard-core `browser/session` endpoint has never been called.** The lab uses neko's own login;
  the demo uses a mock. §10.3's five connection/integration items need a dev backend with a browser-enabled
  sandbox, which is not yet confirmed to exist.
- **No consumer app has mounted this** — no `npm pack` into Mimir / Sindri.

---

## Execution Log

- 2026-09-15: REVIEW task created, paired with BUILD-082 (Status: `draft`).
- 2026-09-15: §1 static review run (Status: `draft → in-progress`). 19 applicable items ✅, 1 n/a; 9 greps
  run, 2 non-empty results adjudicated (CSS-variable fallbacks, an issue number, one genuine timeout);
  5 lint warnings all confirmed pre-existing. Zero violations.
- 2026-09-15: §3 functional validation complete — R1–R20 Pass, three partial and explicitly scoped
  (R12 / R15 / R16 need a person for their observational halves). 75 new react cases, four mutation-based
  reverse verifications, both demo routes walked in a real browser, twelve §10.2 items confirmed against a
  real Neko container. Zero BLOCKERs (Status: `in-progress → done`).
