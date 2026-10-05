# BUILD-088 Show leading YAML frontmatter as fields in the markdown file preview

## Meta

- Task ID: `BUILD-088`
- Status: `done`
- Issue: [asgard-heimdall-pm#375](https://github.com/asgard-ai-platform/asgard-heimdall-pm/issues/375)（Heimdall BUG-032 的「預覽」那一半；「文章列表卡片摘要」那一半由 Heimdall 自己修）
- Source spec: issue body 即規格（`tracking/newsreport/bugs/BUG-032-文章預覽與列表摘要未剝除-article-md-的-yaml-frontmatter-標題重複顯示.md` in `asgard-heimdall-pm`）
- Complexity: `M`

---

## Brief

`FileView` 以 rendered markdown 預覽 `.md`／`.markdown`，原文整份交給 `StreamdownClient`。Heimdall 新對話 agent 寫的
`article.md` 以 YAML frontmatter（`---\ntitle: "…"\n---`）開頭，於是開頭 `---` 被畫成 `<hr>`、`title: "…"` 加結尾 `---`
形成 setext 大標題，緊接著又是正文的 `# 標題`——同一標題出現兩次。

修法只動**預覽模式的渲染輸入**：開頭是格式正確的 frontmatter 區塊時把它略過，其餘原樣交給 `StreamdownClient`。
`content` state、編輯模式（CodeMirror 原始碼）、存檔（`onSaveFile`）全部維持完整原文——Heimdall 靠 frontmatter 解析文章標題，
它不能在 `providers.readFile` 先剝掉，否則一進編輯模式存檔就把 frontmatter 抹掉。

PM Expected 允許「只呈現正文」或「frontmatter 以欄位另外顯示」兩種。第一版取前者；2026-10-05 改為**後者**：`FileExplorer`
也被 Sindri 掛在目錄檔案分頁與對話檔案面板，只剝不顯示會讓 `SKILL.md` 的 `name`／`description` 在預覽裡消失。改成在正文上方以
欄位表顯示，Heimdall 的標題重複一樣解決，Sindri 也不少資訊。

欄位表以 `js-yaml` 的 `load(text, { schema: FAILSAFE_SCHEMA })` 解析（`node_modules/js-yaml/README.md:70-83`）：只產生字串、陣列、
一般物件，`1.0`、日期、`yes` 不會被轉型，畫出來就是檔案裡寫的字。`SKILL.md` 實際會用 `description: >-` 多行折疊，所以不自寫逐行解析。
`js-yaml` 加進 `@asgard-js/react` 的 `dependencies`（vite 只 externalize react／core／streamdown，會打包進 dist）、`@types/js-yaml` 進 devDependencies。

判斷條件以 Heimdall `src/lib/parse-article-frontmatter.ts` 的 `/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/` 為底，但**不**要求內含
`title:`——預覽不關心欄位內容；並把中間內容改成可空且先試空（`/^---\r?\n(?:[\s\S]*?\r?\n)??---(?:\r?\n|$)/`），否則空的 frontmatter
會跳過自己的結尾 `---`、改配對到正文裡的分隔線（review 時發現，見 REVIEW-088）。這與 GitHub／Obsidian 的判讀一致：檔案第一行就是
`---` 且下面某行又是 `---` 時視為 frontmatter。

**Already exists:** `packages/react/src/components/file-explorer/file-view.tsx`（`body` 的 `kind === 'markdown' && mode === 'preview'` 分支）；
`packages/react/src/components/file-explorer/file-view-modes.spec.tsx`（三種副檔名的呈現路徑測試，可沿用其 harness）。

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

- `R1` When a `.md` / `.markdown` file whose content starts with a well-formed frontmatter block (`---` line, any lines, `---` line) is shown in preview mode, the system shall render the markdown after that block as the body — no leading `<hr>`, no heading built from the frontmatter lines — so the body's `# 標題` is the only heading of that title. → T1, T2
- `R1a` When that block parses to a YAML mapping, the system shall show it above the body as a field table: one row per top-level key, in file order, key on the left and value on the right. A string value shows as parsed (a folded `>-` block reads as one paragraph, a literal `|` block keeps its line breaks); a list of strings shows comma-joined; any other value (nested mapping, list of mappings) shows as YAML text. Values keep their written form (no number / date / boolean coercion). → T1, T2
- `R1c` When the block has a `title` key whose string value, trimmed, equals the text of the body's first level-1 ATX heading (`# …`), the system shall leave that row out of the table — the same title is never shown twice (#375 Expected ¶2); when that leaves no rows, no table is shown. Any other key, a `title` that differs from the heading, or a body without a `# ` heading keeps the row. → T8, T9
- `R1b` When the block is empty or parses to nothing, the system shall show no table; when it does not parse, or parses to something other than a mapping, the system shall show the block's raw text in a monospace box instead — the frontmatter is never silently dropped from the preview. → T1, T2
- `R2` When the same file is switched to edit mode, the system shall show the full original source including the frontmatter, and a save shall write the full content (frontmatter included) through `onSaveFile`. → T1, T2
- `R3` When the content does not start with a well-formed frontmatter block (no `---` on the first line, or no closing `---` line), the system shall render the content unchanged — a `---` thematic break later in the body is still rendered as `<hr>`. → T1, T2
- `R4` (Smoke check) When the developer runs `npm run build:core && npm run build:react` and opens a frontmatter `.md` in the react-demo `/file-explorer` route (`npm run serve:react-demo -- -- --port 5100`) at both the default narrow shell and full-bleed width, the system shall show R1–R1b in preview and R2 in edit, the field table themed through the explorer's CSS variables (no new copy, no i18n keys), with no build errors. → T3, T4

---

## Implementation Tasks

- [x] T1 (R1, R2, R3): Vitest first — frontmatter fixtures in `file-view-frontmatter.spec.tsx`: preview shows one heading and no `<hr>`; edit mode keeps the source; body `---`, unclosed `---`, empty block. Confirmed red before the fix.
- [x] T2 (R1–R3): `file-view.tsx` feeds `StreamdownClient` the content without the leading block; `content` state, `CodeEditor`, `scheduleSave` untouched.
- [x] T5 (R1a, R1b): Vitest first — field table rows / order, `>-` folded and `|` literal strings, string list, nested value as YAML, no coercion (`1.0`, `2026-10-05`, `yes`), empty block → no table, unparsable block and scalar block → raw box. Confirm red before T6.
- [x] T6 (R1a, R1b): Add `js-yaml` (dependency) + `@types/js-yaml` (devDependency) to `@asgard-js/react`; split the leading block into `{ frontmatter, body }`, parse with `FAILSAFE_SCHEMA`, render the table / raw box above the body; styles via `--asg-color-*` in `file-view.module.scss`.
- [x] T8 (R1c): Vitest first — equal `title` hidden (and the table gone when it was the only row), other rows kept, differing `title` kept, `name` equal to the heading kept, `## ` heading does not count. Confirm red before T9.
- [x] T9 (R1c): In `file-view.tsx`, drop the `title` row when it matches the body's first `# ` heading; render nothing for zero rows.
- [x] T3 (R4): Add a frontmatter `.md` sample to the react-demo file-explorer mock so the route exercises it.
- [x] T7 (R4): Add a `SKILL.md`-shaped sample (folded multi-line `description`, list) to the demo mock.
- [x] T4-1: Run `npm run lint:packages` + `npm run format:check` + `npm run typecheck` + `npm run build:core && npm run build:react` + `npm run test:packages`
- [x] T4 (R4): Smoke check — walk R1–R3 in the demo at both widths and under a dark theme; screenshots go to the local verification handover, not the repo.

---

## Coverage

Use Cases: R1, R1a, R1b, R1c, R2, R3, R4

Files:

- `packages/react/src/components/file-explorer/file-view.tsx`（react）— `FRONTMATTER` regex（捕捉內容）、`splitFrontmatter()`、`FIRST_HEADING`／`firstHeading()`、`fieldText()`、module-local `Frontmatter` 元件；只作用在預覽分支
- `packages/react/src/components/file-explorer/file-view.module.scss`（react）— `.frontmatter` 欄位表、`.frontmatterRaw` 原樣區塊，顏色走 `--asg-color-*`
- `packages/react/src/components/file-explorer/file-view-frontmatter.spec.tsx`（react，新增）— R1–R3 7 案、R1a／R1b 10 案、R1c 6 案
- `packages/react/package.json`、`package-lock.json` — `js-yaml` ^4.3.2（dependency）、`@types/js-yaml` ^4.0.9（devDependency）
- `apps/react-demo/src/app/routes/file-explorer/file-explorer.tsx`（demo）— `article.md`（title 與 `# ` 標題相同 → 預覽只剩正文）、`SKILL.md` 樣本

---

## Execution Log / Change Log

- 2026-10-05: BUILD task created from [asgard-heimdall-pm#375](https://github.com/asgard-ai-platform/asgard-heimdall-pm/issues/375), handed over by the Heimdall session (Status: `draft`).
- 2026-10-05: Plan confirmed (Status: `draft → ready → in-progress`).
- 2026-10-05: T1 spec written first — the three R1 cases failed against the unchanged `FileView` (leading `<hr>`, `title:` text), the R2/R3 cases passed; after T2 all 6 pass and the file-explorer suite is 19 files / 157 tests green.
- 2026-10-05: lint (0 errors; the 5 warnings predate this task) / format / typecheck / build:core / build:react / test:packages (core 430, react 638) green. Demo `/file-explorer` walked with Playwright: before the fix the preview showed `H2 title: "…"` + `H1` and two `<hr>`; after, one `H1` and only the body's `<hr>`, at both 987px and 341px with no horizontal overflow. Edit mode showed the full source; typing saved (dirty mark cleared), and a reload from the in-memory fs still had the frontmatter plus the edit (Status: `in-progress → done`).
- 2026-10-05: Noted, not changed: the demo draws the body `<hr>` as `rgba(255,255,255,0.2)` on white, so it is in the DOM but invisible in the light demo; pre-existing styling. `source-set-explorer/file-view.tsx` has the same preview path and the same bug; out of this task's scope (Heimdall uses `FileExplorer`).
- 2026-10-05: Review found that an empty block (`---\n---\n`) followed by a body `---` was matched up to that thematic break, hiding the title. Added a failing spec, made the block body optional and tried empty first (`??`); file-explorer suite 158, full gate green (react 639), demo unchanged at both widths, console clean after reload (commit `9ba7bca1`).
- 2026-10-05: Re-opened after the merge-confidence check found Sindri also mounts `FileExplorer` (directory files tab, conversation files panel): stripping would hide `SKILL.md`'s `name` / `description`. Decided to show the block as a field table above the body, parsed with `js-yaml` (`FAILSAFE_SCHEMA`) because real `SKILL.md` files use folded multi-line values. Added R1a / R1b, T5–T7 (Status: `done → in-progress`).
- 2026-10-05: T5 specs written first — 7 of the 10 field-table cases red against the strip-only build (the empty-block case passes either way). T6: `js-yaml` resolved to 4.3.2 (README `load` / `FAILSAFE_SCHEMA` unchanged from 4.1.1, lines 70–83); `dump` needs `noCompatMode` (else `yes` is quoted) and throws on a nested null, which falls back to the raw block. 168 file-explorer cases green; full gate green (react 649; lint 0 errors, same 5 pre-existing warnings). js-yaml adds ≈44 KB min / 15 KB gzip to the bundled dist (Status: `in-progress → done`).
- 2026-10-05: Demo walk (zh-TW, 987px / 341px): `article.md` shows one `title` row then the single `H1`; `SKILL.md` shows `name` / `description` (folded into one paragraph, wraps at 341px) / `tags` (`git, pr`) / `version` (`1.0`), no horizontal overflow. Dark: the demo shells have no theme scope, so Heimdall's `.dark` token values were set on the shell as the `--asg-color-*` vars its `AsgardThemeScope` would emit (bg `#141414`, border `#434343`, secondary `#ae8d0e`, foreground `oklch(0.985 0 0)`) — keys gold, values white, rules visible. An unclosed quote typed into `SKILL.md` falls back to the raw block, readable in dark.
- 2026-10-05: Re-opened for R1c. The Heimdall session pointed out that #375 Expected ¶2 (「標題只出現一次」) can be read as failing when `article.md` shows a `title` field and the same `# ` heading. Decided: hide only the `title` row, and only when it equals the body's first `# ` heading; Sindri's `name` / `description` untouched, a mismatched `title` still shown (Status: `done → in-progress`).
- 2026-10-05: R1c built (commit `28f89d49`). T8 specs first: the 3 "leave it out" cases red, the 3 "keep it" cases green before T9. `firstHeading()` reads the first `# ` line (closing `#`s and padding trimmed); the `title` row is dropped only for a string value equal to it, and zero rows render nothing. 174 file-explorer cases; full gate green (react 655). Demo: `article.md` shows no table and one `H1` at 987px / 341px; `SKILL.md` still lists `name` / `description` / `tags` / `version` (Status: `in-progress → done`).
- 2026-10-05: Consumer check in Sindri (`asgard-ai-agent-hub-web`, local dev): packed `0.3.92-local` (versions restored afterwards) and installed with `--no-save`. Directory Files tab, a new `SKILL.md` in the verification directory (folded `description`, list, `version: 1.0`): four field rows under Sindri's own dark theme (keys grey, values white, `#434343` rules), one `H1`, no overflow at 1202px; edit → save → reload kept the frontmatter as written. Restored with `npm install` (back to 0.3.91, git clean) and the same file showed the old rendering again. Sindri's dev overlay "1 Issue" (a server-side "Set objects are not supported" error) is present with 0.3.91 too, so it is not from this change. The conversation files panel was not checked: that chat had no running sandbox.
- 2026-10-05: Consumer check in Heimdall (`asgard-ai-auto-post-web`, on the BUG-032 list-summary branch, local dev restarted after installing `0.3.92-local` with `--no-save`): a `/chat` request produced a real agent `article.md` whose `title` equals its `# ` heading. The ed-chat 「本篇草稿」 preview (458px panel) showed one `H1`, no `<hr>`, no field table, no `title:`; source mode kept the frontmatter. Restored to 0.3.91 (git clean) and restarted the dev server. The test article (`zz-test-` prefix) is left for the owner to delete. Noted for the Heimdall half, not this task: the list card summary starts with the raw `# title` text, and the panel's SDK labels are English (Heimdall does not pass `zh-TW` to the explorer).
