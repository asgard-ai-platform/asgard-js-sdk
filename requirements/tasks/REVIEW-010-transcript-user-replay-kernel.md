# REVIEW-010 Transcript replay kernel + message.user (F-014)

## Meta

- Task ID: `REVIEW-010`
- Status: `done`
- BUILD Task: `BUILD-010`
- Reviewed branch: `feat/stream-robustness-and-resume`

## §1 Static Code Review

- No `any` / `@ts-ignore` / `eslint-disable` / `console.log` / `setTimeout` in the coverage files ✅
- `@asgard-js/core` framework-neutral (no react/DOM) ✅
- Additive only: new enum values, optional event-data + `ConversationUserMessage` fields, new `onMessageUser` handler — no breaking change ✅
- New types auto-exported via `export type *`; enum via `export *` ✅
- `tsc` (core) clean; `lint:packages` green.

**No §1 BLOCKERs.**

## §3 Functional Validation

| R#                           | Result   | Note                                                                                                                                    |
| ---------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| R1 (enum parity + safe skip) | Pass     | `MESSAGE_USER` + `CHANNEL_TITLE_UPDATE` added; `onMessage` default skips unhandled (`CHANNEL_TITLE_UPDATE` has no handler yet — F-016). |
| R3 (message.user assembly)   | Pass     | Vitest: cold replay materializes user message with text/blobIds/customMessageId/identityHint.                                           |
| R4 (replay-safe assembly)    | Pass     | Reuses F-011 complete-self-sufficient handlers unchanged.                                                                               |
| R5 (dedupe)                  | Pass     | Vitest: optimistic (customMessageId) + duplicate replay (messageId) both deduped.                                                       |
| R6 (replay-safe)             | Pass     | No arrival-time-derived values.                                                                                                         |
| R2 (GET transport)           | Deferred | Folded into F-015/BUILD-011 (mount metadata-gate initiates the GET rejoin).                                                             |
| R7 (smoke)                   | Pass     | build core+react ✅; 31/31 Vitest.                                                                                                      |

**No §3 BLOCKERs.** (§3 done without the browser — the kernel is pure data-layer; the GET-driven flow is exercised in F-015.)

## Findings

None (Critical / Important / Minor).

## Execution Log

- 2026-07-13: §1 static clean; §3 R1/R3/R4/R5/R6/R7 Pass, R2 deferred to F-015; 0 BLOCKERs (Status: `done`).
