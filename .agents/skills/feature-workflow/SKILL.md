---
name: feature-workflow
description: Per-issue SDD cycle: resolve a PM issue to its TASK spec, plan a BUILD/REVIEW pair, build per FRONTEND_RULE_COMMON, review via the review skill.
version: 1.0.0
alwaysApply: false
---

# Feature Workflow

## Activation Contract

### Use this skill when

- You are given a GitHub issue number or link from `asgard-ai-platform/asgard-sdk-pm`
- You need the full per-issue SDD cycle: resolve → plan → build → review → done

### Do NOT use for

- Small fixes with clear scope that do not trace to a PM issue (edit the file directly)
- Review-only runs (invoke `/review BUILD-NNN` directly instead)
- Issues already planned — check `requirements/tasks/_index.md` first, and the PM issue column of `requirements/spec/converged-tasks.md` (an issue whose tasks were already converged is done, not unplanned)

---

## How it works

This skill is the **per-issue orchestrator** for the asgard-js-sdk SDD process. It operates in **spec-only mode** always (no running design-reference server, no screenshot comparison). The prototype reference under `references/asgard-chat-kit-prototype` is visual / behavioral background only — do not treat it as the implementation spec.

**Lifecycle: Resolve → Plan → [PAUSE] → Build → Review → Done**

**No auto mode.** The skill always pauses after Plan to present the task pair(s) and wait for explicit user confirmation before any implementation begins.

---

## Stage 1: Resolve

**Goal:** Locate and read the PM TASK spec for the given issue.

### Step 1.0 — Refresh design references（每次開工先執行）

在讀取任何 spec 之前，先把 PM spec 與 prototype/design submodule 更新到遠端最新，確保對到的是最新設計：

```bash
git submodule update --init --recursive --remote references
```

註：`--remote` 會把 submodule checkout 到遠端最新，父 repo 的 pin 會顯示為已變更。這個 pin bump commit 進 feature 分支**完全無妨、也不影響開發**——`references/` 只是背景參考（不被 app 編譯，實作以 distill 進 `requirements/` 的內容為準），且 CI 未開 `submodules: true`。因此就讓 pin 始終浮到最新、bump 自然留在分支即可，不必刻意避免 commit。

### Step 1.1 — Fetch the issue

```bash
gh issue view <n> -R asgard-ai-platform/asgard-sdk-pm --json title,body,labels
```

Inspect the `body` field for a tracking reference — typically under "相關票" or similar heading. The reference is a path like `tracking/asgard-js-sdk/tasks/TASK-NNN-<slug>.md` (or a `features/F-NNN-*.md` / `use-cases/UC-NNN-*.md` path).

### Step 1.2 — Read the TASK spec

Read `references/asgard-sdk-pm/<that-path>`.

If the file is still not present after Step 1.0's refresh, search by TASK number or title:

```bash
find references/asgard-sdk-pm/tracking/asgard-js-sdk -name "*NNN*.md" 2>/dev/null
# or search by keyword:
grep -rl "<keyword-from-title>" references/asgard-sdk-pm/tracking/asgard-js-sdk/ 2>/dev/null
```

### Step 1.3 — Resolve Gate

- [ ] Issue title, labels, and body retrieved
- [ ] TASK / feature / use-case spec file path confirmed and file read
- [ ] Acceptance criteria or behavioral requirements identified from the spec

If the spec references other upstream specs under `references/asgard-sdk-pm` (features ↔ use-cases), read those too as background. Do not implement from `references/` directly — the spec must be distilled into `requirements/tasks/` files first.

---

## Stage 2: Plan

**Goal:** Distill the spec into one BUILD + REVIEW pair (or several pairs for large features), create the task files, and PAUSE for user confirmation.

### Step 2.1 — Determine task numbering

Find the highest BUILD number in use. Converged tasks are deleted from `requirements/tasks/` but keep their numbers in `requirements/spec/converged-tasks.md`, so look in both places:

```bash
{ ls requirements/tasks/BUILD-*.md 2>/dev/null; cat requirements/spec/converged-tasks.md 2>/dev/null; } \
  | grep -oE 'BUILD-[0-9]{3}' | sort -u | tail -1
```

If nothing is found, start at `BUILD-001`. Otherwise increment the highest number by 1. **Never reuse a number**: code comments, commit messages and PRs still cite converged numbers (and `BUILD-029` was already used twice in this repo — check before you create the file).

### Step 2.2 — Decide how many BUILD tasks

**Default: one BUILD + one REVIEW pair per issue.**

Split into multiple pairs only when the issue covers two or more clearly separable capabilities (e.g. a core-only stream change AND an independent react template) that cannot reasonably be reviewed together. When in doubt, keep it one pair.

