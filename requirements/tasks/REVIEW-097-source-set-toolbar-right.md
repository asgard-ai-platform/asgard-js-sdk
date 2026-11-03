# REVIEW-097 Review: toolbarRight slot and toolbar hidden while a file is open

## Meta

- Task ID: `REVIEW-097`
- Status: `done`
- BUILD Task: `BUILD-097`
- Reviewed commit: `317e1a46`
- Reviewed branch: `feat/98-source-set-toolbar-right`

---

## §1 Static Code Review

Scope is `BUILD-097 ## Coverage`（react `source-set-explorer/` 與 README；demo `source-set-explorer/`）. `lint` / `format` / `typecheck` / `build` / `test` run project-wide.

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
| core and react share a version number                | FRONTEND_RULE_COMMON §5      | ✅ ⁴   |
| Repeated logic extracted (≥2×)                       | FRONTEND_RULE_COMMON §6      | ✅     |
| `setTimeout` mock, dead code, untracked TODO / FIXME | FRONTEND_RULE_COMMON §7      | ✅ ⁵   |

¹ 沒有新增訂閱、listener 或 timer。
² 新增選填 prop `toolbarRight?: ReactNode`，型別隨既有的 `SourceSetFileExplorerProps` 導出。行為變更一條：開檔時不渲染工具列（2026-10-06 已在 asgard-sdk-pm#98 回覆說明為預設行為）。`useSourceSetExplorer` 移除 `refreshToken`，該 hook 不在公開進入點（`source-set-explorer/index.ts` 只導出元件與 props 型別）。
³ 元件 scss 只用 `var(--asg-color-border, rgba(...))`，與該檔 D2 慣例相同（token + 字面 fallback）。demo scss 的 `.readOnlyNote` 用 `rgba(0, 0, 0, 0.55)`，demo 檔既有樣式同樣寫字面值，不屬於 library。
⁴ 皆為 `0.3.95`，未 bump。
⁵ 開檔時沒有任何入口會呼叫 `refresh`，檔案檢視 `key` 裡的 `refreshToken` 因此失去作用，已一併移除（含 hook 的欄位與 state），不留死碼。

### §1.2 Mechanical grep

Run over the lines the branch adds relative to `main`.

```text
any / as any            : (empty)
ts-ignore / eslint-dis. : (empty)
console.log             : (empty)
core → react            : (empty)
react → core/src        : (empty)
colour (added)          : source-set-explorer.module.scss `var(--asg-color-border, rgba(0, 0, 0, 0.1))` — token fallback; demo `.readOnlyNote` `rgba(0, 0, 0, 0.55)` — demo only（見 ³）
setTimeout              : (empty)
TODO / FIXME            : (empty)
```

### §1.4 Build / Lint / Format

```text
lint:packages: PASS — 0 errors；5 warnings 皆為既有
format:check:  PASS
typecheck:     PASS — core + react + react-demo
build:         PASS — core, react
test:          PASS — core 458、react 723（+4：asgard-sdk-pm#98 案例）
```

---

## §3 Functional Validation

驗證手段：Vitest（jsdom，真 `AsgardSourceSetClient` 對假 volume；新案例先寫、四個中三個在改動前為紅；把開檔時的工具列放回去，隱藏案例轉紅）＋ react-demo `/source-set-explorer`（port 5100；320px 與 full-bleed 並排，`toolbarRight` 開關放 Odin 那組按鈕）以 Playwright 實際操作。

| R#   | Result | Evidence                                                                                                                                                                                                              |
| ---- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `R1` | ✅     | spec：工具列按鈕順序為十個內建動作再接宿主按鈕；不傳時工具列子元素只有十顆按鈕。demo：寬版 `Open in Advance Editor` 在最右端（x 1415–1568，面板 404–1576），左側有分隔線                                              |
| `R2` | ✅     | spec：`readOnly` 時宿主按鈕仍在工具列內。demo：勾 `readOnly` 後兩個面板都顯示 `Read-only`、`Edit`、`Open in Advance Editor`；按 `Edit` 關掉 `readOnly`                                                                |
| `R3` | ✅     | spec：開 `a.txt` 後沒有 toolbar、沒有宿主按鈕，檢視標頭的返回／重新載入／下載都在；返回後工具列與宿主按鈕回來、`a.txt` 仍選取、重新命名可按。demo：兩種寬度開 `greet.ts` → 工具列消失；返回 → 回來、`greet.ts` 仍選取 |
| `R4` | ✅     | demo：窄版工具列 318px，宿主按鈕換到第二行並靠右（右緣 380 = 工具列右緣減 padding）；寬版同一行最右端；兩者 `scrollWidth ≤ clientWidth`，唯讀多兩個元素時亦然                                                         |
| `R5` | ✅     | `toolbarRight` JSDoc；react README props 表一列、開檔隱藏工具列一段、「沒有 watch」段改寫開檔時的重讀方式                                                                                                             |
| `R6` | ✅     | 見 §1.4；demo 兩種寬度並排走過 R1–R4                                                                                                                                                                                  |

---

## Findings

### Critical (must fix before done)

None.

### Important (should fix in this cycle)

None.

### Minor (nice to have)

1. 開檔時 busy spinner 跟著工具列一起不顯示。開檔期間樹與右鍵選單都不在畫面上，沒有會觸發 busy 的樹操作；檔案讀取有檢視自己的載入狀態。不改。
2. Sindri 資源面板與 Mimir 資源抽屜開檔時也會隱藏工具列（預設行為、無開關）。2026-10-06 已在票上說明，消費端有意見再改成可選。

---

## Execution Log

- 2026-11-03: REVIEW task created, paired with BUILD-097 (Status: `draft`).
- 2026-11-03: BUILD-097 done (Status: `draft → ready`).
- 2026-11-03: §1 18/18、§3 R1–R6 全 Pass；0 Critical、0 Important、2 Minor 不改 (Status: `ready → in-progress → done`).
