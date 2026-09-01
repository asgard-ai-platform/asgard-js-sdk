# REVIEW-075 Review: host actions under readOnly, path highlight and auto-expand

## Meta

- Task ID: `REVIEW-075`
- Status: `done`
- BUILD Task: `BUILD-075`
- Reviewed commit: `d6d3299f` (second round; first round was `0fc95574`)
- Reviewed branch: `feat/95-explorer-search-path-affordances`

---

## §1 Static Code Review

Scope is `BUILD-075 ## Coverage`: `packages/react/src/components/source-set-explorer/` and
`apps/react-demo/src/app/routes/source-set-explorer/`. `typecheck` / `lint` / `build` run project-wide.

### §1.1 Checklist

| Check item                                                           | Rule                           | Result |
| -------------------------------------------------------------------- | ------------------------------ | ------ |
| `any` / `as any`                                                     | FRONTEND_RULE_COMMON §1.1      | ✅     |
| `@ts-ignore` / `@ts-nocheck` / `eslint-disable` to bypass an error   | FRONTEND_RULE_COMMON §1.2      | ✅     |
| `console.log` left in library code                                   | FRONTEND_RULE_COMMON §1.3 §7   | ✅     |
| Hardcoded API key / endpoint / namespace                             | FRONTEND_RULE_COMMON §1.4      | ✅     |
| Teardown for every subscription / listener / timer                   | FRONTEND_RULE_COMMON §1.5      | ✅     |
| `@asgard-js/react` imports core through its public entry only        | FRONTEND_RULE_COMMON §1.6      | ✅     |
| `@asgard-js/core` free of `react` / `react-dom` / DOM                | FRONTEND_RULE_COMMON §1.6 §2.1 | ✅     |
| Public API change carries a `@deprecated` transition                 | FRONTEND_RULE_COMMON §1.7      | ✅     |
| New public types / components exported from the package entry        | FRONTEND_RULE_COMMON §2.2      | ✅     |
| Message-template prerequisites in place                              | FRONTEND_RULE_COMMON §2.3      | ✅ n/a |
| `botProviderEndpoint` rather than the deprecated `endpoint`          | FRONTEND_RULE_COMMON §2.4      | ✅ n/a |
| Explicit return types on exported functions                          | FRONTEND_RULE_COMMON §3.1      | ✅     |
| Shared types centralized, no duplicate interfaces                    | FRONTEND_RULE_COMMON §3.2      | ✅     |
| Component props fully typed                                          | FRONTEND_RULE_COMMON §4.1      | ✅     |
| No hardcoded colour outside a `var()` fallback                       | FRONTEND_RULE_COMMON §4.2      | ✅     |
| `react` / `react-dom` stay peerDependencies                          | FRONTEND_RULE_COMMON §4.4      | ✅     |
| core and react share a version number                                | FRONTEND_RULE_COMMON §5        | ✅     |
| Repeated logic (≥2×) / types / JSX (≥3×) extracted                   | FRONTEND_RULE_COMMON §6        | ✅     |
| `setTimeout` mock delay, dead commented code, untracked TODO / FIXME | FRONTEND_RULE_COMMON §7        | ✅     |

Notes on the three that needed a judgment rather than a grep:

- **§1.7 — the `readOnly` change is a behavior change, not a breaking API change.** No prop is removed,
  renamed or retyped; a host that returned items for a read-only mount now sees them rendered. Recorded
  as a decision in `BUILD-075 ## Brief`, and the superseded `BUILD-064 R3` case is inverted in place
  rather than deleted, so the reversal is visible where the old expectation lived.
- **§2.2 — nothing new to export.** All four affordances are properties of the already-public
  `SourceSetFileExplorerProps`; `index.ts` is unchanged, and the three new props are present in the
  emitted `packages/react/dist/components/source-set-explorer/source-set-file-explorer.d.ts` (lines 46,
  58, 95). `normalizeRefPath` / `pathChain` stay module-internal, as `paths.ts` already is.
- **§6 — the demo's two mounts were extracted into one `ExplorerMount`.** The panel would otherwise be
  the third copy of the same block; the extraction also gives each mount its own selection, which is
  what `onSelectEntry` is for.

