# BUILD-100 Converge Accepted Tasks Into a Current-State Spec

## Meta

- Task ID: `BUILD-100`
- Status: `done`
- Issue: none — process documentation, no PM ticket (same shape as BUILD-059)
- Source spec: none — `requirements/spec/README.md`, written by this task
- Complexity: `M`

## Brief

Every finished ticket leaves a BUILD/REVIEW pair behind for good, and later tickets often overturn earlier ones (the error exits went through BUILD-073 → 074 → 077; the content width through 047 → 062). To learn what the SDK does today an agent has to read a chain of files, and reading the stale one makes it re-implement old behavior. This task adds `requirements/spec/`, a current-state spec with one chapter per feature area, folds every accepted pair into it, deletes the pair, and keeps the number and a pinned link in `requirements/spec/converged-tasks.md`. The `feature-workflow` and `review` skills are changed so that numbering, the duplicate check and `/review BUILD-NNN` keep working after the files are gone. No package code changes.

## Decisions

- **D1 — What counts as accepted.** A pair converges when its BUILD and REVIEW are both `done` and every PM issue it cites is **Done** on its own board. SDK tickets often cite other products' PM repos (sindri-pm, freyr-pm, heimdall-pm, odin-pm, mimir-pm); those count too. A pair with no PM issue follows the BUILD it was derived from; with no such source it converges once merged to `main` and released.
- **D2 — Result.** 36 BUILDs (66 files, six BUILDs had no REVIEW) converge. 64 BUILDs stay: 54 cite a PM issue that is not Done (mostly In review on sdk-pm), 3 are not `done` themselves (028, 040, 071), and 7 have no PM issue but derive from a ticket that is not accepted (025 ← REVIEW-024, 029-attachment-chip-browser-icon ← 022, 033 ← 032/F-023, 058 ← UC-043/F-022, 072 ← F-032, 076 ← 075, 092 ← 087). `FOLLOWUP-f002-background-tab-detach.md` stays: it is deferred work under F-002, which is not accepted.
- **D3 — Chapters keep only what the code cannot tell (2026-11-06 revision).** Each chapter has four sections: scope (links to the PM spec under `references/asgard-sdk-pm/` and the precedence rule — product rules from the PM spec, actual behavior from the code), design decisions typed as「理由」「刻意的行為」or「PM 未定義、前端先決定」, gaps with the PM spec, and known limits. The behavior tables, the one-line「待驗收」rows and the code-location lists are removed: API names, defaults and paths are in the code and go stale in prose; unaccepted behavior is read from its BUILD, which stays in `requirements/tasks/`. Retained rows keep their IDs; decisions and limits that had no ID get new numbers.
- **D4 — Numbering.** The next number is the maximum across `requirements/tasks/BUILD-*.md` and `requirements/spec/converged-tasks.md`, plus one. A stored "next number" line was rejected: it would be a second source for the same fact. One number in this repo was already used twice (two `BUILD-029` files); the archive keys on the full file name and the skill now says to check.
- **D5 — `.gitignore` exception.** The root `.gitignore` ignores every directory named `spec/` (local scratch notes at the repo root). `!requirements/spec/` is added right after it; the scratch rule is unchanged.
- **D6 — `▶ Next Task` in `requirements/tasks/_index.md`.** It had grown into ~100 lines of shipping history covering converged and unconverged tickets alike. It is replaced by where the unconverged tickets are stuck, plus the forward-looking parts (F-027 candidate, theme audit stages, backlog); the old text is reachable through a pinned link. Covered Specs bullets that only mention converged BUILDs are removed.
- **D7 — BUILD-059 has no chapter.** It is about the repo's type-check gate, not SDK behavior; its content already lives in `AGENTS.md` → Type checking, which the archive row points to.
- **D8 — FOLLOWUP-f002.** Still deferred (needs a real backend). The `openWhenHidden: true` guard becomes CLIENT-19 (a deliberate behavior with its do-not), the `detach` → cursor-rejoin item becomes known limit CLIENT-24, and the file is archived. BUILD-002 and REVIEW-002 still mention the file name as history; the archive index resolves it.

## Acceptance Criteria

