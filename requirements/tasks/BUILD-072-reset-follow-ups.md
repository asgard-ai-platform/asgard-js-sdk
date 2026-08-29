# BUILD-072 Close the three reset follow-ups

## Meta

- Task ID: `BUILD-072`
- Status: `done`
- Issue: `https://github.com/asgard-ai-platform/asgard-js-sdk/issues/455`
- Source spec: the issue body (an internal defect report, not a PM tracking ticket — same shape as BUILD-067 / `asgard-js-sdk#448`)
- Complexity: `M`

---

## Brief

Three defects an adversarial review of F-032 surfaced. **None is a regression from that change** — revert
0.3.75 and all three still stand — but the delete it introduced widened the window they live in from one
SSE round trip to as much as 60 seconds, which is what moved them from "unreachable in practice" to
"reachable". All three are the same underlying omission: state that belongs to a conversation outliving
the conversation.

**Already exists:** `use-attachment-upload.ts` (`clear()`, already wired into `chat-composer.tsx:195` on
submit), `chat-composer.tsx` (the attachment entrance and its existing `isConnecting` / `isStopping` /
`isAwaitingConsent` submit gate), `use-channel.ts` (`openingRef`, `sendMessage`, `replyToolCallConsents`),
`ChannelBusyError(runKind)` (takes a `RunKind`, of which `'reset'` is one), `tool-call-consent-gate.tsx`
(`queue` state and the effect that seeds it from `pendingConsent`).

---

## Acceptance Criteria

- `R1` When the channel instance is replaced (the reset path, and any other replacement), the system shall
  clear the composer's pending attachments and revoke their preview object URLs, so no blobId belonging
  to a deleted channel can be carried into the next send. → T1
- `R2` While a reset is in flight, the system shall refuse the attachment entrance, so a file cannot be
  uploaded to a channel that is being torn down. → T2
- `R3` While a reset is in flight, the system shall reject `sendMessage` and `replyToolCallConsents` with
  `ChannelBusyError('reset')` — no turn dispatched, no optimistic bubble left behind — rather than
  letting them race the delete. → T3
- `R4` When the channel instance is replaced while a consent modal is open, the system shall drop the
  local consent queue, so an authorization collected for the deleted conversation is never submitted
  against the new one. → T4
- `R5` When none of the above conditions hold, the system shall behave exactly as before: a normal submit
  still clears attachments, a normal consent batch still submits, and a normal send still goes out. → T5
- `R6` (Smoke check) When the developer runs the gate and walks `/delete-channel` plus a consent route in
  the react-demo, the system shall show the attachment chips clearing on reset, the attachment button
  disabled during a slow teardown, and no stale consent modal after a reset — with no build errors. → T6

---

## Implementation Tasks

- [ ] T1 (R1): `chat-composer.tsx` — clear attachments when the channel identity changes (skip the first
      channel; `clear()` already revokes preview URLs).
- [ ] T2 (R2): `chat-composer.tsx` — include `isResetting` in the attachment entrance's disabled state,
      alongside the flags the submit path already honors.
- [ ] T3 (R3): `use-channel.ts` — refuse `sendMessage` / `replyToolCallConsents` while `openingRef` is
      set, rejecting with `ChannelBusyError('reset')`. No new public error type.
- [ ] T4 (R4): `tool-call-consent-gate.tsx` — take `channel` from context and drop `queue` (and the
      per-batch allow-always set) when the instance changes.
- [ ] T5 (R1–R5): Vitest for each, each written to fail before its fix.
- [ ] T6: Run `npm run lint:packages` + `format:check` + `typecheck` + `build:core && build:react` +
      `test:packages`, in that order.
- [ ] T7 (R6): Browser walk; screenshots stay local.

---

## Decisions (settled here, not in the issue)

1. **`ChannelBusyError('reset')` rather than a new error type.** It already takes a `RunKind`, `'reset'`
   is one, and its docstring already says it only surfaces for programmatic sends — which is exactly the
   exposure here (the built-in composer is gated by `isConnecting`).
2. **Gate in the react layer, not in core.** The delete happens in the `Channel.reset` static _before_
   any channel exists, so the old `Channel` instance has no way to know it is being torn down. Teaching
   it would mean new core API for a fact react already holds.
3. **Key the composer and consent invalidation on the channel instance changing**, not on "a reset
   happened". Same effect for reset, and it also covers every other replacement path for free.

---

## Coverage

Use Cases: R1, R2, R3, R4, R5, R6

Files (react only — core untouched):

- `packages/react/src/components/chatbot/chatbot-footer/chat-composer.tsx` — drop pending attachments when the channel instance changes; `disabled={isResetting}` on the attachment entrance
- `packages/react/src/hooks/use-channel.ts` — `refuseWhileResetting()` guarding `sendMessage` / `replyToolCallConsents`
- `packages/react/src/components/tool-call-consent/tool-call-consent-gate.tsx` — drop the queue (and the per-batch allow-always set and the in-flight marker) when the channel instance changes
- `packages/react/src/components/chatbot/chatbot-footer/reset-clears-attachments.spec.tsx` — new, 4 cases (R1 ×2 incl. the negative, R2 ×2)
- `packages/react/src/components/tool-call-consent/consent-queue-invalidation.spec.tsx` — new, 2 cases (R4 + the R5 negative)
- `packages/react/src/hooks/use-channel.spec.ts` — 1 case (R3)

---

## Execution Log / Change Log

- 2026-08-29: BUILD task created from https://github.com/asgard-ai-platform/asgard-js-sdk/issues/455 (Status: `draft`).
- 2026-08-29: All R# verified; gate green (lint 0 errors / format / typecheck / build / core 275 + react 402). Each of the four fixes reverted individually to confirm its test fails without it. Browser: `/delete-channel` for R1 (attachment chip cleared by a reset) and R2 (attachment button `disabled` with `opacity: 0.6` through a held teardown); `/tool-call-consent` against the real dev consent bot for R4 — the modal for `processId=7d1ef33d…` vanished on reset and the one now open belongs to a new `processId=ae9ef035…`, with no consent reply submitted at any point. R3's programmatic half is Vitest-only: the demo has no affordance that calls `sendMessage` during a reset (Status: `in-progress → done`).
