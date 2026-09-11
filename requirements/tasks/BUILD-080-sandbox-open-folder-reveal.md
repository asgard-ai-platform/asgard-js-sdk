# BUILD-080 Sandbox open-folder card and directory reveal

## Meta

- Task ID: `BUILD-080`
- Status: `done`
- Issue: [asgard-sdk-pm#102](https://github.com/asgard-ai-platform/asgard-sdk-pm/issues/102)
- Source spec: `references/asgard-sdk-pm/tracking/asgard-js-sdk/features/F-034-sandbox-open-folder-卡片與檔案總管目錄-reveal.md`
  （UC-060、UC-061；UI 權威＝ prototype pinned @ `38cf0f5`）
- Complexity: `L`

---

## Brief

Agent 手上原本只有一張路徑卡 —— `sandbox://<name>/open-file?absolute_path=`。要請使用者看**一整個資料夾**時，
它只能把檔案卡指向目錄，而 SDK 照 open-file 語意把它送進 FileView（`GET fs/file` + 掛 `GET fs/watch`），
後端對目錄兩者一律拒絕 ⇒ 使用者點下去的卡片不可能成功（2026-09-09 agent-hub 正式站：`fs/file` 回 500
`path is a directory`、`fs/watch` 連線直接斷）。後端已出貨 `open_sandbox_folder`，推
**`sandbox://<name>/open-folder?absolute_path=`**（[asgard-core#288](https://github.com/asgard-ai-platform/asgard-core/pull/288)，DEV 已部署）；
在 SDK 認得它之前，`resolveSandboxUri()` 對未知 action 回 `null`（UC-036 既定行為），所以這張新卡在前端是
**安靜的 no-op**。

本 task 把它接起來，動 core + react + demo：core 的 `resolveSandboxUri()` 多一個 `open-folder` 分支；
react 的 uri dispatcher 多一條分支與 `onSandboxOpenFolder` 宿主 callback（對標 `onSandboxOpenFile`）；
File Explorer controller 的 reveal 請求帶上 `kind`（檔／目錄）並新增 `requestFolder()`；provider 的 reveal
effect 依 `kind` 決定終點 —— folder 展開祖先**與該目錄自己** + 選取 + 停在樹上（不 `readFile`、不 `watchFile`、
FileView 要關掉）。同時補上一直存在卻沒被表達過的狀態：**卡片指向樹根外**時不發任何 fs 請求，並在面板上
明講「這個位置不在目前的工作目錄裡」＋那條路徑＋關閉鈕（UC-061）。

**Already exists:**
`packages/core/src/lib/resolve-sandbox-uri.ts`（`SandboxUriIntent`、open-browser／open-file 分支）、
`packages/core/src/lib/resolve-sandbox-uri.spec.ts`、
`packages/react/src/utils/dispatch-uri-action.ts`（`DispatchUriActionOptions`、open-file 分支）、
`packages/react/src/context/asgard-template-context.tsx`（`onSandboxOpenFile` 與其 provider props）、
`packages/react/src/components/chatbot/chatbot.tsx`（`handleSandboxOpenFile`、`autoRevealOnOpenFileCard`）、
`packages/react/src/components/chatbot/chatbot-file-explorer.tsx`（`FileExplorerArrivalBridge` 到站掃描）、
`packages/react/src/hooks/use-file-explorer-controller.ts`（`RequestedFile`、`requestFile`、per-source view state）、
`packages/react/src/components/file-explorer/file-explorer-context.tsx`（reveal effect，目前寫死 `isDir: false`）、
`packages/react/src/components/file-explorer/paths.ts`（`ancestorDirs`、`baseName`）、
`packages/react/src/components/file-explorer/file-explorer-parts.tsx`（`FileExplorerWorkspace` 等零件）、
`packages/react/src/components/file-explorer/icons.tsx`（`FolderOpenIcon`，lucide folder-open 同一條 path）、
`packages/react/src/components/templates/attachment-template/chip.tsx`（glyph 跟著 action 走，BUILD-029）、
`apps/react-demo/src/app/routes/sandbox-cards/`、`apps/react-demo/src/app/routes/file-explorer/`。

---

## Relevant Rules

| §    | Rule (summary)                                                                                            |
| ---- | --------------------------------------------------------------------------------------------------------- |
| §1.1 | No `any` / `as any` — use precise types, generics, or `unknown` + narrowing                               |
| §1.2 | No `@ts-ignore` / `eslint-disable` to bypass type or lint errors                                          |
| §1.3 | No `console.log` left in library code                                                                     |
| §1.4 | No hardcoded API key / endpoint / namespace                                                               |
| §1.5 | Every RxJS subscription / EventSource / timer has teardown                                                |
| §1.6 | `@asgard-js/core` never imports `react` / `react-dom` / DOM; react imports core via its public entry only |
| §1.7 | No breaking public-API change without `@deprecated` transition                                            |
| §2.2 | New public types / functions / components exported from the package entry with explicit `export type`     |
| §2.3 | Types in `core/src/types` / `constants` exist before first use                                            |
| §2.4 | Use `botProviderEndpoint`, not the deprecated `endpoint`                                                  |
| §3.1 | Exported functions / methods declare explicit return types                                                |
| §3.2 | Shared types centralized in `core/src/types/`; no duplicate interfaces across files                       |
| §4.1 | React component props fully typed (no `any`)                                                              |
| §4.2 | No hardcoded color values in components — theme via CSS variables / theme context                         |
| §4.4 | `react` / `react-dom` stay peerDependencies                                                               |
| §5   | `@asgard-js/core` and `@asgard-js/react` keep the same version number                                     |
| §6   | After implementation: extract repeated logic (≥2×), duplicate types, repeated JSX (≥3×)                   |
| §7   | No `setTimeout` mock delays, no `console.log`, no dead commented code, no untracked TODO / FIXME          |

Extra rows for this task:

| §    | Rule (summary)                                                                                                                       |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------ |
| §5.3 | 所有新面板文案走 `t()`，三語（`en-US` / `ja-JP` / `zh-TW`）同步 —— 本 repo 自帶 catalog（`packages/react/src/i18n.ts`），不進 Tolgee |
| UI   | 原型（`38cf0f5`）是視覺權威：folder 卡與開檔卡**同一族**，只換資料夾圖示；越界提示為 warning 色系的一列 notice + 關閉鈕              |

---

## Acceptance Criteria

EARS form。括號內為 F-034 的對應 AC。

- `R1` (AC1) When `resolveSandboxUri()` is given `sandbox://<name>/open-folder?absolute_path=<abs>`, the system shall
  return `{ kind: 'open-folder', sandboxName, absolutePath }` with the path percent-decoded; when `absolute_path` is
  missing it shall return `null` (the same rule as `open-file`), and any other unknown action shall still return `null`. → T1
- `R2` (AC2) When a dispatched uri action resolves to `open-folder`, the system shall call the host's
  `onSandboxOpenFolder(sandboxName, absolutePath)` and shall never `window.open()` the raw `sandbox://` uri;
  with no handler wired the click shall be a no-op. → T2, T3
- `R3` (AC3) When `controller.requestFolder(sourceId, absolutePath)` is called, the system shall publish a reveal
  request carrying `kind: 'folder'`; `controller.requestFile(...)` shall publish `kind: 'file'`. Both shall keep the
  existing `reveal` option (F-021 AC9 notify-not-force). → T4
- `R4` (AC4, AC5) When a `kind: 'folder'` reveal request arrives for the active source and its path is under the tree
  root, the File Explorer shall expand every ancestor directory **and that directory itself**, select it, close any
  open FileView, and stay on the tree — making no `readFile` and no `watchFile` call. The destination shall be decided
  by the request's `kind` alone; there shall be no "try it as a file, fall back to a folder" path. → T5
- `R5` (AC6) When an ATTACHMENT chip's default action is an `open-folder` uri, the chip shall show the folder glyph
  (`open-file` keeps the document glyph, `open-browser` the globe) with no other visual difference. → T6
- `R6` (AC7) When a reveal request (file **or** folder) targets a path outside the tree root, the system shall not
  expand, not select, and issue no fs request, and shall show a dismissible panel notice naming that absolute path;
  the tree / FileView the user was looking at shall stay untouched. Containment shall be decided segment-wise, so
  `/work` does not swallow `/workspace/x`. → T7, T8
- `R7` (AC7 ALT1–ALT3) When the user dismisses the notice, or switches source, or a later in-root reveal request
  arrives, the system shall clear the notice. → T7, T8
- `R8` (AC8) When a message carrying an `open-folder` card arrives, the arrival bridge shall fire the folder intent
  once per (message, uri) without a click, and shall not fire again for the same card. → T9
- `R9` (AC9) When the user leaves a source after a folder reveal and returns to it, the expanded directories and the
  selection shall still be there (F-027 per-source view state). → T5
- `R10` (§5.3) When any new panel text is rendered, it shall come from `t()` with `en-US` / `ja-JP` / `zh-TW` entries
  present, and no user-facing literal shall sit in JSX. → T7
- `R11` (Smoke check) When the developer runs `npm run build:core && npm run build:react`, the Vitest suites, and
  walks the demo (`npm run serve:react-demo -- -- --port 5100`) at **both** widths — wide full-bleed and 343px — the
  open-folder card shall reveal the directory on the tree, the out-of-root card shall show the notice and fire no fs
  request, and no build / type / lint error shall appear. → T10, T11

---

## Implementation Tasks

- [x] T1 (R1): `packages/core/src/lib/resolve-sandbox-uri.ts` — add `{ kind: 'open-folder'; sandboxName; absolutePath }`
      to `SandboxUriIntent` and fold the `open-file` / `open-folder` branches into one shared `absolute_path` rule;
      extend `resolve-sandbox-uri.spec.ts`.
- [x] T2 (R2): `packages/react/src/utils/dispatch-uri-action.ts` — add `onSandboxOpenFolder` to
      `DispatchUriActionOptions` and a dispatch branch for the folder intent.
- [x] T3 (R2): thread the new callback through `asgard-template-context.tsx` (context value + provider props),
      `chip.tsx`, `card.tsx`, and `<Chatbot>` props; add `handleSandboxOpenFolder` mirroring `handleSandboxOpenFile`.
- [x] T4 (R3): `use-file-explorer-controller.ts` — add `kind: 'file' | 'folder'` to `RequestedFile` and a
      `requestFolder(sourceId, absolutePath, options?)` action sharing one private `request()` helper with `requestFile`.
- [x] T5 (R4, R9): `file-explorer-context.tsx` reveal effect — branch on `rf.kind`: folder expands ancestors + itself,
      sets a `selectedEntry` with `isDir: true`, and sets `openFile: null`; file keeps today's FileView destination.
- [x] T6 (R5): add `packages/react/src/icons/folder-open.svg` (lucide folder-open, same path as `FolderOpenIcon`) and
      resolve the chip glyph from the intent kind instead of the current `isOpenBrowser` boolean.
- [x] T7 (R6, R7, R10): `paths.ts` — add `isUnderRoot(root, path)` (segment-wise) and make `ancestorDirs` use it;
      provider holds `outOfRoot` state, cleared on source change / dismissal / a later in-root reveal; new
      `FileExplorerNotice` part rendered at the top of `FileExplorerWorkspace` and exported as `FileExplorer.Notice`;
      i18n keys in three locales.
- [x] T8 (R6, R7): Vitest — reveal effect for folder / file / out-of-root (assert `readFile` and `watchFile` are never
      called for a folder, and no provider call at all for an out-of-root path).
- [x] T9 (R8): `chatbot-file-explorer.tsx` — the arrival scan accepts both `open-file` and `open-folder` and routes
      each to its own handler, keeping the once-per-(message, uri) guard.
- [x] T10: `npm run lint:packages` + `npm run format:check` + `npm run typecheck` + `npm run build:core && npm run build:react` + `npm run test:packages`.
- [x] T11 (R11): demo — add an `open-folder` card (and an out-of-root card) to `/sandbox-cards`, and
      "模擬 open-folder 卡片" / "模擬樹根外的卡片" buttons to `/file-explorer`, rendered at both widths; walk every R#
      in the browser. Screenshots go to `local-verification`, **not** into the repo.

---

## Coverage

Use Cases: R1–R11（UC-060、UC-061；F-034 AC1–AC9）

Files:

**`@asgard-js/core`**

- `packages/core/src/lib/resolve-sandbox-uri.ts` — `open-folder` 加進 `SandboxUriIntent`；兩個帶路徑的 action
  收斂成一條共用規則（`PATH_ACTIONS` + `isPathAction`），不讓它們各寫一次 `absolute_path` 檢查
- `packages/core/src/lib/resolve-sandbox-uri.spec.ts` — +5 案

**`@asgard-js/react`**

- `packages/react/src/utils/dispatch-uri-action.ts` — `onSandboxOpenFolder` + folder 分派分支
- `packages/react/src/context/asgard-template-context.tsx` — context value / provider props / 預設值
- `packages/react/src/components/chatbot/chatbot.tsx` — `onSandboxOpenFolder` prop、`handleSandboxOpenFolder`、
  到站橋接改傳兩個 handler
- `packages/react/src/components/chatbot/chatbot-file-explorer.tsx` — `FileExplorerArrivalBridge` 認得兩種卡，
  props 由 `onIntent` 改為 `onFileIntent` / `onFolderIntent`
- `packages/react/src/hooks/use-file-explorer-controller.ts` — `RequestedFile.kind`、`requestFolder()`、
  共用的私有 `request()`
- `packages/react/src/components/file-explorer/file-explorer-context.tsx` — reveal effect 依 `kind` 分岔、
  越界 `outOfRoot` 狀態 + `dismissOutOfRoot`、換 source 時清掉
- `packages/react/src/components/file-explorer/paths.ts` — 新 `isUnderRoot()`（逐段），`ancestorDirs` 改用它
- `packages/react/src/components/file-explorer/file-explorer-parts.tsx` — 新 `FileExplorerNotice`，掛在
  `FileExplorerWorkspace` 最上方
- `packages/react/src/components/file-explorer/file-explorer-panel.module.scss` — notice 樣式（`--asg-color-warning`）
- `packages/react/src/components/file-explorer/index.ts` — 導出 `FileExplorer.Notice`
- `packages/react/src/components/templates/attachment-template/chip.tsx` — glyph 由 intent kind 決定
- `packages/react/src/components/templates/button-template/card.tsx` — 轉傳新 callback
- `packages/react/src/icons/folder-open.svg` — 新增（lucide folder-open，與 `FolderOpenIcon` 同一條 path）
- `packages/react/src/i18n.ts` — `fileExplorer.outOfRoot` / `fileExplorer.outOfRootDismiss` × 3 語

**測試（新增 26 案）**

- `packages/react/src/components/file-explorer/folder-reveal.spec.tsx`（11）
- `packages/react/src/components/file-explorer/paths-under-root.spec.ts`（6）
- `packages/react/src/utils/dispatch-open-folder.spec.ts`（4）
- `packages/react/src/components/chatbot/arrival-bridge-open-folder.spec.tsx`（3）
- `packages/react/src/components/templates/attachment-template/chip.spec.tsx`（+2）

**demo（不進套件）**

- `apps/react-demo/src/app/routes/file-explorer/file-explorer.tsx` — F-034 寬窄並排區塊、三顆模擬卡按鈕、
  巢狀 mock 目錄、`LocaleSwitch` 抽出並套用到這一段
- `apps/react-demo/src/app/routes/sandbox-cards/sandbox-cards.tsx` — 第三張卡（open-folder）、
  `onSandboxOpenFolder` 記錄、`initMessages` memo 化（見下方「順修」）

---

## Decisions

<!-- 開工前先記，避免事後才補。 -->

1. **`RequestedFile.kind` 設為必填，不設選填。** 它的唯一生產者是 controller 自己（`requestFile` / `requestFolder`），
   消費者只讀不寫 —— 已查過下游：`asgard-ai-agent-hub-web` 只呼叫 `controller.requestFile(...)`，沒有任何地方自行
   組 `RequestedFile`。選填會讓「第二個寫入點什麼都不填」編譯得過，而那正是這張票要修掉的形狀（BUILD-079 記過同一件事）。
2. **folder reveal 會寫 `selectedEntry`（`isDir: true`），file 分支一併補上。** 原型 `FileExplorerPanel.tsx` 對兩者
   都 `setSelectedEntry(entry)`；現行 SDK 只寫 `selectedPath`，於是 reveal 之後工具列的 `targetDir` 仍指向上一次選到的
   目錄。UC-060 的 Postcondition 要求「使用者可直接在樹上對該目錄做既有操作」，那就需要 `selectedEntry`。
3. **沿用既有的 `autoRevealOnOpenFileCard`，不新增第二個開關。** 它的語意是「卡片到站要不要把面板拉出來」，
   對兩種卡一致；新增 `autoRevealOnSandboxCard` 只會製造兩個必須同步的旗標。
4. **越界提示（`outOfRoot`）放 provider、零件放 `FileExplorerWorkspace`。** 這樣自組零件的宿主（Sindri 的
   SourceSet explorer）不必各自實作一次；同時 export 成 `FileExplorer.Notice` 供自訂版面擺放。
5. **順修一個既有的 demo 缺陷（不在原定範圍）。** `/sandbox-cards` 的 `initMessages` 每次 render 都用
   `nanoid()` 重新產生 message id，而 `botProviderEndpoint: 'skip'` 是 preview 模式、`initMessages` 一換
   identity 就重建 conversation ⇒ 到站掃描（鍵為 message id + uri）每次都看到「新卡」，log 無限增長
   （未改動的版本實測 2.5 秒內 390 筆）。這是既有缺陷、不是本次造成，但**它會讓 AC8「同一張卡不重複觸發」
   無法判讀**，所以在同一個檔案裡以 `useMemo` 修掉。SDK 側不改：以 (message id, uri) 去重是對的，
   真正換了一則訊息就該再觸發一次。

6. **demo 的 `/file-explorer` 補上整條路徑的走查。** 原本兩個 demo 面只能各證明一半（`/sandbox-cards` 證
   卡片 → 宿主 callback，`/file-explorer` 的獨立面板證 controller → 面板）。內建 aside 那個頻道本來就有一台
   live sandbox，所以把兩張 `open-folder` 卡加進它的 transcript 重播，一次走完「卡片抵達 → `resolveSandboxUri`
   → 宿主 handler → 共用 controller → aside」。**不是用 `initMessages` 種**：那個頻道在 metadata mock 裡已存在，
   SDK 走 restore 路徑，只有 init 路徑會讀 `initMessages`。附帶好處是 mock 的 fs 是真的 HTTP 端點，於是
   「對目錄不打 `fs/file`／`fs/watch`」有了請求紀錄可查（只有三支 `fs/list`）。
7. **`/sandbox-cards` 關掉卡片到站時的自動拉開側欄（`autoRevealOnOpenFileCard={false}`）。** 那一頁的 shell 是
   預設 theme 的 375px，側欄一開就吃掉 `max-width: 60%` ＝ 225px，對話區只剩 150px、卡片標題被截成「開啟…」。
   這是既有行為（F-021 AC9，開檔案卡也一樣），不是本票造成；但那一頁存在的理由就是看卡片。intent 仍照常在
   到站時觸發，所以 AC8 的證據沒有變弱。**SDK 側不改**——窄 shell 上自動拉開側欄是否合適，是 F-021 的設計問題，
   不該在這張票裡順手改掉。
8. **下游跟版不在本票。** `asgard-ai-agent-hub-web` 目前自行接 `onSandboxOpenFile` → `requestFile`，
   要吃到資料夾卡得等本 SDK 發版後另外接 `onSandboxOpenFolder` → `requestFolder`。issue #102 的「下游評估」
   以另開票處理，不混進這個 cycle。

---

## Execution Log / Change Log

- 2026-09-11: BUILD task created from [asgard-sdk-pm#102](https://github.com/asgard-ai-platform/asgard-sdk-pm/issues/102) (Status: `draft`).
- 2026-09-11: Plan confirmed by the user (Status: `draft → ready`); implementation started on `feat/102-sandbox-open-folder-reveal` (Status: `ready → in-progress`).
- 2026-09-11: T1–T11 done. `lint:packages` 0 errors（5 個既有 warning，皆不在本次改動的檔案）、
  `format:check` 全綠、`typecheck` 三個 project 全綠、`build:core` + `build:react` 無錯、
  `test:packages` core 324 / react 511（+26）全綠。四項反向驗證各自確認新測試會紅：
  忽略 `kind` → folder 三案紅；拿掉越界守衛 → 越界五案紅；core 還原 → 3 案紅；
  `ancestorDirs` 改回 `startsWith` → prefix 那案紅（且會憑空產出 `/work/space` 這種祖先）。
  瀏覽器實走 `/file-explorer`（寬 + 343px 窄並排）與 `/sandbox-cards`（Status: `in-progress → done`）。
- 2026-09-11: 產驗收文件時把兩個 demo 缺口補掉（見 Decisions 6／7），整條卡片 → aside 路徑改成一次走完，
  並取得「只有三支 `fs/list`、零 `fs/file`／`fs/watch`」的實際請求紀錄。重跑全部閘門仍全綠
  （react 512 案）。驗收文件：`local-verification/asgard-js-sdk/F-034-sandbox-open-folder-reveal.html`。
