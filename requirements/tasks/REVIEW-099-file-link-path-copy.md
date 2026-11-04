# REVIEW-099 Review: file:// links shown as a copyable path

## Meta

- Task ID: `REVIEW-099`
- Status: `done`
- BUILD Task: `BUILD-099`
- Reviewed commit: `c698b119`
- Reviewed branch: `fix/350-file-link-path-copy`

---

## §1 Static Code Review

Scope is `BUILD-099 ## Coverage`（react `templates/text-template/`、`i18n.ts`、`package.json`；demo `markdown-file-links/`）. `lint` / `format` / `typecheck` / `build` / `test` run project-wide.

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
| No hardcoded colour values                           | FRONTEND_RULE_COMMON §4.2    | ✅ ³   |
| UI verified at both widths                           | FRONTEND_RULE_COMMON §4.3+   | ✅     |
| `react` / `react-dom` stay peerDependencies          | FRONTEND_RULE_COMMON §4.4    | ✅ ⁴   |
| core and react share a version number                | FRONTEND_RULE_COMMON §5      | ✅ ⁵   |
| Repeated logic extracted (≥2×)                       | FRONTEND_RULE_COMMON §6      | ✅ ⁶   |
| `setTimeout` mock, dead code, untracked TODO / FIXME | FRONTEND_RULE_COMMON §7      | ✅ ¹   |

¹ 新增一個 `setTimeout`：複製後 1.5 秒把按鈕從「已複製」還原。不是模擬延遲；放在 `useEffect` 裡、cleanup 會 `clearTimeout`，卸載或連按都不會留下 timer。
² 沒有公開 API 變更。`FileLink`、`rehypeFileLinks`、`withFileLinks`、`toFileLinkPath` 都是 `text-template/` 內部模組，不從 package 進入點導出。行為變更只有一條：`file:` 連結從「[blocked]」改為路徑＋複製（即 BUG-025 本身）。
³ 新增 scss 只用 `var(--asgard-markdown-code-bg, rgba(...))`，與同檔既有寫法相同（token ＋字面 fallback）；路徑直接沿用 `.code`。demo 的淺色主題字面色值與 `/markdown-theme` 的 preset 相同，屬 demo。
⁴ 新依賴 `rehype-sanitize@^6.0.0` 不含 React；它沒有列進 vite `external`，所以會打進 `dist`（與 `clsx`、`dompurify` 等其他依賴相同）。streamdown 本身是 external，執行時會另外載入它自己那份——兩份是不同模組實例，但都是無狀態函式，不影響行為。
⁵ 皆為 `0.3.96`，未 bump。
⁶ 剪貼簿可用性判斷（`navigator.clipboard.writeText` 是否存在）在 `sandbox-browser-panel.tsx` 也有一份 `clipboardWritePlausible`，那是該模組的私有函式。兩處各一行，抽共用 util 屬另一個 refactor，見 Minor 1。

### §1.2 Mechanical grep

Run over the files in Coverage.

```text
any / as any            : (empty)
ts-ignore / eslint-dis. : (empty)
console.log             : (empty)
core → react            : (empty)
react → core/src        : (empty)
colour (tsx / ts)       : (empty)
setTimeout              : streamdown-components.tsx:120 — copied-state reset with cleanup（見 ¹）
TODO / FIXME            : (empty)
```

### §1.4 Build / Lint / Format

```text
lint:packages: PASS — 0 errors；5 warnings 皆為既有、不在 Coverage 檔案
format:check:  PASS
typecheck:     PASS — core + react + react-demo
build:         PASS — core, react（dist 內含 asgard-file-link 與 sanitize schema）
test:          PASS — core 458、react 764（+9：file-link 5、streamdown-file-links 4）
```

---

## §3 Functional Validation

驗證手段：Vitest（jsdom，走真正的 Streamdown pipeline；同一份 spec 在改動前跑，file:// 三條紅、https／javascript:／data:／mailto: 那條綠）＋ react-demo `/markdown-file-links`（port 5101；full-bleed 與 375×640 並排，locale 與 Default／Light 主題切換）以 Playwright 實際操作。

| R#   | Result | Evidence                                                                                                                                                                                                                       |
| ---- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `R1` | ✅     | demo：兩個 shell 各 4 個 file 連結都是「文字＋路徑＋複製鈕」，頁面上沒有 `a[href^="file:"]`，`[blocked]` 只出現在兩個 javascript: 連結。句中連結維持行內、autolink 只顯示一次路徑                                              |
| `R2` | ✅     | `file://192.168.0.10/share/規格書.pdf` → `\\192.168.0.10\share\規格書.pdf`；`file://fileserver.corp.local/財務部/…/2026%20第三季營運報告（最終版）.xlsx` → 中文與 `%20` 都解碼。spec 另含壞掉的 escape（`100%.txt`）保留原字串 |
| `R3` | ✅     | `file:///tmp/test.txt`、`file://localhost/…`、`file:///C:/…` 照原樣                                                                                                                                                            |
| `R4` | ✅     | demo（zh-TW）：按 `規格書.pdf` 的複製鈕 → `navigator.clipboard.readText()` 讀回 `\\192.168.0.10\share\規格書.pdf`，按鈕 `aria-label` 變「已複製」、圖示變勾，1.7 秒後回到「複製路徑」。en-US `Copy path`、ja-JP `パスをコピー` |
| `R5` | ✅     | demo：https 仍是 `<a href="https://example.com/" target="_blank" rel="noopener noreferrer">`。spec：mailto: 仍是連結；javascript:、data: 仍是「[blocked]」、DOM 內沒有對應的 `<a>`                                             |
| `R6` | ✅     | 見 §1.4；demo 兩種寬度、兩種主題走過 R1–R5。窄版長 UNC 路徑在路徑內換行，連結元素右緣都在 shell 內                                                                                                                             |

---

## Findings

### Critical (must fix before done)

None.

### Important (should fix in this cycle)

None.

### Minor (nice to have)

1. 剪貼簿可用性判斷與 `sandbox-browser-panel.tsx` 的 `clipboardWritePlausible` 重複（各一行）。抽成共用 util 會動到無關的 sandbox 瀏覽器面板，另開 `refactor:` 處理，不併進這個修正。
2. 瀏覽器不給寫剪貼簿時（非安全來源、權限被拒）按鈕不會有反應、也不顯示錯誤。路徑本身 `user-select: all`，點一下就整段選取，可以手動複製。消費端都跑在 https，不改。

---

## Execution Log

- 2026-11-03: REVIEW task created, paired with BUILD-099 (Status: `draft`).
- 2026-11-03: BUILD-099 done (Status: `draft → ready`).
- 2026-11-03: §1 19/19、§3 R1–R6 全 Pass；0 Critical、0 Important、2 Minor 不改 (Status: `ready → in-progress → done`).
