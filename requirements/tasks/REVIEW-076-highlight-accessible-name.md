# REVIEW-076 Review: announce the highlight levels instead of only painting them

## Meta

- Task ID: `REVIEW-076`
- Status: `done`
- BUILD Task: `BUILD-076`
- Reviewed commit: `<filled on commit>`
- Reviewed branch: `fix/462-highlight-accessible-name`

---

## §1 Static Code Review

Scope is `BUILD-076 ## Coverage`: `packages/react/src/components/source-set-explorer/` and
`packages/react/src/i18n.ts`. `typecheck` / `lint` / `build` run project-wide.

### §1.1 Checklist

| Check item                                            | Rule                           | Result |
| ----------------------------------------------------- | ------------------------------ | ------ |
| `any` / `as any`                                      | FRONTEND_RULE_COMMON §1.1      | ✅     |
| `@ts-ignore` / `eslint-disable`                       | FRONTEND_RULE_COMMON §1.2      | ✅     |
| `console.log`                                         | FRONTEND_RULE_COMMON §1.3 §7   | ✅     |
| Hardcoded key / endpoint / namespace                  | FRONTEND_RULE_COMMON §1.4      | ✅     |
| Teardown for subscriptions / listeners / timers       | FRONTEND_RULE_COMMON §1.5      | ✅ n/a |
| react → core through the public entry only            | FRONTEND_RULE_COMMON §1.6      | ✅     |
| core free of react / react-dom / DOM                  | FRONTEND_RULE_COMMON §1.6 §2.1 | ✅     |
| Public API change carries a `@deprecated` transition  | FRONTEND_RULE_COMMON §1.7      | ✅ n/a |
| New public API exported from the package entry        | FRONTEND_RULE_COMMON §2.2      | ✅ n/a |
| Explicit return types on exported functions           | FRONTEND_RULE_COMMON §3.1      | ✅     |
| Component props fully typed                           | FRONTEND_RULE_COMMON §4.1      | ✅     |
| No hardcoded colour outside a `var()` fallback        | FRONTEND_RULE_COMMON §4.2      | ✅     |
| core and react share a version number                 | FRONTEND_RULE_COMMON §5        | ✅     |
| Repeated logic / types / JSX extracted                | FRONTEND_RULE_COMMON §6        | ✅     |
| `setTimeout` mock, dead code, untracked TODO / FIXME  | FRONTEND_RULE_COMMON §7        | ✅     |
| User-facing strings in the catalog, all three locales | F-005                          | ✅     |
| Only `--asg-*` tokens, fallback declaration included  | F-025 R16                      | ✅     |
| BUILD-064's row-child-count assertions still hold     | BUILD-064                      | ✅     |
| Information not conveyed by colour alone              | WCAG 1.4.1                     | ✅     |

Notes on the three that needed a judgment rather than a grep:

- **§1.7 / §2.2 — nothing public changed.** `git diff --stat` over `packages/react/src/index.ts`,
  `source-set-explorer/index.ts` and `file-explorer/index.ts` is empty. The change is a hidden child
  node, a stylesheet declaration and two catalog entries; every existing consumer is unaffected.
- **§4.2 — the fallback declaration is a token, not a literal.** `color: var(--asg-color-text-secondary, #6b7280)`
  follows this stylesheet's own established form (`var(--asg-*, <literal fallback>)`), so a host that
  sets no theme still gets a painted component.
- **F-005 — all three locales, verified by count.** `grep -c` for each key returns 3, matching the
  catalog's three-locale layout. This repo's catalog is self-contained (F-005, "自製 catalog、零外部套件"),
  so there is no Tolgee import step and no mapping file to hand over.

### §1.2 Mechanical Grep

Restricted to the lines this task adds (`git diff | grep '^+'`), because the surrounding files carry
pre-existing matches that earlier reviews already cleared.

```
### forbidden patterns in added lines
git diff -- '*.ts' '*.tsx' | grep '^+' | grep -E 'setTimeout|console\.log|: any|as any|@ts-ignore|eslint-disable|TODO|FIXME'
  → no output ✅

### bare colour in the added stylesheet lines
+  color: var(--asg-color-text-secondary, #6b7280);
+// Announced but not painted (#462). The two highlight levels are conveyed by colour, and the weaker one
  → first is `var(--asg-*, fallback)`, the file's own pattern; second is a comment whose `#462`
    matches the hex pattern. Both false positives. ✅

