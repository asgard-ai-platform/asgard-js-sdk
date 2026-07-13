# BUILD-010 Transcript cold-start replay kernel + message.user (F-014)

## Meta

- Task ID: `BUILD-010`
- Status: `done`
- Issue: `asgard-sdk-pm#14 (F-014)`
- Source spec: `F-014-transcript-冷啟動重播內核與-message-user-事件.md` (UC-023); decision `2026-07-13-transcript-first-class-init-lifecycle.md`
- Complexity: `M`

## Brief

Phase 0 of the transcript-first-class init lifecycle. asgard-core replays collapsed history (`*.complete` + `asgard.message.user`) on a `GET /message/sse` rejoin. This task adds the **data core**: the missing event types and the `message.user` assembly (with optimistic-vs-replay dedupe). The GET-transport trigger + mount orchestration is F-015 (BUILD-011); the reducers already assemble replay-safely (F-011).

### BACKEND CONTRACT — confirmed

Verified against `asgard-core@dev-1.16.19` (`internal/constants.go` + `internal/models/edgeserver.go`):

- `asgard.message.user` fact `messageUser` = `GenericBotSseEventFactUserMessage` `{ messageId, text, identityHint?, customMessageId?, blobIds? }`; **persist-only** — never echoed on the live POST path, only carried by a GET rejoin.
- `asgard.channel.title.update` fact `channelTitleUpdate` = `{ title }` (added for enum/fact parity; consumed by F-016).

## Acceptance Criteria (condensed)

- `R1` (Enum parity) `EventType` gains `MESSAGE_USER` + `CHANNEL_TITLE_UPDATE`; unhandled events safely skipped (`onMessage` default). → done
- `R3` (message.user assembly) `onMessageUser` folds a `ConversationUserMessage` with `text` / `blobIds` / `customMessageId` / `identityHint`. → done
- `R4` (replay-safe assembly) replay carries only self-sufficient `*.complete` + `message.user`; existing F-011 handlers assemble them idempotently/order-independently (unchanged). → done
- `R5` (dedupe) optimistic bubble (keyed by `customMessageId`) and a prior replay (keyed by `messageId`) are not duplicated by a rejoin. → done
- `R6` (replay-safe) no value derived from event arrival time. → done
- `R2` (GET replay transport) — **deferred to F-015/BUILD-011**, where the mount metadata-gate actually initiates the GET rejoin. Noted here to keep the phase boundary explicit.
- `R7` (Smoke) build core+react green; `onMessageUser` unit-tested. → done

## Coverage

Use Cases: UC-023 (transcript 冷啟動重播組進 conversation) — assembly portion

Files:

- `packages/core/src/constants/enum.ts` — `MESSAGE_USER`, `CHANNEL_TITLE_UPDATE`.
- `packages/core/src/types/sse-response.ts` — `UserMessageEventData`, `ChannelTitleUpdateEventData`, `Fact` entries.
- `packages/core/src/types/channel.ts` — `ConversationUserMessage.customMessageId` / `.identityHint`.
- `packages/core/src/lib/conversation.ts` — `onMessageUser` (dedupe by customMessageId / messageId).
- `packages/core/src/lib/conversation.spec.ts` — +4 tests (cold replay, optimistic dedupe, duplicate-replay dedupe, key-by-messageId).

Verification: core Vitest 31/31 ✅ · build:core + build:react ✅ · tsc clean.

## Execution Log

- 2026-07-13: F-014 replay kernel — enum + types + `onMessageUser` + dedupe (+4 Vitest). GET-transport (R2) deferred to F-015. (Status: `in-progress → done`).
