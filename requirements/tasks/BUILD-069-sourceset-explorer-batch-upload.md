# BUILD-069 Wire the SourceSet File Explorer to the shared batch upload queue

## Meta

- Task ID: `BUILD-069`
- Status: `done`
- Issue: `https://github.com/asgard-ai-platform/asgard-sdk-pm/issues/88`
- Source spec: `references/asgard-sdk-pm/tracking/asgard-js-sdk/bugs/BUG-008-sourceset-file-explorer-上傳仍是舊的逐檔迴圈-沒有上傳資料夾入口-沒有進度面板-撞名即中止整批.md`
- Complexity: `L`

---

## Brief

`SourceSetFileExplorer` still uploads the way it did before F-031: one toolbar entry that opens a single
`<input multiple>`, a serial `for (const file of picked) await write(...)` loop inside `mutate()`, a lone
`busy` spinner for progress, a collision that `throw`s and aborts the rest of the batch, and no drop
handler at all. This task replaces that path with the module F-031 already extracted for exactly this
purpose — `packages/react/src/components/upload-queue/` — so the SourceSet side gets the folder entry
point, the docked progress panel, the worker pool with AIMD back-off, cancellation, and the conflict
dialog, without growing a second implementation.

Two things differ from the chat side and must not be copied across: the SourceSet volume streams in
32 KB chunks and therefore has **no per-file cap** (so `maxBytes` stays `undefined`), and its copy lives
in the `sourceSetExplorer.*` catalog rather than `fileExplorer.*` (the shared components take injected
labels precisely so both can be served). Cancellation needs one additive change in core:
`AsgardSourceSetClient.write` / `.mkdir` currently pass no `signal` to `fetch`, so an aborted batch
cannot interrupt a request in flight.

The issue also carries a separate wiring defect on the chat side: `ChatbotFileExplorerAside` passes only
`upload={providers.upload}`, dropping the `uploadMany` that `createSandboxFsProviders` returns. That
degrades `<Chatbot fileExplorer="builtin">` to concurrency 1, no `createOnly` (silent overwrite), no
`signal` (cancel cannot interrupt), and no size pre-check. Fixed here as its own criterion.

**Already exists:** `packages/react/src/components/upload-queue/` (`useUploadQueue`, `planFromFileList`,
`planFromDataTransfer`, `isFileDrag`, `UploadProgress`, `UploadConflictDialog`, `UploadLabels`,
`formatUploadSize`) · `packages/react/src/components/file-explorer/file-explorer-context.tsx` (the chat-side
wiring this mirrors) · `packages/react/src/components/file-explorer/context-menu.tsx` (already a sanctioned
import for this module) · `apps/react-demo/src/app/routes/source-set-explorer/` (route + in-memory volume
mock that already answers 409 for `create_only`).

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

| §                    | Rule (summary)                                                                                                                                                                                                   |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-025 R1             | `source-set-explorer/` may import only `../file-explorer/context-menu` and `../file-explorer/types`; `module-boundary.spec.ts` enforces it. `../upload-queue/` is **not** restricted — it exists for this reuse. |
| F-025 i18n           | SourceSet copy lives in `sourceSetExplorer.*`; do not reuse `fileExplorer.*` keys.                                                                                                                               |
| F-031 AC17           | The shared orchestrator carries no sandbox concept: cap, concurrency and copy stay injected.                                                                                                                     |
| BUG-008 修復方向 (1) | The SourceSet volume has **no** per-file cap — do not carry the in-sandbox `maxBytes` constant across.                                                                                                           |

---

## Acceptance Criteria

EARS form: `When <event/condition>[, while <state>], the system shall <observable behavior>`.

- `R1` (E1) When the user activates the upload action in the toolbar or the context menu, the system shall
  open a two-item menu offering `Upload files…` and `Upload folder…` as parallel entries, rather than
  opening a picker directly. → T4, T5
- `R2` (E2) When the user picks a folder, the system shall upload every file in the tree to
  `<target dir>/<webkitRelativePath>` without issuing a `mkdir` per intermediate level, relying on the
  volume's own parent creation. → T4, T5
- `R3` (E3) When a batch is running, the system shall dock a progress panel below the tree showing
  `n / N`, a progress bar, and a list of the items that failed or were skipped with a reason, and shall
  offer a retry that re-sends only the failed items. → T5, T6
- `R4` (E4) When a batch runs, the system shall dispatch through a worker pool capped at an injectable
  concurrency (default 3), halve the ceiling on `429` / `5xx` with exponential back-off, and state the
  reduced ceiling in the progress panel while it is below the configured one. → T5, T6
