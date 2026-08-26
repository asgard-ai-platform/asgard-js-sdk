# BUILD-070 Let the File Explorer clear its selection

## Meta

- Task ID: `BUILD-070`
- Status: `done`
- Issue: `https://github.com/asgard-ai-platform/asgard-sdk-pm/issues/89`
- Source spec: `references/asgard-sdk-pm/tracking/asgard-js-sdk/bugs/BUG-009-file-explorer-選取資料夾後無法取消-focus-上傳目標永遠鎖在該資料夾.md`
- Complexity: `M`

---

## Brief

Both File Explorers — the chat-side Sandbox one (F-021) and the SourceSet / Drive one (F-025) — hold a
selection that only ever goes in. The tree container binds `onContextMenu` and nothing else, so there is
no left-click path back to "nothing selected", and outside of the initial value, deleting the selected
entry, and switching sandbox, no code path clears it. Once a subfolder is clicked, every
selection-derived action — upload, new file, new folder, paste — is pinned to that folder until the page
is reloaded.

This task adds the two missing exits on both sides: a left-click on tree whitespace and an `Esc` key on
the explorer root, each clearing the selection back to `null`. `Esc` must stay subordinate to an open
dialog or context menu.

The spec's suggested fix widens `onSelect` to `(entry: FsEntry | null) => void`. **Not taken on the chat
side**: `FileExplorerContextValue` is public API (`components/index.ts` → `src/index.ts`), and a function
type in a property position is contravariant in its parameter, so widening it breaks assignment for any
consumer supplying a handler of their own — a breaking change §1.7 puts above type elegance. A sibling
`clearSelection: () => void` is purely additive and reads better besides. The SourceSet tree is internal
(its barrel exports only the component and its props), so `SourceSetTreeProps` simply gains an
`onClearSelection` prop for symmetry. `use-source-set-explorer.ts` needed no change at all.

