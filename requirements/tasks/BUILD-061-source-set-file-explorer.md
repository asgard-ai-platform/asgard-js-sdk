# BUILD-061 Mount the File Explorer on a SourceSet volume

## Meta

- Task ID: `BUILD-061`
- Status: `done`
- Issue: `https://github.com/asgard-ai-platform/asgard-sdk-pm/issues/76` (F-025),
  `.../issues/77` (F-026, UI half), `.../issues/78` (TASK-004) — **all opened 2026-08-14, after this
  task was done**; until then the batch existed only as spec files inside the merged PR #60. Governing
  decisions: `.../issues/79` (compose rather than duplicate — still unanswered, and #76's text still
  describes the superseded approach, so a note was left there) and `.../issues/74` (toolbar slot
  withdrawn). Downstream consumer: `asgard-ai-platform/asgard-odin-pm#439` (UC-032).
- Source spec: `references/asgard-sdk-pm/tracking/asgard-js-sdk/features/F-025-sourceset-file-explorer-元件.md`
  (all ACs) + `.../F-026-sourceset-volume-大目錄分頁載入.md` (UI half) +
  `.../tasks/TASK-004-sourceset-file-explorer-demo-route-與接入文件.md` (demo route only; the README is
  BUILD-062)
- Complexity: `L`

---

## Brief

Cycle 2 of the SourceSet File Explorer batch. `SourceSetFileExplorer` lets a host mount the existing
File Explorer straight onto a SourceSet volume — no chat, no sandbox, no channel — so Platform can edit
SourceSet / SkillSet files and Agent Hub can browse a Directory without spinning up a throwaway vscode
sandbox. It is built by **composing the shared File Explorer parts**, not by writing a second explorer.

**This deviates from F-025 and the deviation is the point of `asgard-sdk-pm#79`.** F-025 (2026-08-10)
requires a fully independent component and lists "`chatbot/file-explorer/` diff is empty" as an
acceptance criterion. One day later, `35a103da` (2026-08-11) restructured this module into
source-agnostic composable parts — `FileExplorer.Provider` / `.Toolbar` / `.Tree` / `.View` /
`.Workspace` over an `FsSource` + `FsProviders` contract — and its own docblocks name this exact
consumer:

- `file-explorer-panel.tsx:67` — "A host that browses something other than sandboxes composes the same
  parts with its own header and the shared `<FileExplorer.Workspace>`"
- `types.ts:37` — "a live sandbox is one kind; **a Sindri directory volume is another**"
- `types.ts:51` — "**Sindri's directory volume API has no equivalent** [of watch] … the FileView
  degrades to load-once when it is absent"
- `types.ts:68` — "each omitted capability simply disables the actions that need it … **which is how a
  read-only source is expressed**"

Building the separate explorer F-025 describes would duplicate ~2,154 lines of a module that was
generalized for this three days earlier. The panel it warned about touching is now 133 lines of
assembly. So this task instead makes **five additive changes** to the shared module and adds a thin
assembly plus an adapter. The plan said three; `createFile` and the error notice emerged from the ACs
once the shared `run()` turned out to swallow every failure, and `locale` from the assembly needing to
be translatable with no Chatbot above it. All five are inert when their prop is absent.

**Already exists** (all read for the plan, none to be rewritten):

- `packages/react/src/components/file-explorer/` — `FileExplorerProvider` (461 lines, the whole
  controller: selection, clipboard, dialogs, all `act*` handlers), `file-explorer-parts.tsx` (554,
  toolbar / header / body / view / context menu / empty state), `file-explorer-tree.tsx` (142, lazy
  `DirChildren`), `file-view.tsx` (235), `paths.ts` (`joinPath` / `parentDir` / `uniqueName` /
  `sortEntries`)
- `create-sandbox-fs-providers.ts` (166) — **the adapter pattern to mirror**: a client → `FsProviders`
  function, image→data-URL, `remove` routed by `isDir`, `<a download>` blob trigger
