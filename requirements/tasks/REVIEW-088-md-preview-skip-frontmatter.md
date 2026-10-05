# REVIEW-088 Review: show leading YAML frontmatter as fields in the markdown file preview

## Meta

- Task ID: `REVIEW-088`
- Status: `done`
- BUILD Task: `BUILD-088`
- Reviewed commit: `de0055a2`
- Reviewed branch: `fix/heimdall-375-md-preview-frontmatter`

---

## §1 Static Code Review

Scope is `BUILD-088 ## Coverage`（`file-view.tsx`、`file-view.module.scss`、`file-view-frontmatter.spec.tsx`、react `package.json`／lock、demo
`file-explorer.tsx`）。Grep 範圍是整條分支相對 `main`（`35e32adf..28f89d49`）的新增行。`lint` / `format` / `typecheck` / `build` / `test`
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

¹ `FileViewProps` 不變；`splitFrontmatter`／`firstHeading`／`fieldText`／`Frontmatter` 皆 module-local、未導出。行為變更只在 `.md`／`.markdown` 預覽。
² 四個 helper 都標了回傳型別（未導出）。
³ 命中 8 處：5 處票號 `#375`；3 處是 `var(--asg-color-…, fallback)` 的後備值，與同檔 `.header`／`.actionBtn` 既有寫法一致，有主題時不生效。
原樣區塊的底色原本寫了 `#111827` 後備，review 時改成 `color-mix(in srgb, currentColor 5%, transparent)`，跟著文字色走。
⁴ `js-yaml` 進 `dependencies`；react build 只 externalize react／react-dom／core／streamdown，所以它被打包進 dist（≈44 KB min／15 KB gzip）。
⁵ 未 bump（兩者仍為 `0.3.91`）。
⁶ `source-set-explorer/file-view.tsx` 仍有自己的一份預覽分支（同一個 bug），本 task 未動，所以沒有第二份 helper。
⁷ 預覽分支換成 `splitFrontmatter` ＋ `<Frontmatter>` ＋ `body`；`CodeEditor value={content ?? ''}` 與 `scheduleSave(val)` 原樣。
⁸ key 與 value 都是 React 文字節點，沒有 `dangerouslySetInnerHTML`。實測 `__proto__:` key 只是一般的 own key、不污染原型；
alias 炸彈（9 層 × 9 個 alias）`load` 與 `dump` 各 1 ms，`dump` 以 YAML 參照輸出、不展開。

### §1.2 Mechanical grep（`35e32adf..28f89d49` 新增行）

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
test:          PASS — core 430、react 663（本 task 新增 31 案）
```

本 repo 沒有 `lint:check` script；唯讀 lint 以 `lint:packages` 代替（同 REVIEW-087）。

---

## §3 Functional Validation

| R#    | Result | Evidence                                                                                                                                                                             |
| ----- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `R1`  | ✅     | spec 3 案（LF、CRLF、`.markdown`）。demo 987px／341px：`article.md` 頂部無 `<hr>`、無 `title: "…"` 大標題，`H1` 只有一個                                                             |
| `R1a` | ✅     | spec 6 案（順序、`>-` 折疊、字串清單、`\|` 保留換行、巢狀以 YAML 文字、不轉型）。demo：`SKILL.md` 四列 `name`／`description`／`tags`／`version`，窄版自動換行、無水平溢出            |
| `R1b` | ✅     | spec 4 案（空區塊無表、解析失敗、非 mapping、巢狀空值 → 原樣區塊）。demo：在 `SKILL.md` 打一個未閉合引號，預覽退回原樣區塊、內容完整                                                 |
| `R1c` | ✅     | spec 6 案（相同就藏、只剩它時整表不顯示、其他列保留、去空白比對、不同就留、只認 `title`、`##` 不算）。demo 987px／341px：`article.md` 沒有欄位表、只有一個 `H1`；`SKILL.md` 四列不變 |
| `R5`  | ✅     | spec 2 案：標題行塞 5 萬個空白（有／無 frontmatter）各在 1 s 內渲染完；修正前各約 10 s。sub-agent 量到舊 regex 20k 空白 1.5 s                                                        |
| `R6`  | ✅     | demo 341px：46 字元 key 換行、key 欄上限 127px（40%）、值欄 190px、無溢出；987px 不變                                                                                                |
| `R2`  | ✅     | spec：編輯模式含完整 frontmatter。demo（上一輪）：打字存檔後從記憶體 fs 重讀，frontmatter 與編輯都在；本輪 diff 未動編輯／存檔路徑                                                   |
| `R3`  | ✅     | spec 3 案：正文中的 `---` 仍是 `<hr>`；開頭 `---` 無結尾照原文；空 frontmatter 不吃到後面的分隔線                                                                                    |
| `R4`  | ✅     | 閘門全綠（§1.4）。深色：以 Heimdall `.dark` token 值設定其 `AsgardThemeScope` 會產生的 `--asg-color-*`，欄位表與原樣區塊皆可讀                                                       |

---

## Findings

### Critical (must fix before done)

None.

### Important (should fix in this cycle)