### Step 2.3 — Create BUILD-NNN.md

Copy `requirements/tasks/_build_template.md` to `requirements/tasks/BUILD-NNN-<slug>.md`.

Fill in these fields (remove template HTML comments after filling):

- `Task ID`: `BUILD-NNN`
- `Status`: `draft`
- `Issue`: the GitHub issue URL (`https://github.com/asgard-ai-platform/asgard-sdk-pm/issues/<n>`)
- `Source spec`: the `references/asgard-sdk-pm/tracking/asgard-js-sdk/<path>` spec path
- `Complexity`: `S` (single function / small change) | `M` (standard client method / template) | `L` (cross-package flow or streaming/protocol change)
- `Brief`: 2–5 sentences — the developer-visible outcome and the changed packages / modules / components; note anything that already exists to be reused or extended. Before planning, read the matching chapter in `requirements/spec/` (`_index.md` lists them): it holds what the code cannot tell you — design decisions, gaps with the PM spec, known limits. What the SDK does is in the code and the PM spec, not there. When the task keeps an existing behavior, point at the PM spec or the code; cite `← spec/<ID>` (e.g. `← spec/CLIENT-1`) only when the task relies on a recorded design decision.
- `Relevant Rules`: the pre-filled table from the template (sourced from `FRONTEND_RULE_COMMON.md`) — do not delete rows; add extra rows if this task involves patterns not in the default table.
- `Acceptance Criteria`: translate the spec's acceptance conditions into EARS `R#` identifiers. Every `R#` must be independently verifiable. The last `R#` is always a build + demo/test smoke check.
- `Implementation Tasks`: ordered `T#` steps mapped to `R#`; include `npm run lint:packages`, `npm run format:check`, and `npm run build:core && npm run build:react` in the pre-done step.
- `Coverage` — both Use Cases and Files: leave as `[filled during build]`.
- `Execution Log`: add `YYYY-MM-DD: BUILD task created from <issue URL> (Status: draft)`.

### Step 2.4 — Create REVIEW-NNN.md

Copy `requirements/tasks/_review_template.md` to `requirements/tasks/REVIEW-NNN-<slug>.md`.

Fill in:

- `Task ID`: `REVIEW-NNN`
- `Status`: `draft`
- `BUILD Task`: `BUILD-NNN`
- Leave `Reviewed commit` and `Reviewed branch` blank — filled at review time.
- `Execution Log`: add `YYYY-MM-DD: REVIEW task created, paired with BUILD-NNN (Status: draft)`.

### Step 2.5 — Register in `_index.md`

Add both tasks to the Task Queue in `requirements/tasks/_index.md` with Status `draft`.

### Step 2.6 — PAUSE and present plan for user confirmation

**Mandatory stop.** Do not begin Stage 3 until the user explicitly confirms.

Present:

```
計畫完成 — 請確認後再開始實作。

Issue: <title> (#<n>)
Source spec: references/asgard-sdk-pm/<path>

Task Queue (新增):
| Task ID    | Title          | Complexity | Status |
|------------|----------------|------------|--------|
| BUILD-NNN  | <title>        | S/M/L      | draft  |
| REVIEW-NNN | Review: <...>  | —          | draft  |

Acceptance Criteria (BUILD-NNN):
- R1: When ..., the system shall ...
- R2: ...
- RN: (Smoke check) When the developer runs `npm run build:core && npm run build:react`
      and exercises <feature> in the react-demo (http://localhost:4200) / Vitest,
      the system shall <expected observable behavior> with no build errors.

有問題或需要調整（例如拆成多個 task、修改 R#）請告知。確認後我開始實作。
```

After user confirms, update BUILD-NNN.md Status: `draft → ready`. Update `_index.md` to `ready`. If no other task is currently `in-progress`, advance `## ▶ Next Task` to `BUILD-NNN`.

---

## Stage 3: Build

**Goal:** Implement per `FRONTEND_RULE_COMMON.md`; fill `## Coverage`; keep `_index.md` status current.

### On user go

1. Update `BUILD-NNN.md` Status: `ready → in-progress`. Update `_index.md`.
2. Read `.claude/skills/feature-workflow/FRONTEND_RULE_COMMON.md` in full before writing any code. The `## Relevant Rules` table in BUILD-NNN.md is a distilled reference, but the full corpus catches edge cases.
3. Work through `## Implementation Tasks` in order, checking off each `T#` as completed.
4. Implement per `FRONTEND_RULE_COMMON.md` §1–§7:
   - Types / enums in `packages/core/src/types` + `constants` before first use (§2.3)
   - Keep the package boundary: `@asgard-js/core` has no React/DOM deps; `@asgard-js/react` imports core via its public entry only (§1.6 / §2.1)
   - No `any`, no `@ts-ignore` / `eslint-disable` to bypass type errors (§1.1–§1.2)
   - Clean teardown for every RxJS subscription / EventSource / timer (§1.5)
   - Public API changes go through `@deprecated`, not removal (§1.7); export new API from the package entry (§2.2)
   - React components: typed props, theming via CSS variables (§4.1–§4.2)