### core reverse dep on react            (no output) ✅
### react deep-import into core          (no output) ✅

### three-locale coverage
markedPath: 3
markedPathAncestor: 3
  → ✅

### public export surface
git diff --stat -- packages/react/src/index.ts …/source-set-explorer/index.ts …/file-explorer/index.ts
  → empty ✅
```

### §1.3 Build / Lint / Format

```
lint:packages:  PASS — 0 errors, 5 warnings, all pre-existing and none in a changed file
nx lint react-demo: PASS — 0 errors, 15 pre-existing warnings (the demo is untouched by this task)
format:check:   PASS
typecheck:      PASS — core + react + react-demo
build:          PASS — build:core + build:react clean
test:packages:  PASS — 275 core + 440 react
```

### §1.4 Static Review Acceptance

- [x] All §1.1 items checked and marked
- [x] No ❌ violations, so nothing to list
- [x] All §1.2 greps run and output pasted
- [x] `npm run typecheck` and the builds — no TypeScript errors
- [x] `npm run lint:packages` — no ESLint errors

---

## §3 Functional Validation

Vitest plus a measured pass over the react-demo route (`npm run serve:react-demo -- -- --port 5100`).

### R# Result Matrix

| R#  | Description                                  | Result | Note                                                                                                                                                               |
| --- | -------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R1  | Target level announced after the name        | Pass   | `rowFor('pdf').textContent === 'pdf' + t('marked path')`; in the browser the wide mount's `pdf` row reads `pdf` + the state                                        |
| R2  | Ancestor level announced instead, never both | Pass   | `skills` carries only the ancestor string; a path that is both target and ancestor announces as the target, matching what it paints                                |
| R3  | Announced in the supplied locale             | Pass   | With `locale="zh-TW"`: 1 × 已標記的路徑, 2 × 通往已標記的路徑（`git` and `git/skills`), and zero en-US strings present                                             |
| R4  | No DOM added to an unmarked row              | Pass   | Unmarked rows stay at 3 children, marked at 4; BUILD-064's `toBe(4)` and `toEqual([3, 3])` assertions pass unedited                                                |
| R5  | Nothing visible changes                      | Pass   | Measured: marked and unmarked rows both 1074×24, label left edge identical at equal depth, `document.scrollWidth === innerWidth`, hidden span 1×1 absolute clipped |
| R6  | Ancestor still differs without `color-mix()` | Pass   | Two `color` declarations on `.labelHighlightAncestor`, the plain one first — pinned by a spec case asserting order, since order is the whole mechanism             |
| R7  | Smoke check                                  | Pass   | See §1.3; demo inspected at both mount widths, 4 hidden spans total (2 mounts × 1 target + 1 ancestor)                                                             |

### §3.1 Acceptance

- [x] Every R# executed through static read, test/browser, and boundaries
- [x] Each R# marked Pass
- [x] Vitest run and passing — 55 cases in `source-set-explorer.spec.tsx`
- [x] Boundaries confirmed: a row that is both target and ancestor, a row with a host badge _and_ a
      highlight (4 children plus badge stays coherent), and the props-absent path

---

## Findings

### Critical (must fix before done)

None.

### Important (should fix in this cycle)

None. One test defect was caught and fixed while writing the cases, not in the implementation: the
locale case first used `getByText`, which throws on the two ancestor rows a single seeded path produces
(`git` and `git/skills`). Switched to `getAllByText` with explicit counts, which makes the fan-out part
of the assertion rather than an accident.

### Minor (nice to have)

1. **The announcement is a state, not a role, and screen readers will read it as part of the name.**
   That is the intended trade — `aria-describedby` would be more semantically precise but adds an id
   and a second node per row, and the state is short enough that appending reads naturally. Recorded
   rather than actioned; revisit only if a consumer reports it being noisy.

---

## Execution Log

- 2026-09-01: REVIEW task created, paired with BUILD-076 (Status: `draft → in-progress`).
- 2026-09-01: §1 static review — 19 checklist items, 19 ✅ / 0 ❌; every grep empty or a confirmed false
  positive; lint / format / typecheck / build / tests all PASS.
- 2026-09-01: §3 functional validation — R1–R7 all Pass across Vitest and a measured demo pass.
  0 BLOCKERs (Status: `in-progress → done`).