- `R5` (E5) When the user cancels a running batch, the system shall abort the requests in flight through
  an `AbortSignal` carried into `AsgardSourceSetClient.write`, dispatch nothing further, and leave already
  written files in place. → T1, T2, T5
- `R6` (E6) When a write collides with an existing path, the system shall detect it through
  `createOnly` / `409` and ask with skip / keep both / overwrite plus an "apply to the remaining N"
  row, serializing the questions so concurrent collisions never ask twice at once, and shall not abort
  the rest of the batch. → T5, T6
- `R7` (E7) When files or folders are dragged from the desktop onto the panel, the system shall highlight
  the panel, expand the drop through `webkitGetAsEntry()` with `readEntries` looped until it returns an
  empty array, and upload the result; a drag the panel cannot serve shall pass through untouched. → T5, T6
- `R8` (E8) When a batch settles — completion or cancellation alike — the system shall refresh the
  affected directory exactly once, not once per file. → T5, T6
- `R9` (E9) When the SourceSet explorer performs a batch upload, the system shall consume
  `components/upload-queue/` directly, adding no second limiter or progress model, and
  `module-boundary.spec.ts` shall still pass. → T4, T5
- `R10` (E10) When a consumer mounts `<Chatbot fileExplorer="builtin">`, the system shall give the built-in
  aside the same batch behavior as a hand-assembled `FileExplorer.Provider`: `uploadMany` wired,
  concurrency not degraded to 1, `createOnly` collisions asked about, cancellation able to interrupt, and
  a per-file size pre-check at the in-sandbox 64 MiB with a `<Chatbot>` prop to override it. → T7, T8
- `R11` When the upload UI renders in any supported locale, the system shall draw every new string from
  the `sourceSetExplorer.*` catalog in all three locales (`en-US` / `ja-JP` / `zh-TW`), reusing no
  `fileExplorer.*` key. → T3, T5