- `packages/core` — `AsgardSourceSetClient` from BUILD-060, including `listAll`
- `packages/react/src/hooks/use-file-explorer-controller.ts` — `useFileExplorerController()` takes no
  required arguments, so the assembly can own one
- `packages/react/src/i18n.ts` — 117 `fileExplorer.*` keys across en-US / ja-JP / zh-TW

---

## Deviations from F-025, and why

Each is recorded in `asgard-sdk-pm#79` for PM to fold into the ticket. Implementation does not wait.

| F-025 AC                                                              | What this task does                                                                                                  | Why                                                                                                                                                                   |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `chatbot/file-explorer/` diff is empty                                | 3 additive changes to `components/file-explorer/`                                                                    | The premise (an 877-line monolith) expired on 2026-08-11. Regression is guarded by R13 instead: 11 spec files stay green and the sandbox panel is walked in the demo. |
| New `sourceSetExplorer.*` i18n namespace                              | Reuse `fileExplorer.*`; add only the genuinely new keys                                                              | Shared parts means shared strings. Two namespaces would give one button two translations that can drift apart.                                                        |
| Component lives in its own directory, self-contained                  | Directory kept (`components/source-set-explorer/`), but it holds an assembly + adapter rather than a second explorer | Honors the structure without the duplication.                                                                                                                         |
| Path spec says `packages/react/src/components/chatbot/file-explorer/` | Real path is `packages/react/src/components/file-explorer/`                                                          | The `chatbot/` segment has never existed.                                                                                                                             |

`readOnly` follows the ticket literally — mutating actions are **hidden**, not disabled — while the
existing "nothing selected" rule stays **disabled, not hidden**, as the same ticket requires. Running
the prototype confirmed the exact set: with it on, the toolbar keeps only Download and Refresh.

---

## Relevant Rules

Distilled from `FRONTEND_RULE_COMMON.md`; builder reads this table instead of the full corpus.

| §     | Rule (summary)                                                                                                            |
| ----- | ------------------------------------------------------------------------------------------------------------------------- |
| §1.1  | No `any` / `as any` — use precise types, generics, or `unknown` + narrowing                                               |
| §1.2  | No `@ts-ignore` / `eslint-disable` to bypass type or lint errors                                                          |
| §1.3  | No `console.log` left in library code                                                                                     |
| §1.4  | No hardcoded API key / endpoint / namespace — pass via `config`                                                           |
| §1.5  | Every RxJS subscription / EventSource / timer has teardown (`takeUntil` / `unsubscribe` / `useEffect` cleanup)            |
| §1.6  | `@asgard-js/core` never imports `react` / `react-dom` / DOM; react imports core via its public entry only (no `core/src`) |
| §1.7  | No breaking public-API change without `@deprecated` transition                                                            |
| §2.2  | New public types / functions / components exported from the package entry with explicit `export type`                     |
| §3.1  | Exported functions / methods declare explicit return types                                                                |
| §3.2  | Shared types centralized in `core/src/types/`; no duplicate interfaces across files                                       |
| §4.1  | React component props fully typed (no `any`)                                                                              |
| §4.2  | No hardcoded color values — theme via CSS variables / theme context                                                       |
| §4.3+ | UI acceptance is walked at **both** widths, rendered side by side on the demo route                                       |
| §4.4  | `react` / `react-dom` stay peerDependencies (not bundled)                                                                 |
| §5    | `@asgard-js/core` and `@asgard-js/react` keep the same version number                                                     |
| §6    | After implementation: extract repeated logic (≥2×), duplicate types, repeated JSX (≥3×)                                   |
| §7    | No `setTimeout` mock delays, no `console.log`, no dead commented code, no untracked TODO / FIXME                          |

Extra rule for this task, from memory of `/all-features-wide`: style review happens on the **wide**
route under the **Crazy** theme, because that is where an unthemed hardcoded value or a broken
full-width alignment actually shows.

---

## Acceptance Criteria

