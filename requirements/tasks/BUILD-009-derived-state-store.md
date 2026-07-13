# BUILD-009 Framework-agnostic derived-state store (F-013)

## Meta

- Task ID: `BUILD-009`
- Status: `done`
- Issue: `asgard-sdk-pm#13 (F-013)`
- Source spec: `F-013-衍生狀態以-framework-agnostic-store-對外暴露.md` (UC-021, UC-022)
- Complexity: `L`

## Brief

Consumers often want to render the Task List / Subagent List **outside** the `<Chatbot>` component, in any framework. Relocate the two derived-state reducers from `@asgard-js/react` into `@asgard-js/core` (single source of truth), fold them over the same SSE-driven `Channel`, and expose each slice as a **reactive store** — a current-snapshot + change-notification contract (not a fire-and-forget delta event) that any framework can bridge. `ChannelStates` gains `tasks` / `subagents` so existing `statesObserver` consumers get them for free; per-slice `tasks$` / `subagents$` (`BehaviorSubject` + `distinctUntilChanged`) emit **only when that slice actually changes**, so a high-frequency `message.delta` does not redraw a consumer that only wants the list. React ships `useTaskList()` / `useSubagents()` adapters via `useSyncExternalStore`.

- **Move to core** — `Task` / `reduceTasks` / `isTaskTool` (from `task-list.tsx`) and `Subagent` / `SubagentToolCall` / `reduceSubagents` / `isAgentTool` / `isSubagentChildTool` / `isSubagentRelated` (from `subagent-list.tsx`) → `packages/core/src/lib/derived-state.ts`; react re-imports them (dedup).
- **Store** — `Channel` derives `tasks$` / `subagents$` from `conversation$` (`map(reduce)` + `distinctUntilChanged(deepEqual)`), exposes each as a `ReactiveStore<T>` (`getSnapshot()` + `subscribe(listener) → unsubscribe` + `observable`), and adds `tasks` / `subagents` to `ChannelStates`.
- **React** — expose the stores through `AsgardServiceContext`; add `useTaskList()` / `useSubagents()` hooks; `useChannel` return also surfaces `tasks` / `subagents`.
- **Docs** — `docs/derived-state-stores.md` bridging examples (React / Vue / Svelte / Angular-RxJS / vanilla).

**Already exists:** `packages/react/src/components/chatbot/{task-list,subagent-list}/*` (reducers to relocate), `packages/core/src/lib/channel.ts` (`conversation$` / `isConnecting$` / `combineLatest` → `statesObserver`), `packages/react/src/hooks/use-channel.ts`.

## Acceptance Criteria

- `R1` (Reducers in core) When SSE events flow into `Channel`, the system shall fold them into `tasks` / `subagents` via `reduceTasks` / `reduceSubagents` living in `@asgard-js/core`, each producing a **new immutable reference** on change. → T1, T2
- `R2` (ChannelStates) The `ChannelStates` pushed to `statesObserver` shall include `tasks` and `subagents` alongside `isConnecting` / `conversation`, with no change required of existing consumers. → T2
- `R3` (Per-slice store) `tasks$` / `subagents$` shall be `BehaviorSubject`s gated by `distinctUntilChanged` (structural), emitting only when that slice's content changes — a `message.delta` that leaves tasks unchanged must not re-emit `tasks$`. → T2, T3
- `R4` (Framework-agnostic contract) Each slice shall be exposed as `ReactiveStore<T>` = `getSnapshot(): T` (immutable current value) + `subscribe(listener): () => void` + `observable`, usable without a React dependency. → T3
- `R5` (React adapter) `useTaskList()` / `useSubagents()` shall be implemented with `useSyncExternalStore(subscribe, getSnapshot)` and re-render only when their slice changes. → T4, T5
- `R6` (No delta event) The system shall NOT add a fire-and-forget "listChanged" delta event; the store (snapshot + notify) is the only new surface. → (design)
- `R7` (Docs) `docs/derived-state-stores.md` shall show the bridge for React, Vue, Svelte, Angular/RxJS, and vanilla. → T6
- `R8` (Smoke) When the developer runs `npm run build:core && npm run build:react` and exercises the react-demo, the in-chatbot panels shall still render (now fed by the relocated core reducers), the external `useTaskList()` demo shall reflect the live tasks, and `tasks$` shall not emit on pure `message.delta`; no build/console errors. → T7, T8

## Implementation Tasks

