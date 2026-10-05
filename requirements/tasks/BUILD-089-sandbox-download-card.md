# BUILD-089 Download sandbox files from a stateful card that wakes the sandbox through the shared wake

## Meta

- Task ID: `BUILD-089`
- Status: `done`
- Issue: [asgard-sdk-pm#118](https://github.com/asgard-ai-platform/asgard-sdk-pm/issues/118)
- Source spec: `references/asgard-sdk-pm/tracking/asgard-js-sdk/features/F-038-sandbox-下載卡-download-file-與-channel-層共用喚醒.md`（AC6–AC14）；`references/asgard-sdk-pm/docs/spec/asgard-js-sdk/sandbox-download.md` §3、§5、§6、§8.2–§8.4；UC-062、UC-063、UC-064；原型 `references/asgard-chat-kit-prototype` @ `bb14a65` `src/useSandboxFileDownload.ts`、`src/SandboxCards.tsx`（`SandboxDownloadFileCard`）、`src/demo/DownloadCardDemo.tsx`
- Complexity: `L`
- Depends on: `BUILD-088`（`channel.wakeSandbox` / `sandboxWake$` / `useSandboxWake`）

---

## Brief

F-038 的後半：後端新工具 `show_sandbox_file_download_link` 推 ATTACHMENT 卡
`sandbox://<name>/download-file?absolute_path=<abs>`（`defaultAction` 與 `downloadAction` 同一個）。現況
`resolveSandboxUri()` 回 `null` → 落到 `safeWindowOpen`，點了沒反應（DEV 已是這狀態）。

本張讓這張卡變成**有狀態的下載卡**：sandbox 活著就直接 `sandboxFsRead`（不帶 limit、依 `X-Total-Bytes` 顯示進度）
後存檔；沒活著就走 BUILD-088 的共用喚醒、醒了自動下載；失敗依 spec §6 分流。同一檔案（`sandboxName + absolutePath`）
的多張卡共用一份狀態，所以狀態放在 `<Chatbot>` 層的 react controller（存檔要 DOM，不能進 core）。卡片全程不開
File Explorer、到站不自動觸發。宿主唯一的掛點是選填 `saveDownloadedFile(blob, fileName)`；內建 `<Chatbot>` 零行 code。
`channel-home://` 舊卡維持原樣。

core 需要一處 additive 改動：`client.sandboxFsRead` 目前用 `response.blob()` 一次讀完，拿不到進度 → 新增選填
`onProgress(received, total)`（串流讀 body），既有呼叫端不受影響。

**Already exists:** `packages/core/src/lib/resolve-sandbox-uri.ts`（`PATH_ACTIONS`）、`packages/core/src/lib/client.ts`
（`sandboxFsRead`、`HttpError`）、`packages/core/src/lib/channel.ts`（`dropSandbox`、BUILD-088 的喚醒 store）、
`packages/react/src/utils/dispatch-uri-action.ts`（sandbox 分支的 open-file else）、
`packages/react/src/utils/channel-home-download.ts` 與 `create-sandbox-fs-providers.ts`（兩份重複的
`triggerBlobDownload`）、`attachment-template/chip.tsx`（`isDownloadAction`、`bodyActsAsDownload`）、
`chatbot-file-explorer.tsx`（`FileExplorerArrivalBridge`）、`hooks/use-channel.ts`（`useLaunchedSandboxes`）、
`packages/react/src/i18n.ts`。

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
| 補充 | 卡片不得自設喚醒逾時；唯一的計時器是 done → idle（約 2.5s），須在 unmount 時清除                                          |

---

## Acceptance Criteria

- `R1` When `resolveSandboxUri()` receives `sandbox://<name>/download-file?absolute_path=<enc>`, the system shall return `{ kind: 'download-file', sandboxName, absolutePath }` (decoded); a missing `absolute_path` shall return `null`. → T1, T9
- `R2` When a download-file URI is dispatched, the system shall take an explicit download-file branch in `dispatchUriAction()` — never `onSandboxOpenFile`, never `safeWindowOpen`; `isDownloadAction()` shall count it as a download; `FileExplorerArrivalBridge` shall not react to its arrival. → T3, T5, T9
- `R3` When `sandboxFsRead()` is given `onProgress`, the system shall stream the body and report `(received, total)` with `total` from `X-Total-Bytes`; callers that omit it shall behave exactly as before. → T2, T9
- `R4` When the user clicks a download card whose sandbox is live, the system shall call `sandboxFsRead(name, absolutePath)` without a limit, show "downloading X / Y" with a progress bar, save the blob under the path's basename via `<a download>` (or the host's `saveDownloadedFile`) only if `size >= totalBytes`, show "downloaded", and return to idle after ~2.5s. → T4, T6, T10
- `R5` While a card is idle, the system shall hint "Sandbox not running · will wake first" when its sandbox is not live (no time estimate), and "Sandbox waking · downloads once awake" when `sandboxWake$` is `waking`. → T6, T10
- `R6` When the user clicks a card whose sandbox is not live, the system shall enter `waiting` (spinner, message, Cancel, indeterminate bar) and call the shared `wakeSandbox(name)`; once metadata lists the sandbox, every card waiting on it shall start downloading; Cancel shall return only that card to idle while the shared wake continues. → T4, T6, T10
- `R7` When several cards point to the same `sandboxName + absolutePath`, the system shall show one shared state and ignore repeat clicks while waiting / downloading; clicking three cards for different files on a cold sandbox shall send exactly one nudge. → T4, T10
- `R8` When a run holds the channel, the system shall put a clicked cold card into `waiting` without sending a nudge, and wake only if the sandbox is still not live when the run ends; while a consent prompt is pending the card shall stay idle. → T4, T10
- `R9` When a download fails, the system shall: on 404 show "file no longer exists" with no retry; on the card's first 412 / 5xx call `channel.dropSandbox(name)` and fall back to the shared wake; on the next 412 / 5xx show "download failed" with retry; on `size < totalBytes` show "download incomplete" without saving, with retry; on a failed shared wake show "wake failed" with retry while the File Explorer shows its failed hint (BUILD-088). A manual retry re-grants the one 412 / 5xx fallback. → T4, T6, T10
- `R10` When a download card is used in any phase, the system shall not open or change the File Explorer. → T5, T10
- `R11` When the host passes `saveDownloadedFile(blob, fileName)` to `<Chatbot>`, the system shall call it instead of the `<a download>` save step; no other part of the card (wake, wait, read) is replaceable. → T5, T10
- `R12` When a legacy `channel-home://` download card is clicked, the system shall behave exactly as before. → T3, T9
- `R13` When rendered, the download card shall sit in the same visual family as the existing sandbox action chips with a download icon, take colors only from theme tokens (error via the error token), and localize every string (en / ja / zh). The two duplicated `triggerBlobDownload` helpers shall be merged into one shared util used by the card. → T6, T7, T8
- `R14` (Smoke check) When the developer runs `npm run build:core && npm run build:react`, the Vitest suites, and the react-demo route `/sandbox-download` (wide + narrow side by side; the prod "three PDFs" case, live / cold, 404, stale 412, incomplete, wake failed, run in progress), the system shall show each R4–R11 behavior with no build or type errors. → T11, T12

