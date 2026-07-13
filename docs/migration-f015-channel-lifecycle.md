# Migration — F-015 transcript-first channel init lifecycle

**Status:** breaking behavioral change to `autoResetChannel` (no API removed). Ships on the transcript-lifecycle branch; **no npm release / tag yet**.

## What changed

Before F-015, mounting a `<Chatbot>` (or calling `useChannel`) with `autoResetChannel !== false` (the default) **unconditionally** dispatched `RESET_CHANNEL` on mount. Against a channel that already had a transcript, that wiped history (asgard-core `RESET_CHANNEL` is delete-then-ensure — it clears transcript / session / title / run state).

After F-015, mount is **transcript-first**. It first probes `GET {botProviderEndpoint}/channel/metadata?custom_channel_id=<id>`, then branches:

| Channel state              | `autoResetChannel` | Behavior                                                                                                             |
| -------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------- |
| **Exists** (metadata 200)  | any                | **Restore** — `GET /message/sse` rejoin replays the collapsed history and tails any in-flight run. **Never** resets. |
| **Missing** (metadata 404) | `true` (default)   | `RESET_CHANNEL` opens the channel (unchanged from before).                                                           |
| **Missing** (metadata 404) | `false`            | Stays empty, sends nothing; the first user send starts the channel with `action=NONE` (unchanged).                   |

So `autoResetChannel` keeps its name but its **meaning narrows**: it now only governs the _missing-channel_ case. An existing channel is **always restored**, regardless of `autoResetChannel`.

## What you need to do

- **Nothing, if you relied on reset-on-mount only for brand-new channels.** That still happens (404 + `autoResetChannel=true`).
- **If you relied on `autoResetChannel=true` to wipe-and-restart an _existing_ channel every mount**, that no longer happens. Trigger a reset explicitly instead — the header reset control or the `resetChannel()` API from `useChannel`.
- **Backend requirement:** the bot-provider must expose `GET /channel/metadata` and the `GET /message/sse` rejoin (asgard-core `dev-1.16.19`+). The built-in `AsgardServiceClient` calls them automatically. A custom `IAsgardServiceClient` that does **not** implement `getChannelMetadata` keeps the **pre-F-015** behavior (probe skipped → reset/create by `autoResetChannel`), so nothing breaks silently.

## Behavior notes

- **Cold restore rehydrates persisted messages only.** `message.user` and `message.complete` are persisted and replay; `tool_call.*`, thinking deltas, and the derived task / subagent / tool-call activity are **ephemeral** (never in transcript history) and do **not** replay for an idle channel. They reappear only from a new live run. (This matches asgard-core's rejoin collapse.)
- **Input is disabled during restore** (reusing F-003 `isConnecting`) until the replay tails to `run.done` / `run.error`. An idle channel releases immediately — the backend synthesizes a terminal. There is currently no interrupt API, so a `RUNNING` channel keeps input disabled until its run reaches a terminal.
- **`initMessages` is not used on the restore path** (history comes from the server replay; seeding it would duplicate/precede real history). It still seeds `reset` / `create` and preview/offline (`!client`) mode. Full narrowing of `initMessages` to preview-only is tracked separately (TASK-001).
- **A non-404 metadata error degrades gracefully** to an empty channel — an existing transcript is never wiped on an ambiguous (network / 5xx) failure, and the mount never hangs.

## New public surface (additive)

- `ChannelMetadata` / `ChannelRunState` types (`@asgard-js/core`).
- `IAsgardServiceClient.getChannelMetadata?(customChannelId)` and `.rejoinSse?(customChannelId, options)` (implemented by `AsgardServiceClient`).
- `Channel.rejoin(config, options?, onChannelCreated?)`.
- `createSseObservable` gains `method: 'GET' | 'POST'` + `queryParams` (GET carries no body).

See the `/channel-restore` route in `apps/react-demo` for a runnable restore-vs-fresh demo.
