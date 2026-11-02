# BUILD-096 Clear the FileExplorer clipboard when its source goes away or the conversation changes

## Meta

- Task ID: `BUILD-096`
- Status: `done`
- Issue: [asgard-js-sdk#482](https://github.com/asgard-ai-platform/asgard-js-sdk/issues/482)（issue 開在本 repo，無 PM tracking spec；issue body 即規格。本 task 只做第 1 項，第 2、3、4 項已由 BUILD-091 完成）
- Source spec: 無 PM spec。語意於 2026-11-02 決定：**來源從清單消失、或換對話時，清空剪貼簿**；只清剪貼簿，其他狀態（開檔、展開、上傳佇列）不動。
- Complexity: `S`

---

## Brief

剪貼簿只以 `sourceId` 字串認來源，而 sandbox 名稱以 channel 為單位、會在不同對話裡重複使用。於是在對話 1 的 `sbx` 剪下 `/work/a.txt`、切到同樣有 `sbx` 的對話 2，貼上仍可按，按下去會在對話 2 的 sandbox 搬一個不屬於它的路徑。來源從 `sources` 被移除後剪貼簿也一直留著，同 id 再出現時貼上又會啟用。

做法分兩半：

- **來源消失**：`FileExplorerProvider` 在 `sources` 不再包含 `clipboard.sourceId` 時清空剪貼簿。之後同 id 再出現，剪貼簿已經是空的。
- **換對話**：`sources` 看不出「同名但已是另一個對話」，所以由宿主告訴 Provider。新增選填 prop `clipboardScope?: string`（`FileExplorerProvider` 與 `FileExplorerPanel`），值一變就清空剪貼簿；不傳時行為與現在相同。內建側欄傳 `customChannelId`。不用 `key` 重掛，是因為重掛會一併丟掉上傳佇列與開檔狀態（Sindri 的面板也因為同樣原因刻意不用 `key={conversationId}`）。

自己組裝檔案總管的宿主（例：Sindri 的 `FileExplorer.Provider`）傳一行 `clipboardScope={conversationId}` 即可；README 與 JSDoc 寫明。

**不在範圍**：`SourceSetFileExplorer` 自己的剪貼簿。消費端接上 `clipboardScope` 由各自的 repo 在 SDK 發版後處理。

**Already exists:** `file-explorer-context.tsx`（`Clipboard`、`setClipboardState`、補 `sourceId` 的 `useLayoutEffect`、`canPaste`）、`file-explorer-panel.tsx`（把 props 轉給 Provider）、`chatbot-file-explorer.tsx`（內建側欄，已從 `useAsgardContext()` 取得 `customChannelId`）、`clipboard-follow-ups.spec.tsx`（剪貼簿測試 harness，可沿用）。

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

- `R1` When `sources` no longer contains the clipboard's `sourceId`, the context shall clear the clipboard; when a source with that id appears again afterwards, paste shall stay disabled. → T1, T2
- `R2` When `clipboardScope` changes, the context shall clear the clipboard, while the open file, the expanded folders and an upload in flight are unaffected. → T1, T2
- `R3` When `clipboardScope` stays the same or is omitted and every source stays listed, clipboard behaviour shall be unchanged: switching to another source disables paste, switching back enables it again (#476), and BUILD-091 R1–R4 still hold. → T1, T2
- `R4` When the built-in aside of `<Chatbot>` moves to another conversation (`customChannelId` changes) whose sandbox reuses the same name, the clipboard shall be empty and paste disabled. → T1, T3
- `R5` `clipboardScope` shall be documented on `FileExplorerProvider` / `FileExplorerPanel` (JSDoc) and in the react README's File Explorer section, including the one line a host that assembles its own explorer adds. → T4
- `R6` When the developer runs lint / format / typecheck / build / `test:packages` and walks the react-demo `/file-explorer` at both the narrow and the full-bleed shell (removing a source, changing the scope, plain source switching), the behaviour above shall be observable with no build errors. → T5

---

## Implementation Tasks

- [x] T1 (R1–R4): Vitest first — clipboard cleared when its source leaves `sources` and stays empty when the id returns; cleared when `clipboardScope` changes, with open file / expanded state / upload queue intact; unchanged when the scope is stable or omitted; built-in aside clears across a `customChannelId` change with the same sandbox name. Confirm the new cases fail before T2/T3.
- [x] T2 (R1–R3): `file-explorer-context.tsx` — clear when the clipboard's source leaves `sources`; add optional `clipboardScope` and clear when it changes. `file-explorer-panel.tsx` — accept and forward `clipboardScope`.
- [x] T3 (R4): `chatbot-file-explorer.tsx` — pass `customChannelId` as `clipboardScope`.
- [x] T4 (R5): JSDoc on both props and the `Clipboard` type; react README File Explorer section.
- [x] T5-1: Run `npm run lint:packages` + `npm run format:check` + `npm run typecheck` + `npm run build:core && npm run build:react` + `npm run test:packages`
- [x] T5 (R6): Demo `/file-explorer` — add controls to remove a source and to change the scope if the route has none; walk at both widths. Screenshots go to the local verification handover, not the repo.

---

## Coverage

Use Cases: R1, R2, R3, R4, R5, R6

Files:

- `packages/react/src/components/file-explorer/file-explorer-context.tsx`（react）— 新增選填 `clipboardScope`；兩個 `useLayoutEffect`：剪貼簿的來源不在 `sources` 時清空、`clipboardScope` 變了就清空；`Clipboard` JSDoc 改寫
- `packages/react/src/components/file-explorer/file-explorer-panel.tsx`（react）— 接受並轉傳 `clipboardScope`
- `packages/react/src/components/chatbot/chatbot-file-explorer.tsx`（react）— 內建側欄傳 `customChannelId` 為 `clipboardScope`
- `packages/react/src/components/file-explorer/clipboard-scope.spec.tsx`（react，新增）— R1–R3 與 Panel 轉傳，7 案
- `packages/react/src/components/chatbot/builtin-aside-channel-scope.spec.tsx`（react）— R4 1 案
- `packages/react/README.md`（react）— Read-only sources 一節改寫剪貼簿段落、加 `clipboardScope` 範例
- `apps/react-demo/src/app/routes/file-explorer/file-explorer.tsx`（demo）— #482 寬窄並排區塊與「換對話」「拿掉可寫來源」兩顆鈕；`ReadOnlySourcePanel` 收 `sources` / `clipboardScope`，並改以實際顯示的來源挑 providers

---

## Execution Log / Change Log

- 2026-11-02: BUILD task created from [asgard-js-sdk#482](https://github.com/asgard-ai-platform/asgard-js-sdk/issues/482) item 1 (Status: `draft`).
- 2026-11-02: Plan confirmed, including the new optional `clipboardScope` prop (Status: `draft → ready → in-progress`).
- 2026-11-02: T1 specs first: 5 red (source gone, scope change, scope change keeps open file / no remount, panel forwarding, aside passes `customChannelId`), 4 already green and now pinned (another source leaving, stable scope, no scope + source switch). After T2/T3 all 9 green; full gate green (core 458, react 727 = +8; lint 0 errors, same 5 pre-existing warnings; typecheck incl. demo; build). (Status: `in-progress → done`)
- 2026-11-02: Demo `/file-explorer` #482 pair walked at 1149px and 343px: cut `notes.txt` → paste enabled and dimmed; 換對話 → paste disabled, dimming gone, `src` still expanded, an open `article.md` stays open; cut again → 拿掉可寫來源 → falls back to the read-only source with paste disabled → 加回 → paste still disabled, not dimmed. No horizontal overflow. Found and fixed a demo-only bug on the way: with the writable source removed, the route handed the full providers to the read-only source because it picked by the controller's remembered id.