- `R12` (Smoke check) When the developer runs `npm run build:core && npm run build:react`, `npm run
test:packages`, and exercises `/source-set-explorer` in the react-demo
  (`npm run serve:react-demo -- -- --port 5100`, http://localhost:5100), the system shall walk R1–R9 at both
  the narrow and full-bleed mounts with no build errors and no console errors. → T9, T10, T11

---

## Implementation Tasks

Run in order; each task maps to the R# it satisfies.

- [ ] T1 (R5): `packages/core/src/types/source-set-fs.ts` — add `signal?: AbortSignal` to
      `SourceSetWriteOptions` and a new `SourceSetMkdirOptions`; additive only.
- [ ] T2 (R5): `packages/core/src/lib/source-set-client.ts` — thread the signal through `request()` into
      `fetch`; `write` and `mkdir` accept it. Add core Vitest for abort.
- [ ] T3 (R11): `packages/react/src/i18n.ts` — add the `sourceSetExplorer.upload*` / `dropToUpload` keys
      across `en-US`, `ja-JP`, `zh-TW`.
- [ ] T4 (R1, R2, R9): `use-source-set-explorer.ts` — replace the serial `upload` loop with
      `useUploadQueue`. The write adapter resolves a plan-relative path against the batch destination and
      calls `client.write` with `createOnly` and the batch `signal`; `mkdir` covers empty directories only;
      no `maxBytes`; `onSettled` invalidates the destination once. Expose the queue and `startUpload` on
      the controller.
- [ ] T5 (R1–R9, R11): `source-set-file-explorer.tsx` — upload menu (two entries), two hidden inputs
      (`multiple`; `multiple` + `webkitdirectory`), drop handlers on the root with the panel highlight,
      docked `UploadProgress`, `UploadConflictDialog`, `sourceSetExplorer.*` labels, new
      `uploadConcurrency` prop; drop the batch path's `busy` spinner. Add `FolderUpIcon` to this module's
      own `icons.tsx`; add the drop-overlay rules to `source-set-explorer.module.scss`.
- [ ] T6 (R3–R8): new `source-set-explorer/batch-upload.spec.tsx` — menu entries, folder relative paths,
      progress counts, concurrency ceiling, conflict serialization, cancel, single refresh, drop recursion.
- [ ] T7 (R10): `components/chatbot/chatbot-file-explorer.tsx` — pass `uploadMany={providers.uploadMany}`
      and `maxUploadBytes`, with the in-sandbox 64 MiB as the host-layer default.
- [ ] T8 (R10): `components/chatbot/chatbot.tsx` — add the override prop and thread it to the aside; add a
      spec asserting the aside forwards `uploadMany` and the cap.
- [ ] T9 (R12): `apps/react-demo` — honour `signal` in the volume mock, add a fault-injection control
      (latency / `429`) so throttling and cancellation are observable, and note the new gestures on the route.
- [ ] T10: Run `npm run lint:packages` + `npm run format:check` + `npm run typecheck` +
      `npm run build:core && npm run build:react` + `npm run test:packages`.
- [ ] T11 (R12): Smoke check — walk R1–R9 in the browser at both mounts; screenshots stay local
      (`local-verification`), not in the repo.

---

## Coverage

Use Cases: R1–R12 (BUG-008 E1–E10; R11 i18n and R12 smoke are this task's own).

Files:

**`@asgard-js/core`**

- `src/types/source-set-fs.ts` — `SourceSetWriteOptions.signal`; new `SourceSetMkdirOptions` (additive)
- `src/lib/source-set-client.ts` — `request()` forwards a signal to `fetch`; `write` / `mkdir` accept one
- `src/lib/source-set-client.spec.ts` — 3 cases (2 red before the change)

**`@asgard-js/react`**

- `src/i18n.ts` — 28 `sourceSetExplorer.upload*` / `dropToUpload` keys × 3 locales; dropped the now-unused
  `sourceSetExplorer.opUpload`
- `src/components/source-set-explorer/use-source-set-explorer.ts` — serial `upload` loop replaced by
  `useUploadQueue`; controller now exposes `uploads` + `startUpload`
- `src/components/source-set-explorer/source-set-file-explorer.tsx` — upload menu, two hidden pickers,
  drop zone, docked `UploadProgress`, `UploadConflictDialog`, `sourceSetExplorer.*` labels,
  `uploadConcurrency` prop
- `src/components/source-set-explorer/icons.tsx` — `FolderUpIcon` (this module keeps its own copy, F-025 R1)
- `src/components/source-set-explorer/source-set-explorer.module.scss` — drop highlight + overlay
- `src/components/source-set-explorer/source-set-explorer.spec.tsx` — `MENU_ORDER`: the context menu now
  lists the two upload rows flat
- `src/components/source-set-explorer/batch-upload.spec.tsx` — **new**, 15 cases (12 of the first 13 red
  before the change; the last two came back from REVIEW-069 as boundary gaps)
- `src/components/chatbot/chatbot-file-explorer.tsx` — forwards `uploadMany` + `maxUploadBytes`;
  `SANDBOX_MAX_UPLOAD_BYTES` (internal, not exported from the package entry)
- `src/components/chatbot/chatbot.tsx` — `fileExplorerMaxUploadBytes` prop
- `src/components/chatbot/builtin-aside-upload-wiring.spec.tsx` — **new**, 2 cases (both red before)

**`apps/react-demo`**

- `src/app/routes/source-set-explorer/volume-mock.ts` — honours `signal`, `MkdirAll` on write, injectable
  latency / `429`
- `src/app/routes/source-set-explorer/source-set-explorer.tsx` — two fault controls + a batch-upload hint

---

## Execution Log / Change Log

- 2026-08-26: BUILD task created from https://github.com/asgard-ai-platform/asgard-sdk-pm/issues/88 (Status: `draft`).
- 2026-08-26: Plan confirmed; R1–R12 accepted as written (Status: `draft → ready`).
- 2026-08-26: Implementation started on `fix/88-sourceset-explorer-batch-upload` (Status: `ready → in-progress`).
- 2026-08-26: T1–T11 complete. `lint:packages` 0 errors (5 pre-existing warnings), `format:check` clean,
  `typecheck` green over all three projects, `build:core` + `build:react` clean, `test:packages`
  261 core + 368 react all passing (+18 new). Browser walk of R1–R11 done at both the 320px and the
  full-bleed mount on `/source-set-explorer`, and R10 on `/file-explorer`'s built-in aside, with a
  before/after measurement for the aside (peak concurrency 1 → 3, `create_only` 0/6 → 6/6, `AbortSignal`
  0/6 → 6/6, and a 65 MiB file now rejected client-side with no request spent). 320px shows zero
  horizontal overflow; console clean apart from two pre-existing React Router future-flag warnings.
  (Status: `in-progress → done`).
- 2026-08-26: REVIEW-069 routed back two boundary gaps — a file drag was still claimed while `readOnly`,
  and while a file was open in the viewer. Both were only ever guarded by `serves()` and never pinned;
  covered now (`batch-upload.spec.tsx` 13 → 15 cases). Full gate re-run green: 261 core + 370 react.
