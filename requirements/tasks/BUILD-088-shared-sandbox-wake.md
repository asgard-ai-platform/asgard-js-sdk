# BUILD-088 Make sandbox wake a single channel-level store shared by every entry point

## Meta

- Task ID: `BUILD-088`
- Status: `done`
- Issue: [asgard-sdk-pm#118](https://github.com/asgard-ai-platform/asgard-sdk-pm/issues/118)
- Source spec: `references/asgard-sdk-pm/tracking/asgard-js-sdk/features/F-038-sandbox-下載卡-download-file-與-channel-層共用喚醒.md`（AC1–AC5）；`references/asgard-sdk-pm/docs/spec/asgard-js-sdk/sandbox-download.md` §4、§8.1；UC-063；原型 `references/asgard-chat-kit-prototype` @ `bb14a65` `src/useSandboxWake.ts`
- Complexity: `L`

---

## Brief

F-038 的前半：把「喚醒 sandbox」從 File Explorer 的元件 local state（`file-explorer-context` 的 `nudging`）抽成
`@asgard-js/core` Channel 上**唯一的一份** store，讓 File Explorer、下一張的下載卡（BUILD-089）以及以後任何需要
sandbox 活著的入口都讀同一份、只是發動時機不同。

- **core**：`channel.wakeSandbox(sandboxName?)`（single-flight，回 `'live' | 'failed' | 'blocked'`）＋
  `channel.sandboxWake$` / `getSandboxWake()`（`{ phase: 'idle' | 'waking' | 'failed' }`）。沒有任何計時器：
  失敗 = nudge 被拒 / 失敗，或 nudge 正常結束後重拉 `/channel/metadata` 仍沒有目標。
- **任何被接受的 `channel.nudge()` 都驅動同一份 store**（2026-10-05 決定）——不只走 `wakeSandbox` 的。理由：
  agent-hub-web 自己組 `FileExplorerPanel`、直接呼叫 `nudge(modelPayload)`；只算 `wakeSandbox` 的話，那邊的
  檔案總管與下載卡會各記各的。`wakeSandbox` 是在 `nudge` 之上的 single-flight 入口。
- **`sandboxName` 選填**（2026-10-05 決定，spec §8.1 原為必填）：File Explorer 的喚醒鈕出現在「沒有任何 live
  sandbox」時，不知道要等哪一台 —— 省略時 metadata 列出任一台即為 live。共用同一次 nudge 的各呼叫端用各自的
  條件判定結果。
- **react**：`useSandboxWake()` 讀同一份 store；`wake()` 的 payload 與內建 `nudge` 一樣經 `onBeforeSendMessage`
  解析（BUG-004）。`FileExplorerProvider` / `FileExplorerPanel` 新增選填 `wakePhase`，內建
  `ChatbotFileExplorerAside` 接上；**未傳 `wakePhase` 的宿主保留舊的 local 轉圈**（向後相容，agent-hub-web
  之後改傳即可，不在本 repo 處理）。

**Already exists:** `packages/core/src/lib/channel.ts`（`nudge()` 的 busy / consent 拒絕、`refetchMetadata()`、
`launchedSandboxes$`、`runStatus$`、其他 `get*()` + Observable store 的寫法）、`packages/react/src/hooks/use-channel.ts`
（`useLaunchedSandboxes` 的 store 橋接）、`packages/react/src/context/asgard-service-context.tsx`（`wrappedNudge`、
`resolveOutboundPayload`）、`file-explorer-context.tsx`（`nudging` / `handleNudge` / `nudgeDisabled`）、
`file-explorer-parts.tsx`（空狀態喚醒鈕）、`chatbot-file-explorer.tsx`（aside 接線）、`packages/react/src/i18n.ts`。

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
| 補充 | `nudge()` 既有簽章與拒絕語意（`ChannelBusyError` / `ChannelAwaitingConsentError`）不得改變                                |
| 補充 | 喚醒路徑不得新增任何 `setTimeout` / 逾時（spec §4「沒有入口自設逾時」）                                                   |

---

## Acceptance Criteria

- `R1` When a Channel is created, the system shall expose `channel.sandboxWake$` (replay-safe Observable) and `channel.getSandboxWake()` with initial `{ phase: 'idle' }`, plus `channel.wakeSandbox(sandboxName?)`; the new types are exported from `@asgard-js/core`. → T1, T2, T6
- `R2` When `wakeSandbox()` is called while a wake is already in flight, the system shall join that same wake and **not** send a second nudge request — three concurrent `wakeSandbox` calls produce exactly one `action=NUDGE` request. A direct `nudge()` keeps rejecting with `ChannelBusyError` while the nudge turn runs (unchanged), and joins without sending during the metadata re-fetch after it. → T2, T6
- `R3` When an accepted nudge resolves, the system shall keep `phase: 'waking'` while it re-fetches `/channel/metadata`, then set `idle` and resolve `'live'` if the target is listed, or set `failed` and resolve `'failed'` if not; no timer is involved anywhere in the path. → T2, T6
- `R4` When the nudge is rejected or fails (or the metadata re-fetch throws), the system shall set `phase: 'failed'` and resolve `'failed'`; the next accepted wake shall clear it back to `waking`. → T2, T6
- `R5` When `wakeSandbox()` is called while a non-nudge run holds the channel (user / welcome / replay) or a consent prompt is pending, the system shall resolve `'blocked'` without sending a nudge and without changing `sandboxWake$`. → T2, T6
- `R6` When a host calls `channel.nudge()` directly (not through `wakeSandbox`) and the nudge is accepted, the system shall drive the same store (`waking` → `idle` / `failed`) exactly as a `wakeSandbox()` call would; a rejected direct `nudge()` (busy / consent) shall leave the store unchanged and keep rejecting as today. → T2, T6
- `R7` When the target is already live, `wakeSandbox()` shall resolve `'live'` without sending a nudge. When `sandboxName` is given, the system shall treat the wake as live only if metadata lists that sandbox; when omitted, if metadata lists any sandbox. Each caller that joined a shared wake shall get a result judged by its own target, while the store reflects the initiating caller's target. → T2, T6
- `R8` When a React component calls `useSandboxWake()` inside the Asgard provider, the system shall return the current phase and a `wake(sandboxName?)` that routes through `channel.wakeSandbox` with the payload resolved via `onBeforeSendMessage`, exactly as the built-in `nudge` does (BUG-004). → T3, T7
- `R9` When the built-in `<Chatbot>` File Explorer aside shows its empty state, the system shall render the wake button from `sandboxWake$`: a wake started anywhere (another entry point, or a direct `channel.wakeSandbox()`) shows the explorer as waking immediately and disables the button; after a failed wake it shows a localized "last wake failed" hint (en / ja / zh) and the button is clickable again; `nudgeDisabled` rules (run in progress / consent pending) are unchanged. → T4, T5, T7
- `R10` When a host renders `FileExplorerProvider` / `FileExplorerPanel` with `onNudge` but without the new `wakePhase` prop, the system shall keep today's local spinner behavior unchanged (backward compatible). → T4, T7
- `R11` (Smoke check) When the developer runs `npm run build:core && npm run build:react`, the Vitest suites, and the new react-demo route `/sandbox-download` (wide + narrow shells side by side, mock nudge / metadata), the system shall show the File Explorer entering and leaving the waking state from both its own button and an external wake trigger, and the failed state, with no build or type errors. → T8, T9

---

## Implementation Tasks

- [x] T1 (R1): Add `SandboxWakePhase`, `SandboxWakeState`, `SandboxWakeResult` to `packages/core/src/types`（channel 相關型別旁），export from the core entry
- [x] T2 (R1–R7): `channel.ts` — `sandboxWakeSubject` + `sandboxWake$` / `getSandboxWake()`；把喚醒簿記掛在 `nudge()` 被接受之後（in-flight promise、nudge 結束 → `refetchMetadata()` → 判定目標）；`wakeSandbox(sandboxName?, payload?, options?)` 為 single-flight 入口（in-flight 則接上；非 nudge run / consent → `'blocked'`）；`nudge()` 對外簽章與拒絕語意不變
- [x] T3 (R8): react — context 新增 `wakeSandbox`（同 `wrappedNudge` 經 `resolveOutboundPayload`）與 `sandboxWake` 狀態；新增 `useSandboxWake()` hook（store 橋接照 `useLaunchedSandboxes`），從 react entry export
- [x] T4 (R9, R10): `file-explorer-context.tsx` / `file-explorer-panel.tsx` 新增選填 `wakePhase`；有傳 → 不用 local `nudging`，轉圈與失敗提示都讀它；沒傳 → 保留現行 local 行為（JSDoc 註明此為舊路徑）；`file-explorer-parts.tsx` 空狀態加失敗提示
- [x] T5 (R9): `chatbot-file-explorer.tsx` — `onNudge={() => wakeSandbox()}`、`wakePhase` 接 store；`i18n.ts` 加失敗提示 key（en / ja / zh）
- [x] T6 (R1–R7): core Vitest — single-flight（三次呼叫一次 request）、waking 涵蓋 refetch、live / 未列出 / 拒絕 / refetch 失敗、blocked（user run / consent）、直接 `nudge()` 也驅動 store、具名 / 不具名目標與 joiner 各自判定、失敗後下一次清除
- [x] T7 (R8–R10): react Vitest — `useSandboxWake` payload 經 `onBeforeSendMessage`；aside 在外部 wake 時立即顯示喚醒中、失敗提示；未傳 `wakePhase` 的 panel 行為不變
- [x] T8 (R11): react-demo 新 route `/sandbox-download`（寬窄兩個 shell 並排、各自 `customChannelId`、mock 依 prefix 配對）：mock nudge（可設時長 / 注入失敗）、mock metadata、外部「從別處喚醒」按鈕；BUILD-089 會在同一條 route 加下載卡
- [x] T9: Run `npm run lint:packages` + `npm run format:check` + `npm run typecheck` + `npm run build:core && npm run build:react` + `npm run test:packages`
- [x] T10 (R11): Smoke check — demo 寬窄兩側走完 R9；截圖

---

## Notes / Risks

- **agent-hub-web 的 nudge payload**：它的 `onBeforeSendMessage` 對無文字 outbound 早退，`model` 是在呼叫
  `nudge(modelPayload)` 時由呼叫端帶。內建入口（本張的 aside、BUILD-089 的下載卡）走 `onBeforeSendMessage`，
  在 agent-hub 裡就不會帶 `model`。sandbox blueprint 讀的是 subagents / source-set 掛載 / 工作目錄，不是 model，
  預期不影響喚醒結果；但要在 agent-hub 整合時確認。
- **agent-hub-web 的 `FileExplorerPanel`** 要改傳 `wakePhase` 才會與下載卡顯示一致（R6 已保證 store 正確）。
  連同 `isArtifactCardMessage` 排除 `download-file`（spec §8.5），在 SDK 發版後於 agent-hub-web 另開 PR。

---

## Coverage

Use Cases: R1–R11（UC-063 的共用喚醒段落；UC-064 的「檔案總管同時顯示失敗」）

Files:

- core：`packages/core/src/types/channel.ts`（`SandboxWakePhase` / `SandboxWakeState` / `SandboxWakeResult`）、`packages/core/src/lib/channel.ts`（`sandboxWake$`、`getSandboxWake()`、`wakeSandbox()`、`nudge()` 改走 `sendNudge()` + `trackWake()`）、`packages/core/src/lib/sandbox-wake.spec.ts`（新，15 案）
- react：`packages/react/src/hooks/use-channel.ts`（`wakeSandbox`、`nudgeSseOptions` 共用）、`packages/react/src/hooks/use-derived-state.ts`（`useSandboxWakeState`）、`packages/react/src/hooks/use-sandbox-wake.ts`（新，`useSandboxWake`）、`packages/react/src/hooks/index.ts`、`packages/react/src/context/asgard-service-context.tsx`（`wakeSandbox` 經 `resolveOutboundPayload`）、`packages/react/src/components/file-explorer/file-explorer-context.tsx`、`file-explorer-panel.tsx`、`file-explorer-parts.tsx`、`file-explorer-panel.module.scss`（`wakePhase`、`wakeFailed`、失敗提示）、`packages/react/src/components/chatbot/chatbot-file-explorer.tsx`（aside 接 `useSandboxWake`）、`packages/react/src/i18n.ts`（`fileExplorer.wakeFailed` ×3）
- react 測試：`packages/react/src/components/chatbot/aside-shared-wake.spec.tsx`（新）、`packages/react/src/components/file-explorer/panel-wake-phase.spec.tsx`（新）、`packages/react/src/context/asgard-service-context.spec.tsx`（+1）、`builtin-aside-channel-scope.spec.tsx` / `builtin-aside-upload-wiring.spec.tsx` / `nudge-consent-gate.spec.tsx`（mock 補 `useSandboxWakeState`）
- demo：`apps/react-demo/src/app/routes/sandbox-download/`（新）、`apps/react-demo/src/app/app.tsx`、`apps/react-demo/src/app/components/layout/layout.tsx`、`apps/react-demo/src/mock-server/sse-mock.ts`（`sandbox-download-` 前綴的 SSE / rejoin / metadata / fs / 控制端點）、`apps/react-demo/vite.config.ts`（`/mock-asgard/__sandbox-download`）

---

## Execution Log / Change Log

- 2026-10-05: BUILD task created from https://github.com/asgard-ai-platform/asgard-sdk-pm/issues/118 (Status: `draft`). Plan-time decisions: any accepted `nudge()` drives the store (not only `wakeSandbox`); `sandboxName` optional; hosts without `wakePhase` keep the local spinner; F-038 split into BUILD-088 (shared wake) + BUILD-089 (download card).
- 2026-10-05: Implementation started (Status: `ready → in-progress`), branch `feat/118-sandbox-download-card`.
- 2026-10-05: All R# verified (Status: `in-progress → done`). lint 0 errors（5 warnings 皆在未改動的檔案）、format、typecheck（3 projects）、build core + react 綠；test:packages core 445 / react 639 全過。新測試以 mutation 確認會紅：拿掉 single-flight 檢查 → 4 案紅；拿掉 nudge 後的 metadata 重拉 → 7 案紅；aside 不傳 `wakePhase` → 2 案紅。demo `/sandbox-download`（port 4201，4200 被其他 repo 的 dev server 佔用）寬窄兩側走過 R9：外部 `wakeSandbox` → 寬版檔案總管立即「Waking…」、mock 收到 1 次 NUDGE、醒來後樹出現；`wake-failed` 下窄版按喚醒 → 失敗提示（error token）且按鈕可再按。實作中補進 R2 / R7 的兩處細節：直接 `nudge()` 在 nudge turn 進行中仍丟 `ChannelBusyError`、在之後的 metadata 重拉期間則接上；目標已 live 時 `wakeSandbox()` 直接回 `live` 不送 nudge。
