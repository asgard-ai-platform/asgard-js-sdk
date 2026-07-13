# BUILD-007 Task Check List Panel (F-010)

## Meta

- Task ID: `BUILD-007`
- Status: `done`
- Issue: `asgard-sdk-pm#10 (F-010)`
- Source spec: `F-010-task-check-list-面板呈現當前任務清單.md` (UC-015, UC-016)
- Complexity: `M`

## Brief

`TaskCreate` / `TaskUpdate` are native tool calls (`toolsetName === ""`) but semantically increment **one shared task list**, not individual tool rows. Route them out of the tool-call group and fold them into a single docked "Task Check List" tray above the thread↔input seam (run-level live state, same nature as `RunningIndicator` — not a message block). Hidden when there are no tasks.

- **Routing** — `isTaskTool` (`toolsetName === "" && toolName ∈ {TaskCreate, TaskUpdate}`) filters task tools out of `groupMessages` in `chatbot-body`; they never render as tool-call rows.
- **Accumulation** — `reduceTasks` folds `.complete` events into the current list, keyed by task id, in create-arrival order; pure + replay-safe.
- **Three states** — `completed` = green check; `in_progress` = amber spinner + emphasized `activeForm`; `pending` = hollow dim circle. A task with a `description` expands to show the full text.
- **i18n** — `task.title` (+ status keys) in en / ja / zh; `subject` / `activeForm` / `description` are backend content, not localized.

### INFERRED BACKEND CONTRACT

The F-010 PM spec keys off `sidecar.task.id` and `sidecar.statusChange.to`, which are **not yet on the SDK event type** (tracked as EXT-002). Until the backend `sidecar` contract lands, `reduceTasks` reads `id` / `status` / `subject` / `activeForm` / `description` from `parameter` — which is exactly the spec's documented `parameter.status` fallback path. The react-demo mock matches this shape. When `sidecar` lands, `reduceTasks` gains a `sidecar`-first read with the current `parameter` read as fallback (no consumer-facing change).

> Reducer currently lives in `@asgard-js/react` (`task-list.tsx`). F-013 relocates it into `@asgard-js/core` and exposes it via a framework-agnostic store.

## Acceptance Criteria (condensed)

- `R1` (Routing) `isTaskTool` pulls TaskCreate/TaskUpdate out of the tool-call group; they do not appear as tool-call rows. → done
- `R2` (Accumulation) `reduceTasks` folds `.complete` events → current list; id-keyed; create-arrival order; pure + replay-safe. → done
- `R3` (Position / visibility) docked tray above the seam; empty list ⇒ not rendered. → done
- `R4` (Three states + label) in_progress = amber spinner + activeForm emphasized; completed = check; pending = hollow dim; description rows expand. → done
- `R5` (i18n) `task.*` keys (en / ja / zh, fallback en); backend content not localized. → done
- `R6` (Unknown status) unknown status kept as-is, neutral style, no crash (EXT-002). → done
- `R7` (Smoke) build + lint green; demo shows the tray with 3 folded tasks, no console errors. → done

## Coverage

Use Cases: UC-015, UC-016
Files:

- `packages/react/src/components/chatbot/task-list/task-list.tsx` (+ `.module.scss`, `index.ts`) — `isTaskTool`, `reduceTasks`, `Task`, `StatusGlyph`, `TaskRow`, `TaskList` docked tray.
- `packages/react/src/components/chatbot/chatbot-body/chatbot-body.tsx` — filter `isTaskTool` out of `groupMessages`.
- `packages/react/src/components/chatbot/chatbot.tsx` — render `<TaskList />` above `<RunningIndicator />`.
- `packages/react/src/i18n/tool-call-i18n.ts` — `task.*` message keys.
- `apps/react-demo/src/mock-server/sse-mock.ts` — task phase (TaskCreate×3 + TaskUpdate×2) on `parameter`.

Verification: lint:packages ✅ · build:core + build:react ✅ · Playwright — "TASKS · 3": task-1 completed (green check), task-2 in_progress (amber spinner, activeForm "正在依通路彙總並排序前 5 名"), task-3 pending (hollow); task-1 description expands/collapses (aria-expanded toggles, description text renders); 0 console errors. Screenshots `.github/screenshots/f010-task-list/{collapsed,expanded}.png`.

## Execution Log

- 2026-07-13: react `task-list` (isTaskTool + reduceTasks + docked tray, 3-state glyphs, activeForm, description expand); chatbot-body filter; chatbot render; `task.*` i18n; demo task phase. Documented INFERRED CONTRACT (parameter until `sidecar`; EXT-002). Verified lint/build + Playwright + 2 screenshots. (Status: `in-progress → done`).
- 2026-07-13: **EXT-002 resolved** (`fix/f010-task-sidecar`). Confirmed `asgard-core@dev-1.16.19` carries `toolUseResultSidecar` (TaskCreate → `task.{id,subject}`, TaskUpdate → `taskId` + `statusChange.to`); `reduceTasks` now reads the sidecar first with `parameter` fallback (+ type on `ToolCallCompleteEventData`/`ConversationToolCallMessage`, `onToolCallComplete` passthrough, mock sidecar, +4 unit tests). Consumer-facing behavior unchanged.
