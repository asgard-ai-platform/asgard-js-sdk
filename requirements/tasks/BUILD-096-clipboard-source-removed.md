# BUILD-096 Clear the FileExplorer clipboard when its source leaves the list

## Meta

- Task ID: `BUILD-096`
- Status: `done`
- Issue: [asgard-js-sdk#482](https://github.com/asgard-ai-platform/asgard-js-sdk/issues/482)（issue 開在本 repo，無 PM tracking spec；issue body 即規格。本 task 只做第 1 項，第 2、3、4 項已由 BUILD-091 完成）
- Source spec: 無 PM spec。語意於 2026-11-02 決定：**來源從清單消失時清空剪貼簿**；只清剪貼簿，其他狀態（開檔、展開、上傳佇列）不動。「換對話時清空」同日先納入、實作後撤回，理由見 Brief 與 Execution Log。
- Complexity: `S`

---

## Brief

剪貼簿只以 `sourceId` 字串認來源。來源從 `sources` 被移除後剪貼簿一直留著，同一個 id 再出現時貼上又會啟用；而 sandbox 名稱會被重複使用，「同一個 id」可能已經是另一台機器，貼上會搬一個不屬於它的路徑。

做法：`FileExplorerProvider` 在 `sources` 不再包含 `clipboard.sourceId` 時清空剪貼簿（`useLayoutEffect`，與既有補 `sourceId` 的那段同型）。之後同 id 再出現，剪貼簿已經是空的。

**換對話不另外處理。** issue 也提到「切換 channel 時 sandbox 同名、剪貼簿被帶過去」。查證後沒有任何消費端會在不重掛檔案總管的情況下換對話：`<Chatbot>` 的 channel 建立後，`customChannelId` 改變不會重新初始化（`use-channel.ts` 的 bootstrap effect 在 `channel` 已存在時直接 return），換對話必須重掛整個 Chatbot，內建側欄的剪貼簿隨之清空；Sindri 的 `FileExplorer.Provider` 掛在 `PanelSystemProvider key={conversationId}` 底下；Odin Workbench 以 `key` 重掛 Chatbot。為一個沒有使用者的情境新增公開 prop（原計畫的 `clipboardScope`）不划算，改在 README 寫明：跨對話保留同一個檔案總管的宿主，換對話時自行 `setClipboard(null)` 或重掛。

**不在範圍**：`SourceSetFileExplorer` 自己的剪貼簿。

**Already exists:** `file-explorer-context.tsx`（`Clipboard`、`setClipboardState`、補 `sourceId` 的 `useLayoutEffect`、`canPaste`）、`clipboard-follow-ups.spec.tsx`（剪貼簿測試 harness，可沿用）、demo `/file-explorer` 的 #476 唯讀來源組合（`ReadOnlySourcePanel`）。

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

- `R1` When `sources` no longer contains the clipboard's `sourceId`, the context shall clear the clipboard, leaving the open file of the remaining source and the provider itself (no remount) untouched; when a source with that id appears again afterwards, paste shall stay disabled. → T1, T2
- `R2` When every source stays listed, clipboard behaviour shall be unchanged: another source leaving keeps the clipboard, switching to another source disables paste and switching back enables it again (#476), and BUILD-091 R1–R4 still hold. → T1, T2
- `R3` The `Clipboard` JSDoc and the react README File Explorer section shall say when the clipboard empties, and that a host keeping one explorer mounted across conversations clears it itself (`setClipboard(null)`) or remounts. → T3
- `R4` When the developer runs lint / format / typecheck / build / `test:packages` and walks the react-demo `/file-explorer` at both the narrow and the full-bleed width (cut, remove the writable source, add it back; plain source switching), the behaviour above shall be observable with no build errors. → T4

---

## Implementation Tasks

- [x] T1 (R1–R2): Vitest first — clipboard cleared when its source leaves `sources` and stays empty when the id returns; the remaining source's open file stays and nothing remounts; another source leaving keeps it; source switching unchanged. Confirm the clearing cases fail without the change.
- [x] T2 (R1–R2): `file-explorer-context.tsx` — a `useLayoutEffect` that clears the clipboard once its source leaves `sources`.
- [x] T3 (R3): `Clipboard` JSDoc; react README〈Read-only sources〉clipboard paragraph.
- [x] T4-1: Run `npm run lint:packages` + `npm run format:check` + `npm run typecheck` + `npm run build:core && npm run build:react` + `npm run test:packages`
- [x] T4 (R4): Demo `/file-explorer` — a #482 pair with a 拿掉／加回可寫來源 toggle; walk at both widths. Screenshots go to the local verification handover, not the repo.

---

## Coverage

Use Cases: R1, R2, R3, R4

Files:

- `packages/react/src/components/file-explorer/file-explorer-context.tsx`（react）— `useLayoutEffect`：剪貼簿的來源不在 `sources` 時清空；`Clipboard` JSDoc 改寫
- `packages/react/src/components/file-explorer/clipboard-source-removed.spec.tsx`（react，新增）— R1–R2 4 案
- `packages/react/README.md`（react）— Read-only sources 一節改寫剪貼簿段落
- `apps/react-demo/src/app/routes/file-explorer/file-explorer.tsx`（demo）— #482 寬窄並排區塊與「拿掉／加回可寫來源」鈕；`ReadOnlySourcePanel` 收 `sources`，並改以實際顯示的來源挑 providers

---

## Execution Log / Change Log

- 2026-11-02: BUILD task created from [asgard-js-sdk#482](https://github.com/asgard-ai-platform/asgard-js-sdk/issues/482) item 1 (Status: `draft`).
- 2026-11-02: Plan confirmed, including a new optional `clipboardScope` prop for the conversation-switch half (Status: `draft → ready → in-progress`).
- 2026-11-02: First pass built both halves (`clipboardScope` on `FileExplorerProvider` / `FileExplorerPanel`, the built-in aside passing `customChannelId`); gate green, demo walked. Committed as `02262461`–`f5b295a1`.
- 2026-11-02: Walking the built-in aside end to end showed the premise did not hold: `<Chatbot>` does not re-initialise its channel when `customChannelId` changes, so the demo's "switch channel" produced a state no consumer reaches; Sindri and Odin remount their explorer per conversation. Decision the same day: drop `clipboardScope`, keep the source-removal half. Rewrote R1–R4 accordingly (Status: `in-progress`).
- 2026-11-02: Spec renamed `clipboard-source-removed.spec.tsx`, 4 cases; with the clearing line removed, the 2 clearing cases fail and the 2 unchanged-behaviour cases pass. One case first asserted the open file survives the removal of _its own_ source — wrong premise, open files are per source; rewritten to watch the remaining source's file. Full gate green (core 458, react 723 = +4; lint 0 errors; typecheck incl. demo; build) (Status: `in-progress → done`).
- 2026-11-02: Demo `/file-explorer` #482 pair walked at 1149px and 343px: cut `notes.txt` → paste enabled and dimmed; 拿掉可寫來源 → falls back to the read-only source with paste disabled; 加回 → paste still disabled, not dimmed. No horizontal overflow. Found and fixed a demo-only bug on the way: with the writable source removed, the route handed the full providers to the read-only source because it picked by the controller's remembered id.
