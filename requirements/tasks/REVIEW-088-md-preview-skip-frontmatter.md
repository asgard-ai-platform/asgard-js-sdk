# REVIEW-088 Review: show leading YAML frontmatter as fields in the markdown file preview

## Meta

- Task ID: `REVIEW-088`
- Status: `done`
- BUILD Task: `BUILD-088`
- Reviewed commit: `af9b62cd`
- Reviewed branch: `fix/heimdall-375-md-preview-frontmatter`

---

## §1 Static Code Review

Scope is `BUILD-088 ## Coverage`（`file-view.tsx`、`file-view.module.scss`、`file-view-frontmatter.spec.tsx`、react `package.json`／lock、demo
`file-explorer.tsx`）。Grep 範圍是整條分支相對 `main`（`35e32adf..af9b62cd`）的新增行。`lint` / `format` / `typecheck` / `build` / `test`
run project-wide.

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
| No breaking public-API change                        | FRONTEND_RULE_COMMON §1.7      | ✅ ¹   |
| New public type exported from the package entry      | FRONTEND_RULE_COMMON §2.2      | ✅ n/a |
| Explicit return types on exported functions          | FRONTEND_RULE_COMMON §3.1      | ✅ ²   |
| Shared types centralized; no duplicates              | FRONTEND_RULE_COMMON §3.2      | ✅ n/a |
| Component props fully typed                          | FRONTEND_RULE_COMMON §4.1      | ✅     |
| No hardcoded colour values                           | FRONTEND_RULE_COMMON §4.2      | ✅ ³   |
| UI verified at both widths, side by side             | FRONTEND_RULE_COMMON §4.3+     | ✅     |
| react / react-dom stay peer deps; new dep bundled    | FRONTEND_RULE_COMMON §4.4 §7   | ✅ ⁴   |
| core and react share a version number                | FRONTEND_RULE_COMMON §5        | ✅ ⁵   |
| Repeated logic extracted (≥2×)                       | FRONTEND_RULE_COMMON §6        | ✅ ⁶   |
| `setTimeout` mock, dead code, untracked TODO / FIXME | FRONTEND_RULE_COMMON §7        | ✅     |
| 只動預覽；`content`、編輯器、存檔不變                | #375                           | ✅ ⁷   |
| 檔案內容只當文字渲染，不注入 HTML                    | —                              | ✅ ⁸   |

¹ `FileViewProps` 不變；`splitFrontmatter`／`fieldText`／`Frontmatter` 皆 module-local、未導出。行為變更只在 `.md`／`.markdown` 預覽。
² 三個 helper 都標了回傳型別（未導出）。
³ 命中 8 處：5 處票號 `#375`；3 處是 `var(--asg-color-…, fallback)` 的後備值，與同檔 `.header`／`.actionBtn` 既有寫法一致，有主題時不生效。
原樣區塊的底色原本寫了 `#111827` 後備，review 時改成 `color-mix(in srgb, currentColor 5%, transparent)`，跟著文字色走。
⁴ `js-yaml` 進 `dependencies`；react build 只 externalize react／react-dom／core／streamdown，所以它被打包進 dist（≈44 KB min／15 KB gzip）。
⁵ 未 bump（兩者仍為 `0.3.91`）。
⁶ `source-set-explorer/file-view.tsx` 仍有自己的一份預覽分支（同一個 bug），本 task 未動，所以沒有第二份 helper。
⁷ 預覽分支換成 `splitFrontmatter` ＋ `<Frontmatter>` ＋ `body`；`CodeEditor value={content ?? ''}` 與 `scheduleSave(val)` 原樣。
⁸ key 與 value 都是 React 文字節點，沒有 `dangerouslySetInnerHTML`。實測 `__proto__:` key 只是一般的 own key、不污染原型；
alias 炸彈（9 層 × 9 個 alias）`load` 與 `dump` 各 1 ms，`dump` 以 YAML 參照輸出、不展開。

### §1.2 Mechanical grep（`35e32adf..af9b62cd` 新增行）

```text
[any]              0
[ignore]           0
[console]          0
[setTimeout]       0
[TODO/FIXME]       0
[color]            8 — 5 票號 #375；3 var() 後備值（見 ³）
[react → core/src] 0
[dangerouslySetInnerHTML] 0
[core / source-set-explorer diff] 0
```

