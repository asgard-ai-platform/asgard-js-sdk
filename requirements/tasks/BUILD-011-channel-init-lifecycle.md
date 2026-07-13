# BUILD-011 進房初始化編排 + autoResetChannel metadata-gated 改版 (F-015)

## Meta

- Task ID: `BUILD-011`
- Status: `done`
- Issue: `asgard-sdk-pm#15 (F-015)`
- Source spec: `F-015-進房初始化編排與-autoresetchannel-metadata-gated-改版.md` (UC-024/025/026)
- Complexity: `L` (breaking cross-package mount-lifecycle + new GET transport)

## Brief

Today `useChannel` mounts by unconditionally `POST /message/sse` with `RESET_CHANNEL` whenever `autoResetChannel !== false` (the default). Against an **existing** channel that is a data-loss bug — asgard-core's `RESET_CHANNEL` is delete-then-ensure, wiping transcript / title / run state. F-015 makes the mount lifecycle **transcript-first**: probe `GET /channel/metadata` first, then branch — an existing channel is **restored** (GET rejoin replay, never reset); a missing one is either **reset** (`autoResetChannel=true`, default) or left **empty** (`autoResetChannel=false`, first send `action=NONE`). `autoResetChannel` keeps its name but changes semantics: it now only governs the _missing-channel_ case; an existing channel is always restored. The restore period disables input (reuse F-003 `isConnecting`) until the replay tails to `run.done`/`run.error`; an idle channel releases immediately (backend synthesizes a terminal). Adds a GET method to the SSE transport, `client.getChannelMetadata()` + `client.rejoinSse()`, and `Channel.rejoin()`.

- **Transport** — `create-sse-observable.ts` gains `method: 'GET' | 'POST'` (default POST) + `queryParams`; GET carries no body, the channel id travels as `custom_channel_id`.
- **Client** — `getChannelMetadata(customChannelId)` (GET, 404 → `{ exists: false }`, non-404 throws so the caller can fall back without wiping history); `rejoinSse(customChannelId, options)` (GET rejoin, shares the exact stream plumbing).
- **Channel** — `Channel.rejoin()` static + private `rejoinChannel()`; the POST/GET stream wiring is unified in a private `streamSse()`.
- **React** — `useChannel` mount rewrite: `openChannel()` probes metadata then routes to `restoreChannel()` / `resetChannel()` / `initChannel()`; a re-entry guard (`openingRef`) covers the async probe window.
- **Demo** — mock GET `/channel/metadata` + GET rejoin (`existing-` id prefix ⇒ exists); a `/channel-restore` route shows restore vs. fresh side-by-side.

**Already exists (reused):** F-014 `Conversation.onMessageUser` + `message.user` assembly (the replay payload); F-003 `isConnecting` (input gate); `Channel.reset` / `Channel.create` (the missing-channel branches).

## Acceptance Criteria

- `R1` (Metadata gate) When `useChannel` mounts with a `customChannelId` and a client that supports it, the system shall first `GET /channel/metadata` and treat 404 as "does not exist". → T2, T4
- `R2` (Restore, never reset) When the channel exists, the system shall restore it via GET rejoin (replay history, tail to terminal) and shall **never** dispatch `RESET_CHANNEL`. → T3, T4
- `R3` (Missing + autoReset) When the channel does not exist and `autoResetChannel !== false`, the system shall dispatch `RESET_CHANNEL`. → T4
- `R4` (Missing + no autoReset) When the channel does not exist and `autoResetChannel === false`, the system shall stay empty (no request) and the first send shall use `action=NONE`. → T4
- `R5` (Input gate) During restore the system shall keep input disabled (F-003 `isConnecting`) until `run.done`/`run.error`; an idle channel shall release immediately via the backend-synthesized terminal. → T3, T4
- `R6` (Old semantic gone) The system shall no longer reset an existing channel on mount; a returning channel never loses history. → T4
- `R7` (Error fallback) A non-404 metadata error shall degrade gracefully to an empty channel (never silently wipe history, never hang); a client without `getChannelMetadata` shall keep the pre-F-015 behavior. → T2, T4
- `R8` (Smoke) When the developer runs `npm run build:core && npm run build:react` and exercises `/channel-restore`, an `existing-` channel shall render replayed history on mount with input briefly disabled then enabled, and a fresh channel shall reset/greet — no build/console errors. → T6

## Implementation Tasks