### The three additive changes to the shared module

- `R1` When `FileExplorerProvider` receives `readOnly`, the system shall **hide** every mutating action
  in both the toolbar and the context menu (new file, new folder, upload, copy, cut, paste, rename,
  delete), keep the non-mutating ones (download, refresh, open), and leave the FileView non-editable;
  when `readOnly` is absent the sandbox panel shall behave exactly as it does today, including keeping
  the existing "nothing selected → disabled, not hidden" rule. → T1, T8
- `R2` ~~When `FileExplorerProvider` receives `toolbarActions`, the system shall render them
  right-aligned in the toolbar before Refresh…~~ — **withdrawn during the build, not deferred.**
  The criterion came from the written decision (§Q2 "Files tab 內工具列的次要按鈕") and UC-032
  ("點工具列右側"). Running the approved design shows the opposite: `asgard-odin-pm-design#18`'s
  `FilesPanel.tsx` renders "Open in Advance Editor" as its own button **above** the explorer, and the
  chat-kit prototype's toolbar has no extension point at all. A public prop is permanent — removing one
  later needs a `@deprecated` transition (§1.7) — so shipping a slot whose only known consumer does not
  use it is the expensive mistake here. Corrected on `asgard-sdk-pm#74`; if PM rules for the toolbar,
  adding it then is additive and cheap.
- `R3` When a provider's `listDir` reports more entries than it returned, the system shall render a
  "N more items not loaded" line under that directory node instead of ending the list silently; when a
  provider reports no such shortfall the node shall look exactly as it does today. → T2, T8

### The component

- `R4` When a host renders `<SourceSetFileExplorer sourceSetEndpoint="…" />` with nothing else, the
  system shall list, open, edit, save, upload, download, copy, cut, paste, rename, delete and refresh
  against that volume, owning its own controller and requiring **no** chat context (`useAsgardContext`
  or otherwise), so it mounts on a page that has no Chatbot. → T3, T4, T9
- `R5` When the adapter talks to the volume, the system shall convert between the explorer's
  absolute-under-root paths and the volume's relative paths (root `''`) at the provider boundary, list
  through `listAll` so a large directory arrives whole, resolve images to a data URL and text to a
  string, route `remove` to `remove` / `removeAll` by `isDir`, and download through a blob link. → T3, T9
- `R6` When `rootPath` is given, the system shall root the tree there and offer no way to browse above
  it. → T3, T9
- `R7` When `initialPath` is given, the system shall expand its ancestors and select it on mount. → T3, T9
- `R8` When the user creates a file whose name is taken, the system shall send `createOnly`, and on the
  resulting 409 shall show an "already exists" message and leave the existing file untouched. → T4, T9
- `R9` When any volume call fails (400 / 403 / 404 / 409), the system shall show a readable sentence,
  never raw JSON or an `HttpError` string, and shall surface it through `onError` when provided. → T4, T9
- `R10` When the SourceSet explorer renders in any state — populated, empty directory, error — the
  system shall show **no** sandbox vocabulary and **no** Nudge affordance anywhere. → T3, T9
- `R11` When `locale` / `theme` are given, the system shall apply them without a surrounding Chatbot
  provider. → T3, T9

### F-026's UI half

- `R12` When a directory larger than one page is expanded, the system shall show the loading state for
  the duration of the walk (not an empty node), render the whole directory once it arrives, show R3's
  shortfall line if the cap was hit, and keep the UI responsive at ≥1000 entries. → T2, T3, T9

### Demo and regression

- `R13` When the sandbox File Explorer is exercised after these changes, the system shall behave and
  look exactly as before: all 11 existing `file-explorer` spec files green, and `/file-explorer`
  walked in the browser with the toolbar, context menu, and FileView unchanged. → T8, T9
- `R14` (TASK-004, demo half) When the developer opens `/source-set-explorer`, the system shall render
  the component against a real dev volume configured **by environment variable, not code edit**, with
  two shells side by side — narrow and full-bleed — and a read-only toggle, and the developer shall
  complete list / open / edit-save / upload / download / copy / move / delete against dev. → T5, T9
