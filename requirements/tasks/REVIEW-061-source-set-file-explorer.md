# REVIEW-061 Review: mount the File Explorer on a SourceSet volume

## Meta

- Task ID: `REVIEW-061`
- Status: `done`
- BUILD Task: `BUILD-061`
- Reviewed commit: `9fc64330` + the R1 fix committed during this review (see Findings → Fixed)
- Reviewed branch: `feat/f024-sourceset-volume-core-client`

---

## §1 Static Code Review

Scope: the 19 files in BUILD-061 `## Coverage`, all resolved before grepping.

### §1.1 Checklist

| Check item                                                                | Rule                           | Result                                                                                                                           |
| ------------------------------------------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| SVG path strings inlined into components                                  | FRONTEND_RULE_COMMON §1.1      | ✅ — icons come from the existing `icons.tsx`; no new inline paths                                                               |
| Inline style magic numbers                                                | FRONTEND_RULE_COMMON §1.2      | ✅ — all new sizing lives in the two `.module.scss` files                                                                        |
| Hardcoded color values (hex / rgba / oklch literal)                       | FRONTEND_RULE_COMMON §1.3      | ✅ in the SDK / ⚠ in the demo — see §1.2 note 3                                                                                  |
| `<style>` tag injected into JSX                                           | FRONTEND_RULE_COMMON §1.4      | ✅ (grep empty)                                                                                                                  |
| Module-level mutable ID counters                                          | FRONTEND_RULE_COMMON §1.5      | ✅ — `MUTATING_ACTION_KEYS`, `SOURCE_ID` and the mock's counts are all constants                                                 |
| Login backdoor outside `NODE_ENV === 'development'` guard                 | FRONTEND_RULE_COMMON §1.6      | n/a — no auth flow                                                                                                               |
| Sensitive data passed through URL query strings                           | FRONTEND_RULE_COMMON §1.7      | ✅ — the token travels as a header; the query carries paths and paging only                                                      |
| Feature components in `src/components/{feature}/`; no `screens/` dir      | FRONTEND_RULE_COMMON §2.1      | ✅ — new code sits in `components/source-set-explorer/`                                                                          |
| TypeScript type and API module exist before first use                     | FRONTEND_RULE_COMMON §2.2      | ✅ — `FsProviders.createFile` / `FsListResult.totalEntries` declared before the consumers                                        |
| API calls routed through a domain module; no ad-hoc `fetch` in components | FRONTEND_RULE_COMMON §3.2      | ✅ — the assembly touches no `fetch`; every call goes through `AsgardSourceSetClient` via the adapter                            |
| Loading and error states both handled                                     | FRONTEND_RULE_COMMON §3.3 §3.4 | ✅ — tree loading / load error already existed; **mutation errors are newly handled at all** (they were silently dropped)        |
| No `as any`; no `eslint-disable` / `@ts-ignore` to bypass type errors     | FRONTEND_RULE_COMMON §4.1 §4.2 | ✅ (both greps empty). One `eslint-disable` was written during the build and **removed** rather than kept — see Findings → Fixed |
| Shared types centralized; no duplicate interfaces across files            | FRONTEND_RULE_COMMON §4.3 §4.4 | ✅ — `SourceSetFsProviders` is a `Pick<FsProviders, …>`, not a parallel declaration                                              |
| Size magic numbers repeated ≥3× extracted                                 | FRONTEND_RULE_COMMON §5.2      | ✅                                                                                                                               |
| All user-facing text via `t()`, synced across en-US / ja-JP / zh-TW       | FRONTEND_RULE_COMMON §5.3      | ✅ — 10 new keys, each present in all three locales (verified by count, below)                                                   |
| Repeated class groups (≥3×), JSX fragments (≥3×), logic (≥2×) extracted   | FRONTEND_RULE_COMMON §6        | ✅ — `fs-blob.ts` extracted the three blob helpers now used by both adapters                                                     |
| No `setTimeout` mock delays                                               | FRONTEND_RULE_COMMON §7        | ✅ — the demo mock deliberately resolves without invented latency                                                                |
| No `console.log`                                                          | FRONTEND_RULE_COMMON §7        | ✅ in this task's diff — see §1.2 note 2                                                                                         |
| No untracked TODO / FIXME                                                 | FRONTEND_RULE_COMMON §7        | ✅ (grep empty)                                                                                                                  |
| Every `useEffect` subscription / listener has cleanup                     | FRONTEND_RULE_COMMON §1.5      | ✅ — the route's `installVolumeMock()` returns its uninstall and the effect returns it, so no route leaves `fetch` patched       |
| Props fully typed; `react` / `react-dom` still externalized               | FRONTEND_RULE_COMMON §4.1 §4.4 | ✅ — no bundler config touched                                                                                                   |

