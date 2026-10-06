# BUILD-092 Let the SourceSet hook own hideEntry, and show markdown frontmatter as fields there too

## Meta

- Task ID: `BUILD-092`
- Status: `done`
- Issue: [asgard-js-sdk#485](https://github.com/asgard-ai-platform/asgard-js-sdk/issues/485)（issue 開在本 repo，無 PM tracking spec；issue body 即規格。本 task 做第 1、3、4 項）＋ `SourceSetFileExplorer` 預覽與 [asgard-heimdall-pm#375](https://github.com/asgard-ai-platform/asgard-heimdall-pm/issues/375) 同一個 frontmatter bug（BUILD-090 已在 `FileExplorer` 修掉）
- Source spec: 無 PM spec。`hideEntry` 的語意以 #483（BUILD-087）的 JSDoc 為準；frontmatter 顯示規則以 BUILD-090 的 R1–R6 為準。
- Complexity: `M`

---

## Brief

**hideEntry（#485 第 1、3、4 項）**：隱藏目前只發生在 `tree.tsx` 繪製時，hook 不知道哪些項目被藏起來。後果有二：先前展開過、之後被隱藏的目錄仍留在 `expanded`，重新整理、`invalidate`、seeded cascade 都會再 list 它（`.git/objects` 可能很大），失敗時還會經 `onError` 回報一個畫面上不存在的節點；「選取變成隱藏」得由元件另外補一段（`source-set-file-explorer.tsx` 的 `selectionHidden`）。另外 `renderDirBody` 每次重繪都對整份清單重跑過濾（單一目錄最多 10,000 筆）。

做法：`SourceSetExplorerOptions` 加選填的 `hideEntry`，由 `SourceSetFileExplorer` 傳入。hook 在 expanded cascade、`refresh`、`invalidate` 略過被隱藏的路徑（路徑本身或任一祖先被隱藏），選取變成隱藏時由 hook 清掉（取代元件裡的 `selectionHidden`）。去重（`takenIn`）繼續讀完整清單，維持「貼上不覆蓋被藏的同名項目」。過濾結果以 `listing` 與 `hideEntry` 為 key 記住。

**frontmatter**：`SourceSetFileExplorer` 有自己的一份 `file-view.tsx`，仍把 `.md` 開頭的 frontmatter 畫成「分隔線＋大標題」。F-025 的邊界測試（`module-boundary.spec.ts`）不准它從 `../file-explorer/` 引用 `context-menu`、`types` 以外的東西，所以不能直接拿 `file-explorer/file-view.tsx` 的實作。做法：把 frontmatter 的切分、解析、標題比對與 `<Frontmatter>` 顯示，從 `file-explorer/file-view.tsx` 搬到新的中立模組 `components/markdown-frontmatter/`（含自己的 scss 與 BUILD-090 的測試），兩個 FileView 都從那裡引用。新模組不讀任何 chat context。

**不在範圍**：#485 第 2 項（可寫模式新建隱藏名稱時是否提示）需要產品決定，另議。#482 屬於 `FileExplorer`，是另一個 PR（BUILD-091）。

**Already exists:** `use-source-set-explorer.ts`（`isKnownDir`、expanded cascade、`refresh`、`invalidate`、`takenIn`）、`source-set-file-explorer.tsx`（`hideEntry` prop、`selectionHidden`）、`tree.tsx`（`renderDirBody` 的過濾）、`source-set-explorer.spec.tsx`（BUILD-087 的 hideEntry 測試）、`file-explorer/file-view.tsx` 與 `file-view-frontmatter.spec.tsx`（BUILD-090）。

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

- `R1` When a directory that is expanded becomes hidden by `hideEntry` (or an `autoExpandPaths` entry points into a hidden directory), refresh, `invalidate` and the seeded cascade shall not list it or anything under it, and no `onError` shall be raised for it; un-hiding it lists it again. → T1, T2
- `R2` When the selection, or a folder above it, becomes hidden, the hook shall clear the selection (the component no longer carries its own `selectionHidden` effect); paste de-duplication shall still see hidden entries, so a paste never lands on top of a hidden same-name entry. → T1, T2
- `R3` When the tree re-renders for a reason unrelated to a listing or `hideEntry` (menu open / close, busy toggle), `hideEntry` shall not be called again for that listing. → T1, T3
- `R4` When a `.md` / `.markdown` file is previewed in `SourceSetFileExplorer`, the leading frontmatter shall be handled exactly as BUILD-090 R1–R6 specify for `FileExplorer` (fields above the body, `title` equal to the first `# ` heading left out, raw box when it does not read as a mapping, `---` + blank line is not frontmatter, linear heading scan, long keys wrap); edit mode and saving keep the full source. → T4, T5
- `R5` When the frontmatter code moves to `components/markdown-frontmatter/`, `FileExplorer`'s behaviour shall be unchanged (BUILD-090's specs pass from the new location), `module-boundary.spec.ts` shall pass unchanged, and the new module shall import no chat context. → T4, T5
- `R6` (Smoke check) When the developer runs lint / format / typecheck / build / `test:packages` and walks the react-demo SourceSet route and `/file-explorer` at both the narrow and the full-bleed shell (hide toggle, refresh with a hidden expanded folder, a frontmatter `.md`), the system shall behave per R1–R5 with no build errors. → T6

---

## Implementation Tasks

