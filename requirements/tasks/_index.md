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

`main` is **complete: 13/13** (F-001~F-013), re-verified against the PM acceptance criteria (2026-07-14; report + evidence in `.github/verification/f001-f013/`).

- **EXT-003 closed** — F-012 subagent contract confirmed field-for-field against `asgard-core@dev-1.16.19`.
- **EXT-002 closed** — F-010 reads the authoritative `toolUseResultSidecar` (TaskCreate → `task.{id,subject}`, TaskUpdate → `taskId`+`statusChange.to`), parameter fallback (PR #281, merged to `main`).
- **Open follow-up** — [FOLLOWUP-f002-background-tab-detach](./FOLLOWUP-f002-background-tab-detach.md): F-002's background-tab `openWhenHidden` return + `detach`→cursor-rejoin (2 of 6 criteria), deferred pending real-backend regression.

**On this branch (PR-B, stacked on the shared-provider PR):** F-014 (BUILD-010, transcript replay kernel) `done`; **`BUILD-011` — F-015** 進房初始化編排 (metadata gate + autoResetChannel 改版 + GET replay transport, **breaking**) next. After F-015: F-016 (channelTitle$ store), F-017 (title UI, deferred).

## Task Queue

| Task ID      | Title                                                    | Priority | Status | Spec                                                                                             |
| ------------ | -------------------------------------------------------- | -------- | ------ | ------------------------------------------------------------------------------------------------ |
| `BUILD-001`  | Message Stream Assembly Robustness (F-011)               | High     | done   | [BUILD-001-message-stream-robustness.md](./BUILD-001-message-stream-robustness.md)               |
| `REVIEW-001` | Review: Message Stream Assembly Robustness               | —        | done   | [REVIEW-001-message-stream-robustness.md](./REVIEW-001-message-stream-robustness.md)             |
| `BUILD-002`  | Last-Event-ID Resume — core enablement (F-002)           | High     | done   | [BUILD-002-last-event-id-resume.md](./BUILD-002-last-event-id-resume.md)                         |
| `REVIEW-002` | Review: Last-Event-ID Resume                             | —        | done   | [REVIEW-002-last-event-id-resume.md](./REVIEW-002-last-event-id-resume.md)                       |
| `BUILD-003`  | Thinking Message Display (F-001)                         | High     | done   | [BUILD-003-thinking-message-display.md](./BUILD-003-thinking-message-display.md)                 |
| `REVIEW-003` | Review: Thinking Message Display                         | —        | done   | [REVIEW-003-thinking-message-display.md](./REVIEW-003-thinking-message-display.md)               |
| `BUILD-004`  | Run Indicator Bound to Connection (F-003)                | High     | done   | [BUILD-004-run-indicator-at-seam.md](./BUILD-004-run-indicator-at-seam.md)                       |
| `REVIEW-004` | Review: Run Indicator at Seam                            | —        | done   | [REVIEW-004-run-indicator-at-seam.md](./REVIEW-004-run-indicator-at-seam.md)                     |
| `BUILD-005`  | Tool-call i18n + Variants + Summary (F-005/004/006)      | High     | done   | [BUILD-005-tool-call-i18n-variants-summary.md](./BUILD-005-tool-call-i18n-variants-summary.md)   |
| `REVIEW-005` | Review: Tool-call i18n + Variants + Summary              | —        | done   | [REVIEW-005-tool-call-i18n-variants-summary.md](./REVIEW-005-tool-call-i18n-variants-summary.md) |
| `BUILD-006`  | Tool-call isError + Diff/Status + Expand (F-009/007/008) | High     | done   | [BUILD-006-tool-call-iserror-diff-expand.md](./BUILD-006-tool-call-iserror-diff-expand.md)       |
| `REVIEW-006` | Review: Tool-call isError + Diff/Status + Expand         | —        | done   | [REVIEW-006-tool-call-iserror-diff-expand.md](./REVIEW-006-tool-call-iserror-diff-expand.md)     |
| `BUILD-007`  | Task Check List Panel (F-010)                            | High     | done   | [BUILD-007-task-check-list-panel.md](./BUILD-007-task-check-list-panel.md)                       |
| `REVIEW-007` | Review: Task Check List Panel                            | —        | done   | [REVIEW-007-task-check-list-panel.md](./REVIEW-007-task-check-list-panel.md)                     |
| `BUILD-008`  | Subagent List Panel (F-012)                              | High     | done   | [BUILD-008-subagent-list-panel.md](./BUILD-008-subagent-list-panel.md)                           |
| `REVIEW-008` | Review: Subagent List Panel                              | —        | done   | [REVIEW-008-subagent-list-panel.md](./REVIEW-008-subagent-list-panel.md)                         |
| `BUILD-009`  | Framework-agnostic derived-state store (F-013)           | High     | done   | [BUILD-009-derived-state-store.md](./BUILD-009-derived-state-store.md)                           |
| `REVIEW-009` | Review: Derived-state store                              | —        | done   | [REVIEW-009-derived-state-store.md](./REVIEW-009-derived-state-store.md)                         |
| `BUILD-010`  | Transcript replay kernel + message.user (F-014)          | High     | done   | [BUILD-010-transcript-user-replay-kernel.md](./BUILD-010-transcript-user-replay-kernel.md)       |
| `REVIEW-010` | Review: Transcript replay kernel                         | —        | done   | [REVIEW-010-transcript-user-replay-kernel.md](./REVIEW-010-transcript-user-replay-kernel.md)     |
