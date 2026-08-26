# REVIEW-069 Review: SourceSet File Explorer batch upload

## Meta

- Task ID: `REVIEW-069`
- Status: `done`
- BUILD Task: `BUILD-069`
- Reviewed commit: `fd949cdeabced12ece071279b982673adf0b95de` (branch base; the change is uncommitted at review time)
- Reviewed branch: `fix/88-sourceset-explorer-batch-upload`

---

## §1 Static Code Review

Scope: the files listed in `BUILD-069 ## Coverage`. `lint` / `format` / `typecheck` run project-wide.

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
| No hardcoded colors in components                                     | §4.2                      | ✅ (5) |
| `react` / `react-dom` stay peerDependencies                           | §4.4                      | ✅     |
| core and react share one version number                               | §5                        | ✅ (6) |
| Repeated logic (≥2×) / types / JSX (≥3×) extracted                    | §6                        | ✅ (7) |
| No `setTimeout` mock delay, dead code, or untracked TODO / FIXME      | §7                        | ✅ (8) |

**Notes**

1. **§1.5** — `useUploadQueue` already owns its unmount teardown (aborts the controller, releases a worker
   parked on a collision answer). The one effect this task adds (`dirInput.current.webkitdirectory = true`)
   registers nothing, so it needs no cleanup. The demo mock's `abortable()` leaves one `abort` listener per
   held request on a signal that lives for the batch — demo-only, and the signal dies with the batch.
2. **§1.6** — core gains `AbortSignal` in a type and forwards it to `fetch`. That is the same platform
   family the client already depends on (`fetch` / `Response` / `Headers` / `FormData` / `Blob` / `URL`),
   available in Node ≥ 18 and in workers, so "framework-agnostic, runs outside a browser" still holds. No
   `react` / `react-dom` / DOM-node API is touched.
3. **§1.7** — every public change is additive: `SourceSetWriteOptions.signal?`, a new
   `SourceSetMkdirOptions`, `mkdir(path, options?)`, `SourceSetFileExplorerProps.uploadConcurrency?`,
   `ChatbotProps.fileExplorerMaxUploadBytes?`. `SourceSetExplorerController.upload` was replaced by
   `uploads` + `startUpload`, but that hook and its controller type are **not** exported from
   `source-set-explorer/index.ts`, so no public surface changed.
4. **§2.2** — `SourceSetMkdirOptions` rides the existing `export type * from './source-set-fs'`.
   `SANDBOX_MAX_UPLOAD_BYTES` is deliberately **not** exported from the package entry: `chatbot-file-explorer`
   is absent from `components/index.ts`, and §1.7 would then only allow deprecating it, never removing it.
5. **§4.2** — the `#…` matches in `.tsx` are all issue references in comments (`#446`, `#409`, `#432`).
   The two SCSS rules added follow this stylesheet's stated convention: `var(--asg-color-*, <literal>)`,
   where the literal is only a fallback for a host that supplies no theme.
6. **§5** — `core=0.3.72 react=0.3.72 peer=0.3.72`. No bump in this task.
7. **§6** — see Findings / Minor 1: `uploadLabels` is structurally duplicated between the chat explorer and
   this one. Extracting it would require editing `components/file-explorer/`, which F-025 R1 freezes
   (verified: `git diff main -- packages/react/src/components/file-explorer/` is empty). Deliberate.
8. **§7** — `setTimeout` appears twice in the new spec as `await new Promise(r => setTimeout(r, 0))`, a
   macrotask flush used to prove that a pool dispatched **nothing** further; it simulates no latency. The
   demo mock's `sleep()` is fault injection in a mock server, which is where simulated latency belongs and
   is the same pattern the file already used for `MOCK_LATENCY_MS`.

### §1.2 Mechanical Grep

