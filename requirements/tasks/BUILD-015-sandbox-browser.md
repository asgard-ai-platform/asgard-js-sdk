# BUILD-015 Sandbox Browser component `<SandboxBrowser>` (sandbox Files/Browser, part 2)

## Meta

- Task ID: `BUILD-015`
- Status: `done`
- Source: user direction (2026-07-14) — Sindri Files/Browser into the SDK. UI authority = Sindri prototype `BrowserPanel`; data = `asgard-core` `POST /sandbox/{name}/browser/open-url`.
- Complexity: `M`
- Part: **2 of 3** (Foundation ✅ → **Browser** → Files). Stacks on BUILD-014.

## Brief

Render the channel's sandbox browser (Neko) as an SDK component. `<SandboxBrowser>` reads the sandbox name from the BUILD-014 store (`useSandboxName()`), asks the client for a one-time embed URL (`client.getSandboxBrowserUrl()` → `POST /sandbox/{name}/browser/open-url` → `{ openURL }`), and embeds it in an iframe with a URL / reload / open-in-new-tab toolbar and waiting / loading / error / ready states. UI adapted from the Sindri prototype `BrowserPanel` (Tailwind → SDK CSS vars). A chrome component the app lays out.

## Acceptance Criteria

- `R1` `client.getSandboxBrowserUrl(sandboxName)` POSTs to `/sandbox/{name}/browser/open-url` and returns `data.openURL`; non-OK throws `HttpError`; missing `openURL` throws. → T1, T4
- `R2` `<SandboxBrowser>` reads `useSandboxName()`; with a name it fetches the URL and embeds it in an iframe; without one it shows the waiting placeholder. → T2, T5
- `R3` toolbar: current URL (truncate), reload (re-fetches a fresh one-time URL + remounts the iframe), open-in-new-tab; disabled when no URL. → T2, T5
- `R4` states: waiting / loading / error / ready; errors surface the message, don't crash. → T2, T5
- `R5` (Smoke) build + `/multi-panel` Browser panel embeds the mock Neko frame after `sandbox.ready`; tests green. → T3, T5

## Implementation Tasks

- [x] T1 (R1): `client.ts` `getSandboxBrowserUrl()` + `IAsgardServiceClient` type.
- [x] T2 (R2-R4): `sandbox-browser/{sandbox-browser.tsx,.module.scss,index.ts}`; export from `components/index.ts`.
- [x] T3 (R5): `sse-mock.ts` `handleMockSandbox` (open-url) + `handleMockSandboxFrame` (mock Neko HTML); `vite.config.ts` middlewares; `/multi-panel` Browser panel via `<SandboxBrowser>`.
- [x] T4 (R1): `client.spec.ts` +3 (POST path + openURL parse, non-OK throw, missing-openURL throw).
- [x] T5 (R5): build + browser verify.

## Coverage

Files: `packages/core/src/lib/client.ts`, `types/client.ts`, `lib/client.spec.ts`; `packages/react/src/components/chatbot/sandbox-browser/*`, `components/index.ts`; `apps/react-demo/src/mock-server/sse-mock.ts`, `vite.config.ts`, `routes/multi-panel/*`.

Verification: build:core + build:react ✅ · core **49/49** (client.spec +3) ✅ · prettier ✅. Browser `/multi-panel`: BROWSER panel (`SDK 元件`) shows the toolbar (`/mock-asgard/sandbox-frame?sbx=sbx-mock-0001`) + an iframe embedding the mock Neko page, after `sandbox.ready` → `useSandboxName()` → `getSandboxBrowserUrl()` → openURL. Screenshot: `.github/screenshots/f-sandbox-browser/sandbox-browser-panel.png`.

## Follow-ups

- Real Neko browser verification needs a dev backend (the mock embeds a same-origin placeholder page). Recorded with the BUILD-014 real-sandbox follow-up.
- **Part 3** BUILD-016 `<SandboxFiles>` (`fs/list` tree + viewer/upload/download).

## Execution Log

- 2026-07-14: `<SandboxBrowser>` + `getSandboxBrowserUrl` + mock Neko frame + demo panel; core 49/49; browser-verified. (Status: `draft` → `done`).