- `R15` (Smoke check) When the developer runs `npm run lint:packages`, `npm run format:check`,
  `npm run typecheck`, `npm run build:core && npm run build:react` and `npm run test:packages`, the
  system shall pass with no errors, and `SourceSetFileExplorer` shall be reachable from the built
  `@asgard-js/react` entry after a `--skip-nx-cache` rebuild. → T10

### Added during the build, from the rendered design

Three criteria the ticket does not contain. Each came from running the prototype rather than reading
about it, which is the reason they exist at all.

- `R16` While `readOnly` is on, the system shall mark the header "Read only" in the panel's own locale,
  so a toolbar stripped of its actions reads as a permission rather than a broken component. Measured
  off the prototype's `.ssfe-badge`: 11.2px, `--text-secondary`, 1px `--border`, 4px radius. → T1, T8
- `R17` When any file action fails, the system shall show one dismissible sentence between the header
  and the toolbar, and shall clear it on the next success. Until this task those failures were
  swallowed — a delete refused with 403 and a delete that worked both ended as a re-listed tree. This
  **changes shipped sandbox behavior**, which the deviation table below records; it was authorized
  rather than assumed. → T4, T8
- `R18` When the host gives the panel an unbounded box, the tree shall still scroll inside the panel
  rather than the panel growing to fit. Verified by measurement: before the demo route pinned a
  definite height, expanding the 10,600-entry directory made the panel **244,846px** tall. The
  component's contract is `height: 100%` plus an internally scrolling tree, so the box is the host's to
  bound — the demo route now does, and the README (BUILD-062) has to say so. → T5, T9

> The README section of TASK-004 is **BUILD-062**, so that this task's review is about behavior and the
> next one is about the words. Nothing here is released on its own.

---

## Implementation Tasks

- [x] T1 (R1, R2): `file-explorer-context.tsx` + `file-explorer-parts.tsx` — add `readOnly` and
      `toolbarActions` to `FileExplorerProviderProps`, expose them on the context, and consume them in
      `FileExplorerToolbar` and `FileExplorerContextMenu`. Both default to today's behavior.
- [x] T2 (R3, R12): `types.ts` — widen `FsListResult` with an optional shortfall count;
      `file-explorer-tree.tsx` — render the "N more" line after the entries; new i18n keys in all three
      locales.
- [x] T3 (R4–R7, R10–R12): new `components/source-set-explorer/` — `source-set-file-explorer.tsx` (the
      assembly: own controller, one `FsSource`, `FileExplorer.Root` + own header + `.Workspace`, no
      `SourceSelect`, no `EmptyState`) and `create-source-set-fs-providers.ts` (the adapter, mirroring
      `create-sandbox-fs-providers.ts` minus `watchFile` and the failure tracker, plus the
      absolute↔relative conversion).
- [x] T4 (R8, R9): error mapping — `createOnly` on new file, 409 → "already exists", a readable message
      per status, and `onError` pass-through.
- [x] T5 (R14): `apps/react-demo` — `routes/source-set-explorer/`, registered in `app.tsx` and linked
      from home; endpoint / token / rootPath from `import.meta.env`; two shells side by side per §4.3+;
      a read-only toggle. Add the new variables to `.env.example`.
- [x] T6 (R4): export `SourceSetFileExplorer`, its props, and the adapter from the react package entry
      with explicit `export type`.
- [x] T7: §6 refactor pass over everything added.
- [x] T8 (R1–R3, R13): **TDD** — write the failing Vitest cases first. Minimum set: `readOnly` hides the
      8 mutating actions in both toolbar and menu; `readOnly` absent leaves today's markup unchanged;
      nothing-selected still disables rather than hides; `toolbarActions` render before Refresh, honour
      `disabled`, and survive `readOnly`; the shortfall line appears with a count and is absent without
      one; the adapter's path conversion round-trips including root and `rootPath`.