### §1.2 Mechanical Grep

Scanned `packages/react/src/components/source-set-explorer/` +
`apps/react-demo/src/app/routes/source-set-explorer/`, plus the two cross-package guards project-wide.

```
### any / as any
packages/react/src/components/source-set-explorer/paths.spec.ts:8:  * reaches the backend as a 400 rather than as anything the user could act on.
packages/react/src/components/source-set-explorer/source-set-explorer.spec.tsx:596: * and already fell `targetDir` back to the volume root; what was missing was any UI that called it, so
  → both are the English word "any" inside prose comments, not the type. ✅

### ts-ignore / eslint-disable          (no output) ✅
### console.log                          (no output) ✅
### core reverse dep on react            (no output) ✅
### react deep-import into core          (no output) ✅
### TODO / FIXME                         (no output) ✅

### setTimeout
packages/react/src/components/source-set-explorer/blob.ts:46
packages/react/src/components/source-set-explorer/file-view.tsx:107,113
packages/react/src/components/source-set-explorer/batch-upload.spec.tsx:236,251,322,490
apps/react-demo/src/app/routes/source-set-explorer/volume-mock.ts:57
  → all pre-existing; none is in a file this task changed except `volume-mock.ts`, whose line 57 is the
    mock's own latency helper and is untouched by the diff. Confirmed by grepping the added lines only:
    `git diff main...HEAD -- '*.ts' '*.tsx' | grep '^+' | grep -E 'setTimeout|console\.log|: any|as any'`
    → no output. ✅

### hardcoded colour, added lines of the package stylesheet
+  color: var(--asg-color-primary, #4f46e5);
+  color: color-mix(in srgb, var(--asg-color-primary, #4f46e5) 60%, var(--asg-color-text-secondary, #6b7280));
  → both are `var(--asg-*, <literal fallback>)`, the pattern this stylesheet's own header mandates so a
    host that sets no theme still gets a painted component. No bare literal. ✅
```

### §1.3 Build / Lint / Format

```
lint:packages: PASS — 0 errors, 5 warnings, all pre-existing and none in a changed file
               (chat-composer.tsx:374, file-explorer/file-view.tsx:183,
                per-source-view-state.spec.tsx:99, source-set-explorer/file-view.tsx:172,
                canvas-runtime-behavior.spec.ts:56)
format:check:  PASS — all matched files use Prettier code style
typecheck:     PASS — core + react + react-demo
build:         PASS — build:core + build:react clean; the three new props are in the emitted .d.ts
test:packages: PASS — 275 core + 432 react
```

One extra gate outside the rule's list, because this task changed the demo: `nx lint react-demo` — 0
errors, 15 pre-existing warnings.

### §1.4 Static Review Acceptance

- [x] All §1.1 items checked and marked
- [x] No ❌ violations, so nothing to list
- [x] All §1.2 grep commands run and output pasted
- [x] `npm run typecheck` and `build:core` / `build:react` — no TypeScript errors
- [x] `npm run lint:packages` — no ESLint errors

---

## §3 Functional Validation

Vitest at `packages/react/src/components/source-set-explorer/` plus a walk of the react-demo route at
both mount widths (`npm run serve:react-demo -- -- --port 5100`, per `CLAUDE.local.md`).

### R# Result Matrix