---

## Implementation Tasks

- [x] T1 (R1): `resolve-sandbox-uri.ts` — `download-file` 加入 `PATH_ACTIONS`、`SandboxUriIntent` 加 `download-file` 變體；export 不變
- [x] T2 (R3): `client.ts` — `SandboxFsReadOptions.onProgress?`，有傳才串流讀 body（`response.body.getReader()`），沒傳維持 `response.blob()`
- [x] T3 (R2, R12): `dispatch-uri-action.ts` — 明確 download-file 分支，交給 SDK 內部的下載 handler（不新增宿主可接管整張卡的 prop）；`chip.tsx` 的 `isDownloadAction` 認得 download-file；channel-home 分支原樣
- [x] T4 (R4, R6–R9): react 下載 controller（`<Chatbot>` 層 context / store；key = `sandboxName + absolutePath`）：讀 `useLaunchedSandboxes`、`useSandboxWake`、`runStatus` / `pendingConsent`；狀態機照 spec §5 / §6；done → idle 計時器 unmount 時清除
- [x] T5 (R2, R10, R11): 把 controller 接進 `<Chatbot>`（新增選填 prop `saveDownloadedFile`）；確認 `FileExplorerArrivalBridge` 不處理 download-file、點卡不呼叫 explorer controller
- [x] T6 (R4–R6, R9, R13): `SandboxDownloadFileCard` 元件（ATTACHMENT 的 download-file 改渲染它）：idle / waiting / downloading / done / error 呈現、取消 / 重試、進度條；SCSS module + theme token
- [x] T7 (R13): 合併 `triggerBlobDownload` 為共用 util（`channel-home-download.ts`、`create-sandbox-fs-providers.ts`、下載卡共用）
- [x] T8 (R13): `i18n.ts` 新增下載卡字串（en / ja / zh）
- [x] T9 (R1–R3, R12): core Vitest（resolve、`sandboxFsRead` 進度與不帶 limit）＋ react Vitest（dispatch 分支、`isDownloadAction`、channel-home 不變）
- [x] T10 (R4–R11): react Vitest — 下載卡狀態機：live 下載與存檔、basename、cold → waiting → 自動下載、取消、同檔共用、三張一次 nudge、run 中不送 nudge 與 run 結束後喚醒、consent 維持 idle、404 / 412×2 / 5xx / incomplete / wake-failed、手動重試重新給機會、`saveDownloadedFile`、不碰 explorer
- [x] T11: Run `npm run lint:packages` + `npm run format:check` + `npm run typecheck` + `npm run build:core && npm run build:react` + `npm run test:packages`
- [x] T12 (R14): Smoke check — `/sandbox-download`（BUILD-088 建立）加下載卡與故障注入，寬窄兩側走完 R4–R11；截圖