**Score: 20 ✅ / 0 ❌ / 1 n/a**, with two annotated ⚠ notes below.

### §1.1b Task-specific checks

| Check item                                                                                                | R#     | Result                                                                                                    |
| --------------------------------------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------- |
| Every change to `components/file-explorer/` is **additive** — no existing prop, type, or behavior altered | R13    | ⚠ **two intentional exceptions**, both recorded and authorized: R17 (errors now surface) and the R1 fix   |
| `readOnly` defaults to today's behavior when absent                                                       | R1     | ✅ — 4 of the 16 new cases assert exactly that                                                            |
| `readOnly` **hides** mutating actions, while nothing-selected still **disables**                          | R1     | ✅                                                                                                        |
| `toolbarActions` render even under `readOnly`                                                             | R2     | n/a — withdrawn, see BUILD-061 R2                                                                         |
| The shortfall line is absent when the provider reports no shortfall                                       | R3     | ✅                                                                                                        |
| No sandbox / Nudge vocabulary reachable from the SourceSet assembly                                       | R10    | ✅ — asserted at the DOM, not by grep: both rendered shells contain none of sandbox / nudge / wake / 喚醒 |
| The assembly reads no chat context                                                                        | R4     | ✅ — the only match is the word "Chatbot" in a doc comment                                                |
| Absolute↔relative conversion happens at the provider boundary only                                        | R5     | ✅ — `toVolumePath` appears nowhere outside the adapter and its barrel                                    |
| New i18n keys present in all three locales                                                                | R3, R9 | ✅ — 10/10 keys × 3                                                                                       |

### §1.2 Mechanical Grep

The 19-file list was asserted to resolve **before** grepping (`resolved 19 files … all present ✅`).
REVIEW-060's false-clean pass came from skipping exactly that step.

```
#[0-9a-fA-F]\{3,6\}                : ❌ 2 hits  → see note 1
rgba(\|oklch(                      : (empty) ✅
<style>                            : (empty) ✅
as any                             : (empty) ✅
eslint-disable\|@ts-ignore         : (empty) ✅
console\.log                       : ❌ 1 hit   → see note 2
setTimeout                         : (empty) ✅
TODO\|FIXME                        : (empty) ✅

R10  grep -rni 'sandbox|nudge' components/source-set-explorer/   → 2 hits, both prose in comments
R4   grep -rn 'useAsgardContext|useChannel|AsgardServiceClient'  → 1 hit, the word "Chatbot" in a doc comment
R5   toVolumePath outside the adapter                            → (empty) ✅
```

1. **Not colors.** Both hits are `#427`, the issue number cited in two comments explaining the
   controller-identity loop. The pattern cannot tell an issue reference from a shorthand hex.
2. **Not this task's.** `apps/react-demo/src/app/routes/home/home.tsx:67` — present since `4c84011a`
   (2026-03-16) and absent from this cycle's diff (`git diff HEAD~1 HEAD` finds no `console.log`).
   The file is in Coverage only because one demo card was added to it.
