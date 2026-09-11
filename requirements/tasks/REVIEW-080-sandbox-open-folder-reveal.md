# REVIEW-080 Review: sandbox open-folder card and directory reveal

## Meta

- Task ID: `REVIEW-080`
- Status: `done`
- BUILD Task: `BUILD-080`
- Reviewed commit: `5eb5b4ff`
- Reviewed branch: `feat/102-sandbox-open-folder-reveal`

---

## §1 Static Code Review

Scope: the files listed in `BUILD-080 ## Coverage`. `tsc` / `lint` run project-wide.

### §1.1 Checklist

| Check item                                                            | Rule                           | Result |
| --------------------------------------------------------------------- | ------------------------------ | ------ |
| `any` / `as any`                                                      | FRONTEND_RULE_COMMON §1.1      | ✅     |
| `@ts-ignore` / `eslint-disable` used to bypass type or lint errors    | FRONTEND_RULE_COMMON §1.2      | ✅     |
| `console.log` left in library code                                    | FRONTEND_RULE_COMMON §1.3 §7   | ✅     |
| Hardcoded API key / endpoint / namespace                              | FRONTEND_RULE_COMMON §1.4      | ✅     |
| RxJS subscription / EventSource / timer teardown                      | FRONTEND_RULE_COMMON §1.5      | ✅     |
| react imports core through its public entry only                      | FRONTEND_RULE_COMMON §1.6      | ✅     |
| core imports no react / react-dom / DOM                               | FRONTEND_RULE_COMMON §1.6 §2.1 | ✅     |
| Public API change carries a `@deprecated` transition                  | FRONTEND_RULE_COMMON §1.7      | ⚠️     |
| New public types / components exported from the package entry         | FRONTEND_RULE_COMMON §2.2      | ✅     |
| Message-template prerequisites in place                               | FRONTEND_RULE_COMMON §2.3      | n/a    |
| Uses `botProviderEndpoint`, not `endpoint`                            | FRONTEND_RULE_COMMON §2.4      | ✅     |
| Exported functions declare explicit return types                      | FRONTEND_RULE_COMMON §3.1      | ✅     |
| Shared types centralized; no duplicate interfaces                     | FRONTEND_RULE_COMMON §3.2      | ✅     |
| React component props fully typed                                     | FRONTEND_RULE_COMMON §4.1      | ✅     |
| No hardcoded colors in components (theme / CSS variables)             | FRONTEND_RULE_COMMON §4.2      | ✅     |
| `react` / `react-dom` stay peerDependencies                           | FRONTEND_RULE_COMMON §4.4      | ✅     |
| core and react share one version number                               | FRONTEND_RULE_COMMON §5        | ✅     |
| Repeated logic (≥2×) / types / JSX (≥3×) extracted                    | FRONTEND_RULE_COMMON §6        | ⚠️     |
| `setTimeout` mock delays, dead commented code, untracked TODO / FIXME | FRONTEND_RULE_COMMON §7        | ✅     |

Notes on the two ⚠️:

- **§1.7** — `RequestedFile.kind` is added as a **required** field on a publicly exported type, which is a
  type-level breaking change for anyone who _constructs_ one. Recorded as BUILD-080 Decision 1 with the
  evidence it rests on: the controller is the only producer, and the one downstream that touches this API
  (`asgard-ai-agent-hub-web`) calls `controller.requestFile(...)` and never builds a `RequestedFile`. Readers
  are unaffected either way. Not a BLOCKER — §1.7's own escape hatch is "record it as a decision in the TASK
  spec and reflect it in the version number", and the version bump belongs to the release step.
  `FileExplorerArrivalBridge`'s prop rename (`onIntent` → `onFileIntent` / `onFolderIntent`) is **not** a
  public change: it is absent from `packages/react/dist/index.d.ts` (0 hits) — `components/index.ts` exports
  `./chatbot/chatbot`, not `chatbot-file-explorer`.
- **§6** — see Findings / Minor 1.

### §1.2 Mechanical Grep

Scoped to the 20 files in `BUILD-080 ## Coverage` (shell array, quoted — the unquoted form has given a false
all-clear twice before, in BUILD-072 and BUILD-078).

```bash
# any / as any
grep -n ': any\b\|<any>\|as any' "${F[@]}"                     → (empty)
# ts-ignore / ts-nocheck / eslint-disable
grep -n '@ts-ignore\|@ts-nocheck\|eslint-disable' "${F[@]}"     → 1 hit, pre-existing (below)
# console.log
grep -n 'console\.log' "${F[@]}"                                → (empty)
# setTimeout
grep -n 'setTimeout' "${F[@]}"                                  → (empty)
# TODO / FIXME
grep -n 'TODO\|FIXME' "${F[@]}"                                 → (empty)
# core reverse dependency on react
grep -rn "from 'react'\|from \"react\"\|react-dom" packages/core/src/   → (empty)
# react deep-importing core internals
grep -rn "@asgard-js/core/src\|core/src/lib" packages/react/src/        → (empty)
# hardcoded colors in the changed component files
grep -n '#[0-9a-fA-F]\{3,6\}\|rgba(' <changed .tsx/.ts>         → 4 hits, all issue numbers in comments (#427, #446)
```

