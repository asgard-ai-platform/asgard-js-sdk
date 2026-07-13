# REVIEW-012 Channel title store (F-016)

## Meta

- Task ID: `REVIEW-012`
- Status: `done`
- BUILD Task: `BUILD-012`
- Reviewed branch: `feat/f016-channel-title`

## §1 Static Code Review

Scope: `channel.ts`, `channel.spec.ts`, `types/channel.ts`, `use-channel.ts`, `use-derived-stores.ts`, `asgard-service-context.tsx`, `sse-mock.ts`, `multi-panel/*`.

- ✅ No `any` / `@ts-ignore` / `eslint-disable` bypass. The one cast (`as unknown as SseResponse` in the test) builds a typed fixture, not an `any` in library code.
- ✅ Additive public surface: `ChannelStates.title`, `ChannelConfig.initialTitle`, `Channel.channelTitle`, `useChannelTitle()`, `channelTitleStore`. No removals — **not breaking**.
- ✅ Package boundary intact (core has no React/DOM); title store mirrors the F-013 `toReactiveStore` pattern exactly.
- ✅ Teardown: `channelTitle$` completed in `close()`; the store `subscribe` returns an unsubscribe (skip(1)); no leak.
- ✅ Replay-safe: title updated only from `channel.title.update` (guarded) or seeded from metadata; rejoin (no title.update) keeps the seed.
- ✅ `build:core` + `build:react` clean; prettier clean.

No §1 BLOCKERs.

## §3 Functional Validation

Verified on `/multi-panel` (zh-TW) + `channel.spec.ts`.

| R#  | Criterion                                            | Result                                                                                                   |
| --- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| R1  | Consume `channel.title.update` → title state         | ✅ title bar updates to `上週各通路訂單分析` from the event; unit test folds it                          |
| R2  | Per-slice `channelTitle$` store + on `ChannelStates` | ✅ `useChannelTitle()` reads the store; `states.title` set (unit test)                                   |
| R3  | Seed from `GET /channel/metadata.title`              | ✅ `titleSeedRef` → `initialTitle`; unit test seeds from constructor                                     |
| R4  | Ephemeral / replay-safe                              | ✅ rejoin emits no title.update (mock); seed survives (unit test)                                        |
| R5  | External render, not redrawn by delta                | ✅ title bar rendered outside `<Chatbot>` via `useChannelTitle()`; separate subject from `conversation$` |
| R6  | Smoke: build + demo, no errors                       | ✅ build green; console clean (lone 404 = intended metadata probe)                                       |

No §3 BLOCKERs.

## Execution Log

- 2026-07-14: §1 static ✅ (no BLOCKERs), §3 functional ✅ (R1–R6). core 44/44. Status: `draft → done`.