- **已修（`9ba7bca1`）** 空的 frontmatter（`---\n---\n`）後面正文又有 `---` 分隔線時，第一版 regex 跳過真正的結尾、一路配對到正文的分隔線，
  標題與前段正文都不顯示。補了會失敗的 spec 後把中間內容改成可空、且先試空（`(?:…)??`）。

- **已修（`28f89d49`）** 欄位表讓 `article.md` 的標題文字出現兩次（`title` 欄位＋`# ` 標題），可能被 #375 Expected ¶2「標題只出現一次」
  退件（Heimdall session 提出）。上一輪只列成 Minor，低估了。改成 `title` 與正文第一個 `# ` 標題相同時不顯示那一列（R1c）。

- **已修（`de0055a2`）sub-agent code review**（逐條重現後才修）：
  - #1 important：`FIRST_HEADING` 的 lazy `.+?` 遇到長空白會平方級回溯（20k 空白 1.5 s），而且每個 `.md` 預覽都會跑 → 改成線性逐行掃描，只在有字串 `title` 時才找標題。
  - #2：開頭 `---` 下一行是空行的文件（用 `---` 分頁的投影片）被整段吞進原樣區塊，相對 main 是回歸 → `---`＋空行不當 frontmatter。
  - #3：code fence／HTML 註解裡的 `# ` 行被當成標題，`title` 列被誤藏 → 掃描時略過。
  - #6：長 key 在 341px 溢出 → 改成 `<dl>` grid、`fit-content(40%)`。
  - 測試缺口：補上 `onSaveFile` 收到完整內容的斷言。

### Minor (nice to have)

- YAML 折疊（`>-`）把換行變成一個空白，所以中文的兩行之間會多一個空格（「佔位， 本地驗收」）。這是 YAML 規格本身的行為，不改。
- 檔案開頭有 BOM、或結尾 `---` 後面帶空白、用 `...` 收尾時不當成 frontmatter（實測）。agent 產的 `article.md` 碰不到，不改。
- 數字樣式的 key（`1:`、`2:`）會排在最前面（`Object.entries` 的規則），不是檔案順序。要保序得自己從原文解析，不划算，記成已知限制。
- 標題含行內 markdown（`# **x**`）時不會和純文字的 `title` 對上，兩者都顯示。記成已知限制。
- 開頭是 `---` 而且下一行不是空行、內容又不是 key/value 的文件，仍會進原樣區塊（例如 `---\n## Slide 1` 開頭的投影片）。沒有可靠的方法和「打錯的 frontmatter」區分。
- `source-set-explorer/file-view.tsx`（Sindri／Mimir 的 `SourceSetFileExplorer`）有同一個 bug，未在本 task 範圍。

---

## Execution Log

- 2026-10-05: REVIEW task created, paired with BUILD-088 (Status: `draft`).
- 2026-10-05: BUILD-088 done (Status: `draft → ready`).
- 2026-10-05: §1 — 18 項 ✅、0 違規；§3 — R1–R4 全 Pass；邊界實測找到 1 Important（空 frontmatter 吃到正文分隔線），已修並重跑閘門與 demo；3 Minor 不改 (Status: `ready → in-progress → done`).
- 2026-10-05: Reset — BUILD-088 re-opened for the field-table display (R1a / R1b); the review above covers the strip-only version and is re-run after the build (Status: `done → draft`).
- 2026-10-05: Re-run on the field-table build (`af9b62cd`): §1 — 20 項 ✅、0 違規（`#111827` 後備改 `currentColor`）；§3 — R1／R1a／R1b／R2／R3／R4 全 Pass；1 Important（前一輪已修）、4 Minor 不改 (Status: `draft → in-progress → done`).
- 2026-10-05: Reset for R1c (hide a `title` row equal to the first `# ` heading); re-run after the build (Status: `done → draft`).
- 2026-10-05: Re-run on `28f89d49` (R1c): §1 — 20 項 ✅、0 違規；§3 — R1／R1a／R1b／R1c／R2／R3／R4 全 Pass；Important 2（皆已修）、Minor 3 不改 (Status: `draft → in-progress → done`).
- 2026-10-05: Consumer check in Sindri via `npm pack`（directory Files tab, `SKILL.md`）: R1a passes under Sindri's own theme; see BUILD-088 log.
- 2026-10-05: Consumer check in Heimdall via `npm pack`（real agent `article.md` in 「本篇草稿」）: R1 / R1c pass; see BUILD-088 log.
- 2026-10-05: Reset — sub-agent code review findings #1/#2/#3/#6 and the R2 save assertion go back to BUILD-088 (Status: `done → draft`).
- 2026-10-05: Sub-agent code review (read-only, probes under the scratchpad): 0 critical, 1 important, 6 minor, 5 nit, test gaps. #1/#2/#3/#4 and the js-yaml-in-main-chunk point reproduced here before acting. Fixed #1/#2/#3/#6 + the R2 save assertion (`de0055a2`); #4/#5 kept as known limitations; #7 (lazy-load js-yaml) not done; the nits left as is. Gate green (react 663), demo walked at both widths (Status: `draft → in-progress → done`).
