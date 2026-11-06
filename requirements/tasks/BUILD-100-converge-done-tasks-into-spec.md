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
- **D3 — Chapters describe the whole SDK, not only the converged rows.** A chapter that only listed accepted behavior would be the second partial source this task exists to remove. Behavior that shipped but is not accepted is written as a one-line row marked「待驗收：BUILD-NNN」; its detail stays in the BUILD.
- **D4 — Numbering.** The next number is the maximum across `requirements/tasks/BUILD-*.md` and `requirements/spec/converged-tasks.md`, plus one. A stored "next number" line was rejected: it would be a second source for the same fact. One number in this repo was already used twice (two `BUILD-029` files); the archive keys on the full file name and the skill now says to check.
- **D5 — `.gitignore` exception.** The root `.gitignore` ignores every directory named `spec/` (local scratch notes at the repo root). `!requirements/spec/` is added right after it; the scratch rule is unchanged.
- **D6 — `▶ Next Task` in `requirements/tasks/_index.md`.** It had grown into ~100 lines of shipping history covering converged and unconverged tickets alike. It is replaced by where the unconverged tickets are stuck, plus the forward-looking parts (F-027 candidate, theme audit stages, backlog); the old text is reachable through a pinned link. Covered Specs bullets that only mention converged BUILDs are removed.
- **D7 — BUILD-059 has no chapter.** It is about the repo's type-check gate, not SDK behavior; its content already lives in `AGENTS.md` → Type checking, which the archive row points to.

## Acceptance Criteria

- `R1` When an agent asks what the SDK does today, `requirements/spec/_index.md` lists the chapters and each chapter states the current behavior with stable row IDs, design decisions with their source BUILD, known limits and code locations. → T1, T2
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

## Coverage

- Use Cases: —
- Files: `requirements/spec/*`, `requirements/tasks/_index.md`, `requirements/_index.md`, `requirements/README.md`, `docs/spec-driven-development.md`, `AGENTS.md`, `.gitignore`, `.agents/skills/{feature-workflow,review}/SKILL.md`, `.claude/skills/{feature-workflow,review}/SKILL.md`

## Execution Log / Change Log

- 2026-11-06: BUILD task created (Status: `draft → in-progress`). Converged-set computed from the sdk-pm board (#10) plus `gh issue view --json projectItems` for the 14 issues in other PM repos.
- 2026-11-06: Chapters written; integration run (66 rows, 66 files removed). Verification: 258 relative links, 8 dead — the same 8 as on `main` (README links to a missing `CONTRIBUTING.md`/`LICENSE`, four REVIEW files linking to `none`). 66/66 archive SHAs pass `git cat-file -e` and are ancestors of `origin/main`. Every cited identifier exists except the chapter codes and names of backend or rejected alternatives. Next number by the new rule: `BUILD-101`. (Status: `in-progress → done`)
