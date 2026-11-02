# REVIEW-096 Review: clear the clipboard when its source or conversation goes away

## Meta

- Task ID: `REVIEW-096`
- Status: `done`
- BUILD Task: `BUILD-096`
- Reviewed commit: `89e4bd47`
- Reviewed branch: `fix/482-file-explorer-clipboard-followups`

---

## §1 Static Code Review

Scope is `BUILD-096 ## Coverage`（react `file-explorer-context.tsx`、`file-explorer-panel.tsx`、`chatbot-file-explorer.tsx` 及兩個 spec；demo `file-explorer/file-explorer.tsx`；react README）. `lint` / `format` / `typecheck` / `build` / `test` run project-wide.

### §1.1 Checklist

| Check item                                           | Rule                         | Result |
| ---------------------------------------------------- | ---------------------------- | ------ |
| `any` / `as any`                                     | FRONTEND_RULE_COMMON §1.1    | ✅     |
| `@ts-ignore` / `eslint-disable`                      | FRONTEND_RULE_COMMON §1.2    | ✅     |
| `console.log`                                        | FRONTEND_RULE_COMMON §1.3 §7 | ✅     |
| No hardcoded API key / endpoint / namespace          | FRONTEND_RULE_COMMON §1.4    | ✅     |
| Teardown for subscriptions / listeners / timers      | FRONTEND_RULE_COMMON §1.5    | ✅ ¹   |
| core has no react / DOM import                       | FRONTEND_RULE_COMMON §1.6    | ✅     |
| react → core through the public entry only           | FRONTEND_RULE_COMMON §1.6    | ✅     |
| No breaking public-API change                        | FRONTEND_RULE_COMMON §1.7    | ✅ ²   |
| New public API exported from the entry               | FRONTEND_RULE_COMMON §2.2    | ✅ ²   |
| `botProviderEndpoint`, not `endpoint`                | FRONTEND_RULE_COMMON §2.4    | ✅     |
| Explicit return types on exported functions          | FRONTEND_RULE_COMMON §3.1    | ✅     |
| Shared types centralized, no duplicates              | FRONTEND_RULE_COMMON §3.2    | ✅     |
| React props fully typed                              | FRONTEND_RULE_COMMON §4.1    | ✅     |
| No hardcoded colour values                           | FRONTEND_RULE_COMMON §4.2    | ✅     |
| UI verified at both widths                           | FRONTEND_RULE_COMMON §4.3+   | ✅     |
| core and react share a version number                | FRONTEND_RULE_COMMON §5      | ✅ ³   |
| Repeated logic extracted (≥2×)                       | FRONTEND_RULE_COMMON §6      | ✅     |
| `setTimeout` mock, dead code, untracked TODO / FIXME | FRONTEND_RULE_COMMON §7      | ✅     |

¹ 新增兩個 `useLayoutEffect` 只呼叫 `setClipboardState`，沒有訂閱、listener 或 timer。
² 只增不改：`FileExplorerProviderProps` 與 `FileExplorerPanelProps` 各多一個 optional `clipboardScope?: string`，兩個型別本來就由 entry 匯出；不傳時只多了「來源消失就清空」這一條行為（R1，2026-11-02 決定的語意）。
³ 皆為 `0.3.95`，未 bump。

### §1.2 Mechanical grep

Run over the added lines of the Coverage files.

```text
any / as any            : (empty)
ts-ignore / eslint-dis. : (empty)
console.log             : (empty)
core → react            : (empty)
react → core/src        : (empty)
colour (added)          : 4 hits, all `#482` issue references in spec comments / describe titles — not colours
setTimeout              : (empty)
TODO / FIXME            : (empty)
```

### §1.4 Build / Lint / Format

```text
lint:packages: PASS — 0 errors；5 warnings 皆為既有
format:check:  PASS
typecheck:     PASS — core + react + react-demo
build:         PASS — core, react
test:          PASS — core 458、react 727（+8：clipboard-scope.spec 7、builtin-aside-channel-scope.spec 1）
```

---

## §3 Functional Validation

驗證手段：Vitest（jsdom，真 `FileExplorerProvider` / `FileExplorerPanel`；先寫測試，5 案紅、4 案原本就綠並釘住）＋ react-demo `/file-explorer` 新增的 #482 區塊（port 5100；寬 1149px 與窄 343px 並排，「換對話」「拿掉可寫來源」兩顆鈕）以 Playwright 實際操作。

| R#   | Result | Evidence                                                                                                                                                                                                                    |
| ---- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `R1` | ✅     | spec：剪下後拿掉該來源 → 剪貼簿清空；同 id 加回並切回 → 貼上停用、仍為空；拿掉另一個來源 → 剪貼簿保留。demo：剪下 `notes.txt` → 拿掉可寫來源 → 退回唯讀來源、貼上停用 → 加回 → 貼上仍停用、`notes.txt` 不再變淡             |
| `R2` | ✅     | spec：scope 換值 → 清空、貼上停用；開著的檔案保留、子元件 mount 次數維持 1（Provider 沒有重掛）。demo：換對話 → 貼上停用、淡化消失，`src` 仍展開，開著的 `article.md` 仍開著                                                |
| `R3` | ✅     | spec：scope 同值 rerender → 剪貼簿保留、可貼；不傳 scope → 切到 B 停用、切回 A 可貼（#476）。`clipboard-follow-ups.spec`（BUILD-091 R1–R4）與 `read-only-source-actions.spec`、`paste-dedupe.spec` 全綠                     |
| `R4` | ✅     | spec：內建側欄把 context 的 `customChannelId` 傳成 `clipboardScope`；Panel 層 spec 證明換 scope 會清空 Panel 內部的剪貼簿。真實 `<Chatbot>` 換 channel 的端到端沒有另走（demo 沒有切換 channel 的內建側欄），由這兩段串起來 |
| `R5` | ✅     | `FileExplorerProviderProps.clipboardScope`、`FileExplorerPanelProps.clipboardScope` JSDoc；`Clipboard` 型別註解改寫；react README〈Read-only sources〉改寫剪貼簿段落並附一行範例                                            |
| `R6` | ✅     | 見 §1.4；demo 兩種寬度並排走過 R1、R2，無水平溢出                                                                                                                                                                           |

---

## Findings

### Critical (must fix before done)

None.

### Important (should fix in this cycle)

- **已修（BUILD 期間）**：demo 的 `ReadOnlySourcePanel` 依 controller 記住的 id 挑 providers；拿掉可寫來源後畫面退回唯讀來源，卻拿到完整的可寫 providers。改成依實際顯示的來源挑。只影響 demo。

### Minor (nice to have)

1. 來源暫時從 `sources` 掉出去也會清空剪貼簿，例如內建側欄因 fs 連續失敗而 `dropSandbox`、之後 metadata 又把它補回。這是「消失就清空」語意的直接結果，2026-11-02 決定時已接受。
2. `SourceSetFileExplorer` 有自己的剪貼簿，不在範圍內。
3. Sindri 自行組裝 `FileExplorer.Provider`，要接上 `clipboardScope={conversationId}` 才有換對話清空；需在 SDK 發版後由 Sindri 那條線處理。

---

## Execution Log

- 2026-11-02: REVIEW task created, paired with BUILD-096 (Status: `draft`).
- 2026-11-02: BUILD-096 done; ready for review (Status: `draft → ready`).
- 2026-11-02: §1 — 18 項 ✅、0 違規；§3 — R1–R6 全 Pass；1 Important 已修（demo providers 挑錯），3 Minor 不改 (Status: `ready → in-progress → done`).