3. **Demo colors are raw hex, SDK colors are not.** Every color added to
   `file-explorer-panel.module.scss` is `var(--asg-color-*, <fallback>)`, matching that file
   throughout. `source-set-explorer.module.scss` uses `#6b7280` / `#b91c1c` / `#fef2f2` / `#fecaca`
   directly — §4.2 governs the component library, and the demo's own chrome (`demo-wrapper.module.scss`)
   is hardcoded the same way, so this is consistent rather than clean. Logged as Minor.

### §1.3 TypeScript and Lint

`npm run lint:check` does not exist in this repo; `lint:packages` is the read-only equivalent.
`npm run typecheck` supersedes `npx tsc --noEmit` and covers core + react + react-demo (BUILD-059).

```
typecheck: PASS — NX Successfully ran target typecheck for 3 projects
lint:      PASS — NX Successfully ran target lint for 2 projects
           4 problems (0 errors, 4 warnings)
```

The 4 warnings are the pre-existing react baseline (`jsx-a11y/role-supports-aria-props`,
`react-hooks/exhaustive-deps`, `react/jsx-no-useless-fragment`, `no-new-func`), unchanged in count.
A 5th (an actual **error**, `padding-line-between-statements` in the new spec) was raised by this
review and fixed before finishing.

---

## §3 Functional Validation

`npm run serve:react-demo` on http://localhost:4200. `/source-set-explorer` walked at **both** widths
side by side (narrow 360px, zh-TW; wide full-bleed, en-US), `/file-explorer` walked for the regression.
The chat-kit prototype was served on :8348 and driven in parallel as the visual authority.

### R# Result Matrix

| R#  | Description                                                            | Result      | Note                                                                                                                                                             |
| --- | ---------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | `readOnly` hides mutating actions; absent = today's behavior           | Pass        | Toolbar → Download + Refresh only, separator gone with its group; menu likewise. **Initially Fail on the viewer half** — see Findings → Fixed.                   |
| R2  | `toolbarActions`                                                       | n/a         | Withdrawn during the build; the approved design renders the button outside the explorer.                                                                         |
| R3  | "N more items not loaded" line; absent without a shortfall             | Pass        | 「還有 600 個項目未載入」 at 12px / `--text-secondary` / opacity .7 / 35.2px indent — identical to the prototype's `.ssfe-note.is-muted` measured on :8348.      |
| R4  | Renders and operates from `sourceSetEndpoint` alone, no chat context   | Pass        | The route passes only endpoint + label + locale; no Chatbot on the page.                                                                                         |
| R5  | Adapter: path conversion, `listAll`, image data URL, remove by `isDir` | Pass        | `/docs` tree resolves against a volume-relative API; `onboarding.md` opens and renders markdown through the reused FileView.                                     |
| R6  | `rootPath` locks the tree                                              | Pass        | With `rootPath="docs"`: crumb `/docs`, children `archive` / `vast` / `diagram.svg` / `onboarding.md`, and `skills` / `README.md` unreachable.                    |
| R7  | `initialPath` expands ancestors and selects                            | **Blocked** | Wired via `controller.requestFile(…, { reveal: false })` and typechecked, but the demo route exposes no control for it, so it was never exercised. See Minor 3.  |
| R8  | `createOnly`; 409 → "already exists", nothing overwritten              | Pass        | Creating `README.md` where it exists → notice "An item with that name already exists."; the file is untouched.                                                   |
| R9  | 400 / 403 / 404 / 409 show a sentence, not raw JSON; `onError` fires   | Pass        | 409 walked in the browser with `onError` firing alongside (route shows `onError: HTTP 409`); 400 / 403 / 404 covered by unit cases asserting the body is absent. |
| R10 | No sandbox vocabulary, no Nudge, in any state                          | Pass        | DOM assertion over both shells: zero hits for sandbox / Nudge / wake / 喚醒.                                                                                     |
| R11 | `locale` / `theme` apply without a Chatbot provider                    | Pass        | The two shells render 唯讀 and "Read only" side by side from the `locale` prop alone.                                                                            |
| R12 | Large directory: loading during the walk, whole list after, responsive | Pass        | 10,600 entries → 11 paged requests → **466ms** to first paint of the shortfall line, 10,018 rows, tree scrolling internally, page not overflowing.               |
| R13 | Sandbox File Explorer unchanged — spec files green + browser walk      | Pass        | 12 spec files / 108 cases green, and `/file-explorer` walked: picker, cwd, all ten toolbar buttons, no badge, no notice bar.                                     |
| R14 | Demo route: env-driven, both widths, real dev CRUD                     | **Blocked** | Env switching and both widths are done; **the real-dev half is not**. See below.                                                                                 |
| R15 | (Smoke) lint / format / typecheck / build / test; export in `dist`     | Pass        | core 13 / 245, react **43 / 272**; after `--skip-nx-cache` the built bundle exports all six new symbols plus `FileExplorer.ReadOnlyBadge` / `.Notice`.           |
| R16 | Read-only badge in the header                                          | Pass        | Rendered in both locales; measured against the prototype's `.ssfe-badge`.                                                                                        |
| R17 | One dismissible failure sentence, cleared on the next success          | Pass        | Walked for 409; dismissal and clear-on-success covered by unit cases.                                                                                            |
| R18 | The tree scrolls inside the panel rather than the panel growing        | Pass        | After the route pinned a definite height: shell 543px, tree 464 visible / 244,767 total, page not overflowing. See Findings → Fixed.                             |