```
### any / as any
packages/react/src/components/source-set-explorer/paths.spec.ts:8: * reaches the backend as a 400 rather than as anything the user could act on.
  → false positive: the English word "as anything" in a comment, in a file this task did not touch.

### ts-ignore / eslint-disable
(empty)

### console.log
(empty)

### core imports react / react-dom
(empty)

### react deep-imports core internals (@asgard-js/core/src, core/src/lib)
(empty)

### hardcoded colors in changed components
packages/react/src/components/source-set-explorer/source-set-file-explorer.tsx:513  (asgard-js-sdk#446 …)
packages/react/src/components/chatbot/chatbot-file-explorer.tsx:114                 (asgard-core#230 …)
packages/react/src/components/chatbot/chatbot-file-explorer.tsx:167                 (#409 … #407 …)
packages/react/src/components/chatbot/chatbot.tsx:485                               (heimdall-pm#200 …)
packages/react/src/components/chatbot/chatbot.tsx:549                               (#387 …)
packages/react/src/components/chatbot/chatbot.tsx:588                               (issue #432 …)
  → all six are issue numbers inside comments; no color literal in any component.

### setTimeout
packages/react/src/components/source-set-explorer/blob.ts:46          (pre-existing, revokeObjectURL)
packages/react/src/components/source-set-explorer/file-view.tsx:107   (pre-existing, save debounce)
packages/react/src/components/source-set-explorer/file-view.tsx:113   (pre-existing, save debounce)
packages/react/src/components/source-set-explorer/batch-upload.spec.tsx:287  (macrotask flush, see note 8)
packages/react/src/components/source-set-explorer/batch-upload.spec.tsx:450  (macrotask flush, see note 8)
apps/react-demo/src/app/routes/source-set-explorer/volume-mock.ts:57         (mock server, see note 8)

### TODO / FIXME
(empty)
```

Extra checks this task's ACs call for:

```
### F-025 R1 — the frozen module must not move
$ git diff --stat main -- packages/react/src/components/file-explorer/
(empty)

### module boundary spec
✓ src/components/source-set-explorer/module-boundary.spec.ts  (3 tests)
  Imports from `../file-explorer/` are exactly `context-menu` and `types`; `../upload-queue` is the new
  import and is not restricted — that module exists for this reuse.
```

### §1.3 Lint / Format / Typecheck / Build

`npm run lint:check` does not exist in this repo; `npm run lint:packages` is the read-only ESLint run and
`npm run typecheck` is the command that actually fails on a type error (`build` does not — see
`AGENTS.md` → Type checking).

```
lint:packages: PASS — 0 errors, 5 warnings.
               All five reproduce with the change stashed (`git stash push -u` → same 5), so all
               pre-existing: 2× react-hooks/exhaustive-deps (file-view save debounce, both explorers),
               1× jsx-a11y/role-supports-aria-props, 1× react/jsx-no-useless-fragment,
               1× no-new-func (canvas runtime spec).
format:check:  PASS — All matched files use Prettier code style!
typecheck:     PASS — 3 projects (core + react + react-demo)
build:         PASS — build:core and build:react both clean
```

### §1.4 Static Review Acceptance

- [x] All §1.1 items checked and marked
- [x] No ❌ violations
- [x] All §1.2 greps run and output pasted
- [x] `npm run typecheck` run — no TypeScript errors
- [x] `npm run lint:packages` run — no ESLint errors

---

## §3 Functional Validation

Two harnesses, per `REVIEW_RULE §3`: Vitest first, then the react-demo in a real browser
(`npm run serve:react-demo -- -- --port 5100`). Every UI criterion was walked at **both** the 320px aside
and the full-bleed mount, as `FRONTEND_RULE_COMMON §4.3+` requires.

New automated coverage: `batch-upload.spec.tsx` 15 cases, `builtin-aside-upload-wiring.spec.tsx` 2 cases,
`source-set-client.spec.ts` +3 cases. Fail-before was measured for each group by reverting the
implementation and re-running: **12 / 15**, **2 / 2** and **2 / 3** red respectively (the ones that stay
green are regression guards, which is what they are for).

### R# Result Matrix

