# requirements

`requirements/` stores executable requirements and specs. This is the implementation source of truth for agents.

Read order:

1. `requirements/_index.md`
2. `requirements/spec/_index.md` for design decisions and known limits; `requirements/requests/_index.md` or `requirements/tasks/_index.md` for work
3. Target spec chapter, `REQ-*.md`, or `BUILD-*.md` / `REVIEW-*.md`
4. `references/` only when more background is needed

Work lives under `requirements/tasks/` as BUILD/REVIEW pairs, created from `_build_template.md` and `_review_template.md`; the templates define the sections. `_template.md` (single-file `TASK-*.md`) is the older format.

Accepted work is folded into `requirements/spec/` and its task files deleted; see `requirements/spec/README.md`.

Status values:

- `draft`
- `ready`
- `in-progress`
- `done`

Do not use `in_progress`.