**Already exists:** `use-source-set-explorer.ts` (`select` already takes `FsEntry | null` at `:258`;
`targetDir` already returns `rootPath` when nothing is selected at `:201`) · both toolbars already derive
`disabled` from the selection (`file-explorer-parts.tsx:222-273`, `source-set-file-explorer.tsx:337-378`),
so R5 follows from R1–R3 rather than needing its own wiring · `upload-conflict-dialog.tsx:40` already
stops `Escape` from propagating · `file-explorer-context.tsx:251` (chat-side `targetDir` derivation).

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
Each criterion is mapped to one or more Implementation Tasks (→ T#).

- `R1` (BUG-009 E1, chat side) When the user left-clicks empty space inside the chat-side File Explorer
  tree, while an entry is selected, the system shall clear the selection so no row stays highlighted;
  a left-click landing on a row shall still select that row and shall not be undone by the container. → T1, T2
- `R2` (BUG-009 E1, SourceSet side) When the user left-clicks empty space inside the SourceSet File
  Explorer tree, while an entry is selected, the system shall clear the selection, with the same
  row-click guarantee as R1. → T3
- `R3` (BUG-009 E2) When the user presses `Esc` while the explorer holds focus and no dialog and no
  context menu is open, the system shall clear the selection on both sides; while a dialog or a context
  menu is open, that overlay shall consume the `Esc` and the selection shall be left untouched. → T4
- `R4` (BUG-009 E3) When no entry is selected, the system shall land upload, new file, new folder, and
  paste at the tree root — `rootPath` on the chat side, the volume root on the SourceSet side. → T5
- `R5` (BUG-009 E4) When the selection has been cleared, the system shall return every toolbar action
  requiring a selection (download / copy / cut / rename / delete) to `disabled`. → T5
- `R6` (BUG-009 E5) When the same clearing interaction is performed on either side, the system shall
  produce the same observable outcome, so the two explorers do not drift apart. → T6
- `R7` (Smoke check) When the developer runs `npm run build:core && npm run build:react` and exercises
  both explorers via Vitest and the react-demo (`npm run serve:react-demo`, http://localhost:4200) at
  both the default 375px widget size and the full-bleed width, the system shall clear the selection on
  whitespace click and on `Esc`, land the next upload at the root, and grey out the selection-only
  toolbar actions, with no build errors. → T9

---

## Implementation Tasks

Run in order; each task maps to the R# it satisfies.

- [x] T1 (R1): Widen the chat-side `onSelect` to `(entry: FsEntry | null) => void` — the context type at
      `file-explorer-context.tsx:109` and the `useCallback` at `:277`, which must clear both `selectedPath`
      and `selectedEntry` when passed `null`. Verify `targetDir` (`:251`) already falls back to
      `rootPath ?? '/'` when `selectedEntry` is `null`.
- [x] T2 (R1): Bind `onClick` on the chat-side tree container (`file-explorer-tree.tsx:138`) to
      `onSelect(null)`, guarded so a click that originated on a row does not reach it
      (`e.target === e.currentTarget`, or `stopPropagation` on the row handler — pick one and apply the
      same choice on both sides).
- [x] T3 (R2): Widen `TreeProps.onSelect` to accept `null` (`source-set-explorer/tree.tsx:15`) and bind
      `onClick` on its container (`:137`) to `onSelect(null)`. `use-source-set-explorer.ts` needs no
      change — `select` already accepts `null` and `targetDir` already falls back to `rootPath`.
- [x] T4 (R3): Add `onKeyDown` + a focusable root on both explorer roots (chat-side `FileExplorerRoot`,
      SourceSet `source-set-file-explorer.tsx:564` — append after the `{...dropZone}` spread). Confirm the
      overlay precedence rather than assuming it: `UploadConflictDialog` calls `stopPropagation` on
      `Escape` and is not portalled, so it does block the root handler — but `ContextMenu` closes on a
      **`document`-level `keydown` listener with no `stopPropagation`** (`context-menu.tsx:47-49`), which
      does **not** stop a React handler on the root. Suppress the clear while a menu is open, and cover
      both overlays with tests.
- [x] T5 (R4, R5): No new wiring expected — both `targetDir` derivations and both toolbars already read
      the selection. Add the regression tests that pin the fallback and the `disabled` transition.
- [x] T6 (R6): Add Vitest for both sides — whitespace click clears, row click still selects, `Esc` clears,
      `Esc` under an open dialog and under an open context menu does not, target falls back to root,
      selection-only toolbar actions go `disabled`.
- [ ] T7: Run `npm run lint:packages` + `npm run format:check` + `npm run typecheck`.
- [ ] T8: Run `npm run build:core && npm run build:react` + `npm run test:packages`.
- [x] T9 (R7): Smoke check — walk every R# in the react-demo at both widths per `AGENTS.md`; attach
      screenshots to `.github/screenshots/`.

---

## Coverage

Use Cases: R1–R7 (BUG-009 E1–E5; R7 smoke is this task's own).

Files — **`@asgard-js/react`** only; `@asgard-js/core` and `apps/react-demo` are untouched, and the two
demo routes already mounted a narrow and a full-bleed shell side by side, so no route change was needed.

- `src/components/file-explorer/file-explorer-context.tsx` — `clearSelection` on the context type, its
  `useCallback`, and both the value object and the memo dep list
- `src/components/file-explorer/file-explorer-tree.tsx` — background `onClick`, guarded by
  `event.target === event.currentTarget`
- `src/components/file-explorer/file-explorer-parts.tsx` — `FileExplorerRoot` gains `tabIndex={-1}` and
  the `Escape` handler, placed after the `{...dropZoneProps}` spread
- `src/components/file-explorer/clear-selection.spec.tsx` — **new**, 6 cases (4 red before the change;
  the other 2 are the "must not clear" guards, which pass either way by construction)
- `src/components/source-set-explorer/tree.tsx` — `onClearSelection` prop + the same guarded background
  `onClick`
- `src/components/source-set-explorer/source-set-file-explorer.tsx` — `clearSelection` /
  `onExplorerKeyDown`, wired to the tree and to the root
- `src/components/source-set-explorer/source-set-explorer.spec.tsx` — 7 cases appended (4 red before);
  reuses the file's existing `installVolume` rather than growing a third fake volume in this package

---

## Scope Decision (prototype)

BUG-009 asks for the prototype to be patched and re-pinned alongside the SDK fix ("比照 BUG-007 的作法"),
naming `FileExplorerPanel.tsx:251` and `SourceSetFileExplorer.tsx`, plus a note in
`docs/figma-make-patches.md`. Two premises do not hold: BUILD-050 (the BUG-007 cycle) treated the
prototype as a **reference solution only** and changed nothing in that submodule, and
`docs/figma-make-patches.md` does not exist in the pinned prototype (`6aad8be`), whose `docs/` holds only
`superpowers/`.

**Decided 2026-08-26: this task is SDK-only.** `references/asgard-chat-kit-prototype` stays pinned at
`6aad8be` and is not modified. The mismatch is to be reported back on the issue so the spec can be
corrected or a separate prototype task opened.

---

## Execution Log / Change Log

- 2026-08-26: BUILD task created from https://github.com/asgard-ai-platform/asgard-sdk-pm/issues/89 (Status: `draft`).
- 2026-08-26: Plan confirmed; prototype scope decided as SDK-only (Status: `draft → ready`).
- 2026-08-26: All R# verified. Static gates green in the order lint → format → typecheck → **build** →
  test (build last on purpose: `typecheck` restores `packages/core/dist` from the Nx cache, and the react
  Vitest run resolves to that dist). 383 tests pass, 0 regressions. Browser walk done on both routes at
  both widths; the context-menu precedence was confirmed live rather than assumed. Visual evidence kept
  outside the repo (Status: `in-progress → done`).
- 2026-08-26: Rebased onto `origin/main` `2d0f9ff4` — BUG-008 (PR #451) is merged, so the root-node
  conflict this task was sequenced behind is gone. Implementation started (Status: `ready → in-progress`).
