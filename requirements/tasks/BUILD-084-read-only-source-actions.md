# BUILD-084 Gate clipboard and source editing on the source's providers

## Meta

- Task ID: `BUILD-084`
- Status: `done`
- Issue: [asgard-js-sdk#476](https://github.com/asgard-ai-platform/asgard-js-sdk/issues/476)（issue 開在本 repo，無 PM tracking spec；issue body 的「建議：C ＋ 剪貼簿綁來源」即規格）
- Source spec: 無 PM spec。契約來源是 `FsProviders` 自己的型別註解（`packages/react/src/components/file-explorer/types.ts`）：
  「each omitted capability simply disables the actions that need it … which is how a read-only source is expressed」
- Complexity: `S`

---

## Brief

sandbox `FileExplorer` 以「省略 provider」表達唯讀來源，但有三個入口不看 provider：複製／剪下（只看選取）、
貼上（只看剪貼簿）、檔案檢視的預覽／原始碼切換（只看檔案類型）。沒有 `saveFile` 時原始碼編輯還會在 400ms 後把
dirty 清掉，畫面把沒存的內容當成已存。另外剪貼簿不分來源，在 A 來源剪下、切到 B 來源貼上，會以 B 的 `sourceId`
搬 A 的路徑。

本 task 讓這三個入口改看 provider，並讓剪貼簿記住它來自哪個來源。**不新增 host 要設定的 API**：現場
（`asgard-ai-auto-post-web` ed-chat 素材庫）切到唯讀來源時已經換成一份不含寫入的 providers，改完就自然生效。

**Already exists:** `file-explorer-context.tsx`（`Clipboard`、`actPaste`、`pasteLabel`、context value）、
`file-explorer-parts.tsx`（工具列＋三種右鍵選單）、`file-explorer-tree.tsx`（剪下淡化 `isCut`）、
`file-view.tsx`（`canToggle`、debounced save）。`createSandboxFsProviders` 回傳的 provider 全部必填，走這個工廠的
host 行為不變。

---

## Relevant Rules

| §    | Rule (summary)                                                                      |
| ---- | ----------------------------------------------------------------------------------- |
| §1.1 | No `any` / `as any`                                                                 |
| §1.2 | No `@ts-ignore` / `eslint-disable`                                                  |
| §1.3 | No `console.log` left in library code                                               |
| §1.4 | No hardcoded API key / endpoint / namespace                                         |
| §1.5 | Every RxJS subscription / EventSource / timer has teardown                          |
| §1.6 | core never imports react / react-dom / DOM; react imports core via its public entry |
| §1.7 | **No breaking public-API change without `@deprecated` transition**                  |
| §2.2 | New public types exported from the package entry with explicit `export type`        |
| §3.1 | Exported functions / methods declare explicit return types                          |
| §3.2 | Shared types centralized in `core/src/types/`; no duplicate interfaces              |
| §6   | After implementation: extract repeated logic (≥2×)                                  |
| §7   | No `setTimeout` mock delays, no dead commented code, no untracked TODO / FIXME      |

Extra rows for this task:

| §    | Rule (summary)                                                                                                                                        |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| #476 | `FileExplorerContextValue` 與 `Clipboard` 是公開型別：`setClipboard({ op, entry })` 既有呼叫必須照樣編譯。來源欄位選填，由 context 補上 active source |
| #476 | 不動 `SourceSetFileExplorer`：它有自己的 `readOnly` 與剪貼簿（`use-source-set-explorer.ts`），不在本票範圍                                            |

---

## Acceptance Criteria

- `R1` When the active source has no `copy` provider, the system shall disable "Copy" in the toolbar and in the
  file and directory context menus; with no `move` provider, the same for "Cut". → T2, T5
- `R2` When the clipboard holds an entry, the system shall enable "Paste" only if the entry was taken from the
  active source **and** the provider its operation needs (`copy` for copy, `move` for cut) is present — in the
  toolbar and in the directory and background context menus alike. → T1, T2, T5
- `R3` When `actPaste` is called while R2 would disable Paste, the system shall make no provider call, so a
  host calling the context action directly cannot reach the other source either. → T1, T5
- `R4` When the user switches away from the source an entry was cut or copied in and back again, the system
  shall still hold that clipboard and allow pasting it there; while another source is active, the tree shall
  not dim a same-path entry as cut, and the paste label shall not name the foreign entry. → T1, T3, T5
- `R5` When a host calls `setClipboard({ op, entry })` without a source, the system shall attribute the entry to
  the active source — the existing public call shape keeps compiling and behaving as before. → T1, T5
- `R6` When the file view has no `onSaveFile`, the system shall not offer the preview/source toggle, and shall
  render the file read-only even if it had been switched to source mode before the provider went away. → T4, T6
- `R7` (Smoke check) When the developer runs `lint:packages`, `format:check`, `typecheck`, `build:core`,
  `build:react` and `test:packages`, all shall pass; and in the react-demo (`npm run serve:react-demo`) an
  explorer with one writable and one read-only source shall show the gated actions at both widths. → T7

---

## Implementation Tasks

- [x] T1 (R2, R3, R4, R5): context — `Clipboard` 加選填 `sourceId`；`setClipboard` 包一層補上 active source；
      新增 `canCopy`／`canCut`／`canPaste` 到 context value；`actPaste` 以 `canPaste` 守門；`pasteLabel` 只在
      `canPaste` 時帶名稱。
- [x] T2 (R1, R2): parts — 工具列與三種右鍵選單改用 `canCopy`／`canCut`／`canPaste`。
- [x] T3 (R4): tree — `isCut` 加比對來源。
- [x] T4 (R6): file view — `canToggle` 需要 `onSaveFile`；沒有時以 preview 呈現。
- [x] T5 (R1–R5): react Vitest — 新 spec 覆蓋工具列／選單停用、跨來源貼上、`actPaste` 守門、`setClipboard` 相容。
- [x] T6 (R6): react Vitest — `file-view-modes.spec.tsx` 補沒有 `onSaveFile` 的案例。
- [x] T7 (R7): demo（`/file-explorer` 新增「唯讀來源（#476）」寬窄並排一節）＋ README 新增〈Read-only sources〉＋ 全套閘門。

---

## Coverage

Use Cases: `R1`–`R7`。R1–R5 由 `read-only-source-actions.spec.tsx`（8 案，其中 5 案在改動前失敗），R6 由
`file-view-modes.spec.tsx` 新增的 3 案（改動前皆失敗），R7 由閘門與 `/file-explorer` demo 寬窄兩個面板各走一輪。

Files:

| File (package)                                                                  | Change                                                                                                         |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `packages/react/src/components/file-explorer/file-explorer-context.tsx`         | `Clipboard.sourceId?`；`setClipboard` 補 active source；`canCopy`／`canCut`／`canPaste`；`actPaste` 守門（T1） |
| `packages/react/src/components/file-explorer/file-explorer-parts.tsx`           | 工具列與三種右鍵選單改用 `canCopy`／`canCut`／`canPaste`（T2）                                                 |
| `packages/react/src/components/file-explorer/file-explorer-tree.tsx`            | `isCut` 比對來源（T3）                                                                                         |
| `packages/react/src/components/file-explorer/file-view.tsx`                     | `canToggle` 需要 `onSaveFile`；沒有時固定 preview（T4）                                                        |
| `packages/react/src/components/file-explorer/read-only-source-actions.spec.tsx` | 新檔 — R1–R5（T5）                                                                                             |
| `packages/react/src/components/file-explorer/file-view-modes.spec.tsx`          | harness 帶 `saveFile`；新增 R6 三案（T6）                                                                      |
| `packages/react/README.md`                                                      | 新增〈Read-only sources〉（T7）                                                                                |
| `apps/react-demo/src/app/routes/file-explorer/file-explorer.tsx`                | 新增唯讀來源寬窄並排一節（T7）                                                                                 |

**公開 API 影響（§1.7）**：全部 additive。`Clipboard` 多一個選填欄位；`FileExplorerContextValue` 多三個唯讀布林。
行為變更只落在「沒給對應 provider」的 host：`createSandboxFsProviders` 的 provider 全部必填，走工廠的 host 不受影響。

---

## Execution Log

- 2026-09-24: BUILD task created from [asgard-js-sdk#476](https://github.com/asgard-ai-platform/asgard-js-sdk/issues/476) (Status: `draft`).
- 2026-09-24: Plan confirmed; implementation started (Status: `draft → ready → in-progress`).
- 2026-09-24: Build complete — lint / format / typecheck / build / test（core 430、react 606）全綠；demo 寬窄各走一輪，R1–R6 皆符合 (Status: `in-progress → done`).
