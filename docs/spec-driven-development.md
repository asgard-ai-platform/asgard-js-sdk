# Spec-Driven Development Guidelines

This repository uses Spec-Driven Development (SDD) for medium-to-large frontend work. The goal is to make work executable by agents without losing product intent, UI contracts, data dependencies, or verification requirements.

## Directory Roles

- `references/`: background material only. Use it for Figma prototypes, PM specs, design screenshots, API documentation, and exploratory research.
- `requirements/`: implementation source of truth. Agents must implement from requirements, not directly from references.
- `requirements/requests/`: high-level requirements, governance documents, cross-task background, and links to related task specs.
- `requirements/tasks/`: executable task specs. Each task must be specific enough for an agent to implement and verify.
- `requirements/spec/`: current-state spec — what the SDK does today, one chapter per feature area. Accepted tasks are folded in here and their task files deleted.

If `references/` conflicts with `requirements/`, trust `requirements/`. Record the conflict as an open question or decision before implementation.

## When SDD Is Required

Use SDD before coding when the work involves any of the following:

- New feature or multi-step behavior change.
- New page, screen, or user flow.
- API contract, request/response shape, error handling, or auth change.
- New app bootstrap from this template.
- Component architecture, folder structure, or design system change.
- Deployment, workflow, Helm, or operational behavior change.
- Ambiguous acceptance criteria or unresolved product decisions.

Small fixes, one-file config changes, or exact user-instructed changes may skip full SDD, but must still obey existing requirements if present.

## Status Flow

Use exactly these status values:

- `draft`: spec is being written or still has blocking questions.
- `ready`: spec passed readiness checks, but implementation has not started.
- `in-progress`: implementation has started after explicit user instruction.
- `done`: implementation and verification are complete.

Do not use `in_progress`. Do not move `ready` to `in-progress` until the user explicitly instructs implementation to begin.

## Required Indexes

- `requirements/_index.md`: repository-level requirements entrypoint and SDD convention summary.
- `requirements/requests/_index.md`: high-level requirements registry.
- `requirements/tasks/_index.md`: executable task registry.

When adding or changing a request/task status, update the matching index in the same change.

## Task Spec Format

Each unit of work is a BUILD/REVIEW pair under `requirements/tasks/`:

- `BUILD-NNN-<slug>.md`, created from `_build_template.md`: sources, decisions, EARS acceptance criteria, implementation tasks, coverage and execution log.
- `REVIEW-NNN-<slug>.md`, created from `_review_template.md`: the paired static review and functional validation against the BUILD's acceptance criteria.

The templates define the sections; the `feature-workflow` skill (plan and build) and the `review` skill (review) define how to fill them. A BUILD's `Source spec` points at the PM ticket, or at the repo issue when there is no PM ticket.

The single-file `TASK-xxx-short-name.md` format (`_template.md`) is older; do not create new ones.

## Current-State Spec

`requirements/spec/` describes what the SDK does today. Once every PM issue a task cites is accepted (board **Done**), its BUILD/REVIEW pair is folded into the matching chapter and deleted; the number stays in `requirements/spec/converged-tasks.md` with a link to the last version, and is never reused. Rules and steps: `requirements/spec/README.md`.

## Acceptance Criteria

Use EARS-style acceptance criteria with `R#` identifiers:

```text
R1 When <trigger>, the <system> shall <observable response>.
R2 If <condition>, the <system> shall <observable response>.
R3 While <precondition>, when <trigger>, the <system> shall <observable response>.
```

Each `R#` must map to at least one implementation task and at least one acceptance test or verification case.

## Readiness Gate

A task can move from `draft` to `ready` only when all checks pass:

- Background, goal, in scope, and out of scope are clear.
- Blocking open questions are resolved.
- UI/UX behavior, form validation, error states, and loading states are defined.
- API contracts (endpoints, request/response shapes, error codes) are defined when applicable.
- Auth and permission requirements are defined when applicable.
- Every `R#` maps to implementation tasks and an acceptance test matrix entry.

## Implementation Rules

- Treat `requirements/` as source of truth during implementation.
- Read `requirements/tasks/_index.md` before selecting work.
- Read the target task spec before editing code.
- Keep task status and change log current.
- Preserve traceability from code changes to `R#` and implementation tasks.
- Follow the front-end implementation rules in `requirements/_index.md` (framework, state, forms, types, UI, i18n, layering).

## Deviation Protocol

If implementation needs to diverge from a `ready` spec:

1. Stop the deviating work.
2. Explain the deviation, reason, impact, risk, and options.
3. Get explicit user confirmation.
4. Update the task spec requirements/design/tasks/change log.
5. Update indexes if status or scope changes.
6. Resume only after the spec is updated.

## Done Gate

A task can move to `done` only when:

- All acceptance criteria are satisfied.
- Acceptance test matrix is covered by automated tests or documented manual verification.
- Required checks/tests/builds pass, or non-runnable checks are documented with reason.
- No unapproved spec deviation remains.
- Code review or equivalent self-review confirmed conformance to the task spec.
- Task spec and index statuses are synchronized.

## Bootstrap Guidance For New Apps

When this template is instantiated into a new app, create or keep these SDD files unless the user explicitly opts out:

```text
references/README.md
requirements/README.md
requirements/_index.md
requirements/requests/_index.md
requirements/tasks/_index.md
```
