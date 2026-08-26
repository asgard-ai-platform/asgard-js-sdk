# REVIEW-070 Review: let the File Explorer clear its selection

## Meta

- Task ID: `REVIEW-070`
- Status: `done`
- BUILD Task: `BUILD-070`
- Reviewed commit: `2d0f9ff4` (branch base; the change is uncommitted at review time)
- Reviewed branch: `fix/89-file-explorer-clear-selection`

---

## §1 Static Code Review

### §1.1 Checklist

| Check item                                                            | Rule                      | Result |
| --------------------------------------------------------------------- | ------------------------- | ------ |
| `any` / `as any`                                                      | FRONTEND_RULE_COMMON §1.1 | ✅     |
| `@ts-ignore` / `eslint-disable` to bypass an error                    | §1.2                      | ✅     |
| `console.log` left in library code                                    | §1.3 §7                   | ✅     |
| Hardcoded API key / endpoint / namespace                              | §1.4                      | ✅     |
| Teardown for every subscription / timer                               | §1.5                      | ✅ (1) |
| `@asgard-js/react` imports core through its public entry only         | §1.6                      | ✅     |
| `@asgard-js/core` imports no `react` / `react-dom`                    | §1.6 §2.1                 | ✅ (2) |
| Public API changes carry a `@deprecated` transition                   | §1.7                      | ✅ (3) |
| New public types / functions exported from the package entry          | §2.2                      | ✅ (4) |
| Template type / enum prerequisites                                    | §2.3                      | n/a    |
| Uses `botProviderEndpoint`, not the deprecated `endpoint`             | §2.4                      | n/a    |
| Explicit return types on exported functions                           | §3.1                      | ✅     |
| Shared types centralized in core `src/types/`, no duplicate interface | §3.2                      | ✅     |
| React component props fully typed                                     | §4.1                      | ✅     |
| No hardcoded colors in components                                     | §4.2                      | ✅     |
| `react` / `react-dom` stay peerDependencies                           | §4.4                      | ✅     |
| core and react share one version number                               | §5                        | ✅ (5) |
| Repeated logic (≥2×) / types / JSX (≥3×) extracted                    | §6                        | ✅ (6) |
| No `setTimeout` mock delay, dead code, or untracked TODO / FIXME      | §7                        | ✅     |

**Notes**

1. **§1.5** — nothing registered. The `Escape` handler is a React prop, not an `addEventListener`; the
   background handler likewise. No subscription, timer, or observer is created by this task.
2. **§1.6** — `@asgard-js/core` was not touched at all. This change lives entirely in `@asgard-js/react`.
3. **§1.7** — the reason the spec's suggested fix was **not** taken. `FileExplorerContextValue` reaches
   the package entry via `components/index.ts`, so widening `onSelect` to `(entry: FsEntry | null) => void`
   would be a breaking change: a function type in a property position is contravariant in its parameter,
   so a consumer's `(entry: FsEntry) => void` stops being assignable. `clearSelection: () => void` is
   purely additive instead. The SourceSet `SourceSetTreeProps` is internal (its barrel exports only the
   component and its props types), so a required `onClearSelection` prop there breaks nobody.
4. **§2.2** — `clearSelection` is a member of the already-exported `FileExplorerContextValue`, so it
   reaches consumers through the existing export with no barrel change needed.
5. **§5** — no version change in this task; both packages stay at `0.3.73`.
6. **§6** — the background-click guard and the `Escape` handler each exist twice, once per explorer. This
   is the duplication F-025 R1 **requires**: `module-boundary.spec.ts` sanctions exactly two imports from
   the shared module (`../file-explorer/context-menu`, `../file-explorer/types`), and its own docstring
   says the honest fix for anything else is "copy what it needs into this module" rather than widening the
   frozen module. Extracting a shared helper would have failed that spec. See Minor 1.

### §1.2 Mechanical Grep

Scoped to `## Coverage` files.

```
### any / as any
(empty)

### ts-ignore / eslint-disable
(empty)

### console.log
(empty)

### hardcoded colors (hex / rgba / oklch)
(empty)

### setTimeout
(empty)

### TODO / FIXME
(empty)

### react deep-imports core internals (@asgard-js/core/src)
(empty)
```

### §1.3 TypeScript and Lint