The single `eslint-disable` hit:

```
packages/react/src/utils/dispatch-uri-action.ts:51:    // eslint-disable-next-line no-console
```

Pre-existing and unrelated — it guards the `console.error` on a failed `open-browser` call, and
`git diff main -- packages/react/src/utils/dispatch-uri-action.ts` does not touch that line.

New SCSS colors all resolve through the `--asg-color-*` palette
(`--asg-color-warning` / `-surface` / `-border` / `-text-primary` / `-text-secondary` / `-primary`), each with
the palette's own literal as the fallback — the convention this file and `upload-queue.module.scss` already
follow, and deliberately not `currentColor` (which resolves against the same declaration that sets `color`).

### §1.3 TypeScript and Lint

```
typecheck (tsc --build over core + react + react-demo): PASS — 3 projects
lint:packages:                                          PASS — 0 errors, 5 warnings
format:check:                                           PASS
build:core && build:react:                              PASS — no type or build errors
```

The 5 ESLint warnings are pre-existing and none is in a file this task touched
(`chatbot-footer/index.tsx`, `file-explorer/file-view.tsx`, `per-source-view-state.spec.tsx`,
`source-set-explorer/file-view.tsx`, `canvas-runtime-behavior.spec.ts`).

### §1.4 Static Review Acceptance

- [x] All §1.1 items checked and marked
- [x] The two ⚠️ items explained above; no ❌
- [x] All §1.2 greps run and output pasted
- [x] `npm run typecheck` — no TypeScript errors
- [x] `npm run lint:packages` — no ESLint errors

---

## §3 Functional Validation

Two harnesses: Vitest (44 cases across six spec files, 32 of them new) and the react-demo walked in a real
browser at both widths (`npm run serve:react-demo -- -- --port 5100`; wide full-bleed + 343px side by side,
per `FRONTEND_RULE_COMMON §4.3+`).

### R# Result Matrix

| R#  | Description                                                           | Result | Note                                                                                                                                                                                                                                                                                                                 |
| --- | --------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | `resolveSandboxUri()` parses `open-folder`; no path → `null`          | Pass   | `resolve-sandbox-uri.spec.ts` 12 cases (+5). Covers the incident's own percent-encoded `/work/生活市集`, the empty `absolute_path=`, and lookalike actions (`open-folders`, `open`) still returning `null`.                                                                                                          |
| R2  | Dispatch calls `onSandboxOpenFolder`; never `window.open` the raw URI | Pass   | `dispatch-open-folder.spec.ts` 4 cases + browser: clicking the folder chip logged `open-folder → …/out/archive`, the file chip `open-file`, the browser chip `open-browser`; the https control still went through `window.open('https://example.com')` and was **not** captured.                                     |
| R3  | `requestFolder` publishes `kind: 'folder'`; `requestFile` `'file'`    | Pass   | `folder-reveal.spec.tsx` — also pins that the nonce bumps, so the same folder can be requested twice, and that `reveal: false` still fires the intent.                                                                                                                                                               |
| R4  | Folder reveal: ancestors + itself, selected, tree, no read/watch      | Pass   | Unit: `expanded` = `/work/out,/work/out/archive`, `selectedEntry.isDir` true, `openFile` null, `readFile` / `watchFile` never called. Browser: `out` and `archive` both unfolded, `archive` highlighted, its two files listed, toolbar actions enabled — at **both** widths.                                         |
| R5  | Destination decided by `kind` alone; no file-first fallback           | Pass   | There is no fallback branch to test for: the effect reads `rf.kind` once and never calls `readFile` speculatively. Reverse-verified — forcing `isDir = false` (the pre-F-034 behavior) turns 3 folder cases red.                                                                                                     |
| R6  | Chip glyph follows the action                                         | Pass   | `chip.spec.tsx` (+2) matches each icon's own path data. Browser: four chips render globe / document / folder / document.                                                                                                                                                                                             |
| R7  | Out-of-root: no expand, no select, no fs request, notice names path   | Pass   | Unit: `listDir` call count unchanged, `readFile` / `watchFile` never called, `expanded` and `selected` stay `none`. Browser at both widths: the notice renders, the path shows verbatim, no horizontal overflow at 343px. Segment-wise containment pinned by `paths-under-root.spec.ts` (`/work` vs `/workspace/x`). |
| R8  | Notice clears on dismiss / source switch / a later in-root reveal     | Pass   | Three unit cases; browser: dismissing the wide panel's notice removed that one and left the narrow panel's standing.                                                                                                                                                                                                 |
| R9  | Arrival fires the folder intent once per (message, uri)               | Pass   | `arrival-bridge-open-folder.spec.tsx` 3 cases. Browser `/sandbox-cards`: exactly two entries on load with no click — one `open-file`, one `open-folder` — and no repeats.                                                                                                                                            |
| R10 | Per-source view state survives leaving and returning                  | Pass   | Added during review (it was only covered by inference from F-027): leave the source → tree empty; return → `/work/out,/work/out/archive` still unfolded and the directory still selected.                                                                                                                            |
| R11 | New text goes through `t()` in all three locales                      | Pass   | `fileExplorer.outOfRoot` / `outOfRootDismiss` present in `en-US` / `ja-JP` / `zh-TW`; all three rendered in the browser via the demo's locale strip (zh-TW「這個位置不在目前的工作目錄裡，檔案總管看不到：」, ja-JP「この場所は…」, close button `通知を閉じる`).                                                    |
| R12 | Smoke: build + tests + demo at both widths                            | Pass   | `build:core` + `build:react` clean; `test:packages` core 324 / react 512; demo walked at 1456px-wide and 343px.                                                                                                                                                                                                      |

