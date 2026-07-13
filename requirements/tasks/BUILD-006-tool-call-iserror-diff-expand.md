# BUILD-006 Tool-call isError + Diff/Status + Expand Align (F-009 / F-007 / F-008)

## Meta

- Task ID: `BUILD-006`
- Status: `done`
- Issue: `asgard-sdk-pm#9 (F-009) · #7 (F-007) · #8 (F-008)`
- Source spec: `F-009-*.md`, `F-007-*.md`, `F-008-*.md` (UC-011, UC-012, UC-013, UC-014)
- Complexity: `M`

## Brief

The remaining tool-call-series refinements, delivered together (they share the tool-call item rendering):

- **F-009 (isError)** — determine failure from the backend-authoritative `isError` instead of `result.error` (invalid for native tools whose result is plain text). Core: add `isError?` to `ToolCallCompleteEventData` + `ConversationToolCallMessage`; `onToolCallComplete` populates it. `result.error` kept as fallback for old data.
- **F-007 (diff + unified status)** — Write diff = `+{content line count}`; Edit diff = line-level LCS estimate of `old_string`↔`new_string`, shown on the right. Unified status `running | completed | error`: running = amber spinner, error = red alert, **completed = no marker** (the variant icon carries identity; a per-row green check would be redundant).
- **F-008 (expand align)** — each call expands to `Initial` ({toolsetName, toolName, parameter}) + `Result` (toolCallResult) JsonViewers with **i18n titles** (`expand.initial`/`expand.result`); no chevron when there's no content. Builtin-variant-specific expand (Bash terminal / Edit diff view) is explicitly next-phase.

## Acceptance Criteria (condensed)

- `R1` (F-009) `isError` on the complete type + reducer; error state driven by `isError`; `result.error` fallback; missing `isError` ⇒ completed. → done
- `R2` (F-007) Write `+n` / Edit `+a -r` diffs on the right; unified 3-state status with the three expressions (running spinner / error alert / completed no-marker). → done
- `R3` (F-008) expand shows Initial + Result with i18n titles; no arrow when empty. → done
- `R4` (Smoke) build + Vitest green; demo shows diffs, an error row, no completed markers, i18n expand titles, no console errors. → done

## Coverage

Use Cases: UC-011, UC-012, UC-013, UC-014
Files:

- `packages/core/src/types/sse-response.ts` — `isError?` on `ToolCallCompleteEventData`.
- `packages/core/src/types/channel.ts` — `isError?` on `ConversationToolCallMessage`.
- `packages/core/src/lib/conversation.ts` — `onToolCallComplete` populates `isError`.
- `packages/react/src/components/chatbot/chatbot-body/chatbot-body.tsx` — status (running/completed/error via isError+fallback) + `diff` (via `toolDiff`).
- `packages/react/src/components/templates/tool-call-group/tool-call-group.tsx` (+ `.module.scss`) — `ToolCallStatus` = running/completed/error, `StatusIcon` (spinner/alert/none), diff display, i18n expand titles (locale prop threaded).
- `apps/react-demo/src/mock-server/sse-mock.ts` — a failing (`isError`) tool call + Write/Edit diff params.

Verification: lint:packages ✅ · build:core + build:react ✅ · core Vitest 14/14 ✅ · Playwright — Wrote report.md `+5`, Edited plan.md `+2 -1`, Fetched api.example.com error (isError), completed rows unmarked (0 check icons), expand titles Initial/Result; 0 console errors (screenshot `.github/screenshots/f007-tool-call-diff/diff-status-error.png`).

## Execution Log

- 2026-07-13: Core `isError` + reducer; react unified status + diff + i18n expand titles; demo error/diff fixtures. Verified lint/build/Vitest + Playwright. (Status: `in-progress → done`).