| R#  | Description                                         | Result | Note                                                                                                                                                                                               |
| --- | --------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Upload asks "files or folder?"                      | Pass   | Menu shows exactly `Upload files…` / `Upload folder…`, anchored under the toolbar button; the second hidden input carries `webkitdirectory`. `readOnly` removes the action entirely.               |
| R2  | Folder upload keeps its shape, no pre-emptive mkdir | Pass   | Browser: `PUT docs/a.txt`, `PUT docs/sub/b.md`, **zero** `mkdir` calls. The empty-folder caveat renders for the picker path only.                                                                  |
| R3  | Count, bar, per-file failures, retry-only-failed    | Pass   | Sampled mid-batch: `0 / 12 → 3 / 12 → 6 / 12 → 9 / 12 → 12 / 12` with the bar at 0/25/50/75/100%. Failures list the path and a reason; retry re-sends only them.                                   |
| R4  | Worker pool, AIMD, and it says when it slows down   | Pass   | The count advances in steps of **3** every ~840ms (700ms injected + 120ms mock) — a pool of 3, not a serial loop. After four `429`s the panel reads `Volume busy — slowed to 1 at a time (max 3)`. |
| R5  | Cancel aborts what is in flight                     | Pass   | `Cancelled 6 / 30`; every signal handed to `fetch` came back `aborted: true`; no write dispatched after the click; the 6 that landed stayed. Undispatched rows read `Cancelled`, not `queued`.     |
| R6  | Collision is asked about, one question at a time    | Pass   | Two colliding files under a pool of 3 produced **one** dialog at a time. Keep both wrote `docs/a (2).txt` and stayed `create_only`; Skip left the item skipped; the rest of the batch finished.    |
| R6b | "Apply to the remaining N"                          | Pass   | With 9 files and 1 collision the row read `Apply to the remaining 6:`; `Overwrite all` produced exactly one non-`create_only` write and asked nothing further.                                     |
| R7  | Drag from the desktop, `readEntries` looped         | Pass   | A dropped tree spanning three reader batches uploaded all three files including `nested/d-3.txt`; the empty `hollow/` got an explicit `mkdir`, issued **first**. A text drag passed through.       |
| R8  | One refresh per batch                               | Pass   | Exactly one `GET list` after each batch — the folder upload, the conflict batch, and the cancelled batch alike.                                                                                    |
| R9  | Consumes `upload-queue`, no second implementation   | Pass   | `module-boundary.spec.ts` green; `components/file-explorer/` diff empty; the only new import is `../upload-queue`.                                                                                 |
| R10 | Built-in aside matches the hand-assembled path      | Pass   | Measured before/after on `/file-explorer`'s real `<Chatbot fileExplorer="builtin">` — see below.                                                                                                   |
| R11 | Copy from `sourceSetExplorer.*`, three locales      | Pass   | Menu and panel verified in `en-US` / `zh-TW` / `ja-JP`; no `fileExplorer.*` key reused.                                                                                                            |
| R12 | Smoke                                               | Pass   | Build clean, 261 core + 370 react tests green, both mounts walked, console clean apart from two pre-existing React Router future-flag warnings.                                                    |

