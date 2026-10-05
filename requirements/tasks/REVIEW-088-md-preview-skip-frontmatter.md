# REVIEW-088 Review: skip leading YAML frontmatter in the markdown file preview

## Meta

- Task ID: `REVIEW-088`
- Status: `done`
- BUILD Task: `BUILD-088`
- Reviewed commit: `9ba7bca1`
- Reviewed branch: `fix/heimdall-375-md-preview-frontmatter`

---

## §1 Static Code Review

Scope is `BUILD-088 ## Coverage`（`file-view.tsx`、新增的 `file-view-frontmatter.spec.tsx`、demo `file-explorer.tsx`）。
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
| No breaking public-API change                        | FRONTEND_RULE_COMMON §1.7      | ✅ ¹   |
| New public type exported from the package entry      | FRONTEND_RULE_COMMON §2.2      | ✅ n/a |
| Explicit return types on exported functions          | FRONTEND_RULE_COMMON §3.1      | ✅ ²   |
| Shared types centralized; no duplicates              | FRONTEND_RULE_COMMON §3.2      | ✅ n/a |
| Component props fully typed                          | FRONTEND_RULE_COMMON §4.1      | ✅     |
| No hardcoded colour values                           | FRONTEND_RULE_COMMON §4.2      | ✅ ³   |
| UI verified at both widths, side by side             | FRONTEND_RULE_COMMON §4.3+     | ✅     |
| core and react share a version number                | FRONTEND_RULE_COMMON §5        | ✅ ⁴   |
| Repeated logic extracted (≥2×)                       | FRONTEND_RULE_COMMON §6        | ✅ ⁵   |
| `setTimeout` mock, dead code, untracked TODO / FIXME | FRONTEND_RULE_COMMON §7        | ✅     |
| 只動預覽的渲染輸入；`content`、編輯器、存檔不變      | #375                           | ✅ ⁶   |

¹ `FileViewProps` 不變；`FRONTMATTER`／`withoutFrontmatter()` 是 module-local、未導出。行為變更只在 `.md`／`.markdown` 預覽。
² `withoutFrontmatter(markdown: string): string` 標了回傳型別（未導出）。
³ 命中 2 處，皆為測試檔的票號 `#375`。
⁴ 未 bump（兩者仍為 `0.3.91`）。
⁵ `source-set-explorer/file-view.tsx` 有同一段預覽分支（也有同一個 bug），但本 task 未動它，所以沒有出現第二份 helper；要一起修時再抽共用。
⁶ diff 只換了 `StreamdownClient` 的 children；`CodeEditor value={content ?? ''}` 與 `scheduleSave(val)` 原樣。

### §1.2 Mechanical grep（本次 diff 新增的行，含新增 spec 全檔）

```text
[any]              0
[ignore]           0
[console]          0
[setTimeout]       0
[TODO/FIXME]       0
[color]            2 — 全為票號 #375
[react → core/src] 0
[core diff]        0
[source-set-explorer diff] 0
```

### §1.4 Build / Lint / Format

```text
lint:packages: PASS — 0 errors；5 warnings 皆為既有（file-view.tsx 的 useMemo scheduleSave 那條改前就在，只是行號位移）
format:check:  PASS
typecheck:     PASS — core + react + react-demo
build:         PASS — core, react
test:          PASS — core 430、react 639（新增 7 案）
```

本 repo 沒有 `lint:check` script；唯讀 lint 以 `lint:packages` 代替（同 REVIEW-087）。

---

## §3 Functional Validation

| R#   | Result | Evidence                                                                                                                                                     |
| ---- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `R1` | ✅     | spec 3 案（LF、CRLF、`.markdown`），改前 3 案皆紅。demo：改前 `H2 title: "…"` + `H1`、2 個 `<hr>`；改後只有 `H1`、1 個 `<hr>`（正文那條），987px／341px 一致 |
| `R2` | ✅     | spec：編輯模式 `.cm-content` 含 `---` 與 `title: "…"`。demo：編輯模式見完整原文；打字後未存圓點消失，按重新整理從 in-memory fs 重讀，frontmatter 與編輯都在  |
| `R3` | ✅     | spec 3 案：正文中的 `---` 仍是 `<hr>`；開頭 `---` 無結尾行時照原文渲染；空 frontmatter 不會吃到後面的分隔線                                                  |
| `R4` | ✅     | 閘門全綠（§1.4）；demo 走查見 BUILD-088 Execution Log                                                                                                        |

---

## Findings

### Critical (must fix before done)

None.

### Important (should fix in this cycle)

- **已修（`9ba7bca1`）** 空的 frontmatter（`---\n---\n`）後面正文又有 `---` 分隔線時，原本的 regex 要求兩條 `---` 之間至少一個換行，
  於是跳過真正的結尾、一路配對到正文的分隔線，標題與前段正文都不顯示。以 node 逐案實測發現；補了會失敗的 spec 後把中間內容改成
  可空、且先試空（`(?:…)??`）。實測 LF／CRLF／空／未閉合／正文分隔線／`----` 開頭等 11 種輸入皆符合預期。

### Minor (nice to have)

- 檔案開頭有 BOM、或結尾 `---` 後面帶空白時不剝（實測）。agent 產的 `article.md` 碰不到，不改。
- 第一行剛好是 `---` 分隔線、下面某行又是 `---` 的文件，中間那段會被當成 frontmatter 不顯示（BUILD-088 Brief 已記，與 GitHub／Obsidian 判讀一致）。
- `source-set-explorer/file-view.tsx`（Sindri／Mimir 的 `SourceSetFileExplorer`）有同一個 bug，未在本 task 範圍。

---

## Execution Log

- 2026-10-05: REVIEW task created, paired with BUILD-088 (Status: `draft`).
- 2026-10-05: BUILD-088 done (Status: `draft → ready`).
- 2026-10-05: §1 — 18 項 ✅、0 違規；§3 — R1–R4 全 Pass；邊界實測找到 1 Important（空 frontmatter 吃到正文分隔線），已修並重跑閘門與 demo；3 Minor 不改 (Status: `ready → in-progress → done`).
