# BUILD-008 Subagent List Panel (F-012)

## Meta

- Task ID: `BUILD-008`
- Status: `done`
- Issue: `asgard-sdk-pm#12 (F-012)`
- Source spec: `F-012-subagent-清單面板呈現當前子代理.md` (UC-019, UC-020)
- Complexity: `L`

## Brief

Spawning a subagent surfaces as an `Agent` tool call (`toolsetName === "" && toolName === "Agent"`) plus a distinct `asgard.subagent.{start,complete}` event family, and the subagent's own child `tool_call.*` events carry `parentToolUseId` pointing back at the `Agent` call's `toolUseId`. Accumulate these into a "current subagent list" rendered as a docked panel stacked **above** the Task List (run-level live state, same nature as `RunningIndicator` / `TaskList` — not a message block). The `Agent` call and every child tool call are routed **out** of the main tool-call group.

- **Core** — add `toolUseId` / `parentToolUseId` to the tool-call event + `ConversationToolCallMessage`; add the `SUBAGENT_START` / `SUBAGENT_COMPLETE` event types, their SSE fact data, and a new `ConversationSubagentMessage` surfaced into the conversation `messages` map (keyed by `parentToolUseId`, replay-safe: only `.complete` moves it to a terminal status; a late/replayed `.start` never rolls a terminal subagent back to running — F-011 contract).
- **React** — `subagent-list.tsx`: `isAgentTool` / `isSubagentChildTool` / `isSubagentRelated` routing predicates, `reduceSubagents(messages)` fold, and `<SubagentList>` panel (auto-collapse when all terminal, hidden when never present, per-item current-tool line + expandable child tool list). Dock above `<TaskList>`; filter subagent-related messages out of the thread; guard the message renderer.
- **i18n** — `subagent.{running,completed,failed,cancelled,activeTool,toolCount}` in en / ja / zh (`subagent.title` already exists); `subagentType` / `description` / tool labels are backend content, not localized.

**Already exists:** `packages/react/src/components/chatbot/task-list/` (closest precedent — `isTaskTool`, `reduceTasks`, docked tray), `tool-call-i18n.ts` (`t`, `toolLabel`, `subagent.title`), `conversation.ts` (event → message pipeline with F-011 anti-rollback guards), `sse-mock.ts` (tool-call + task phases).

### INFERRED BACKEND CONTRACT

The F-012 spec's authoritative event shapes come from `asgard-sdk-go/pkg/models/sse_event.go`, which is **not available in this repo's submodules** (tracked as EXT-003). The event contract is implemented from the pinned prototype reference (`asgard-chat-kit-prototype@f73545c` — `subagentReducer.ts` + `docs/superpowers/specs/2026-07-11-subagent-list-design.md`), which the prototype author validated against the Go source and the `new-example11.sse.txt` dump:

- `asgard.subagent.start` fact `subagentStart`: `agentId`, `parentToolUseId`, `subagentType?`, `description?`.
- `asgard.subagent.complete` fact `subagentComplete`: the same fields **plus** `status` (`completed` | `failed` | `cancelled`) and `summary?`.
- `asgard.tool_call.{start,complete}` facts gain `toolUseId?` / `parentToolUseId?` (sibling to `processId` / `callSeq`, same level as the existing `isError`).

New core event types are marked provisional in-code (`@see EXT-003`) and confirmed against `asgard-sdk-go` before release. The react-demo mock matches this shape.

## Acceptance Criteria

