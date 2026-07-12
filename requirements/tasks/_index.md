# Task Index

## Config

- SPEC_DIR: `references/asgard-sdk-pm/tracking/asgard-js-sdk`
- framework_profile: `ts-library-nx-vite`
- ui_stack: `react-component-lib`

> Static reference (not a running server): `references/asgard-chat-kit-prototype` (chat kit prototype). The spec source of truth is SPEC_DIR (`features/` + `use-cases/` + `tasks/`) linked from a PM issue on `asgard-sdk-pm`. See `requirements/_index.md` → "Working from a PM issue".

## Convention

- Executable task specs (Single-file SDD) live here as `TASK-*.md`. Create new tasks from `_template.md`. Per-issue cycles use the `BUILD-*` / `REVIEW-*` pair (`_build_template.md` / `_review_template.md`).
- Each task spec has `Meta`, `1) Requirements`, `2) Design`, `3) Implementation Tasks`, `4) Execution Log / Change Log`; acceptance criteria use EARS `R#` and map to implementation tasks + an Acceptance Test Matrix.
- Full rules: `docs/spec-driven-development.md`.

## Status Legend

- `draft` — 撰寫中，尚未定案。
- `ready` — 規格完成、通過 readiness gate，可被指派實作（需使用者明確指示才開工）。
- `in-progress` — 實作進行中。
- `done` — 驗收條件達成、驗證完成。

> 一律使用 `in-progress`（連字號），**禁止**使用 `in_progress`（底線）。Task spec 的 `Meta` status 與本表必須同步更新。

## Covered Specs

None yet.

## ▶ Next Task

Batch 1 done — F-011 (BUILD-001/REVIEW-001) + F-002 (BUILD-002/REVIEW-002) all `done`, uncommitted on `fix/f-011-message-stream-robustness`. Next: **Batch 2 → F-001** (thinking message 顯示) — awaiting go.

## Task Queue

| Task ID      | Title                                          | Priority | Status | Spec                                                                                 |
| ------------ | ---------------------------------------------- | -------- | ------ | ------------------------------------------------------------------------------------ |
| `BUILD-001`  | Message Stream Assembly Robustness (F-011)     | High     | done   | [BUILD-001-message-stream-robustness.md](./BUILD-001-message-stream-robustness.md)   |
| `REVIEW-001` | Review: Message Stream Assembly Robustness     | —        | done   | [REVIEW-001-message-stream-robustness.md](./REVIEW-001-message-stream-robustness.md) |
| `BUILD-002`  | Last-Event-ID Resume — core enablement (F-002) | High     | done   | [BUILD-002-last-event-id-resume.md](./BUILD-002-last-event-id-resume.md)             |
| `REVIEW-002` | Review: Last-Event-ID Resume                   | —        | done   | [REVIEW-002-last-event-id-resume.md](./REVIEW-002-last-event-id-resume.md)           |
