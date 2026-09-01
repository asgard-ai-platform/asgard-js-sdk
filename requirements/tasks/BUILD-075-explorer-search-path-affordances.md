# BUILD-075 Keep host actions under readOnly, and add path highlight / auto-expand

## Meta

- Task ID: `BUILD-075`
- Status: `done`
- Issue: [asgard-sdk-pm#95](https://github.com/asgard-ai-platform/asgard-sdk-pm/issues/95)（需求源為消費端 Odin 的 [odin-pm#538 [UC-044] Butany](https://github.com/asgard-ai-platform/asgard-odin-pm/issues/538)，**等這張做完才能啟動**）
- Source spec: `references/asgard-sdk-pm/tracking/asgard-js-sdk/tasks/TASK-005-sourcesetfileexplorer-唯讀下保留宿主動作-並支援路徑高亮與自動展開.md`（背景 feature 為 `features/F-025-sourceset-file-explorer-元件.md`，**F-025 的 AC 不因本 task 改動**，見 Brief 末段）
- Complexity: `M`

---

## Brief

Odin 要把 Skillset 的 Search Paths 從建立表單搬到 Files tab，貼著 `SourceSetFileExplorer` 放，讓使用者**從樹上指資料夾**而不是打路徑（建立當下 volume 是空的，那時候問路徑等於要人猜一個不存在的路徑，而猜錯是靜默的——解析出零個 skill、不報錯）。這需要元件開四個擴充點，前三個**缺一不可**。

1. **`extraEntryActions` 不再被 `readOnly` 抑制**（阻擋性最高）。[BUILD-064](./BUILD-064-explorer-host-extension-points.md) 的 `R3` 把宿主那一段跟內建變更動作綁在同一條規則上，那條規則建立在「宿主動作＝會改 volume」這個不成立的假設上——把資料夾加進 SkillSet 的 search paths 根本不碰 volume。而唯讀來源正是最需要它的地方：from-git 的 SkillSet 檔案唯讀是因為 git 擁有檔案內容，但「哪幾個資料夾算 skill」仍是使用者的決定。本 task 拿掉那條抑制，**內建的變更動作維持被抑制**；要不要在唯讀下提供某個動作，交給宿主用「回傳什麼」表達。
2. **`highlightPaths?: readonly string[]`** —— 依路徑替 entry 名稱上色，**兩級強度**：命中的那一層 accent 實色＋粗體，路徑上每一層祖先淡一階。現有 `entryBadge` 只能在名稱右側掛 ReactNode，改不了字色。
3. **`autoExpandPaths?: readonly string[]`** —— 掛載（或換 `rootPath`）時展開這些路徑、連同祖先鏈**且含路徑自己**。現有 `initialPath` 的 `ancestorDirs()` 會 pop 掉最後一段，所以只展開祖先、不展開路徑自己，且只吃單一路徑。只當**種子**讀一次，不持續追蹤——每次宿主狀態變更都重新展開，會在使用者正在樹上操作時把樹彈回去。
4. **`onSelectEntry?: (entry: FsEntry | null) => void`**（次要）—— 讓樹旁邊的宿主面板能對目前選取操作（「加入選取的資料夾」）。沒有它，右鍵就是唯一入口，對一個刻意不放輸入框的面板來說可發現性太低。

四個 prop 皆 optional，形狀已在 chat-kit prototype 驗證過（[asgard-chat-kit-prototype#22](https://github.com/asgard-ai-platform/asgard-chat-kit-prototype/pull/22)，已 merge，pin [`fc4471d`](https://github.com/asgard-ai-platform/asgard-chat-kit-prototype/blob/fc4471dc2efabc0f8ab9bad2b6ab43fd71fd4d71/src/SourceSetFileExplorer.tsx#L109-L135)）。

> **F-025 的 AC 不需要改。** 它那條寫的是「`readOnly` 為 true 時，所有**變更動作**（含右鍵項目與 toolbar 按鈕）不出現」——講的是元件**自己那十個內建動作**，而宿主追加的那一段本來就不在「變更這個 volume」的語意裡。本 task 推翻的是 BUILD-064 自己下的 `R3`（把宿主段一併吃掉），不是 F-025 的 AC。記在這裡，避免日後被讀成規格漂移。
>
> **這是一次公開行為變更，但不是 breaking API change（§1.7）。** 沒有任何 prop 被移除或改型別；差別只在「宿主在唯讀下回傳的項目現在會被渲染」。既有呼叫端不受影響——Odin Drive 的 syncer 動作本來就自己用 view 模式擋。

**Already exists:** `packages/react/src/components/source-set-explorer/source-set-file-explorer.tsx`（`menuSections` 已把宿主段拼在 `Rename`/`Delete` 與 `Refresh` 之間，`extraEntryActions` / `entryBadge` 兩個擴充點已在）、`use-source-set-explorer.ts`（`expanded` / `selected` 狀態、`ancestorDirs()`、換 root 的 reset effect、`initialPath` reveal effect 都已在）、`tree.tsx`（`SourceSetTree`，`entryBadge` 已穿到列上，名稱在 `styles.label` 那一行）、`paths.ts`（`isWithin` / `joinPath` / `parentDir`）、`source-set-explorer.module.scss`（`.label` / `.rowBadge` 已定義）、`source-set-explorer.spec.tsx`（705 行，測試依 `BUILD-0NN` / `F-0NN R#` 分組，含 BUILD-064 那組 7 案）、`apps/react-demo/src/app/routes/source-set-explorer/source-set-explorer.tsx`（含 `host extension points` 開關的 demo route，兩個寬度並排）。

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

Extra rows for this task:

| §         | Rule (summary)                                                                                                                                            |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-025 R10 | `readOnly` 移除**元件自己的**變更動作（右鍵項目與 toolbar 按鈕）——本 task 把宿主追加的那一段移出此規則的範圍，內建動作照舊                                |
| F-025 R16 | 只用 design-system 的 semantic token（`--asg-color-*`），不自創 token、不寫死色值；高亮兩級都由 `--asg-color-primary` / `--asg-color-text-secondary` 調出 |
| F-025     | `packages/react/src/components/file-explorer/`（in-sandbox explorer 與共用葉節點）**零變更**——本 task 只讀 `context-menu` / `types`                       |
| §1.5      | 新增的 effect 都要能安全重入：seed 只讀一次，cascade 以「已有 listing」為終止條件，不得形成 list → setState → list 的迴圈                                 |

---

## Acceptance Criteria

EARS form: `When <event/condition>[, while <state>], the system shall <observable behavior>`.
Each criterion is mapped to one or more Implementation Tasks (→ T#).

- `R1` While `readOnly` is true, when a host supplies `extraEntryActions`, the system shall call it and render its returned items as their own context-menu section, and shall continue to suppress every built-in mutating action (toolbar and menu alike). → T1
- `R2` When `highlightPaths` names a path, the system shall paint the entry at that exact path with the target emphasis (accent colour, bold) and every directory on the chain leading to it with a weaker ancestor emphasis, so the two are distinguishable from each other and from an unmarked row. → T2, T3
- `R3` When an entry of `highlightPaths` carries a leading or trailing slash (`git/skills/pdf/`), the system shall match it against `entry.path` all the same — the normalization happens before comparison, not at the call site. → T2
- `R4` When the component mounts, or when `rootPath` changes, the system shall expand every path in `autoExpandPaths` together with its ancestor chain **and the path itself**, and shall list those directories so their children are on screen. → T4, T5
- `R5` When `autoExpandPaths` changes while the component stays mounted, the system shall leave the current expansion untouched — it is a seed read once, not state that keeps re-applying over what the user has since collapsed. → T4
- `R6` When the selection changes — including the clearing a `rootPath` change performs, and the clearing a background click or Esc performs — the system shall call `onSelectEntry` with the new entry, or `null`, and shall not call it for a change that did not happen. → T6
- `R7` When none of the four props is supplied, the system shall behave identically to `0.3.77` — same DOM, same listings, same selection lifecycle, and every existing spec passing unchanged. → T7
- `R8` (Smoke check) When the developer runs `npm run typecheck`, `npm run test:packages`, `npm run build:core && npm run build:react`, and exercises the demo route (`npm run serve:react-demo -- -- --port 5100`, see `CLAUDE.local.md`) with a stand-in Search Paths panel, the system shall show the highlight at both levels, the seeded expansion, the host action under `readOnly`, and the selection callback driving the panel, with no build or type errors. → T8

---

## Implementation Tasks

Run in order; each task maps to the R# it satisfies.

- [x] T1 (R1): Drop the `!readOnly &&` guard in front of `extraEntryActions` inside `menuSections`, and rewrite the prop's doc comment to state why the host's section is outside R10's scope. Invert the BUILD-064 `R3` case in `source-set-explorer.spec.tsx` and leave the built-in suppression assertions as they are.
- [x] T2 (R2, R3): Add `normalizeRefPath()` and `pathChain()` to `paths.ts` with unit cases in `paths.spec.ts`; derive `{ targets, ancestors }` in `source-set-file-explorer.tsx` through a `useMemo` keyed on a joined string, so a literal array at the call site does not recompute every render.
- [x] T3 (R2): Thread the two sets into `SourceSetTreeProps` and pick a class for the name span; add `.labelHighlight` / `.labelHighlightAncestor` to `source-set-explorer.module.scss` using only `--asg-color-primary` / `--asg-color-text-secondary` (§4.2 / F-025 R16).
- [x] T4 (R4, R5): Take `autoExpandPaths` into `SourceSetExplorerOptions`, hold it in a ref so only the reset effect reads it, and union its chains (`rootPath` + ancestors + the path itself) into the `expanded` seed alongside `initialPath`'s ancestors.
- [x] T5 (R4): Add the cascade effect that lists an expanded directory which has no listing yet and is confirmed a directory by its parent's listing — the seed can name a depth the initial eager list never reaches, and a path that turns out to be a file must never be listed at all.
- [x] T6 (R6): Take `onSelectEntry` into `SourceSetExplorerOptions` and fire it from an effect that watches `selected` against a ref of what was last reported, so every `setSelected` site (select, clear, reveal, rename, remove, root change) is covered without touching any of them.
- [x] T7 (R7): Confirm the no-props path — `packages/react/src/components/file-explorer/` diff empty, `packages/core/` untouched, existing specs pass with no edits beyond the inverted R3 case.
- [x] T8 (R8): Extend `source-set-explorer.spec.tsx` with a `BUILD-075` group over R1–R7; give the react-demo route a stand-in Search Paths panel (add / remove a path, driven by `onSelectEntry`) wired to `highlightPaths` + `autoExpandPaths`; then run `npm run lint:packages`, `npm run format:check`, `npm run typecheck`, `npm run test:packages`, `npm run build:core && npm run build:react`.

---

## Coverage

Use Cases: `R1`–`R8` — all eight verified. `R1`–`R7` by Vitest (`BUILD-075 — search-path affordances`,
10 cases, plus the inverted BUILD-064 `R3` case and 6 new `paths.spec.ts` cases), and `R1`–`R7` again by
hand in the react-demo at both mount widths.

Files:

| File (package)                                                                       | Change                                                                                   |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `packages/react/src/components/source-set-explorer/paths.ts`                         | `normalizeRefPath()` + `pathChain()` (T2)                                                |
| `packages/react/src/components/source-set-explorer/paths.spec.ts`                    | 6 cases over both helpers, including the root and multi-slash forms (T2)                 |
| `packages/react/src/components/source-set-explorer/source-set-file-explorer.tsx`     | The three new props, the `highlight` memo, and the dropped `readOnly` guard (T1, T2)     |
| `packages/react/src/components/source-set-explorer/use-source-set-explorer.ts`       | `seedExpansion()`, the seed ref, the listing cascade, the selection watcher (T4, T5, T6) |
| `packages/react/src/components/source-set-explorer/tree.tsx`                         | The two highlight sets on `SourceSetTreeProps`, picked per row onto the name span (T3)   |
| `packages/react/src/components/source-set-explorer/source-set-explorer.module.scss`  | `.labelHighlight` / `.labelHighlightAncestor` — `--asg-*` tokens only (T3)               |
| `packages/react/src/components/source-set-explorer/source-set-explorer.spec.tsx`     | `BUILD-075` group (10 cases) + the inverted BUILD-064 `R3` case (T1, T8)                 |
| `apps/react-demo/src/app/routes/source-set-explorer/source-set-explorer.tsx`         | A stand-in Search Paths panel per mount, and the shared list driving both trees (T8)     |
| `apps/react-demo/src/app/routes/source-set-explorer/source-set-explorer.module.scss` | The panel's own styling — host-side, the SDK contributes nothing to that box (T8)        |
| `apps/react-demo/src/app/routes/source-set-explorer/volume-mock.ts`                  | A `skills/` tree, so the mock has an ancestor to paint a step weaker at all (T8)         |

Added after the downstream contract and the design prototype were read (see `## Decisions`):

| File (package)                                                                      | Change                                                                                                                               |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/react/src/components/source-set-explorer/use-source-set-explorer.ts`      | `localeRef` / `onErrorRef` out of `listDir`'s deps; `isKnownDir()` shared by the cascade and `refresh`; the reset re-arms `revealed` |
| `packages/react/src/components/source-set-explorer/source-set-file-explorer.tsx`    | `rootPath` / `initialPath` normalized through `normalizeRefPath`; prop docs on the root-equals-path no-op                            |
| `packages/react/src/components/source-set-explorer/source-set-explorer.module.scss` | Ancestor mix changed to `in oklab` at 62%, matching the reference implementation exactly                                             |
| `packages/react/src/components/source-set-explorer/source-set-explorer.spec.tsx`    | 5 regression cases + the mix space and ratio pinned in the stylesheet assertion                                                      |

`packages/core/` and `packages/react/src/components/file-explorer/` are untouched (T7).

---

## Decisions

- **祖先色用 `in oklab` 62%，不是 `in srgb` 60%。** 這是照參考實作走：chat-kit 的
  `.ssfe-row-name.is-search-path-parent` 寫的就是 `color-mix(in oklab, var(--primary) 62%, var(--text-secondary))`。
  第一版我選了 srgb 60%，理由是這份 stylesheet 其他 `color-mix` 都用 srgb ——**那個理由不成立**：檔案裡其他
  mix 都是「顏色混透明」，沒有一條在混兩個顏色，所以沒有一致性可維護；而 srgb 在同比例下會偏向 accent 自己的
  色相，用 Odin 的翠綠實測差 27/255 的紅（`rgb(93,169,134)` vs `rgb(66,167,133)`），並排看得出來。mix space
  與比例已釘進 stylesheet 測試。
- **`rootPath` / `initialPath` 也吸收尾斜線。** 消費端手上只有一個 `destination_path` 字串（後端存成 `repo/`），
  會同時餵給 `rootPath` 與兩個路徑陣列。原本只有新 prop 容忍尾斜線，`rootPath="repo/"` 則從 core client 拋
  `path must not end with a slash` —— 錯誤訊息指的是 volume path 而不是哪個 prop，樹全空，`autoExpandPaths`
  還被靜默丟棄（`isWithin("repo/", "repo/skills")` 比的是 `startsWith("repo//")`）。既然這張票就是在教消費端
  「尾斜線沒關係」，只做一半是更糟的陷阱。
- **path 等於 `rootPath` 時不亮也不展開，這是刻意的並寫進 prop doc。** root 是樹的框、不是一列，沒有可上色的
  節點。這正是 Skillset 的預設狀態（空 search paths → 後端存 `[destination_path]`），所以三個路徑 prop 的
  doc 都寫明，並指出宿主該往上掛一層。Odin 的原型本來就掛在 volume root，不會踩到。
- **跳色只有視覺通道，不在這張票補無障礙標記。** 參考實作與 Odin 原型都是純視覺，單方面加 `aria-*` 會偏離原型。
  開成 [asgard-js-sdk#462](https://github.com/asgard-ai-platform/asgard-js-sdk/issues/462) 獨立追蹤。
- **順帶修掉兩個既有 bug，因為 R5 / R6 讓它們從隱形變成會被看見。** 重置整棵樹的 effect 依賴 `listDir`，而
  `listDir` 閉包了 `locale` 與 `onError` ⇒ 宿主寫 `onError={e => toast(e)}`（每次 render 都是新 arrow）就會
  在每次 render 清空 `listings`、關掉開啟的檔案、丟掉剪貼簿與選取、重抓整棵樹；而 `revealed` 這個 `useRef`
  從來不重設 ⇒ 改 `initialPath` 只會清掉選取、永遠不再選回來。兩者都早於本 task，但 R5 明說「種子只讀一次」、
  R6 讓宿主真的握著那個選取，所以在本 cycle 內修掉而非留成 follow-up。

---

## Execution Log / Change Log

- 2026-09-01: BUILD task created from [asgard-sdk-pm#95](https://github.com/asgard-ai-platform/asgard-sdk-pm/issues/95) (Status: `draft`).
- 2026-09-01: Plan confirmed; implementation started (Status: `draft → ready → in-progress`).
- 2026-09-01: Implemented T1–T8 (Status: `in-progress → done`). Static gates green — `lint:packages` 0
  errors (5 pre-existing warnings, none in a changed file), `nx lint react-demo` 0 errors after typing
  the ternary that `items.push` no longer gives a contextual type to, `format:check` clean, `typecheck`
  green over core + react + react-demo, `test:packages` 705 passed (275 core + 430 react, 17 new),
  `build:core` + `build:react` clean with all three props present in the emitted `.d.ts`.
- 2026-09-01: Functional walk in the react-demo at 320px and full-bleed. Both trees opened to
  `skills/pdf/` on arrival with its own level expanded (R4); computed styles confirmed three distinct
  renderings — target `rgb(79,70,229)` / 600, ancestor `≈rgb(90,88,189)` / 400, unmarked black / 400
  (R2); the list is held with trailing slashes throughout and still matched (R3); adding `skills/csv/`
  after mount coloured it in both mounts while the narrow tree's `csv` stayed collapsed (R5); selecting
  a folder in one mount armed only that mount's panel button (R6); under `readOnly` the toolbar dropped
  to Download + Refresh while both host items stayed and `Add skills/ to search paths` ran (R1);
  removing `skills/` again returned `skills` to the ancestor shade with `csv` / `pdf` still targets, and
  with the props unset every name span carried exactly the one pre-existing `.label` class (R7).
- 2026-09-01: 讀進下游契約與設計原型後的第二輪（Status 維持 `done`）。來源：[asgard-sdk-pm#95 的留言](https://github.com/asgard-ai-platform/asgard-sdk-pm/issues/95#issuecomment-5487788243)、
  [asgard-odin-pm#540](https://github.com/asgard-ai-platform/asgard-odin-pm/pull/540)（TASK-028 後端契約，已 merged）、
  `UC-044`、決議 `2026-09-01-skillset-search-paths-from-file-tree`、以及**跑起來的**設計原型
  [asgard-odin-pm-design#39](https://github.com/asgard-ai-platform/asgard-odin-pm-design/pull/39)。逐條核對 UC-044
  依賴 SDK 的七條 AC，七條皆可滿足；後端契約（volume-relative、帶尾斜線、前綴非固定 `git/`）與本實作假設一致。
  抓到並修掉的偏差與缺陷見 `## Decisions`；新增 5 個回歸測試。閘門重跑全綠 —— `lint:packages` 0 errors、
  `nx lint react-demo` 0 errors、`format:check` 乾淨、`typecheck` 三專案綠、`test:packages` 712 通過
  （275 core + 437 react），`build:core` / `build:react` 乾淨。