EARS form; each maps to Implementation Tasks (→ T#).

- `R1` (Core event types) When a `tool_call.{start,complete}` carries `toolUseId` / `parentToolUseId`, the system shall parse them onto `ConversationToolCallMessage`; and when `subagent.start` / `subagent.complete` arrive, the system shall materialize a `ConversationSubagentMessage` in the conversation `messages` map. → T1, T2
- `R2` (Replay-safe status) While a subagent is already terminal (`subagent.complete` landed), when a late/replayed `subagent.start` arrives, the system shall not roll its status back to running; status is driven only by `subagent.complete`, never by the `Agent` tool call's `tool_call.complete`. → T2
- `R3` (Routing) When rendering the main tool-call group, the system shall keep only `parentToolUseId === "" && toolName ∉ {Agent, TaskCreate, TaskUpdate}`; the `Agent` call (`isAgentTool`) and every child (`isSubagentChildTool`, `parentToolUseId !== ""`) and every `subagent` message are excluded from the thread. → T3, T4
- `R4` (Accumulation) When folding the conversation, `reduceSubagents` shall produce the current subagent list keyed by `parentToolUseId` (first-seen order), each carrying `subagentType` / `description` / `status` / `summary` and its child tool list (paired by `toolUseId`, `isError → error`); pure + replay-safe. → T4
- `R5` (Position / visibility) The panel shall dock above `<TaskList>` (input side); never rendered when the list is empty; auto-collapsed when every subagent is terminal (`open === null ⇒ show = anyRunning`); expanded while any is running. → T5
- `R6` (Item) Each item shall show a status glyph (running amber spinner / completed muted check / failed red alert / cancelled muted slash) + `subagentType · description` (running → emphasized description); collapsed running item shows `↳ {activeTool}` (last running child, else last), collapsed terminal item shows the tool count; expanded item lists child tools with `toolLabel` + status glyph. → T5
- `R7` (i18n) `subagent.*` keys (en / ja / zh, en fallback); backend content not localized. → T6
- `R8` (Smoke) When the developer runs `npm run build:core && npm run build:react` and exercises the react-demo (`npm run serve:react-demo`, http://localhost:4200), the system shall show the Subagent panel above the Task list with a running-then-terminal subagent and its child tools, the `Agent`/child tools absent from the main tool-call group, and no build/console errors. → T7, T8

## Implementation Tasks

- [ ] T1 (R1): Core types — `EventType.SUBAGENT_START` / `SUBAGENT_COMPLETE` in `enum.ts`; `toolUseId?` / `parentToolUseId?` on `ToolCallBaseEventData`; `SubagentStartEventData` / `SubagentCompleteEventData` + `SubagentStatus` in `sse-response.ts`; extend `Fact<Type>`. Add `toolUseId?` / `parentToolUseId?` to `ConversationToolCallMessage` and the new `ConversationSubagentMessage` to the `ConversationMessage` union in `channel.ts`.
- [ ] T2 (R1, R2): `conversation.ts` — carry `toolUseId` / `parentToolUseId` in `onToolCallStart` / `onToolCallComplete`; add `onSubagentStart` / `onSubagentComplete` (key by `parentToolUseId`) with a terminal anti-rollback guard mirroring `isTerminalThinkingMessage`.
- [ ] T3 (R3): `chatbot-body.tsx` — extend the thread filter to drop `isSubagentRelated` messages alongside `isTaskTool`.
- [ ] T4 (R3, R4): `subagent-list/subagent-list.tsx` — `isAgentTool`, `isSubagentChildTool`, `isSubagentRelated`, `reduceSubagents(ConversationMessage[]): Subagent[]`, `Subagent` / `SubagentToolCall` types.
- [ ] T5 (R5, R6): `<SubagentList>` panel + `subagent-list.module.scss` (theme CSS variables, no hardcoded colors) + `index.ts`; render `<SubagentList />` above `<TaskList />` in `chatbot.tsx`; add `if (message.type === 'subagent') return null` guard in `conversation-message-renderer.tsx`.
- [ ] T6 (R7): `tool-call-i18n.ts` — `subagent.{running,completed,failed,cancelled,activeTool,toolCount}` (en/ja/zh).
- [ ] T7 (R1..R7): Export new public API (core: types; react: `SubagentList`, `reduceSubagents`, `isAgentTool`, `isSubagentChildTool`, `isSubagentRelated`, `Subagent`); add Vitest for `reduceSubagents` + `onSubagent*` replay-safety.
- [ ] T7b: `npm run lint:packages` + `npm run format:check` + `npm run build:core && npm run build:react`.
- [ ] T8 (R8): Demo subagent phase in `sse-mock.ts` (Agent `tool_call.start` → `subagent.start` → early `Agent tool_call.complete` with `async_launched` → child tools → `subagent.complete`); smoke check in react-demo; screenshot to `.github/screenshots/`.

## Coverage

Use Cases: UC-019 (accumulation / routing), UC-020 (panel rendering + tool list)

Files:

- `packages/core/src/constants/enum.ts` — `EventType.SUBAGENT_START` / `SUBAGENT_COMPLETE`.
- `packages/core/src/types/sse-response.ts` — `toolUseId` / `parentToolUseId` on `ToolCallBaseEventData`; `SubagentCompleteStatus`, `SubagentStartEventData`, `SubagentCompleteEventData`; `Fact` `subagentStart` / `subagentComplete`.
- `packages/core/src/types/channel.ts` — `toolUseId` / `parentToolUseId` on `ConversationToolCallMessage`; new `ConversationSubagentMessage`; added to the `ConversationMessage` union (also folded in the previously-missing `ConversationThinkingMessage`, see drive-by #1).
- `packages/core/src/lib/conversation.ts` — carry association keys in `onToolCallStart`; `onSubagentStart` / `onSubagentComplete` with `isTerminalSubagentMessage` anti-rollback guard.
- `packages/core/src/lib/conversation.spec.ts` — +6 tests (subagent start/complete, replay-safety, out-of-order complete, association-key parsing, Agent-stays-main-line). 20/20 pass.
- `packages/react/src/components/chatbot/subagent-list/subagent-list.tsx` (+ `.module.scss`, `index.ts`) — `isAgentTool`, `isSubagentChildTool`, `isSubagentRelated`, `reduceSubagents`, `Subagent` / `SubagentToolCall`, `<SubagentList>` + glyphs.
- `packages/react/src/components/chatbot/chatbot-body/chatbot-body.tsx` — drop `isSubagentRelated` from the thread + main tool-call group.
- `packages/react/src/components/chatbot/chatbot-body/conversation-message-renderer.tsx` — `subagent` renderer guard (returns null).
- `packages/react/src/components/chatbot/chatbot.tsx` — render `<SubagentList />` above `<TaskList />`; move the docked panels inside `AsgardTemplateContextProvider` (drive-by #2).
- `packages/react/src/i18n/tool-call-i18n.ts` — `subagent.{running,completed,failed,cancelled,activeTool,toolCount}` (en/ja/zh).
- `apps/react-demo/src/mock-server/sse-mock.ts` — subagent phase (`Agent` spawn → `subagent.start` → early `async_launched` Agent complete → 3 child tools → `subagent.complete`); `emptyFact()` gains the two subagent keys.
- `apps/react-demo/src/app/routes/subagent/*` (+ `app.tsx`, `components/layout/layout.tsx`) — `/subagent` live-mock demo route.

Verification: lint:packages ✅ · build:core + build:react ✅ · core Vitest 20/20 ✅ · react `tsc --noEmit` 0 real errors (only TS6305 project-ref cache noise) · prettier ✅. Playwright on `/subagent` (locale `zh-TW`): Subagent panel docked **above** the Task list; expanded item `已完成 · general-purpose · 分析上週各通路訂單並找出異常 · 3 個工具` with child tools `讀取 orders.csv` / `彙總各通路訂單金額` / `搜尋「retail order anomaly detection」`; the `Agent` call + child tools **absent** from the main tool-call group (`6 個步驟`); all-terminal → auto-collapsed; i18n localized (`子代理` / `已完成` / `3 個工具`); 0 console errors. Running-state render (amber spinner + `執行中：{tool}`) is covered by the core unit tests (status stays `running` until `subagent.complete`); the live mock stream settles too fast to reliably screenshot the transient running frame. Screenshots: `.github/screenshots/f012-subagent/{expanded-localized,panel-above-tasks}.png`.

### Drive-by fixes (pre-existing, surfaced by this work)

1. **`ConversationMessage` union missing `ConversationThinkingMessage`** — F-001 added the type and used it in `conversation.ts` but never added it to the union. Harmless at runtime (vite tolerates the `vite:dts` error) but `tsc --noEmit` failed on it; adding the subagent member forced a clean union, so the thinking member was folded in too. Now `tsc` is clean.
2. **Docked run-layer panels sat outside `AsgardTemplateContextProvider`** — so `locale` never reached `TaskList` (F-010) or the new `SubagentList`; both rendered `en-US` regardless of the `locale` prop. Moved the docked panels inside the provider (context-only, no DOM node → layout unchanged); `TaskList` now localizes too (`任務清單`). Required for R7.

## Execution Log / Change Log

- 2026-07-13: BUILD task created from asgard-sdk-pm#12 (F-012), grounded on prototype@f73545c + feature md; new core event types marked inferred (EXT-003) pending asgard-sdk-go (Status: `draft`).
- 2026-07-13: Implemented core event types + routing (+6 Vitest), react subagent-list panel + i18n, docked above TaskList, demo subagent phase + `/subagent` route. Two drive-by fixes (union, provider placement). lint/build/tests/format green; Playwright verified on `/subagent` zh-TW with screenshots (Status: `in-progress → done`).