| R#  | Description                                                 | Result | Note                                                                                                                                                                                                                 |
| --- | ----------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Host actions survive `readOnly`; built-ins still suppressed | Pass   | Demo under `readOnly`: toolbar down to Download + Refresh in both mounts, menu = Download / `Pull from external source` / `Add skills/ to search paths` / Refresh, and the search-path item ran and changed the list |
| R2  | Two strengths, both distinguishable                         | Pass   | Computed styles: target `rgb(79,70,229)` weight 600, ancestor `≈rgb(90,88,189)` weight 400, unmarked black weight 400. Removing `skills/` returned it to the ancestor shade with `csv` / `pdf` still targets         |
| R3  | Leading / trailing slashes absorbed before comparison       | Pass   | The demo holds every path as `skills/pdf/` and hands it over unaltered; `paths.spec.ts` covers `//git//`, `/`, and the empty string                                                                                  |
| R4  | Seed opens the chain **and the path itself**, and lists it  | Pass   | Both mounts opened to `skills/pdf` with `SKILL.md` on screen; `probe.listedPaths()` contains the full chain and not the unopened sibling. A seeded path that is a file is never listed and raises no `onError`       |
| R5  | A later change to `autoExpandPaths` moves nothing           | Pass   | After adding `skills/csv/`, the narrow tree's `csv` stayed collapsed (`aria-expanded` absent) while its colour changed — the highlight is live, the seed is not                                                      |
| R6  | Every selection change reported, and only changes           | Pass   | Selecting in the wide mount armed only that mount's panel button; a repeat click on the same row reports nothing; a background click reports `null`; a `rootPath` change reports the clearing                        |
| R7  | Nothing changes when the props are absent                   | Pass   | With the switch off, every name span carried exactly `.label` and only `''` was listed; the other 42 cases in this file pass unedited apart from the deliberate `BUILD-064 R3` inversion                             |
| R8  | Smoke check                                                 | Pass   | See §1.3 — every gate green, and the demo walk above is the exercise it asks for                                                                                                                                     |

### §3.1 Acceptance

- [x] Every R# executed through Step 1 (static read of the signatures and the emitted `.d.ts`), Step 2
      (Vitest + demo operation) and Step 3 (boundaries)
- [x] Each R# marked Pass
- [x] Vitest run and passing — 47 cases in `source-set-explorer.spec.tsx`, 24 in `paths.spec.ts`
- [x] Boundaries confirmed: a path outside `rootPath`, an empty list, a root-only path (`''` / `/`), a
      seeded path that resolves to a file, and a directory that is both a target and an ancestor

---

## Findings

### Critical (must fix before done)

None.

### Important (should fix in this cycle)