> The matrix renumbers slightly against BUILD-080's list because AC7's "clears" half (BUILD `R7`) is reported
> here as its own row; every BUILD `R#` is covered.

### Reverse verification

Each new behavior was confirmed to actually be under test, by reverting it and re-running:

| Reverted                                       | Expected                  | Observed                                                                                       |
| ---------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------- |
| `const isDir = rf.kind === 'folder'` → `false` | folder cases fail         | 3 failed / 6 passed                                                                            |
| the `isUnderRoot` gate in the reveal effect    | out-of-root cases fail    | 5 failed / 4 passed                                                                            |
| `resolve-sandbox-uri.ts` to its `main` version | open-folder parsing fails | 3 failed / 9 passed                                                                            |
| `ancestorDirs` back to `startsWith`            | the prefix case fails     | 1 failed — and it invented `/work/space`, `/work/space/a` as ancestors of `/workspace/a/b.txt` |

### §3.1 Acceptance

- [x] Every R# executed (static read + browser operation + boundary conditions)
- [x] Each R# marked
- [x] No e2e spec exists for these routes; the react-demo walk stands in (per REVIEW_RULE §3 harness order)
- [x] Boundary conditions confirmed: missing `absolute_path`, unknown / lookalike action, path outside the
      root, a FileView open when the folder card arrives, repeat requests for the same folder, source switch

### Not covered

- **No real backend.** Every fs provider in the demo is in-memory, so "no `fs/file`, no `fs/watch` for a
  directory" is proven by the provider mocks never being called, not by an empty Network panel against a live
  sandbox. The 500 this ticket removes has not been observed to be gone on a deployed environment.
- **The full card → built-in aside path.** `/sandbox-cards` proves card → dispatcher → host callback, and
  `/file-explorer` proves controller → panel, but no demo route has both a live sandbox and the cards, so the
  two halves were verified separately rather than end to end.
- **Downstream untested.** `asgard-ai-agent-hub-web` wires `onSandboxOpenFile` → `requestFile` itself and
  will need `onSandboxOpenFolder` → `requestFolder` after this ships; nothing was installed into it.

---

## Findings

### Critical (must fix before done)

None.

### Important (should fix in this cycle)

None.

### Minor (nice to have)

1. **[§6] `handleSandboxOpenFile` and `handleSandboxOpenFolder` share a three-line shape**
   (`packages/react/src/components/chatbot/chatbot.tsx`): call the host callback, then — if the built-in
   explorer is on — compute `reveal` from `autoRevealOnOpenFileCard` and the dirty guard and forward it.
   Not extracted: both call sites need a bound two-argument function anyway (the arrival bridge takes two
   props, the template context takes two props), so a shared factory adds an indirection plus two wrappers to
   remove three lines. Same call the repo recorded in BUILD-072 for the duplicated "the channel changed"
   detection — extract on the third occurrence.
2. **[§1.7] `RequestedFile.kind` is required, not optional.** Deliberate (BUILD-080 Decision 1), but it does
   mean a consumer that constructs a `RequestedFile` gets a compile error on upgrade. Worth a line in the
   release notes when this version ships.
3. **Pre-existing demo defect fixed in passing.** `/sandbox-cards` rebuilt `initMessages` with fresh
   `nanoid()` ids on every render, and preview mode rebuilds the conversation whenever `initMessages` changes
   identity, so the arrival scan saw new cards forever — the unmodified route logged 390 intents in 2.5s. The
   `useMemo` fix is in the demo only; the SDK's (message id, uri) key is correct and was not changed. Flagged
   here because it is outside the stated scope, and because it means the AC8 evidence would have been
   unreadable without it.

---

## Execution Log

- 2026-09-11: REVIEW task created, paired with BUILD-080 (Status: `draft`).
- 2026-09-11: BUILD-080 reached `done`; REVIEW-080 `draft → ready → in-progress`.
- 2026-09-11: §1 complete — 17 ✅ / 2 ⚠️ / 0 ❌ (both ⚠️ explained above); greps clean; typecheck, lint,
  format and both builds green. §3 complete — R1–R12 all Pass, with four reverse-verification runs and a
  browser walk at both widths; one uncovered case (per-source round trip after a folder reveal) was found and
  closed with a new test rather than reported as a finding. 0 BLOCKERs (Status: `in-progress → done`).
