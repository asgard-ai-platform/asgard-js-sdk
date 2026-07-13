# REVIEW-011 Channel init lifecycle — metadata gate (F-015)

## Meta

- Task ID: `REVIEW-011`
- Status: `done`
- BUILD Task: `BUILD-011`
- Reviewed commit: (branch `feat/transcript-channel-lifecycle`, F-015 commits)
- Reviewed branch: `feat/transcript-channel-lifecycle`

## §1 Static Code Review

Scope (BUILD-011 Coverage.Files): `create-sse-observable.ts`, `types/client.ts`, `client.ts`, `channel.ts`, `use-channel.ts`, `sse-mock.ts`, `vite.config.ts`, `channel-restore/*`, demo `app.tsx`/`layout.tsx`.

- ✅ No `any` / `@ts-ignore` / `eslint-disable` bypassing types. The one `eslint-disable-next-line no-console` in `use-channel.ts` gates a `debugMode`-only warn (existing pattern).
- ✅ Package boundary intact: core gains no React/DOM deps; `getChannelMetadata`/`rejoinSse` are plain `fetch`/RxJS.
- ✅ Explicit return types on new exported surface (`ChannelMetadata`, `ChannelRunState`, `getChannelMetadata`, `rejoinSse`, `Channel.rejoin`).
- ✅ Public API additive: `getChannelMetadata?`/`rejoinSse?` optional on `IAsgardServiceClient` (custom clients unaffected → pre-F-015 fallback). `autoResetChannel` is a **behavioral** breaking change (documented in the migration note), not an API removal.
- ✅ Teardown: rejoin reuses the existing `Channel.close()` subscription teardown; `openingRef` prevents duplicate async opens; no new timers/subscriptions leak.
- ✅ `build:core` + `build:react` clean; react lint clean; prettier clean (F-015 files).

No §1 BLOCKERs.

## §3 Functional Validation

Verified in browser on `/channel-restore` (zh-TW), mock GET metadata + GET rejoin faithful to `asgard-core@dev-1.16.19`.

| R#  | Criterion                                                                               | Result                                                                          |
| --- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| R1  | Mount → `GET /channel/metadata`; 404 = not-exist                                        | ✅ existing-demo→200, fresh-demo→404 (network tab)                              |
| R2  | Exists → restore via GET rejoin, never RESET                                            | ✅ `message.user` + `message.complete` replayed on mount; no RESET_CHANNEL POST |
| R3  | Missing + autoReset true → RESET_CHANNEL                                                | ✅ fresh-demo greeting streamed                                                 |
| R4  | Missing + autoReset false → empty, first send `action=NONE`                             | ✅ empty state, waits for input (UC-026)                                        |
| R5  | Restore input-gate via `isConnecting`; IDLE releases immediately                        | ✅ input disabled during replay, released on synthesized terminal               |
| R6  | Existing channel never reset on mount (no history loss)                                 | ✅ restore path sends no RESET_CHANNEL                                          |
| R7  | Non-404 metadata error → graceful empty fallback; no-metadata client keeps old behavior | ✅ catch → `initChannel()`; optional-method guard                               |
| R8  | Smoke: build + demo, no console errors                                                  | ✅ build green; console clean (lone 404 = intended existence probe)             |

No §3 BLOCKERs.

## Execution Log

- 2026-07-13: REVIEW created + run. §1 static ✅ (no BLOCKERs), §3 functional ✅ (R1–R8 pass, UC-024/025/026 browser-verified). Backend contract re-confirmed (rejoin replays persisted messages only; tool_call/thinking ephemeral). Status: `draft → done`.
