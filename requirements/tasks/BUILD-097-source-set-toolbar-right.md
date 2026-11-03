# BUILD-097 Add a toolbarRight slot and hide the toolbar while a file is open

## Meta

- Task ID: `BUILD-097`
- Status: `done`
- Issue: [asgard-sdk-pm#98](https://github.com/asgard-ai-platform/asgard-sdk-pm/issues/98)（形狀見 2026-10-06 回覆：[留言](https://github.com/asgard-ai-platform/asgard-sdk-pm/issues/98#issuecomment-6009571407)「`toolbarRight?: ReactNode`……開檔檢視時整條工具列不顯示……直接改成預設行為，不另加開關」）
- Source spec: issue body 即規格；形狀權威為 chat-kit prototype `src/SourceSetFileExplorer.tsx`（[chat-kit#21](https://github.com/asgard-ai-platform/asgard-chat-kit-prototype/pull/21)，`.ssfe-toolbar-right`），消費端畫面為 `asgard-odin-pm-design` `src/app/components/FilesPanel.tsx`（PR #33 `14003b0` 起）
- Complexity: `S`

---

## Brief

Odin 的 Drive / Skillset Files tab 要把「Open in Advance Editor」（唯讀時再加「Read-only」標示與「Edit」鈕）放進 `SourceSetFileExplorer` 工具列的右端，並且開檔檢視時整條工具列不顯示（asgard-odin-pm 決議 `2026-08-28-drive-list-and-files-redesign`）。`@asgard-js/react` 目前沒有這個插槽，工具列在開檔時也一直畫著。

做法：

1. 新增 `toolbarRight?: ReactNode`，渲染在工具列內建按鈕（與 busy spinner）之後、靠右對齊，與內建按鈕之間有一條分隔線（照 prototype `.ssfe-toolbar-right`）。不傳就不多出任何元素；**不受 `readOnly` 影響**。
2. 開檔檢視（`openFile` 非空）時不渲染整條工具列，`toolbarRight` 一起藏起來。檔案檢視自己的標頭已有返回、重新載入、下載、編輯切換，不少任何操作；回到檔案樹工具列就回來。這是**預設行為、不加開關**——Sindri 資源面板與 Mimir 資源抽屜開檔時也會跟著藏工具列，10/06 已在票上明講，有意見再改成可選。

`source-set-file-explorer.tsx:319` 的 Esc 註解已經寫著「開檔時工具列卸載」，實際上一直沒卸載；這次改完它才成立，不需要改註解。

**不在範圍**：`FileExplorer`（聊天側欄那套）——它開檔時本來就不畫工具列（`file-explorer-parts.tsx:253`），也沒有消費端要插槽。

**Already exists:** `source-set-file-explorer.tsx`、`source-set-explorer.module.scss`、`source-set-explorer.spec.tsx`、react README〈SourceSetFileExplorer〉props 表、react-demo `/source-set-explorer`。

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

- `R1` When the host passes `toolbarRight`, the system shall render it inside the toolbar after every built-in button, aligned to the toolbar's right end and set off by a divider; when the host does not pass it, the toolbar shall render exactly as before, with no extra element. → T1, T2, T4
- `R2` While `readOnly` is true, the system shall still render `toolbarRight`. → T1, T4
- `R3` While a file is open in the file view, the system shall not render the toolbar, `toolbarRight` included; when the user goes back to the tree, the toolbar shall return with the previous selection still applied. The file view's own back, reload, download and edit controls shall be unchanged. → T1, T4
- `R4` At the narrow (320px, the demo's aside) and full-bleed widths, `toolbarRight` shall stay inside the panel: on a wide panel it sits at the right end of the button row, and on a narrow one it wraps to its own line and still aligns right, with no horizontal overflow. → T2, T5
- `R5` The `toolbarRight` JSDoc and the react README props table shall describe the slot, that `readOnly` does not hide it, and that the whole toolbar hides while a file is open. → T3
- `R6` (Smoke check) When the developer runs `npm run lint:packages`, `npm run format:check`, `npm run typecheck`, `npm run build:core && npm run build:react` and `npm run test:packages`, and walks R1–R4 in the react-demo `/source-set-explorer` (`npm run serve:react-demo -- -- --port 5100`, wide and narrow side by side), the system shall show the behaviour above with no build or type errors. → T5, T6

---

## Implementation Tasks

- [x] T1 (R1, R2, R3): `source-set-file-explorer.tsx` — add `toolbarRight?: ReactNode` with JSDoc; render it after the spinner in a wrapper; render the toolbar only while `openFile` is null. The file view's `key` drops `refreshToken` (and the hook drops the field): only the toolbar and the context menu call `refresh`, and neither is on screen while a file is open, so the token could no longer change under an open file — the view's own reload is what re-reads it now.
- [x] T2 (R1, R4): `source-set-explorer.module.scss` — `.toolbarRight`: `margin-left: auto`, divider on the left (`--asg-color-border` token), its own gap.
- [x] T3 (R5): react README — `toolbarRight` row in the props table; one paragraph on the toolbar hiding while a file is open; the "no watch" paragraph now says an open file is re-read by the viewer's own reload.
- [x] T4 (R1, R2, R3): `source-set-explorer.spec.tsx` — slot renders inside the toolbar; absent slot adds nothing; renders while `readOnly`; opening a file removes the toolbar and the slot, back restores both and the selection. `batch-upload.spec.tsx`'s "refuses a drag while a file is open" found the panel root through the toolbar, so it now takes the root before opening.
- [x] T5 (R4, R6): react-demo `/source-set-explorer` — `toolbarRight` switch (on by default) passes Odin's set on both mounts: `Open in Advance Editor`, plus `Read-only` and an `Edit` button (turns `readOnly` off) while `readOnly`; measure no overflow at both widths.
- [x] T6 (R6): Run `npm run lint:packages` + `npm run format:check` + `npm run typecheck` + `npm run build:core && npm run build:react` + `npm run test:packages`; walk R1–R4 in the demo.

---

## Coverage

Use Cases: R1, R2, R3, R4, R5, R6
Files:

- `packages/react/src/components/source-set-explorer/source-set-file-explorer.tsx`（react）— `toolbarRight` prop 與 JSDoc；開檔時不渲染工具列；檔案檢視 `key` 去掉 `refreshToken`
- `packages/react/src/components/source-set-explorer/source-set-explorer.module.scss`（react）— `.toolbarRight`：`margin-left: auto`、左側分隔線
- `packages/react/src/components/source-set-explorer/use-source-set-explorer.ts`（react，內部 hook）— 移除已無作用的 `refreshToken`
- `packages/react/src/components/source-set-explorer/source-set-explorer.spec.tsx`（react）— asgard-sdk-pm#98 四個案例
- `packages/react/src/components/source-set-explorer/batch-upload.spec.tsx`（react）— 開檔前先取得面板根節點
- `packages/react/README.md` — props 表 `toolbarRight`、開檔隱藏工具列段落、「沒有 watch」段落
- `apps/react-demo/src/app/routes/source-set-explorer/source-set-explorer.tsx`、`source-set-explorer.module.scss`（demo）— `toolbarRight` 開關與 Odin 那組按鈕

---

## Execution Log / Change Log

- 2026-11-03: BUILD task created from https://github.com/asgard-ai-platform/asgard-sdk-pm/issues/98 (Status: `draft`).
- 2026-11-03: Plan confirmed; implementation started (Status: `draft → ready → in-progress`).
- 2026-11-03: Tests first — three of the four new cases red before the change (the "adds nothing" case already held). Mutation: putting the toolbar back while a file is open turns the hide case red. lint 0 errors, format, typecheck (core + react + demo), build green; core 458, react 723. Demo walked at 320px and full-bleed: slot at the right end (wide) / wrapped and right-aligned (narrow), no overflow; `Read-only` + `Edit` while `readOnly`, `Edit` turns it off; opening `greet.ts` removes toolbar and slot, back restores both with `greet.ts` still selected (Status: `in-progress → done`).