### §1.4 Build / Lint / Format

```text
lint:packages: PASS — 0 errors；5 warnings 皆為既有（file-view.tsx 的 useMemo scheduleSave 那條改前就在，只是行號位移）
format:check:  PASS
typecheck:     PASS — core + react + react-demo
build:         PASS — core, react
test:          PASS — core 430、react 649（本 task 新增 17 案）
```

本 repo 沒有 `lint:check` script；唯讀 lint 以 `lint:packages` 代替（同 REVIEW-087）。

---

## §3 Functional Validation

| R#    | Result | Evidence                                                                                                                                                                  |
| ----- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `R1`  | ✅     | spec 3 案（LF、CRLF、`.markdown`）。demo 987px／341px：`article.md` 頂部無 `<hr>`、無 `title: "…"` 大標題，`H1` 只有一個                                                  |
| `R1a` | ✅     | spec 6 案（順序、`>-` 折疊、字串清單、`\|` 保留換行、巢狀以 YAML 文字、不轉型）。demo：`SKILL.md` 四列 `name`／`description`／`tags`／`version`，窄版自動換行、無水平溢出 |
| `R1b` | ✅     | spec 4 案（空區塊無表、解析失敗、非 mapping、巢狀空值 → 原樣區塊）。demo：在 `SKILL.md` 打一個未閉合引號，預覽退回原樣區塊、內容完整                                      |
| `R2`  | ✅     | spec：編輯模式含完整 frontmatter。demo（上一輪）：打字存檔後從記憶體 fs 重讀，frontmatter 與編輯都在；本輪 diff 未動編輯／存檔路徑                                        |
| `R3`  | ✅     | spec 3 案：正文中的 `---` 仍是 `<hr>`；開頭 `---` 無結尾照原文；空 frontmatter 不吃到後面的分隔線                                                                         |
| `R4`  | ✅     | 閘門全綠（§1.4）。深色：以 Heimdall `.dark` token 值設定其 `AsgardThemeScope` 會產生的 `--asg-color-*`，欄位表與原樣區塊皆可讀                                            |

---

## Findings

### Critical (must fix before done)

None.

### Important (should fix in this cycle)

- **已修（`9ba7bca1`）** 空的 frontmatter（`---\n---\n`）後面正文又有 `---` 分隔線時，第一版 regex 跳過真正的結尾、一路配對到正文的分隔線，
  標題與前段正文都不顯示。補了會失敗的 spec 後把中間內容改成可空、且先試空（`(?:…)??`）。

### Minor (nice to have)

- YAML 折疊（`>-`）把換行變成一個空白，所以中文的兩行之間會多一個空格（「佔位， 本地驗收」）。這是 YAML 規格本身的行為，不改。
- Heimdall 的文章標題會出現在 `title` 欄位一次、正文 `# 標題` 一次；PM Expected 明列「frontmatter 以欄位形式另行顯示」為可接受，
  欄位列是中繼資料的樣式、不是第二個標題。
- 檔案開頭有 BOM、或結尾 `---` 後面帶空白時不當成 frontmatter（實測）。agent 產的 `article.md` 碰不到，不改。
- `source-set-explorer/file-view.tsx`（Sindri／Mimir 的 `SourceSetFileExplorer`）有同一個 bug，未在本 task 範圍。

---

## Execution Log

- 2026-10-05: REVIEW task created, paired with BUILD-088 (Status: `draft`).
- 2026-10-05: BUILD-088 done (Status: `draft → ready`).
- 2026-10-05: §1 — 18 項 ✅、0 違規；§3 — R1–R4 全 Pass；邊界實測找到 1 Important（空 frontmatter 吃到正文分隔線），已修並重跑閘門與 demo；3 Minor 不改 (Status: `ready → in-progress → done`).
- 2026-10-05: Reset — BUILD-088 re-opened for the field-table display (R1a / R1b); the review above covers the strip-only version and is re-run after the build (Status: `done → draft`).
- 2026-10-05: Re-run on the field-table build (`af9b62cd`): §1 — 20 項 ✅、0 違規（`#111827` 後備改 `currentColor`）；§3 — R1／R1a／R1b／R2／R3／R4 全 Pass；1 Important（前一輪已修）、4 Minor 不改 (Status: `draft → in-progress → done`).