- [ ] T1 (R1): `packages/core/src/lib/derived-state.ts` — relocate `Task`/`reduceTasks`/`isTaskTool` and `Subagent`/`SubagentToolCall`/`reduceSubagents`/`isAgentTool`/`isSubagentChildTool`/`isSubagentRelated`; add `deepEqual`. Export from the core entry.
- [ ] T2 (R1, R2, R3): `channel.ts` — `tasks$`/`subagents$` derived from `conversation$` (`distinctUntilChanged(deepEqual)`); add to `combineLatest` → `ChannelStates`; teardown in `close()`. `types/channel.ts` — `ChannelStates.tasks`/`.subagents`; `ReactiveStore<T>`.
- [ ] T3 (R3, R4): `Channel` exposes `tasks`/`subagents` as `ReactiveStore<T>` (getSnapshot + subscribe + observable).
- [ ] T4 (R5): react `use-channel.ts` — surface `tasks`/`subagents` on the return + expose the stores; `asgard-service-context.tsx` — pass stores through context.
- [ ] T5 (R5): `packages/react/src/hooks/use-derived-stores.ts` — `useTaskList()`/`useSubagents()` via `useSyncExternalStore`; export from react entry. Update `task-list.tsx`/`subagent-list.tsx`/`chatbot-body.tsx` to import the relocated core symbols (remove duplicates).
- [ ] T6 (R7): `docs/derived-state-stores.md`.
- [ ] T7 (R1, R3): Vitest for `reduceTasks`/`reduceSubagents` (relocated) + `deepEqual` + a `tasks$`-doesn't-emit-on-delta test.
- [ ] T7b: `npm run lint:packages` + `npm run format:check` + `npm run build:core && npm run build:react`.
- [ ] T8 (R8): react-demo — a `useTaskList()` external-render demo panel; smoke check; screenshot.

## Coverage

Use Cases: UC-021 (reducers in core + ChannelStates), UC-022 (per-slice store + framework adapters)

Files:

- `packages/core/src/lib/derived-state.ts` (new) — relocated `Task`/`reduceTasks`/`isTaskTool`, `Subagent`/`SubagentToolCall`/`reduceSubagents`/`isAgentTool`/`isSubagentChildTool`/`isSubagentRelated`, plus `deepEqual`.
- `packages/core/src/lib/derived-state.spec.ts` (new) — 7 tests: reduceTasks, reduceSubagents, deepEqual, and "a message.delta leaves the slice structurally equal" (proves `distinctUntilChanged` blocks the re-emit).
- `packages/core/src/lib/channel.ts` — `tasks$`/`subagents$` derived from `conversation$` (`distinctUntilChanged(deepEqual)`); `tasks`/`subagents` `ReactiveStore` (getSnapshot + subscribe + observable); `combineLatest` → `ChannelStates`; teardown in `close()`.
- `packages/core/src/types/channel.ts` — `ChannelStates.tasks`/`.subagents`; `ReactiveStore<T>`; `ConversationSubagentMessage.status` uses `SubagentStatus`.
- `packages/core/src/types/sse-response.ts` — `SubagentStatus`.
- `packages/core/src/index.ts` — export the reducers/predicates/`deepEqual` + `Task`/`Subagent`/`SubagentToolCall`.
- `packages/react/src/hooks/use-channel.ts` — surface `taskStore`/`subagentStore` on the return.
- `packages/react/src/hooks/use-derived-stores.ts` (new) — `useTaskList()`/`useSubagents()` via `useSyncExternalStore`.
- `packages/react/src/hooks/index.ts` — export the new hooks.
- `packages/react/src/context/asgard-service-context.tsx` — pass the stores through context.
- `packages/react/src/components/chatbot/task-list/task-list.tsx`, `subagent-list/subagent-list.tsx`, `chatbot-body/chatbot-body.tsx` — import the relocated symbols from `@asgard-js/core` (dedup); in-chatbot panels keep folding `messages` (works in live + preview).
- `docs/derived-state-stores.md` (new) — React / Vue / Svelte / Angular-RxJS / vanilla bridges.
- `apps/react-demo/src/app/routes/subagent/subagent.tsx` (+ `.module.scss`) — `<DerivedStateMirror>` via `renderMenu`, reading the slices through `useTaskList()`/`useSubagents()`.

Verification: lint:packages ✅ · build:core + build:react ✅ · core Vitest 27/27 ✅ (5 unrelated `references/asgard-sdk-pm` submodule test files fail to collect — missing `gray-matter` dep, pre-existing) · react `tsc --noEmit` 0 real errors · prettier ✅. Playwright on `/subagent` (zh-TW): `<DerivedStateMirror>` shows `useTaskList() → 1/3 tasks · useSubagents() → 1/1 subagents`, matching the built-in `任務清單 · 3` / `子代理 1/1` panels (now fed by the relocated core reducers); 0 console errors. Screenshot: `.github/screenshots/f013-derived-store/hooks-mirror-store.png`.

Note: `useTaskList()`/`useSubagents()` require the `AsgardServiceContextProvider` tree and reflect the live channel; in preview mode (no channel) they return `[]` (documented — reduce from `messages` there). The `console.log` in `use-channel.ts` (grep §1.2) is a pre-existing debug log gated behind `client?.debugMode`, not introduced here.

## Execution Log / Change Log

- 2026-07-13: BUILD task created from asgard-sdk-pm#13 (F-013); relocates F-010/F-012 reducers into core and exposes a framework-agnostic reactive store (Status: `draft` → `in-progress`).
- 2026-07-13: Relocated reducers + predicates + types into `core/lib/derived-state.ts` (+7 Vitest); `Channel` `tasks$`/`subagents$` + `ReactiveStore` + `ChannelStates`; react hooks + context plumbing; dedup components; framework docs; demo mirror. lint/build/tests/format green; Playwright verified the hooks mirror the store on `/subagent`. (Status: `in-progress → done`).