- [x] T1 (R1–R3): Vitest first in `source-set-explorer.spec.tsx` — hidden expanded dir not re-listed on refresh / invalidate / cascade and no `onError`; un-hide lists it; selection under a newly hidden folder cleared with no component effect; paste de-dupe still sees hidden names; `hideEntry` call count unchanged across an unrelated re-render. Confirm red before T2/T3.
- [x] T2 (R1, R2): `use-source-set-explorer.ts` — optional `hideEntry` option; a "hidden path" check (path or an ancestor hidden, via the parent listings); skip hidden paths in cascade / refresh / invalidate; clear a hidden selection; `takenIn` untouched. `source-set-file-explorer.tsx` passes `hideEntry` to the hook and drops `selectionHidden`.
- [x] T3 (R3): `tree.tsx` — memoize the filtered entries per listing and `hideEntry`.
- [x] T4 (R4, R5): Vitest first — move `file-view-frontmatter.spec.tsx`'s parsing / display cases to the new module; add a SourceSet preview spec (fields, title dedupe, raw box, edit keeps source). Confirm the SourceSet cases red before T5.
- [x] T5 (R4, R5): create `components/markdown-frontmatter/` (`splitFrontmatter`, `<Frontmatter>`, scss); `file-explorer/file-view.tsx` and `source-set-explorer/file-view.tsx` import it; remove the moved code and styles from `file-explorer`.
- [x] T6-1: Run `npm run lint:packages` + `npm run format:check` + `npm run typecheck` + `npm run build:core && npm run build:react` + `npm run test:packages`
- [x] T6 (R6): Smoke check in the react-demo at both widths; screenshots go to the local verification handover, not the repo.

---

## Coverage

Use Cases: R1, R2, R3, R4, R5, R6

Files:

- `packages/react/src/components/source-set-explorer/use-source-set-explorer.ts`（react）— 選填 `hideEntry` 選項、`isHiddenPath()`；cascade／`refresh`／`invalidate` 略過被隱藏路徑；`selectionHidden`（`useMemo`）與清除選取的 effect 從元件搬進來
- `packages/react/src/components/source-set-explorer/source-set-file-explorer.tsx`（react）— 把 `hideEntry` 傳給 hook，拿掉自己的 `selectionHidden`
- `packages/react/src/components/source-set-explorer/tree.tsx`（react）— 每份清單的可見項目以 `WeakMap` 記住，快取與填它的 `hideEntry` 綁在一起
- `packages/react/src/components/markdown-frontmatter/frontmatter.tsx`、`frontmatter.module.scss`（react，新增）— 從 `file-explorer/file-view.tsx` 原樣搬來的 `splitFrontmatter()`、`MarkdownFrontmatter`（原 `Frontmatter`）與樣式，未從套件入口匯出
- `packages/react/src/components/file-explorer/file-view.tsx`、`file-view.module.scss`（react）— 改從新模組引用，移除搬走的程式與樣式
- `packages/react/src/components/source-set-explorer/file-view.tsx`（react）— 預覽分支改用 `splitFrontmatter` ＋ `MarkdownFrontmatter`
- `packages/react/src/components/source-set-explorer/source-set-explorer.spec.tsx`（react）— #485 3 案、SourceSet frontmatter 4 案
- `packages/react/src/components/file-explorer/file-view-frontmatter.spec.tsx`（react）— 首次渲染等待放寬到 3 s

---

## Execution Log / Change Log

- 2026-10-06: BUILD task created from [asgard-js-sdk#485](https://github.com/asgard-ai-platform/asgard-js-sdk/issues/485) items 1, 3, 4 plus the SourceSet half of the BUG-032 frontmatter preview (Status: `draft`).
- 2026-10-06: Plan confirmed (Status: `draft → ready → in-progress`).
- 2026-10-06: T1 specs first: all 3 red (hidden `.git` re-listed on refresh 2× vs 1×; hidden `autoExpandPaths` folder listed 2×; `hideEntry` 22 calls vs 4 across menu open / close). T2/T3 built; the R3 spec was sharpened mid-build to re-render on the already-selected entry (the hook's selection check legitimately runs once per selection change), then re-verified red without the tree memo (25 vs 9) and green with it. The existing #116 selection-dropping specs pass unchanged with the effect moved into the hook (commit `2f54307b`).
- 2026-10-06: T4/T5 (commit `d8504f03`): frontmatter code and styles moved verbatim into `components/markdown-frontmatter/`; the SourceSet preview uses it. The 4 SourceSet cases were checked red without the SourceSet change (3 red — the source-view case is a preservation check that passes either way) after strengthening the title case (it passed red at first because the old rendering's `title:` was an H2 the assertion did not look at). Deviation from the plan: BUILD-090's 31 FileView specs stay in `file-explorer/` instead of moving — they are end-to-end FileView specs and keep proving R5 there. One cold-start timeout in that file's first case (1 of 7 runs) → its render wait widened to 3 s.
- 2026-10-06: Gate green (core 448, react 696; lint 0 errors and back to the 5 pre-existing warnings after tying the tree's cache to `hideEntry` — the first cut added a 6th, `useMemo` "unnecessary dependency"). Demo `/source-set-explorer` at 320px and 1012px: `.git` expanded, `hide . directories` on → refresh lists `""`, `skills`, `skills/pdf` only (0× `.git`); off → `.git` listed once per mount and its children return. `skills/pdf/SKILL.md` previews `name = pdf` above the body, no `<hr>`, no overflow at either width (Status: `in-progress → done`).
- 2026-10-06: Known limitation: an `initialPath` inside a hidden folder still has its ancestors listed once at mount — the root listing that says they are hidden is not loaded yet at that point. The selection it would reveal is still dropped.