---

## Coverage

Use Cases: R1–R14（UC-062、UC-063 的卡片段落、UC-064）

Files:

- core：`packages/core/src/lib/resolve-sandbox-uri.ts`（`download-file`）、`packages/core/src/types/sandbox-fs.ts`（`SandboxFsReadOptions.onProgress?`）、`packages/core/src/lib/client.ts`（`readBodyWithProgress`）、`packages/core/src/lib/resolve-sandbox-uri.spec.ts`（+2）、`packages/core/src/lib/client.spec.ts`（+1）、`packages/core/README.md`
- react：`packages/react/src/components/sandbox-download/sandbox-download-context.tsx`（新，controller / provider）、`sandbox-download-card.tsx` + `.module.scss`（新）、`sandbox-download.spec.tsx`（新，16 案）、`packages/react/src/components/templates/attachment-template/attachment-template.tsx`（download-file 改渲染卡片、`customStyle` 合併為一份）、`chip.tsx`（`isDownloadAction`、傳 `onSandboxDownloadFile`）、`chip.spec.tsx`（+2 斷言）、`packages/react/src/components/templates/button-template/card.tsx`（傳 `onSandboxDownloadFile`）、`packages/react/src/utils/dispatch-uri-action.ts`（明確分支）、`dispatch-open-folder.spec.ts`（+2）、`packages/react/src/utils/trigger-blob-download.ts`（新，合併兩份）、`channel-home-download.ts`、`packages/react/src/components/file-explorer/create-sandbox-fs-providers.ts`、`packages/react/src/components/chatbot/chatbot.tsx`（`saveDownloadedFile`、`SandboxDownloadProvider`）、`arrival-bridge-open-folder.spec.tsx`（+1）、`packages/react/src/i18n.ts`（13 key × 3 語系）、`packages/react/README.md`
- demo：沿用 BUILD-088 的 `/sandbox-download` 與 mock（rejoin 補三張 PDF 卡＋同檔第二張卡；`wake-failed` 不送 launch frame）

---

## Execution Log / Change Log

- 2026-10-05: BUILD task created from https://github.com/asgard-ai-platform/asgard-sdk-pm/issues/118 (Status: `draft`). Depends on BUILD-088. Out of scope: agent-hub-web `isArtifactCardMessage` exclusion (spec §8.5), handled in that repo after the SDK release.
- 2026-10-05: Implementation started (Status: `ready → in-progress`).
- 2026-10-05: All R# verified (Status: `in-progress → done`). lint 0 errors（5 warnings 為既有）、format、typecheck（3 projects）、build 綠；test:packages core 448 / react 658。controller 的 5 個守衛各以 mutation 確認有測試會紅（一次性 fallback、run 中不送 nudge、大小比對、consent、連點）。demo `/sandbox-download`（port 4201）寬窄兩側走過：冷 sandbox 連點三張＋同檔第二張 → 1 次 NUDGE、四張同步 waiting → 進度 → Downloaded → 約 2.5s 回 idle、檔案總管未被打開；404 無重試、斷流顯示不完整＋重試、喚醒失敗、metadata 落後（412）→ 1 次 NUDGE 後下載完成、對話進行中 → 0 次 NUDGE、run 結束後下載。
- 2026-10-05: demo 走查抓到兩個 bug，皆先寫會紅的測試再修：(1) 412 退回喚醒後，nudge 自己的 `sandbox.launch` 觸發重拉、仍落後的 metadata 又把 sandbox 列回 → 卡片在喚醒途中再讀一次、又 412、用掉唯一一次機會 → 改為共用喚醒仍 `waking` 時等待卡不開始下載，以喚醒收尾的那次重拉為準；(2) 對話 run 已把 sandbox 帶起來，但 `sandbox.ready` 之後沒有人重拉 metadata，本地清單仍說未啟動 → run 結束時多送一次 nudge → 改為 run 結束時先重拉 metadata 再決定（R8「run 結束仍不在 metadata」照字面問 metadata）。同理，點擊時若本地清單說未啟動也先重拉一次再決定要不要喚醒。
- 2026-10-05: 決定：卡片主區整塊可點（照原型 `SandboxDownloadFileCard` 與 UC-062「點擊下載卡」），不沿用 channel-home 卡「本體不動作、只有下載鈕」的規則——download-file 卡沒有宿主可接管的本體（spec §8.4），兩個 action 也本來就相同。非 idle 時描述行允許換行（chip 家族的單行省略會把狀態訊息切在半句）。