0. **[第二輪] 六項缺陷，四項修掉、一項改文件、一項開票。** 第一輪 §1/§3 是在**只讀過 TASK-005 spec** 的基礎上做的；
   之後補讀了 issue 留言、下游後端契約（[asgard-odin-pm#540](https://github.com/asgard-ai-platform/asgard-odin-pm/pull/540)）、
   `UC-044`、需求方決議，並且**把設計原型跑起來**（[asgard-odin-pm-design#39](https://github.com/asgard-ai-platform/asgard-odin-pm-design/pull/39)），
   對照之下抓到下列各項。全部先用臨時 probe spec 獨立重現、修完再重現一次確認，然後轉成常駐回歸測試。

   | #   | 缺陷                                                                                                                                                   | 實測（修前 → 修後）                                                                                              | 處置                                                                                                                              |
   | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
   | 1   | `refresh()` 對 `expanded` 裡**未確認是目錄**的種子路徑發 `list`，繞過 cascade 的守衛；那些路徑永遠留在集合裡，等於該 mount 的重新整理被永久毒化        | `[…, "git/README.md", "git/ghost"]` → `["", "git", "", "git"]`                                                   | 抽出 `isKnownDir()` 由 cascade 與 `refresh` 共用                                                                                  |
   | 2   | **R5 為假**：重置 effect 依賴 `listDir`，而 `listDir` 閉包 `locale`/`onError` ⇒ 只改 `locale` 就重新套用種子、把收合的樹彈回去，並多送一次 `null` 選取 | 樹彈回展開 + `["git/skills", null]` → 維持收合 + `["git/skills"]`                                                | `localeRef` / `onErrorRef`，`listDir` 只依賴 `[client, maxEntries]`                                                               |
   | 2b  | 同一根因的**既有 bug**：`onError={e => toast(e)}` 使宿主每次 re-render 清空 `listings`、關開啟的檔案、丟剪貼簿與選取、重抓整棵樹                       | `skills` 消失 + 額外 `list` → 零額外請求、`skills` 留著                                                          | 同上                                                                                                                              |
   | 4   | `rootPath` / `initialPath` **不**吸收尾斜線，而新 prop 吸收 ⇒ 宿主拿同一個 `destination_path` 餵三個 prop 時硬失敗，且錯誤訊息不指向 prop              | 爆錯、樹全空、零高亮 → 正常列出、零錯誤、正確高亮                                                                | 兩者都過 `normalizeRefPath`                                                                                                       |
   | 5   | **既有 bug**：`revealed` ref 從不重設 ⇒ 改 `initialPath` 清掉選取後永不重選                                                                            | `["git/README.md", null]` → `["git/README.md", "git/skills"]`（連中間的 `null` 都沒有，React 批次在同一 commit） | 重置 effect 內 `revealed.current = false`                                                                                         |
   | 3   | path 等於 `rootPath` 時不亮也不展開（root 無列可畫）—— 正好是 Skillset 的預設狀態                                                                      | 行為不變                                                                                                         | 三個路徑 prop 的 doc 寫明，並指出宿主該往上掛一層                                                                                 |
   | 6   | 跳色只有顏色通道，祖先層連字重都沒有（WCAG 1.4.1）；不支援 `color-mix()` 時整條退化且無 fallback                                                       | 行為不變                                                                                                         | 參考實作與 Odin 原型皆如此，不單方面偏離 → 開 [asgard-js-sdk#462](https://github.com/asgard-ai-platform/asgard-js-sdk/issues/462) |

   另有一項**與設計原型的偏差**（不是缺陷，是我選錯）：祖先色原型寫 `color-mix(in oklab, primary 62%, text-secondary)`，
   我第一版寫 `in srgb 60%`，且在驗收文件裡把它記成「規格沒給數字，比例是我挑的」—— 那句話不成立，數字就在我讀過的
   那個檔案裡。已改成與原型一致，並把 mix space 與比例釘進 stylesheet 測試。

   §1 與 §3 在修完後重跑：`lint:packages` 0 errors、`nx lint react-demo` 0 errors、`format:check` 乾淨、
   `typecheck` 三專案綠、`test:packages` 712 通過（275 core + 437 react，新增 5 個回歸案例）、build 乾淨。
   R1–R8 逐條仍 Pass。

1. **[test coverage] Three boundaries of the new props were correct but unpinned.** §3 Step 3 probed
   them by hand and all three behaved correctly, but nothing in the suite would have caught a
   regression: a path outside `rootPath` (which must open nothing and must not breach F-025 R11's "never
   list above the root"), an empty `autoExpandPaths` / a root-only `highlightPaths` entry, and the
   subtree-root case where paths stay volume-relative. Routed back to `BUILD-075` and closed in this
   cycle — `0fc95574` adds the two cases and an `outside/` directory to the `DEEP` fixture. Re-ran §1 and
   §3 afterwards: all gates green, react suite 430 → 432.

### Minor (nice to have)

None.

---

## Execution Log

- 2026-09-01: REVIEW task created, paired with BUILD-075 (Status: `draft`).
- 2026-09-01: §1 static review — 19 checklist items, 19 ✅ / 0 ❌; every grep either empty or a confirmed
  false positive (prose "any", pre-existing `setTimeout`, `var()` fallback colours); lint / format /
  typecheck / build / tests all PASS (Status: `draft → in-progress`).
- 2026-09-01: §3 functional validation — R1–R8 all Pass across Vitest and a two-width demo walk. One
  Important finding (unpinned boundaries) routed back to BUILD-075 and fixed in `0fc95574`; §1 and §3
  re-run green afterwards. 0 BLOCKERs (Status: `in-progress → done`).
- 2026-09-01: 第二輪 —— 補讀 issue 留言、下游後端契約、`UC-044`、需求方決議，並把設計原型跑起來對照。六項缺陷：
  四項修掉（commit `d6d3299f`）、一項改 prop doc、一項開 [#462](https://github.com/asgard-ai-platform/asgard-js-sdk/issues/462)；
  另修掉一項與設計原型的顏色偏差。§1 / §3 重跑全綠，0 BLOCKERs（Status 維持 `done`）。