- `R1` When an agent opens `requirements/spec/_index.md`, it shall find every chapter, and each chapter shall have exactly the four sections (scope with PM links and precedence, design decisions with type and the final source BUILD, gaps with the PM spec, known limits) with stable row IDs, and no behavior table, pending-acceptance row or code-location list. → T1, T2, T6
- `R2` When a pair converges, the system shall have recorded it in `requirements/spec/converged-tasks.md` with a link to the last commit before deletion, and that commit shall exist on `origin/main`. → T3
- `R3` When the next BUILD number is computed with the command in `feature-workflow` Step 2.1, the result shall not go back below a converged number. → T4
- `R4` When `/review BUILD-NNN` names a converged number, the skill shall report it as converged and stop. → T4
- `R5` When the branch is compared with `main`, no new dead relative link shall appear, the deleted file names shall appear only in the archive index, and `packages/` and `apps/` shall be unchanged. → T5
- `R6` Every code identifier and path a chapter cites shall exist in the tree, and the cited behavior shall be backed by code or a test. → T2, T5

## Implementation Tasks

- [x] T1 (R1): `requirements/spec/README.md`, `_index.md`.
- [x] T2 (R1, R6): Eight chapters — `client.md`, `consent.md`, `conversation.md`, `layout.md`, `i18n.md`, `attachments.md`, `file-explorer.md`, `sandbox.md` — written from the code and tests, not from the BUILD `R#`.
- [x] T3 (R2): Archive index, deletion of the 66 files, Task Queue and Covered Specs cleanup, `▶ Next Task` rewrite.
- [x] T4 (R3, R4): `feature-workflow` and `review` skills (both the `.agents/` and `.claude/` copies), plus `AGENTS.md`, `docs/spec-driven-development.md`, `requirements/README.md`, `requirements/_index.md`, `requirements/tasks/_index.md` Convention.
- [x] T5 (R5, R6): Link, archive, identifier and diff checks; `typecheck`, `test:packages`, `format:check`.
- [x] T6 (R1, R5): Reshape the eight chapters and `README.md` into the four-section format; `_index.md` and the archive's「收進」column list chapter names only; archive FOLLOWUP-f002; skills, BUILD template and general docs point existing behavior at the PM spec or the code and reserve `← spec/<ID>` for design decisions.

## Coverage

- Use Cases: —
- Files: `requirements/spec/*`, `requirements/tasks/_index.md`, `requirements/_index.md`, `requirements/README.md`, `docs/spec-driven-development.md`, `AGENTS.md`, `.gitignore`, `.agents/skills/{feature-workflow,review}/SKILL.md`, `.claude/skills/{feature-workflow,review}/SKILL.md`

## Execution Log / Change Log

- 2026-11-06: BUILD task created (Status: `draft → in-progress`). Converged-set computed from the sdk-pm board (#10) plus `gh issue view --json projectItems` for the 14 issues in other PM repos.
- 2026-11-06: Chapters written; integration run (66 rows, 66 files removed). Verification: 258 relative links, 8 dead — the same 8 as on `main` (README links to a missing `CONTRIBUTING.md`/`LICENSE`, four REVIEW files linking to `none`). 66/66 archive SHAs pass `git cat-file -e` and are ancestors of `origin/main`. Every cited identifier exists except the chapter codes and names of backend or rejected alternatives. Next number by the new rule: `BUILD-101`. (Status: `in-progress → done`)
- 2026-11-06: Format revision (D3, D8, T6). Chapters now hold 94 rows — 51 design decisions, 3 gaps with the PM spec, 40 known limits — across the four sections; the 36「待驗收」rows and every behavior table are gone. Re-checked the converged set: all 36 BUILD/REVIEW pairs are `done` at their archived commit, every cited sdk-pm issue is Done on board #10, and the nine cross-product issues (freyr-pm #331/#740/#815/#885/#901, heimdall-pm #200/#375, sindri-pm #142/#206) are Done. Archive: 67 rows (FOLLOWUP-f002 added), 67/67 `git cat-file -e` and ancestors of `origin/main`. Links: 300 relative, 50 into the PM submodule all resolve at the pinned commit, 8 dead — the same 8 as on `main`. Next number still BUILD-101. `packages/` and `apps/` unchanged. `typecheck` passes; core 458/458, react 805/805; `format:check` passes.
