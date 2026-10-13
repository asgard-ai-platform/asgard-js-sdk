# BUILD-094 Clear the conversation but keep the files: clearChannel and resetMode

## Meta

- Task ID: `BUILD-094`
- Status: `done`
- Issue: [asgard-sdk-pm#121](https://github.com/asgard-ai-platform/asgard-sdk-pm/issues/121)（F-039）
- Source spec: `references/asgard-sdk-pm/tracking/asgard-js-sdk/features/F-039-清除對話保留檔案-clearchannel-與-reset-鈕-resetmode.md`；契約以 `docs/spec/asgard-js-sdk/channel-clear.md`（§3 後端、§5 UI、§6 失敗、§8 JS API 面）為準，決議見 `docs/decisions/2026-10-10-channel-clear-reset-mode.md`；UI 參考 prototype @ `86db8d5` 的 `src/channelReset.tsx`
- Complexity: `M`

---

## Brief

後端新增 `POST {base}/channel/clear`：清空對話（transcript、session、title、待回覆 consent），但保留 Channel Home（`/work`）檔案、blobs、allow-list 與 channel 本身。SDK 側：core 新增與 `deleteChannel` 對稱的 `clearChannel()`，`Channel.reset` 依模式打 clear 或 delete；react 的 `<Chatbot>` 新增 `resetMode: 'delete' | 'clear'`（預設 `'delete'`，向下相容）與 `showResetButton`（預設 `true`），仍是同一顆 reset 鈕、同一個 icon，只有 label 依模式換字；`useChannel` / context 新增原始 `clearChannel()`（只清、不開場、不動本地 state）給自排流程的宿主——第一個採用者 platform-web Workbench assistant 用的就是這支。react-demo 新增 `/clear-channel` 頁示範。

**動 core + react + demo。公開 API 只增不改**：`deleteChannel()`、`isResetting`、`onReset` 不變。

**計畫階段的三個決定**（spec 沒寫到、需確認）：

1. **`Channel.reset` 怎麼收到模式**：加第五個參數 `mode: ResetMode = 'delete'`（`reset(config, payload, options, onChannelCreated, mode)`）。不放進 `ChannelConfig`——那是所有建 channel 路徑共用的設定，只有 reset 讀它會讓其他路徑多一個無意義欄位。`ResetMode` 型別定義在 core `types/`，由 core entry 匯出，react 引用。
2. **mount 時的自動 reset 也跟著 `resetMode`**：`useChannel` 只有在「自訂 client 沒有 `channelMetadata`」時才會在 mount 呼叫 `resetChannel()`（`use-channel.ts` mount effect）；既然 `resetChannel()` 依 `resetMode` 走，這條也一樣。設 `'clear'` 的宿主不會想在 mount 時把檔案刪掉。第一方 `AsgardServiceClient` 一定有 `channelMetadata`，走不到這條。
3. **label 與按鈕顯示由 `<Chatbot>` 直接傳給 `ChatHeaderHost`**（新 props `resetMode` / `showResetButton`），不經 context；`resetMode` 另經 `AsgardServiceContextProvider` → `useChannel` 決定 `resetChannel()` 打哪支。

**Already exists:** `AsgardServiceClient.deleteChannel` / `deriveChannelEndpoint`（`packages/core/src/lib/client.ts`）、`Channel.reset`（`packages/core/src/lib/channel.ts`）、`useChannel` 的 `startChannel('reset')` 與 `deleteChannel`（`packages/react/src/hooks/use-channel.ts`）、`ChatHeaderHost` 的 reset action（`chat-header-host.tsx`）、i18n `header.reset`、react-demo `/delete-channel` 路由與 mock（`handleMockChannelDelete`、`vite.config.ts` 的 `/mock-asgard/channel` middleware）。

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

EARS form: `When <event/condition>[, while <state>], the system shall <observable behavior>`.
Each criterion is mapped to one or more Implementation Tasks (→ T#).

- `R1` (AC1) When `AsgardServiceClient.clearChannel(customChannelId)` is called, the system shall send `POST {botProviderEndpoint}/channel/clear?custom_channel_id=<id>` with `apiHeaders()`, resolve on any 2xx (204 and 200+body alike) without parsing the body, throw `HttpError` on any other status, and impose no timeout; `IAsgardServiceClient` shall declare it as the optional `clearChannel?(customChannelId: string): Promise<void>`. → T1, T2
- `R2` (AC10) When `clearChannel` receives `404`, the system shall reject with `HttpError` rather than treat it as success. → T2
- `R3` (AC2) When `Channel.reset` runs with mode `'clear'`, the system shall call `client.clearChannel` and then open the `action=NONE` / `text=''` opening turn; with mode `'delete'` or no mode, it shall call `client.deleteChannel` exactly as before; when the client lacks the method for the chosen mode, it shall throw without building a channel. → T3
- `R4` (AC3) When `<Chatbot>` has no `resetMode`, the system shall behave exactly as 0.3.94: the reset button calls `DELETE /channel` and the label is `header.reset`. → T4, T5
- `R5` (AC4) When `<Chatbot showResetButton={false}>`, the system shall not render the header reset action, while a programmatic `resetChannel()` still works. → T5
- `R6` (AC5) When `resetMode` is `'clear'`, the system shall label the reset button (tooltip + `aria-label`) with the new key `header.clear` — zh-TW「清除對話（保留檔案）」, en-US "Clear conversation (keep files)", ja-JP「会話をクリア（ファイルは保持）」 — with the same `RefreshIcon` as `'delete'`. → T5
- `R7` (AC6, AC8) When the reset button is clicked (or `resetChannel()` is called) under `resetMode='clear'`, the system shall hold `isResetting` from the API call through the opening turn, call `POST /channel/clear`, then clear the local conversation and send the opening turn — the same flow as `'delete'` — with no confirmation dialog in either mode. → T4, T5
- `R8` (AC7) When a host calls the context's `clearChannel()`, the system shall call `client.clearChannel(customChannelId)` only — no opening turn, local conversation and `isResetting` untouched — and reject if the API fails. → T4
- `R9` (AC9) When clear (or delete) answers non-2xx or fails on the network during a reset, the system shall send no opening turn, keep the local conversation on screen, end `isResetting`, and report through the existing `onSseError`. → T3, T4
- `R10` (AC11) When a reset in `'clear'` mode completes against a backend whose Channel Home holds files, the files shall still be there once the opening turn brings the sandbox back (no SDK-side change beyond calling clear; verified against the dev backend if a sandbox-enabled bot is reachable, otherwise via the demo mock's server-side file count). → T6
- `R11` (AC12) When the developer opens react-demo `/clear-channel`, the system shall show `resetMode="clear"` side by side at wide (full-bleed) and narrow (375×640) sizes, with scenarios for: clear succeeds and the mock's server-side files survive (contrast: delete empties them), clear fails (500) and the screen stays, slow clear keeps the button busy, `showResetButton={false}`, and the raw `clearChannel()`. → T6
- `R12` (AC13 / smoke) When the developer runs `npm run lint:packages && npm run format:check && npm run typecheck`, `npm run build:core && npm run build:react`, and `npm run test:packages`, all shall pass, with new Vitest cases covering: `clearChannel` method/path/query/header and 2xx/204/200+body/404/500/network; `Channel.reset` per mode and missing-method throw; `resetChannel` per mode hits the right API; `showResetButton=false` renders no reset button; the label switches by mode. → T7, T8

---

## Implementation Tasks

Run in order; each task maps to the R# it satisfies.

- [x] T1 (R1): core `types/client.ts` — `ResetMode` type + `IAsgardServiceClient.clearChannel?`; export `ResetMode` from the core entry
- [x] T2 (R1, R2): core `client.ts` — `clearChannel()` mirroring `deleteChannel()` (POST, `/channel/clear`); Vitest in `client.spec.ts`
- [x] T3 (R3, R9): core `channel.ts` — `Channel.reset(..., mode = 'delete')` picks `clearChannel` / `deleteChannel`, missing method throws; Vitest in `channel.spec.ts`
- [x] T4 (R4, R7, R8, R9): react `use-channel.ts` — `resetMode` prop threaded into `startChannel('reset')`, new `clearChannel()`; `AsgardServiceContextProvider` + context value carry `resetMode` / `clearChannel`; Vitest in `use-channel.spec.ts`
- [x] T5 (R4–R7): react `chatbot.tsx` props `resetMode` / `showResetButton` (JSDoc = public docs) → provider + `ChatHeaderHost`; `chat-header-host.tsx` label by mode + skip the action when hidden; `i18n.ts` `header.clear` ×3; Vitest for the header
- [x] T6 (R10, R11): react-demo `/clear-channel` route (wide + narrow side by side) + mock `POST /channel/clear` (vite middleware routes `/clear` under `/mock-asgard/channel`) with server-side file count; register in `app.tsx` + layout nav
- [ ] T7: Run `npm run lint:packages` + `npm run format:check` + `npm run typecheck` + `npm run build:core && npm run build:react` + `npm run test:packages`
- [x] T8 (R12): Smoke check — `npm run serve:react-demo -- -- --port 5100`, walk every R# on `/clear-channel` and `/delete-channel` (regression) at both widths; screenshots go to the local verification handover, not the repo

---

## Coverage

Use Cases: R1–R12（F-039 AC1–AC13）

Files:

- core: `packages/core/src/types/client.ts`（`ResetMode`、`IAsgardServiceClient.clearChannel?`）、`packages/core/src/lib/client.ts`（`clearChannel()`；與 `deleteChannel()` 共用私有 `releaseChannel()`）、`packages/core/src/lib/channel.ts`（`Channel.reset(..., mode)`）
- core tests: `packages/core/src/lib/client.spec.ts`（+6）、`packages/core/src/lib/channel.spec.ts`（+4）
- react: `packages/react/src/hooks/use-channel.ts`（`resetMode` prop、`clearChannel()`）、`packages/react/src/context/asgard-service-context.tsx`、`packages/react/src/components/chatbot/chatbot.tsx`（`resetMode` / `showResetButton` props）、`packages/react/src/components/chatbot/chat-header/chat-header-host.tsx`、`packages/react/src/i18n.ts`（`header.clear` ×3）
- react tests: `packages/react/src/hooks/use-channel.spec.ts`（+5）、`packages/react/src/components/chatbot/chat-header/reset-mode.spec.tsx`（新，11）
- docs: `packages/core/README.md`、`packages/react/README.md`（review 補上）
- demo: `apps/react-demo/src/app/routes/clear-channel/`（新）、`apps/react-demo/src/app/app.tsx`、`apps/react-demo/src/app/components/layout/layout.tsx`、`apps/react-demo/src/mock-server/sse-mock.ts`（`handleMockChannelClear`、clear demo SSE、Channel Home 檔案清單）、`apps/react-demo/vite.config.ts`（`/mock-asgard/channel/clear` middleware）

---

## Execution Log / Change Log

- 2026-10-12: BUILD task created from https://github.com/asgard-ai-platform/asgard-sdk-pm/issues/121 (Status: `draft`).
- 2026-10-12: Plan confirmed as written, including the three plan-stage decisions (Status: `draft → ready → in-progress`).
- 2026-10-12: TDD — core 9 red → green, react 13 red → green. Full suites: core 458/458, react 719/719. lint (0 problems in touched files) / format / typecheck ×3 / build core + react green.
- 2026-10-12: Smoke on react-demo `/clear-channel` at both widths: ① clear → `POST /channel/clear` 204 → NONE opening, mock Channel Home files kept; ② default mode → `DELETE /channel`, files emptied, label「重設對話」; ③ clear 500 → transcript kept, no opening turn, `onSseError` once per shell; ④ 6s clear → button disabled + send disabled throughout, a second click issues no second clear; ⑤ `showResetButton={false}` → header shows only File Explorer + Close, `resetChannel()` still clears and opens; ⑥ raw `clearChannel()` → one `POST /channel/clear`, no opening turn, transcript untouched. Labels / tooltips checked in zh-TW / en-US / ja-JP. `/delete-channel` regression: label unchanged, still `DELETE /channel` → opening.
- 2026-10-12: R10 against the dev backend (dev consent bot, through the built core `clearChannel()`): agent wrote `/work/f039.txt` → `clearChannel` resolved in 2.7s → metadata still 200 with `title: null` and no live sandbox (fs list 412 meanwhile, the AC11 window) → NONE opening turn relaunched the same sandbox → `/work` still lists `f039.txt`. Also confirmed on dev: absent channel → 204, missing `custom_channel_id` → 400. Probe channel deleted afterwards.
- 2026-10-12: Demo note corrected during smoke — a busy reset disables the send button (`isConnecting`), not the textarea (Status: `in-progress → done`).
- 2026-10-12: REVIEW-094 found the package READMEs missing the new API; documented `clearChannel`, `Channel.reset`'s `mode`, `resetMode` and `showResetButton` (`ca6d4d47`).
- 2026-10-12: R10 through the real button as well: a local, uncommitted `resetMode="clear"` on the demo route wired to the dev consent bot — agent wrote `/work/f039-ui.txt`, the header button sent `POST /channel/clear` (204) then the opening turn (busy ~22.7s); the transcript cleared and the built-in File Explorer still listed the file. Change reverted, probe channel deleted.