**R10, measured both ways** (same route, same gestures, only `ChatbotFileExplorerAside`'s prop list differs):

| Observation                       | Before    | After                                                                                |
| --------------------------------- | --------- | ------------------------------------------------------------------------------------ |
| Peak concurrent writes            | **1**     | **3**                                                                                |
| Writes carrying an `AbortSignal`  | **0 / 6** | **6 / 6**                                                                            |
| Writes sending `create_only=true` | **0 / 6** | **6 / 6**                                                                            |
| 65 MiB file                       | —         | rejected client-side, **no request spent**, `超過單檔上限 64.0 MB（這個檔 65.0 MB）` |

The "before" request URL is `…/fs/file?path=…m-01.txt` with no `create_only` — a silent overwrite, which
is the consequence the issue predicted from reading the code and nobody had yet seen happen.

### §3.1 Boundary conditions

- `readOnly`: the upload action is gone **and** a file drag is no longer claimed (added during this review
  — the first version only covered the toolbar, so a drop would still have uploaded).
- A file open in the viewer: drops are refused, since there is no tree to drop onto (added during review).
- Empty pick / dismissed picker: `isUploadPlanEmpty` makes it a no-op; no panel appears.
- Oversized file: fails pre-flight with a reason and is excluded from retry.
- Cancel mid-back-off: covered by the shared queue's own spec (`use-upload-queue.spec.tsx`).
- 320px: zero horizontal overflow on the root, the progress panel and the document; the conflict dialog
  stays inside its own panel and its "apply to the rest" row wraps rather than clipping.

### §3.2 Acceptance

- [x] Every R# executed through Step 1 (read) + Step 2 (test / browser) + Step 3 (boundaries)
- [x] Each R# marked with its actual result
- [x] Vitest run and green
- [x] Loading / error / empty / cancelled boundaries confirmed

---

## Findings

### Critical (must fix before done)

None.

### Important (should fix in this cycle)

None. The one important finding below is a **repo-wide, pre-existing** defect surfaced by this review and
is not caused by, nor fixable within, BUG-008 — see Minor 2.

### Minor (nice to have)

1. **`uploadLabels` is duplicated between the two explorers (~45 lines).** Both build the same
   `UploadLabels` shape from key suffixes that are identical by construction, differing only in namespace
   (`fileExplorer.*` vs `sourceSetExplorer.*`). A `uploadLabelsFor(locale, namespace)` helper in
   `upload-queue/` would collapse them and §6 triggers at two occurrences — **but** consuming it from the
   chat side means editing `components/file-explorer/`, which F-025 R1 freezes with an empty-diff
   acceptance. It would also turn 28 static `t()` keys into template strings, and this repo has no
   key-existence test, so a typo would fall back silently. Kept duplicated deliberately; worth revisiting
   whenever F-025 R1 is lifted.

2. **`npm run typecheck` silently rolls `packages/core/dist` back to a stale bundle.** Reproduced:

   ```
   after build:core                     a39acc12 (has signal)
   after typecheck --skip-nx-cache      a39acc12 (has signal)   ← tsc emits nothing here
   after typecheck (cache hit)          4196f2b8 (NO signal)    ← restored from the Nx cache
   ```

   Cause: `@asgard-js/core`'s `typecheck` target inherits `@nx/js/typescript`'s default `outputs`, which
   glob `{projectRoot}/**/*.js` / `*.cjs` / `*.mjs` / `*.d.ts` — that claims `packages/core/dist/index.js`,
   a file `build` owns and `tsc --emitDeclarationOnly` never writes. Nx caches those bundles as typecheck
   outputs and restores them on a cache hit.

   Why it matters beyond tidiness: `@asgard-js/react`'s Vitest suite resolves `@asgard-js/core` through
   `node_modules/@asgard-js/core` → `packages/core/dist`, so **running `typecheck` can change what the
   react tests are testing.** That is exactly how it showed up here: R5 went green, then red with
   `signal = missing`, with no source change in between. Same family as the two cache traps `AGENTS.md`
   already documents; worth its own issue and an `outputs` override in `nx.json`.

   Two mitigations landed in this cycle, neither of which fixes the underlying config: the gate is now run
   as lint → format → typecheck → **build** → test, so the last write to `dist` is a real build; and the R5
   assertion now reports `missing` / `aborted` / `open` per signal instead of one boolean, so the next
   occurrence names itself instead of printing `expected false to be true`.

3. **The desktop drag is driven by synthetic `DragEvent`s, not a real OS drag.** No automation can produce
   an OS-level drag into the browser, so R7 was verified by dispatching real `DragEvent`s with a
   hand-built `DataTransfer` carrying `webkitGetAsEntry` (the same approach BUILD-066 used). The
   `readEntries` loop and the recursion are genuinely exercised; what is not exercised is Chromium's own
   entry API. Left as a gap in the local verification document.

---

## Execution Log

- 2026-08-26: REVIEW task created, paired with BUILD-069 (Status: `draft`).
- 2026-08-26: BUILD-069 done; review unblocked (Status: `draft → ready`).
- 2026-08-26: §1 complete — 18 applicable items ✅, 0 ❌; all greps clean (6 comment false positives
  documented); lint 0 errors / 5 pre-existing warnings, format clean, typecheck green on 3 projects,
  build clean. §3 complete — R1–R12 all Pass, including a before/after measurement of the built-in aside
  and a 320px pass. Two boundary gaps found and routed back to BUILD (drag while `readOnly`, drag while a
  file is open); both now covered and green. One repo-wide cache defect surfaced and recorded as Minor 2
  rather than fixed here. 0 BLOCKERs (Status: `ready → done`).
