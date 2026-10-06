# BUILD-092 Let the SourceSet hook own hideEntry, and show markdown frontmatter as fields there too

## Meta

- Task ID: `BUILD-092`
- Status: `draft`
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

- [ ] T1 (R1–R3): Vitest first in `source-set-explorer.spec.tsx` — hidden expanded dir not re-listed on refresh / invalidate / cascade and no `onError`; un-hide lists it; selection under a newly hidden folder cleared with no component effect; paste de-dupe still sees hidden names; `hideEntry` call count unchanged across an unrelated re-render. Confirm red before T2/T3.
- [ ] T2 (R1, R2): `use-source-set-explorer.ts` — optional `hideEntry` option; a "hidden path" check (path or an ancestor hidden, via the parent listings); skip hidden paths in cascade / refresh / invalidate; clear a hidden selection; `takenIn` untouched. `source-set-file-explorer.tsx` passes `hideEntry` to the hook and drops `selectionHidden`.
- [ ] T3 (R3): `tree.tsx` — memoize the filtered entries per listing and `hideEntry`.
- [ ] T4 (R4, R5): Vitest first — move `file-view-frontmatter.spec.tsx`'s parsing / display cases to the new module; add a SourceSet preview spec (fields, title dedupe, raw box, edit keeps source). Confirm the SourceSet cases red before T5.
- [ ] T5 (R4, R5): create `components/markdown-frontmatter/` (`splitFrontmatter`, `<Frontmatter>`, scss); `file-explorer/file-view.tsx` and `source-set-explorer/file-view.tsx` import it; remove the moved code and styles from `file-explorer`.
- [ ] T6-1: Run `npm run lint:packages` + `npm run format:check` + `npm run typecheck` + `npm run build:core && npm run build:react` + `npm run test:packages`
- [ ] T6 (R6): Smoke check in the react-demo at both widths; screenshots go to the local verification handover, not the repo.

---

## Coverage

Use Cases: [filled during build]
Files: [filled during build]

---

## Execution Log / Change Log

- 2026-10-06: BUILD task created from [asgard-js-sdk#485](https://github.com/asgard-ai-platform/asgard-js-sdk/issues/485) items 1, 3, 4 plus the SourceSet half of the BUG-032 frontmatter preview (Status: `draft`).