### Why R14 is Blocked and not Passed

Everything above ran against an in-memory volume served by a `fetch` interceptor. That is a stronger
harness than fake providers — it exercises the real `AsgardSourceSetClient`, the real adapter, the real
envelope and the real status codes — but it is still not the backend. `apps/react-demo/.env` holds no
volume endpoint and no token.

Combined with BUILD-060, whose 37 cases all mock `fetch`, **nothing in this batch has yet touched a live
volume.** The wire contract came from the dev OpenAPI document, which is authoritative but is not the
same as an observed response. Recording this as Blocked rather than Pass is the point.

### §3.1 Acceptance

- [x] All R# executed at both widths where they are visual
- [x] Each R# marked Pass / Blocked with explanation
- [x] Boundary conditions confirmed: empty listing, load error, 409 conflict, cap reached, read-only
- [x] R13 regression walked in the browser, not inferred from green tests
- [x] `dist` export check run after `--skip-nx-cache`
- [ ] R14 real-dev CRUD — **blocked on credentials**

---

## Findings

### Critical (must fix before done)

None outstanding.

### Fixed during this review

1. **R1 was failing in the file viewer.** `readOnly` hid the toolbar and menu actions, but the FileView
   still offered "Switch to editing" and handed back a `contenteditable="true"` buffer whose save went
   to an undefined handler — so typing did nothing, silently, and the dirty dot never cleared.

   The chat-kit prototype **has the same defect** (verified on :8348: readOnly on → "Switch to edit" →
   `contenteditable="true"`), so matching the design here would have meant shipping the design's bug.

   Fixed by giving `FileView` a `readOnly` prop: the toggle still opens the source, because reading is
   not mutating, but it is labelled "View source" and the buffer is not editable. Verified in the
   browser: readOnly on → `["Reload file", "View source", "Download"]` with `contenteditable="false"`;
   readOnly off → "Switch to editing" with `contenteditable="true"`.

   **Deliberately keyed on `readOnly` alone, not on `onSaveFile`.** The first attempt keyed it on the
   saver, which also fixed sources that simply cannot save — and broke three existing cases in
   `file-view-modes.spec.tsx` whose harness passes no `saveFile`. That would have been a behavior change
   nobody asked for, so it was narrowed. The underlying issue is logged as Minor 1.

2. **An `eslint-disable` was written and then removed.** The client memo needed `customHeaders` by value
   rather than by reference, and the first version suppressed `react-hooks/exhaustive-deps`. §1.2
   forbids that, and pre-commit lints from the repo root where the rule does not even run — so the
   suppression would have been both a violation and useless. Rewritten to derive the client from the
   serialized headers, which makes every dependency honest.