- [x] T9 (R4–R14): browser validation on `/source-set-explorer` against a **real dev volume** — every R#
      walked at both widths, plus `/file-explorer` walked for the R13 regression. Screenshots go to
      `local-verification`, never the repo.
- [x] T10 (R15): `npm run lint:packages` + `npm run format:check` + `npm run typecheck` +
      `npm run build:core && npm run build:react` + `npm run test:packages`; confirm the new export in
      `packages/react/dist` after a `--skip-nx-cache` rebuild.

---

## Known blocker for T9

T9 needs a dev SourceSet volume endpoint and a token. `apps/react-demo/.env` currently holds seven
bot-provider variables and **nothing that reaches a volume**. BUILD-060 shipped without a single real
HTTP request for the same reason — every one of its 37 tests mocks `fetch`, and the contract came from
the OpenAPI document rather than an observed response. If credentials are still unavailable when T9 is
reached, stop and say so rather than marking R14 Pass off the mock; the honest outcome is `Blocked`.

---

## Coverage

Use Cases: R1, R3–R18 (R2 withdrawn, see above). Odin `UC-032` Main Flow 1–2 and its Alternate Flows
(no `source-set/put` → tab absent is Odin's, not the SDK's; large directory; 409; refresh-not-watch) are
the downstream cases this serves; they are 验收 on Odin's side once the SDK ships.

Files:

