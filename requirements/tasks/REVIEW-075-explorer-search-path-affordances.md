# REVIEW-075 Review: host actions under readOnly, path highlight and auto-expand

## Meta

- Task ID: `REVIEW-075`
- Status: `done`
- BUILD Task: `BUILD-075`
- Reviewed commit: `0fc95574ff36a6c0a1daf78ab3311408e0244677`
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