- [x] T1 (R1,R2): `create-sse-observable.ts` — `method`/`queryParams`; GET sends no body.
- [x] T2 (R1,R7): `types/client.ts` — `ChannelRunState`, `ChannelMetadata`, `getChannelMetadata?`/`rejoinSse?` on `IAsgardServiceClient`; `client.ts` — `getChannelMetadata()` (404→exists:false, non-404 throws) + `rejoinSse()` + shared `runSse()`.
- [x] T3 (R2,R5): `channel.ts` — `Channel.rejoin()` + `rejoinChannel()`; unify POST/GET into `streamSse()`.
- [x] T4 (R1-R7): `use-channel.ts` — `restoreChannel()` (GET rejoin, empty conversation), `openChannel()` orchestrator (probe → restore/reset/empty), `openingRef` guard, mount effect rewrite.
- [x] T5 (R8): `sse-mock.ts` — GET rejoin replay of collapsed persisted messages (`message.user` + `message.complete` + `run.done`; tool_call/thinking are ephemeral, not persisted) + `handleMockChannelMetadata`; `vite.config.ts` — metadata middleware.
- [x] T6 (R8): `/channel-restore` demo route; `npm run lint:packages` + `format:check` + `build:core && build:react`; browser verify + screenshots/GIF.

## Coverage

Use Cases: UC-024 (restore/tail), UC-025 (missing+autoReset→RESET), UC-026 (missing+noAutoReset→empty)

Files:

- `packages/core/src/lib/create-sse-observable.ts` — `method`/`queryParams`; GET no body.
- `packages/core/src/types/client.ts` — `ChannelRunState`, `ChannelMetadata`, `getChannelMetadata?`/`rejoinSse?`.
- `packages/core/src/lib/client.ts` — `getChannelMetadata()`, `rejoinSse()`, shared `runSse()`.
- `packages/core/src/lib/channel.ts` — `Channel.rejoin()`, `rejoinChannel()`, `streamSse()`.
- `packages/react/src/hooks/use-channel.ts` — `restoreChannel()`, `openChannel()`, `openingRef`, mount rewrite.
- `apps/react-demo/src/mock-server/sse-mock.ts` — GET rejoin replay + `handleMockChannelMetadata`.
- `apps/react-demo/vite.config.ts` — `/mock-asgard/channel/metadata` middleware.
- `apps/react-demo/src/app/routes/channel-restore/*` (new) — restore vs. fresh demo.

- `apps/react-demo/src/app/{app,components/layout/layout}.tsx` — register `/channel-restore` route + nav.
- `requirements/tasks/BUILD-011` / `REVIEW-011` / `_index.md` — SDD tracking.

Verification: build:core + build:react ✅ · react lint ✅ · prettier ✅ (F-015 files) · backend contract verified against `asgard-core@dev-1.16.19` (GET `/channel/metadata` 404-gate + GET `/message/sse` rejoin collapse: `tool_call.*`/thinking are ephemeral, not persisted). Browser (`/channel-restore`, zh-TW): **existing-demo** → metadata 200 → GET rejoin restored `message.user` + `message.complete` on mount, **no RESET_CHANNEL** (UC-024); **fresh-demo** + `autoResetChannel=true` → RESET greeting streamed (UC-025); + `autoResetChannel=false` → empty, first send `action=NONE` (UC-026). Console clean (the lone 404 is the intended metadata existence-probe). Screenshots: `.github/screenshots/f015-channel-restore/{restore-vs-fresh,empty-when-no-autoreset}.png` + `channel-restore-flow.gif`.

## Follow-ups (out of scope)

- **TASK-001**: narrow `initMessages` to preview/offline only — remove it from the `reset`/`create` (live) paths too. F-015 already keeps it out of `restore`; the reset/create narrowing is TASK-001.
- **F-016**: render `metadata.title` (available on `ChannelMetadata`) + `channel.title.update` store.

## Execution Log / Change Log

- 2026-07-13: BUILD task created from asgard-sdk-pm#15 (F-015). Transcript-first mount lifecycle; breaking `autoResetChannel` semantic. (Status: `draft` → `in-progress`).
- 2026-07-13: Implemented GET transport + `getChannelMetadata`/`rejoinSse` + `Channel.rejoin` + `useChannel` metadata-gated mount; mock GET rejoin/metadata + `/channel-restore` demo. Backend contract re-verified against `asgard-core@dev-1.16.19` (rejoin replays persisted messages only; tool_call/thinking ephemeral). All 3 branches browser-verified (UC-024/025/026); build/lint/prettier green. (Status: `in-progress → done`).
