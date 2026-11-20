---
name: review
description: 'Per-BUILD-task reviewer: runs §1 static + §3 functional against REVIEW_RULE, writes the paired REVIEW-NNN.md.'
version: 1.0.0
alwaysApply: false
---

# Review Skill

## Activation Contract

### Use this skill when

- Running `/review BUILD-NNN` to review a specific BUILD task
- Running `/review all` to review every BUILD task with Status = `done` in `requirements/tasks/_index.md`

### Do NOT use for

- Applying fixes — this skill reports findings only; fixes belong to the BUILD task
- Visual comparison against design references — that is the developer's own practice (see CLAUDE.md §開發與驗證流程); it is not part of this review

---

## Execution

### Step 1: Read configuration

Read `requirements/tasks/_index.md` Config block and extract `SPEC_DIR` (the directory where BUILD/REVIEW task files live; typically `requirements/tasks/`).

### Step 2: Resolve BUILD tasks in scope

| Invocation          | Scope                                                       |
| ------------------- | ----------------------------------------------------------- |
| `/review BUILD-NNN` | [BUILD-NNN]                                                 |
| `/review all`       | all Task Queue rows matching `BUILD-*` with Status = `done` |

### Step 3: For each BUILD task in scope

#### 3a. Read Coverage

A converged BUILD is no longer in the Task Queue, so `/review all` skips it. If `/review BUILD-NNN` names a number with no file in `requirements/tasks/`, look it up in `requirements/spec/converged-tasks.md`: listed there means it was accepted and converged — report that and stop; there is nothing to review.

Open `{SPEC_DIR}/BUILD-NNN.md`, read `## Coverage`:

- Use Cases: [list or `—`]
- Files: [list of `.tsx` / `.ts` paths]

#### 3b. Check for unfinished BUILD

If either `Coverage.Files` or `Coverage.Use Cases` still contains the placeholder token `[filled during build]`, **stop immediately** and report:

```
BLOCKER: BUILD-NNN is unfinished — Coverage still shows [filled during build].
Run the BUILD task to completion before invoking /review.
```

Do not proceed to §1 or §3.

#### 3c. Determine which sections to run

| Section                  | Condition                |
| ------------------------ | ------------------------ |
| §1 Static Code Review    | Always                   |
| §3 Functional Validation | Coverage.Use Cases ≠ `—` |

This project's review procedure has exactly two sections: §1 and §3.

#### 3d. Run §1 — Static Code Review (always)

Follow `.claude/skills/feature-workflow/REVIEW_RULE.md` §1 in full. Its §1.1 table is the SDK checklist; the §1.1 table in `requirements/tasks/_review_template.md` is a Next.js leftover — use REVIEW_RULE's.

**Scope for grep checks (§1.1 / §1.2):** restrict to the directories / files listed in `Coverage.Files`. If no explicit directory is listed, fall back to `src/`.

**`tsc` and `lint` always run project-wide** (cannot be scoped per file):

```bash
npx tsc --noEmit
npm run lint:packages
```

Write results under `## §1 Static Code Review` in `REVIEW-NNN.md`:

- For each §1.1 checklist item: mark ✅ / ❌
- For ❌: include file path, line number, and rule reference
- Paste all §1.2 grep outputs verbatim (empty = ✅, any match = ❌)
- Paste `tsc` / `lint:packages` outcomes

If any ❌ is found → mark as BLOCKER in `## Findings` and do not mark REVIEW-NNN done until resolved.

#### 3e. Run §3 — Functional Validation (if Coverage.Use Cases ≠ `—`)

Follow `.claude/skills/feature-workflow/REVIEW_RULE.md` §3 in full.

**Preferred harness:** if an e2e spec exists for the changed routes, run:

```bash
npm run test:e2e
```

(Requires `e2e/.env.local` filled — see `CLAUDE.local.md` for `E2E_USERNAME`, `E2E_PASSWORD`, `E2E_WORKSPACE_ID`.)

If no matching e2e spec exists, manually validate each `R#` acceptance criterion in the browser against the running dev server (`npm run dev -- -p <本地 dev port，見 CLAUDE.local.md>`).

Write results under `## §3 Functional Validation` in `REVIEW-NNN.md` using the R# Result Matrix from `_review_template.md`.

If any R# Fails → report BLOCKER; describe [actual behavior] vs [expected behavior].

If Coverage.Use Cases = `—`, write under `## §3 Functional Validation`:

```
_skipped — Coverage.Use Cases is `—`_
```

### Step 4: Create / fill REVIEW-NNN.md

If `REVIEW-NNN.md` does not yet exist, copy `requirements/tasks/_review_template.md` to `{SPEC_DIR}/REVIEW-NNN-<slug>.md` and fill the Meta block (Task ID, Status: `in-progress`, BUILD Task, reviewed commit, reviewed branch).

Fill each section with findings from Steps 3d–3e.

On completion:

- Update `Status: in-progress → done` (only if zero BLOCKERs remain)
- Fill `## Execution Log` with a one-line summary per section (sections run, pass/fail counts, final status)

### Step 5: Update `_index.md`

Mark `REVIEW-NNN` as `done` in the Task Queue.

---

## Common mistakes / gotchas

- **Only §1 and §3**: this project's review has exactly two sections. Do not add visual or design-comparison steps.
- **Scope §1 greps to Coverage.Files**: do not scan unrelated source files. `tsc` and `lint:packages` still run project-wide.
- **Unfinished BUILD**: if `[filled during build]` is present anywhere in Coverage, the BUILD is not done — report BLOCKER and stop.
- **Pairing**: REVIEW-003 pairs with BUILD-003. Confirm the BUILD task ID from `## Meta - BUILD Task` in the REVIEW file.
- **Lint**: this repo has no `lint:check`; `npm run lint:packages` lints core and react without fixing.
- **Dev port**: the local dev server port is per-repo personal config; see `CLAUDE.local.md` (e.g., `npm run dev -- -p <port>`).
