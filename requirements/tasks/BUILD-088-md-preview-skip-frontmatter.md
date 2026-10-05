# BUILD-088 Skip leading YAML frontmatter in the markdown file preview

## Meta

- Task ID: `BUILD-088`
- Status: `done`
- Issue: [asgard-heimdall-pm#375](https://github.com/asgard-ai-platform/asgard-heimdall-pm/issues/375)（Heimdall BUG-032 的「預覽」那一半；「文章列表卡片摘要」那一半由 Heimdall 自己修）
- Source spec: issue body 即規格（`tracking/newsreport/bugs/BUG-032-文章預覽與列表摘要未剝除-article-md-的-yaml-frontmatter-標題重複顯示.md` in `asgard-heimdall-pm`）
- Complexity: `S`

---

## Brief

`FileView` 以 rendered markdown 預覽 `.md`／`.markdown`，原文整份交給 `StreamdownClient`。Heimdall 新對話 agent 寫的
`article.md` 以 YAML frontmatter（`---\ntitle: "…"\n---`）開頭，於是開頭 `---` 被畫成 `<hr>`、`title: "…"` 加結尾 `---`
形成 setext 大標題，緊接著又是正文的 `# 標題`——同一標題出現兩次。

修法只動**預覽模式的渲染輸入**：開頭是格式正確的 frontmatter 區塊時把它略過，其餘原樣交給 `StreamdownClient`。
`content` state、編輯模式（CodeMirror 原始碼）、存檔（`onSaveFile`）全部維持完整原文——Heimdall 靠 frontmatter 解析文章標題，
它不能在 `providers.readFile` 先剝掉，否則一進編輯模式存檔就把 frontmatter 抹掉。

PM Expected 允許「只呈現正文」或「frontmatter 以欄位另外顯示」兩種；本 task 取前者（最小改動、不新增 UI 與文案）。

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

- `R1` When a `.md` / `.markdown` file whose content starts with a well-formed frontmatter block (`---` line, any lines, `---` line) is shown in preview mode, the system shall render only the markdown after that block — no leading `<hr>`, no heading built from the frontmatter lines — so the body's `# 標題` is the only heading of that title. → T1, T2
- `R2` When the same file is switched to edit mode, the system shall show the full original source including the frontmatter, and a save shall write the full content (frontmatter included) through `onSaveFile`. → T1, T2
- `R3` When the content does not start with a well-formed frontmatter block (no `---` on the first line, or no closing `---` line), the system shall render the content unchanged — a `---` thematic break later in the body is still rendered as `<hr>`. → T1, T2
- `R4` (Smoke check) When the developer runs `npm run build:core && npm run build:react` and opens a frontmatter `.md` in the react-demo `/file-explorer` route (`npm run serve:react-demo -- -- --port 5100`) at both the default narrow shell and full-bleed width, the system shall show R1 in preview and R2 in edit, with no build errors. → T3, T4

---

## Implementation Tasks

- [x] T1 (R1, R2, R3): Vitest first — extend `file-view-modes.spec.tsx` (or a sibling spec) with a frontmatter `.md` fixture: preview shows one heading and no `<hr>`; edit mode's source includes the frontmatter; a file with a body-only `---` and one with an unclosed leading `---` render unchanged. Confirm the R1 case fails before the fix.
- [x] T2 (R1–R3): In `file-view.tsx`, feed `StreamdownClient` the content with a leading frontmatter block removed (module-local helper, not exported); leave `content` state, `CodeEditor` and `scheduleSave` untouched.
- [x] T3 (R4): Add a frontmatter `.md` sample to the react-demo file-explorer mock so the route exercises it.
- [x] T4-1: Run `npm run lint:packages` + `npm run format:check` + `npm run typecheck` + `npm run build:core && npm run build:react` + `npm run test:packages`
- [x] T4 (R4): Smoke check — walk R1–R3 in the demo at both widths; screenshots go to the local verification handover, not the repo.

---

## Coverage

Use Cases: R1, R2, R3, R4

Files:

- `packages/react/src/components/file-explorer/file-view.tsx`（react）— module-local `FRONTMATTER` regex + `withoutFrontmatter()`，只套在預覽分支的 `StreamdownClient` 輸入
- `packages/react/src/components/file-explorer/file-view-frontmatter.spec.tsx`（react，新增）— R1–R3 的 Vitest（含 CRLF、`.markdown`、空 frontmatter）
- `apps/react-demo/src/app/routes/file-explorer/file-explorer.tsx`（demo）— in-memory fs 新增 `article.md` 樣本（frontmatter + 正文中的 `---`）

---

## Execution Log / Change Log

- 2026-10-05: BUILD task created from [asgard-heimdall-pm#375](https://github.com/asgard-ai-platform/asgard-heimdall-pm/issues/375), handed over by the Heimdall session (Status: `draft`).
- 2026-10-05: Plan confirmed (Status: `draft → ready → in-progress`).
- 2026-10-05: T1 spec written first — the three R1 cases failed against the unchanged `FileView` (leading `<hr>`, `title:` text), the R2/R3 cases passed; after T2 all 6 pass and the file-explorer suite is 19 files / 157 tests green.
- 2026-10-05: lint (0 errors; the 5 warnings predate this task) / format / typecheck / build:core / build:react / test:packages (core 430, react 638) green. Demo `/file-explorer` walked with Playwright: before the fix the preview showed `H2 title: "…"` + `H1` and two `<hr>`; after, one `H1` and only the body's `<hr>`, at both 987px and 341px with no horizontal overflow. Edit mode showed the full source; typing saved (dirty mark cleared), and a reload from the in-memory fs still had the frontmatter plus the edit (Status: `in-progress → done`).
- 2026-10-05: Noted, not changed: the demo draws the body `<hr>` as `rgba(255,255,255,0.2)` on white, so it is in the DOM but invisible in the light demo; pre-existing styling. `source-set-explorer/file-view.tsx` has the same preview path and the same bug; out of this task's scope (Heimdall uses `FileExplorer`).
- 2026-10-05: Review found that an empty block (`---\n---\n`) followed by a body `---` was matched up to that thematic break, hiding the title. Added a failing spec, made the block body optional and tried empty first (`??`); file-explorer suite 158, full gate green (react 639), demo unchanged at both widths, console clean after reload (commit `9ba7bca1`).
