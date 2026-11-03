# REVIEW-096 Review: clear the clipboard when its source leaves the list

## Meta

- Task ID: `REVIEW-096`
- Status: `done`
- BUILD Task: `BUILD-096`
- Reviewed commit: `bd42fffd`
- Reviewed branch: `fix/482-file-explorer-clipboard-followups`

---

## §1 Static Code Review

Scope is `BUILD-096 ## Coverage`（react `file-explorer-context.tsx` 與新 spec；demo `file-explorer/file-explorer.tsx`；react README）. `lint` / `format` / `typecheck` / `build` / `test` run project-wide.

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

¹ 新增一個 `useLayoutEffect`，只呼叫 `setClipboardState`，沒有訂閱、listener 或 timer。
² 公開 API 對 `main` 沒有任何增減（第一版加的 `clipboardScope` 已撤回）；行為變更只有「來源消失就清空」一條，2026-11-02 決定的語意。
³ 皆為 `0.3.95`，未 bump。

### §1.2 Mechanical grep

Run over the lines the branch adds relative to `main`.

```text
any / as any            : (empty)
ts-ignore / eslint-dis. : (empty)
console.log             : (empty)
core → react            : (empty)
react → core/src        : (empty)
colour (added)          : `#482` issue references in spec comments / describe titles only — not colours
setTimeout              : (empty)
TODO / FIXME            : (empty)
```

### §1.4 Build / Lint / Format

```text
lint:packages: PASS — 0 errors；warnings 皆為既有
format:check:  PASS
typecheck:     PASS — core + react + react-demo
build:         PASS — core, react
test:          PASS — core 458、react 723（+4：clipboard-source-removed.spec）
```

---

## §3 Functional Validation

驗證手段：Vitest（jsdom，真 `FileExplorerProvider`；把清空那一行拿掉時 2 個清空案例紅、2 個既有行為案例綠）＋ react-demo `/file-explorer` 的 #482 區塊（port 5100；寬 1149px 與窄 343px 並排，「拿掉／加回可寫來源」鈕）以 Playwright 實際操作。

| R#   | Result | Evidence                                                                                                                                                                                                          |
| ---- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `R1` | ✅     | spec：剪下後拿掉該來源 → 剪貼簿清空；B 開著的檔案保留、子元件 mount 次數維持 1；同 id 加回並切回 → 貼上停用、仍為空。demo：剪下 `notes.txt` → 拿掉可寫來源 → 退回唯讀來源、貼上停用 → 加回 → 貼上仍停用、不再變淡 |
| `R2` | ✅     | spec：拿掉另一個來源 → 剪貼簿保留、可貼；所有來源都在時切到 B 停用、切回 A 可貼（#476）。`clipboard-follow-ups.spec`（BUILD-091 R1–R4）、`read-only-source-actions.spec`、`paste-dedupe.spec` 全綠                |
| `R3` | ✅     | `Clipboard` 型別註解；react README〈Read-only sources〉剪貼簿段落                                                                                                                                                 |
| `R4` | ✅     | 見 §1.4；demo 兩種寬度並排走過 R1，無水平溢出                                                                                                                                                                     |

---

## Findings

### Critical (must fix before done)

None.

### Important (should fix in this cycle)

- **已處理（撤回）**：第一版為「換對話」新增的公開 prop `clipboardScope` 沒有真實情境——`<Chatbot>` 換 `customChannelId` 不會重新初始化 channel，各消費端換對話時都會重掛檔案總管。demo 上那顆「換 channel」鈕驗到的是一個實際不會出現的狀態。已撤回 prop、內建側欄的傳值與相關測試，README 改為寫明宿主自行處理的方式。
- **已修（BUILD 期間）**：demo 的 `ReadOnlySourcePanel` 依 controller 記住的 id 挑 providers；拿掉可寫來源後畫面退回唯讀來源，卻拿到完整的可寫 providers。改成依實際顯示的來源挑。只影響 demo。

### Minor (nice to have)

1. 來源暫時從 `sources` 掉出去也會清空剪貼簿，例如內建側欄因 fs 連續失敗而 `dropSandbox`、之後 metadata 又把它補回。這是「消失就清空」語意的直接結果，2026-11-02 決定時已接受。
2. `SourceSetFileExplorer` 有自己的剪貼簿，不在範圍內。

---

## Execution Log

- 2026-11-02: REVIEW task created, paired with BUILD-096 (Status: `draft`).
- 2026-11-02: First review of the two-half version: §1 18/18、§3 R1–R6 Pass (Status: `draft → ready → in-progress → done`).
- 2026-11-02: Re-opened after `clipboardScope` was withdrawn; re-reviewed the narrowed change against the rewritten R1–R4: §1 18/18、§3 全 Pass；1 Important 撤回已處理、1 Important 已修、2 Minor 不改 (Status: `done → in-progress → done`).
