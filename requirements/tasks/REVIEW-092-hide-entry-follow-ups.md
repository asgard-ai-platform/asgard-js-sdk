# REVIEW-092 Review: SourceSet hideEntry in the hook and frontmatter fields

## Meta

- Task ID: `REVIEW-092`
- Status: `done`
- BUILD Task: `BUILD-092`
- Reviewed commit: `d8504f03`
- Reviewed branch: `fix/485-hide-entry-follow-ups`

---

## §1 Static Code Review

Scope is `BUILD-092 ## Coverage`. `lint` / `format` / `typecheck` / `build` / `test` run project-wide.

### §1.1 Checklist

| Check item                                           | Rule                         | Result |
| ---------------------------------------------------- | ---------------------------- | ------ |
| `any` / `as any`                                     | FRONTEND_RULE_COMMON §1.1    | ✅ ¹   |
| `@ts-ignore` / `eslint-disable`                      | FRONTEND_RULE_COMMON §1.2    | ✅     |
| `console.log`                                        | FRONTEND_RULE_COMMON §1.3 §7 | ✅     |
| Teardown for subscriptions / listeners / timers      | FRONTEND_RULE_COMMON §1.5    | ✅ n/a |
| react → core through the public entry only           | FRONTEND_RULE_COMMON §1.6    | ✅     |
| No breaking public-API change                        | FRONTEND_RULE_COMMON §1.7    | ✅ ²   |
| Explicit return types on exported functions          | FRONTEND_RULE_COMMON §3.1    | ✅     |
| No hardcoded colour values                           | FRONTEND_RULE_COMMON §4.2    | ✅ ³   |
| UI verified at both widths                           | FRONTEND_RULE_COMMON §4.3+   | ✅     |
| core and react share a version number                | FRONTEND_RULE_COMMON §5      | ✅ ⁴   |
| Repeated logic extracted (≥2×)                       | FRONTEND_RULE_COMMON §6      | ✅ ⁵   |
| `setTimeout` mock, dead code, untracked TODO / FIXME | FRONTEND_RULE_COMMON §7      | ✅     |
| F-025 boundary: no new `../file-explorer/` import    | `module-boundary.spec.ts`    | ✅ ⁶   |
| New shared module reads no chat context              | F-025 R3                     | ✅ ⁶   |

¹ 唯一命中是註解裡的英文單字 any。
² `useSourceSetExplorer` 不從套件入口匯出，`hideEntry` 選項是內部變更；`SourceSetFileExplorer` 的 props 不變。`MarkdownFrontmatter`／`splitFrontmatter` 也不匯出。
³ 命中 10 處：從 `file-explorer/file-view.module.scss` 原樣搬來的 `var(--asg-color-…, fallback)` 後備值，與票號。
⁴ 未 bump。
⁵ 兩個 FileView 原本會各有一份 frontmatter 程式，改為共用 `components/markdown-frontmatter/`；`isHiddenPath` 取代元件裡同樣的判斷，不是新增第二份。
⁶ 新模組只 import `react`、`js-yaml`、自己的 scss；`module-boundary.spec.ts` 未修改且通過。

### §1.4 Build / Lint / Format

```text
lint:packages: PASS — 0 errors；5 warnings 皆為既有
format:check:  PASS
typecheck:     PASS — core + react + react-demo
build:         PASS — core, react
test:          PASS — core 448、react 696（新增 7 案）
```

---

## §3 Functional Validation

| R#   | Result | Evidence                                                                                                                                                         |
| ---- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `R1` | ✅     | spec 2 案（改前皆紅）。demo 320px／1012px：展開 `.git` → 打開隱藏 → 重新整理只 list `""`、`skills`、`skills/pdf`；關掉隱藏再整理，每個 mount 各 list `.git` 一次 |
| `R2` | ✅     | #116 既有的「選取變隱藏就清掉」「initialPath 指進隱藏處選不到」兩案在 effect 搬進 hook 後不改即通過；貼上去重案照常                                              |
| `R3` | ✅     | spec：對已選取的項目開關右鍵選單兩次，`hideEntry` 呼叫次數不變；拿掉 tree 記憶化時 25 對 9                                                                       |
| `R4` | ✅     | spec 4 案（拿掉 SourceSet 改動時 3 紅）。demo 兩種寬度：`skills/pdf/SKILL.md` 上方 `name = pdf`、無 `<hr>`、無溢出                                               |
| `R5` | ✅     | `FileExplorer` 的 31 個 frontmatter 案例（改從新模組引用後）全過；邊界測試不改即過                                                                               |
| `R6` | ✅     | 閘門全綠；demo 走查見 BUILD-092 Execution Log                                                                                                                    |

---

## Findings

### Critical (must fix before done)

None.

### Important (should fix in this cycle)

None.

### Minor (nice to have)

- `initialPath` 位在被隱藏的目錄裡時，掛載當下它的祖先目錄仍會被 list 一次（那時還沒有根目錄清單可判斷），之後不再 list；選取照樣被清掉。
- `hideEntry` 若每次 render 都是新函式，tree 的快取每次重建、hook 每次重算選取是否隱藏；JSDoc 已寫明要傳穩定的函式。Sindri、Mimir、demo 都是固定函式。
- #485 第 2 項（可寫模式新建隱藏名稱時是否提示）不在本 task，仍開著。

---

## Execution Log

- 2026-10-06: REVIEW task created, paired with BUILD-092 (Status: `draft`).
- 2026-10-06: §1 — 14 項 ✅、0 違規；§3 — R1–R6 全 Pass；3 Minor 不改 (Status: `ready → in-progress → done`).