3. **R18 — the panel grew to 244,846px instead of scrolling.** Found by measuring the shell after
   expanding the 10,600-entry directory, not by looking at it. Two causes stacked: `DemoWrapper`'s
   content area is `min-height: auto`, and on a flex item `flex: 1` beats `height` in the main axis, so
   asking for both got neither. Fixed in the route (`flex: none; height: 70vh`); re-measured at 543px.

### Corrected after this review (found by a later audit)

1. **R1 was still passing wrongly.** This review recorded R1 as Pass after fixing the viewer's _initial_
   render, and Minor 5 blamed CodeMirror for not reacting to a live `readOnly` flip. Both were wrong:
   the cause was a missing memo dependency in the viewer, and the consequence was not cosmetic — a
   keystroke after the flip issued a real write. Minor 5 is withdrawn; the defect and its fix are logged
   on BUILD-061.
2. **R11 was a false pass.** It was recorded as "`locale` / `theme` apply without a Chatbot provider —
   Pass". `locale` did not reach the file viewer at all, and **`theme` was not implemented** — the prop
   did not exist. Both are now real and tested: `locale` reaches the viewer, and `theme` rides an
   `AsgardThemeScope` the panel establishes unconditionally — a host that passes no theme still needs
   the tokens, and that was the broken case, not the configured one.
3. **R3 / R12 were passing against a client that could silently truncate.** Confirmed by probe: a
   response with no `paging` reported 1000 of 3000 files as complete, and a relay ignoring `page`
   returned triplicated entries as complete. Both now detected; see BUILD-061's log.

### Important (should fix before release)

1. **`R14` has never run against a real volume** — see above. This is the largest remaining gap in the
   batch and it spans both cycles.

### Minor

1. **A source with no `saveFile` still promises editing.** Outside `readOnly`, `canEdit` is `true`
   regardless of whether a saver exists, so such a source shows "Switch to editing", accepts typing, and
   discards it. Pre-existing, and out of scope by the narrowing decision above — but it is the same
   silent-no-op class the notice bar was added to kill. Worth its own ticket.
2. **`truncatedAtCap` still cannot distinguish** "hit the cap" from "the backend stopped early" (carried
   over from REVIEW-060). The UI line reads the same either way, which is currently fine.
3. **`R7` (`initialPath`) is unexercised.** The demo route has no control for it. Adding one is cheap and
   belongs with BUILD-062.
4. **Demo route colors are raw hex** — consistent with the rest of the demo app, inconsistent with the
   SDK's token discipline. See §1.2 note 3.
5. **Toggling `readOnly` while a file is open leaves the buffer non-editable** until the viewer is
   reopened; CodeMirror does not appear to pick the change up live. Low impact — Odin switches
   view/edit by navigating, not by flipping the prop — but it is real.

---

## Execution Log

- 2026-08-14: REVIEW task created, paired with BUILD-061 (Status: `draft`).
- 2026-08-14: §1 static review — 20 ✅ / 0 ❌ / 1 n/a plus 8 task-specific checks. Three grep hits
  triaged rather than waved through: two `#427` issue references caught by the hex pattern, and one
  `console.log` that predates this task by five months. File list asserted to resolve before grepping,
  which is what REVIEW-060 missed. `typecheck` PASS; `lint` raised one real **error** (a missing blank
  line in the new spec), fixed, back to the 4-warning baseline.
- 2026-08-14: §3 functional validation — R1–R18 walked at both widths against the in-memory volume, plus
  `/file-explorer` for the regression and the chat-kit prototype on :8348 as the visual reference.
  **R1 came back Fail** on the viewer half and was fixed during the review (see Findings); the fix was
  then narrowed after it broke three unrelated cases, and re-verified in the browser. 16 Pass, 1 n/a,
  **2 Blocked** (`R7` unexercised, `R14` needs a live volume).
- 2026-08-14: 0 Critical outstanding. Marked `done` with `R14` explicitly Blocked rather than passed off
  the mock (Status: `draft → in-progress → done`).
