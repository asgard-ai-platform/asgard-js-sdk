# REVIEW-087 Review: SourceSetFileExplorer hideEntry and context-menu navigation

## Meta

- Task ID: `REVIEW-087`
- Status: `done`
- BUILD Task: `BUILD-087`
- Reviewed commit: `689e53aa`
- Reviewed branch: `feat/116-source-set-readonly-options`

---

## §1 Static Code Review

Scope is `BUILD-087 ## Coverage`（`tree.tsx`、`source-set-file-explorer.tsx`、`i18n.ts`、spec、README、demo route 兩檔）。
`lint` / `format` / `typecheck` / `build` / `test` run project-wide.

### §1.1 Checklist

| Check item                                           | Rule                           | Result |
| ---------------------------------------------------- | ------------------------------ | ------ |
| `any` / `as any`                                     | FRONTEND_RULE_COMMON §1.1      | ✅     |
| `@ts-ignore` / `eslint-disable`                      | FRONTEND_RULE_COMMON §1.2      | ✅     |
| `console.log`                                        | FRONTEND_RULE_COMMON §1.3 §7   | ✅     |
| Hardcoded key / endpoint / namespace                 | FRONTEND_RULE_COMMON §1.4      | ✅ n/a |
| Teardown for subscriptions / listeners / timers      | FRONTEND_RULE_COMMON §1.5      | ✅ n/a |
| react → core through the public entry only           | FRONTEND_RULE_COMMON §1.6      | ✅     |
| core free of react / react-dom / DOM                 | FRONTEND_RULE_COMMON §1.6 §2.1 | ✅ n/a |
| **No breaking public-API change**                    | FRONTEND_RULE_COMMON §1.7      | ✅ ¹   |
| New public type exported from the package entry      | FRONTEND_RULE_COMMON §2.2      | ✅ ²   |
| Explicit return types on exported functions          | FRONTEND_RULE_COMMON §3.1      | ✅     |
| Shared types centralized; no duplicates              | FRONTEND_RULE_COMMON §3.2      | ✅ ³   |
| Component props fully typed                          | FRONTEND_RULE_COMMON §4.1      | ✅     |
| No hardcoded colour values                           | FRONTEND_RULE_COMMON §4.2      | ✅ ⁴   |
| UI verified at both widths, side by side             | FRONTEND_RULE_COMMON §4.3+     | ✅     |
| core and react share a version number                | FRONTEND_RULE_COMMON §5        | ✅ ⁵   |
| Repeated logic extracted (≥2×)                       | FRONTEND_RULE_COMMON §6        | ✅ ⁶   |
| `setTimeout` mock, dead code, untracked TODO / FIXME | FRONTEND_RULE_COMMON §7        | ✅     |
| chat 版 `components/file-explorer/` 零變更           | F-025                          | ✅     |
| 文案走 `sourceSetExplorer.*`，三語齊                 | F-025                          | ✅     |
| 隱藏只作用在畫面，去重仍看完整清單                   | #116                           | ✅ ⁷   |

¹ `SourceSetFileExplorerProps.hideEntry?` 與 `SourceSetTreeProps.hideEntry?` 皆選填；右鍵多一組內建導覽項目，不需要任何 prop。
² `hideEntry` 的型別 `(entry: FsEntry) => boolean` 只用到既有的公開型別 `FsEntry`。
³ 測試檔原有兩份包在 `describe` 裡、內容相同的 `menuLabels()`，加上這次的第三份，已合為一份放在檔案上方。
⁴ 新增程式碼的 `#xxx` 命中全是票號 `#116`（9 處）。
⁵ 未 bump（兩者仍為 `0.3.89`）。
⁶ 「展開」「收合」兩個項目的 `onSelect` 相同、只差標籤與圖示，各寫一次比抽 helper 清楚，不算重複邏輯。
⁷ `renderDirBody` 只過濾要畫的列；`takenIn`（去重）讀的仍是 `listings`。spec「still counts a hidden entry as taken」釘住。

### §1.2 Mechanical grep（本次 diff 新增的行）

```text
[any]              0
[ignore]           0
[console]          0
[setTimeout]       0
[TODO/FIXME]       0
[color]            9 — 全為票號 #116
[core → react]     0
[react → core/src] 0
[chat file-explorer diff] 0
```

### §1.4 Build / Lint / Format

```text
lint:packages: PASS — 0 errors；5 warnings 皆為既有、不在本 task 的檔案
format:check:  PASS
typecheck:     PASS — core + react + react-demo
build:         PASS — core, react
test:          PASS — core 430、react 622（新增 9 案）
```

---

## §3 Functional Validation

| R#   | Result | Evidence                                                                                                                                 |
| ---- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `R1` | ✅     | spec：根層 `.git` 與巢狀 `skills/.cache` 不畫、`.env.example` 照常。demo（zh-TW，寬 1010px／窄 318px）開「hide . directories」後兩邊一致 |
| `R2` | ✅     | spec：內容全被隱藏的目錄顯示「這個目錄是空的」；反向驗證把空目錄判斷改回原始清單即轉紅                                                   |
| `R3` | ✅     | spec：`docs/a.txt` 被隱藏時，把 `a.txt` 貼進 `docs` 的目的地是 `docs/a (1).txt`                                                          |
| `R4` | ✅     | spec：不傳 `hideEntry` 時 `.git`、`.env.example` 都在；既有 R4 lazy-tree 各案不變                                                        |
| `R5` | ✅     | spec 4 案；demo 兩種寬度 × 兩種模式：檔案第一項「開啟」可開檔，資料夾「展開」→「收合」可切換，唯讀時保留；背景右鍵沒有                   |
| `R6` | ✅     | spec：工具列沒有這三個按鈕；demo 工具列一般 10 顆、唯讀 2 顆，與改前相同；唯讀時從右鍵開啟的檔案沒有「切換為編輯」                       |
| `R7` | ✅     | spec：ja-JP、zh-TW 的三個 key 皆與 en-US 不同；demo zh-TW 顯示「開啟／展開／收合」                                                       |
| `R8` | ✅     | 閘門全綠（§1.4）；demo 走查見 BUILD-087 Execution Log                                                                                    |

---

## Findings

### Critical (must fix before done)

None.

### Important (should fix in this cycle)

None.

### Minor (nice to have)

- `hideEntry` 不檢查宿主自己給的路徑 prop：`initialPath` 指在被隱藏的項目（或其底下）時仍會選取它，畫面上沒有那一列、工具列卻
  作用在它身上；宿主在執行中改變 `hideEntry` 讓已選取的項目變成隱藏，也是同樣情形。Sindri／Mimir 傳的是固定規則、路徑 prop 也
  不會指進 `.` 目錄，碰不到。已把 JSDoc 從「沒有東西碰得到被隱藏的項目」改成照實寫（commit `689e53aa`），行為不改。
- 導覽項目只在右鍵，與 F-025 R5「toolbar 與右鍵選單提供同一組動作」字面不同（照原型；BUILD-087 Decisions 已記）。#116 第 2 題
  PM 回覆後若要調整再改。

---

## Execution Log

- 2026-10-01: REVIEW task created, paired with BUILD-087 (Status: `draft`).
- 2026-10-01: BUILD-087 done (Status: `draft → ready`).
- 2026-10-01: §1 — 20 項 ✅、0 違規；§3 — R1–R8 全 Pass；2 Minor（其一已改 JSDoc）(Status: `ready → in-progress → done`).