**`@asgard-js/react` — shared module (all changes additive; absent props = today's behavior)**

- `packages/react/src/components/file-explorer/file-explorer-context.tsx` — `readOnly`, `locale` and
  `onError` props; `notice` / `dismissNotice` on the context; `report()`; `run()` reports instead of
  swallowing; `actNewFile` prefers `createFile`; `actDownload` reports; `MUTATING_ACTION_KEYS` +
  `withoutMutatingItems`
- `packages/react/src/components/file-explorer/file-explorer-parts.tsx` — the two `readOnly` toolbar
  groups, the menu filter, `FileExplorerReadOnlyBadge`, `FileExplorerNotice`, `canCreateFile` gating,
  and the FileView's editing withheld under `readOnly`
- `packages/react/src/components/file-explorer/file-explorer-tree.tsx` — the "N more items not loaded" line
- `packages/react/src/components/file-explorer/types.ts` — `FsListResult.totalEntries`, `FsProviders.createFile`
- `packages/react/src/components/file-explorer/fs-error-message.ts` (new) — status → sentence, never the body
- `packages/react/src/components/file-explorer/fs-blob.ts` (new) — §6 extraction now shared by both adapters
- `packages/react/src/components/file-explorer/create-sandbox-fs-providers.ts` — imports the extracted helpers
- `packages/react/src/components/file-explorer/file-explorer-panel.module.scss` — `.readOnlyBadge`,
  `.notice` / `.noticeText` / `.noticeDismiss`, `.sourceLabel` / `.sourceCrumb`
- `packages/react/src/components/file-explorer/index.ts` — new parts + `fsErrorMessage`
- `packages/react/src/components/file-explorer/read-only-and-listing-shortfall.spec.tsx` (new, 16 cases)

**`@asgard-js/react` — the assembly**

- `packages/react/src/components/source-set-explorer/source-set-file-explorer.tsx` (new)
- `packages/react/src/components/source-set-explorer/create-source-set-fs-providers.ts` (new)
- `packages/react/src/components/source-set-explorer/index.ts` (new)
- `packages/react/src/components/index.ts` — one line
- `packages/react/src/i18n.ts` — 8 new `fileExplorer.*` keys × 3 locales

**`apps/react-demo`**

- `src/app/routes/source-set-explorer/{source-set-explorer.tsx, volume-mock.ts, *.module.scss, index.ts}` (new)
- `src/app/app.tsx`, `src/app/routes/home/home.tsx`, `.env.example`

**`@asgard-js/core`** — untouched this cycle.

---

## Execution Log / Change Log

- 2026-08-14: BUILD task created from F-025 + F-026 (UI half) + TASK-004 (demo half) (Status: `draft`).
- 2026-08-14: Architecture decision — compose the shared parts rather than duplicate the explorer;
  deviation from F-025 raised as `asgard-sdk-pm#79` before any code was written (Status: `draft → ready
→ in-progress`).
- 2026-08-14: **The design was run, not read** — and it changed three decisions the ticket text would
  have led to. The chat-kit prototype was served locally and driven in the browser, and the Odin design
  (`asgard-odin-pm-design#18`, merged) was read at source.
  1. **`toolbarActions` withdrawn.** `FilesPanel.tsx` puts "Open in Advance Editor" _outside_ the
     explorer; the prototype toolbar has no extension point. See R2 and the correction on `#74`.
  2. **`R16` read-only badge added.** The prototype shows one and the ticket never mentions it. Measured
     from `.ssfe-badge` rather than guessed.
  3. **The `readOnly` action set confirmed by observation**: toolbar keeps Download + Refresh only, and
     the separator leaves with the group it separates.
     Our prototype pin `c109ac0c` was checked to be _newer_ than the one the Odin design vendored
     (`f611e11`), so the visual authority is current.
- 2026-08-14: `R17` (error notice) authorized explicitly before implementing, because it changes shipped
  sandbox behavior rather than only adding to it.
- 2026-08-14: TDD — 16 cases written red first (7 failing), then implemented. Half of them assert the
  _absence_ of the new behavior when the prop is absent, which is the actual R13 guarantee.
- 2026-08-14: **`R18` found by measuring, not by looking.** Expanding the 10,600-entry directory made
  the panel 244,846px tall with the tree not scrolling at all. Two causes stacked: `DemoWrapper`'s
  content area is `min-height: auto`, and on a flex item `flex: 1` beats `height` in the main axis — so
  asking for both got neither. Fixed in the route with `flex: none; height: 70vh`; re-measured at 543px
  with the tree scrolling internally and no page overflow.
- 2026-08-14: Browser validation on `/source-set-explorer` at both widths against the in-memory volume:
  `readOnly` (toolbar → Download + Refresh, badge in both locales), paged walk of 10,600 entries in
  **466ms** over 11 requests with 10,018 rows rendered, the shortfall line reading
  「還有 600 個項目未載入」 at 12px / `--text-secondary` / 35.2px indent (identical to the prototype),
  and a 409 surfacing as "An item with that name already exists." with `onError` firing alongside.
  R13 walked on `/file-explorer`: picker, cwd and all ten toolbar buttons unchanged, no badge, no notice.
- 2026-08-14: `lint:packages` ✅ (0 errors, 4 pre-existing react warnings) / `format:check` ✅ /
  `typecheck` ✅ (3 projects) / `build:core && build:react` ✅ / `test:packages` ✅ — core 13 / 245,
  react **43 / 270** (+1 file, +16). After a `--skip-nx-cache` rebuild the built bundle exports
  `SourceSetFileExplorer`, `createSourceSetFsProviders`, `toVolumePath`, `volumeSourceRoot`,
  `fsErrorMessage`, and `FileExplorer.ReadOnlyBadge` / `.Notice` (Status: `in-progress → done`).
- 2026-08-14: **`R14` is `Blocked`, not passed.** Everything above ran against an in-memory volume served
  by a `fetch` interceptor — which does exercise the real client and the real adapter, but not the real
  backend. `apps/react-demo/.env` still has no volume endpoint or token. Combined with BUILD-060, whose
  37 cases all mock `fetch`, **nothing in this batch has yet touched a live volume.**
- 2026-08-15: **Three independent audits run after this task was marked done, and they were right to
  be.** Two AC audits (core / react) plus an adversarial bug hunt over the diff; every finding below was
  reproduced first-hand rather than taken on report.
  - **`readOnly` could be bypassed and wrote to the volume.** Turning it on while a file was open left
    the buffer typable _and saving_: the viewer's body memo omitted `canEdit`, so React reused the
    previous element, whose `onChange` closed over the pre-flip saver — the "withhold the saver" defence
    one layer up never got the chance to apply. Same staleness meant a rotated key kept saving through
    the old client. Fixed by stabilising `scheduleSave` first (a per-render function could not be listed
    without defeating the memo, which is presumably why it was omitted), then declaring both, plus
    dropping any pending debounced save the moment permission is withdrawn. 4 new cases.
    **eslint had been reporting this all along** — its text went from one missing dep to two — but the
    check being made was "0 errors, 4 warnings", a count, which did not move.
  - **`locale` never reached the viewer**, which read the chat template context and so defaulted to
    English: a standalone panel rendered its tree in one language and its file header in another.
  - **The demo mock stored an empty file for every write**, testing the FormData entry with
    `typeof === 'string'` when a Blob comes back as a `File`. Editing a file and reopening it showed it
    blank. The client was sending the right bytes, so the demo could never have verified the write path
    it exists to demonstrate — TASK-004 AC3.
- 2026-08-15: **F-026 hardened after the audit showed two silent-truncation shapes** (option C, chosen
  explicitly over "throw" and over "always warn"). The old `list` synthesized `paging` from
  `entries.length` when the response carried none; `listAll` then read that as "the whole directory" and
  reported 1000 of 3000 files as complete. And `paging.index` was never checked, so a relay that ignores
  `page` yielded duplicates — measured `f0,f1,f2,f0,f1,f2,f0,f1,f2` reported as complete.
  `SourceSetListResult.paging` is now `| null` (never invented); `listAll` returns `complete` in place of
  `truncatedAtCap` — a name that could not describe the three ways a walk falls short. A full page with
  no paging is unanswerable and says so; a short one is genuinely the whole directory; a mismatched index
  stops before appending, because duplicates are worse than a shortfall. The rename was taken now
  because the type is unreleased; after release it would need a `@deprecated` cycle.
  UI: `FsListResult.complete` (optional, absent = today's behavior) and a second wording for
  "short by an unknown amount". 5 core + 2 react cases; three mutations each caught.
- 2026-08-15: Re-measured after the change — 1,200 entries (the ≥1000 bar F-026 names) render in **74ms**
  and correctly show no shortfall line. The demo's deliberately-heavy 10,600 fixture takes ~3.5s on a
  first expand and ~0.5s on a re-expand; the walk itself is 10 requests / 2ms, so it is all first-mount
  DOM cost. I could not account for the whole gap against the 466ms measured on 2026-08-14 under
  nominally the same procedure, so treat the first-expand figure as approximate.
- 2026-08-15: `theme` implemented — the prop F-025 listed and this task shipped without, recorded as a
  false pass on R11. It rides `AsgardThemeScope`, which the panel now establishes **unconditionally**:
  the design tokens are emitted onto the chat shell's root and this component is mounted nowhere near
  one, so without a scope it rendered the light defaults on whatever page it landed on — the
  no-theme-passed case was the broken one, not the configured one. The scope wrapper passes its height
  through, or it would have reintroduced R18. 4 cases; verified in the browser under a dark theme at
  both widths, with the 10,600-entry directory still scrolling inside the panel (scope 543px = shell
  543px, page not overflowing).
- 2026-08-15: TASK-004's README half done, split across the two PRs so each documents its own layer:
  `packages/core/README.md` for the client (four bases, the four contract differences, and what
  `complete: false` alongside `total: 0` means), `packages/react/README.md` for the component (the same
  four bases as a props table, the bounded-height requirement with the 244,846px measurement, and why
  `flex: 1` plus `height` yields neither), plus root README links. All six of TASK-004's README
  criteria are met, including the two it names explicitly — no `apiKey` to a relay, and Agent Hub
  prefixing Directory paths already.