`npm run lint:check` does not exist in this repo; the read-only equivalents are below. Gates were run in
the order lint → format → typecheck → **build** → test, because `typecheck` restores `packages/core/dist`
from the Nx cache and the react Vitest run resolves to that dist (recorded in REVIEW-069 / PR #451).

```
npm run lint:packages   PASS
npm run format:check    PASS — All matched files use Prettier code style!
npm run typecheck       PASS — core + react + react-demo
npm run build:core      PASS
npm run build:react     PASS
npm run test:packages   PASS — core 261 / react 383, 0 regressions
```

### §1.4 Static Review Acceptance

- [x] All §1.1 items checked and marked
- [x] No ❌ violations
- [x] All §1.2 greps run, output pasted (all empty)
- [x] `typecheck` run project-wide — no TypeScript errors
- [x] `lint:packages` run — no ESLint errors

---

## §3 Functional Validation

Walked in the browser against the react-demo dev server on an in-memory mock volume (no backend), on both
`/source-set-explorer` and `/file-explorer`, at both the narrow (320–341px) and full-bleed (987–1010px)
shells those routes already mount side by side. Every interaction was a real mouse coordinate or key
press, not a dispatched event — a dispatched click on the container would prove the handler runs but not
that the whitespace is reachable.

### R# Result Matrix

| R#  | Description                                            | Result | Note                                                                                                                    |
| --- | ------------------------------------------------------ | ------ | ----------------------------------------------------------------------------------------------------------------------- |
| R1  | Chat side: background click clears; row click survives | Pass   | Both widths. Clicked 20px below the last row, inside the container.                                                     |
| R2  | SourceSet side: same                                   | Pass   | Both widths; `aria-selected` went from `notes` to none.                                                                 |
| R3  | `Esc` clears; dialog / context menu take precedence    | Pass   | See note (a) — the context-menu half was the one live check that mattered.                                              |
| R4  | Target falls back to the root once cleared             | Pass   | `in-folder.txt` landed under `notes/`; after clearing, `at-root.txt` landed at the volume root.                         |
| R5  | Selection-only toolbar actions return to `disabled`    | Pass   | Download / copy / cut / rename / delete all `disabled: true`; paste unchanged (it tracks the clipboard, not selection). |
| R6  | Both sides behave the same                             | Pass   | Same three interactions, same observable outcome on both.                                                               |
| R7  | Smoke: build + demo walk at both widths                | Pass   | 644 tests green; both routes walked at both widths.                                                                     |

**Notes**

(a) **The precedence claim was verified, not assumed — and one half of the received wisdom was wrong.**
Both dialogs (`file-explorer-dialog.tsx:115`, `source-set-explorer/dialog.tsx:118`, and
`upload-conflict-dialog.tsx:40`) call `stopPropagation()` on `Escape`, so an open dialog genuinely never
reaches the root handler. `ContextMenu` does **not**: it closes from a `document` keydown listener with no
`stopPropagation` (`context-menu.tsx:47-49`), which runs _after_ React's handler on the root container.
Without an explicit guard, one `Esc` would close the menu _and_ clear the selection. Confirmed live: with
the menu open, the first `Esc` closed the menu and left `notes` selected; a second `Esc` then cleared it.

(b) **`tabIndex={-1}` on the root is load-bearing, not decoration.** A background click leaves focus on
the nearest focusable ancestor; without it, focus falls to `body` and the root's `Esc` never fires.
Measured `document.activeElement === root` immediately after the background click on both sides.

### §3.1 Acceptance

- [x] All R# executed (static read + browser operation + boundary conditions)
- [x] Each R# marked Pass
- [x] No e2e spec exists for these routes; manual browser validation used instead
- [x] Boundary conditions confirmed: row click vs background click, dialog open, context menu open,
      second `Esc` after the menu closed, and the second shell on the same page staying unaffected

---

## Findings

### Critical (must fix before done)

None.

### Important (should fix in this cycle)

None.

### Post-review follow-up (fixed)

**The `Esc` guard did not cover the FileView.** Found while assessing merge confidence, after this review
had been written. While a file has the body, neither the tree nor the toolbar is mounted, so `Esc` cleared
the selection with no visible feedback; it surfaced only on returning to the tree, as a selection the user
never dropped having gone missing and the next upload landing at the root. Verified against a control
before fixing — with `Esc` during the file view, rename came back `disabled`; without it, still enabled —
so this was introduced by BUILD-070, not pre-existing. `openFile` is now part of both guards, with one
regression case per side (react suite: 383 → 385).

This is recorded rather than folded silently into §3: the R# matrix above was accurate for what it
covered, and what it missed was a state the walkthrough never entered.

### Minor (nice to have)

1. **The two explorers each carry their own copy of the guard and the handler.** Deliberate, and the only
   option F-025 R1 leaves open (see §1.1 note 6) — recorded here so a future reader does not "clean it up"
   into a shared helper and break `module-boundary.spec.ts`.
2. **Neither tree container is keyboard-reachable as a whole.** `Esc` works because focus lands on the
   root, and rows are individually focusable on the SourceSet side (`tabIndex={0}`) and are buttons on the
   chat side. But there is no roving-tabindex tree navigation on either side, so a keyboard-only user
   still cannot move between rows with arrow keys. Pre-existing, out of scope for BUG-009, and worth a
   separate a11y ticket rather than a silent expansion of this one.
3. **`apps/react-demo` route `source-set-explorer.tsx:114` mixes `??` with a falsy check.** `usingMock`
   is `!REAL_ENDPOINT` (so `''` counts as "use the mock") but the endpoint is `REAL_ENDPOINT ?? MOCK_ENDPOINT`
   (so `''` is kept). With `VITE_SOURCE_SET_ENDPOINT=` present-but-empty — exactly what copying
   `.env.example` produces — the route installs the mock and then hands the component an empty endpoint,
   and the tree renders `Failed to construct 'URL': Invalid URL`. Demo-only, unrelated to this task, hit
   while setting up the walk. Not fixed here; flagged so it is not rediscovered from scratch.

---

## Execution Log

- 2026-08-26: REVIEW task created, paired with BUILD-070 (Status: `draft`).
- 2026-08-26: §1 static review — 19 items, 0 violations; all 7 greps empty; lint / format / typecheck /
  build / test all green (644 tests).
- 2026-08-26: §3 functional validation — R1–R7 all Pass on both explorers at both widths. The context-menu
  `Esc` precedence was checked live and the guard proved necessary. 0 BLOCKERs (Status: `ready → done`).