5. Fill `## Coverage` in BUILD-NNN.md:
   - **Use Cases**: list R# identifiers satisfied (or `—` if purely structural with no behavioral validation)
   - **Files**: list every `.ts` / `.tsx` file created or modified (note the package)
6. Run static checks:

```bash
npm run lint:packages
npm run format:check
npm run build:core && npm run build:react
```

7. Smoke check: build core+react, then exercise the feature — run relevant Vitest, and/or `npm run serve:react-demo` (http://localhost:4200) and walk through all R# (e.g. `/templates`). Take a screenshot to `.github/screenshots/` if the change is visually significant.
8. Update `BUILD-NNN.md` Status: `in-progress → done`. Fill Execution Log. Update `_index.md`.
9. Update `REVIEW-NNN.md` Status: `draft → ready`. Update `_index.md`.

### Blocking rule

若 build 過程有需要人為判斷、且無法從 spec 或 `FRONTEND_RULE_COMMON.md` 決定的事項，立即停下來問，不要自行假設。

---

## Stage 4: Review

**Goal:** Run the review skill on `BUILD-NNN`; route findings back to build; loop until all findings pass.

### Step 4.1 — Invoke the review skill

```
/review BUILD-NNN
```

The review skill runs §1 Static Code Review and §3 Functional Validation (per `REVIEW_RULE.md`) and writes findings to `REVIEW-NNN.md`. It reads `BUILD-NNN.md ## Coverage` to determine scope.

註：若該 BUILD task 的 `Coverage.Use Cases` 為 `—`，review skill 會跳過 §3 功能驗收，REVIEW-NNN 仍可達 `done`。

### Step 4.2 — Route findings

On review skill completion:

- **Zero BLOCKERs** → proceed to Stage 5.
- **§1 violations** (static rule breach): fix each violation in source, re-run `npm run build:core && npm run build:react` + `npm run lint:packages`, then invoke the review skill again on `BUILD-NNN`.
- **§3 failures** (functional): describe [actual behavior] vs [expected behavior].
  - If fixable by implementation change → fix in source, re-run test / demo, invoke the review skill again.
  - If the gap requires a spec change or new R# → stop and ask the user before touching any file.

Repeat the loop until the review skill reports no BLOCKERs and marks `REVIEW-NNN` `done`.

---

## Stage 5: Done

**Goal:** Close the cycle only after explicit user authorization.

After the review skill marks REVIEW-NNN `done`:

1. Present summary:

```
Review 通過 — 等待授權完成此 cycle。

BUILD-NNN: <title> — done (§1 ✅ / §3 ✅)
REVIEW-NNN: done

確認後我更新 _index.md 並標記本 cycle 完成。
```

2. **Wait for explicit user authorization.**
3. On authorization: confirm both BUILD-NNN and REVIEW-NNN are `done` in `_index.md`. Advance `## ▶ Next Task` to the next `ready` task, or set to `None — awaiting task selection` if none remain.

`done` is not the end of the files' life. Once every PM issue the BUILD cites reaches **Done** on its board (PM acceptance, which happens after release) and the BUILD and REVIEW are both `done`, the pair is converged into `requirements/spec/` and deleted — follow `requirements/spec/README.md` → 收斂步驟. Do not converge on `done` alone: a ticket sent back as Pending fix still needs its BUILD.

---

## State and Status Rules

- **Mode**: always `spec-only`. No running design-reference server, no screenshot comparison against a reference build. The prototype at `references/asgard-chat-kit-prototype` is visual / behavioral background only.
- **Status flow**: `draft → ready → in-progress → done`
- **Forbidden status form**: never write `in_progress` (underscore). Always use `in-progress` (hyphen).
- The `Status` field in a task file and the matching row in `_index.md` Task Queue must always be in sync.

---

## When to Stop and Ask

| Situation                                                                                   | Stage |
| ------------------------------------------------------------------------------------------- | ----- |
| The tracking path is absent from the issue body and `find` returns nothing                  | 1     |
| The spec has no identifiable acceptance criteria or behavioral requirements                 | 1     |
| User requests task split / merge / R# change after seeing the plan                          | 2     |
| A build decision requires human judgment not covered by the spec or FRONTEND_RULE_COMMON.md | 3     |
| A §3 failure requires a spec change rather than an implementation fix                       | 4     |
| User has not yet explicitly authorized Done                                                 | 5     |
