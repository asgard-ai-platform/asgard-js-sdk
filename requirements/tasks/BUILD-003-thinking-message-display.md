# BUILD-003 Thinking Message Display (F-001)

## Meta

- Task ID: `BUILD-003`
- Status: `done`
- Issue: `https://github.com/asgard-ai-platform/asgard-sdk-pm/issues/1`
- Source spec: `references/asgard-sdk-pm/tracking/asgard-js-sdk/features/F-001-thinking-message-顯示.md` (UC-001, UC-002)
- Complexity: `L`

---

## Brief

Render the backend `asgard.message.thinking.{start,delta,complete}` SSE events as a standalone, collapsible **thinking block**, separate from tool-calls and the final answer. Core adds the events + a `ConversationThinkingMessage` variant + reducer handlers (with the F-011 robustness contract built in). React adds a `ThinkingBlock` component wired into the message renderer.

**Design decisions (made autonomously, user away):**

- The prototype's streaming rendering uses a `…`-prefixed tail-slice (horizontal shift), which F-001 AC explicitly **prohibits** — implemented the AC's **bottom-anchored auto-scroll window + top fade mask + plain text** instead. Spec > prototype.
- Complete-state summary is the **fixed** `Thought for a moment` (no duration), per the 2026-07-12 decision.
- Thinking is a **separate `ConversationMessage` variant** (`type:'thinking'`) keyed by its own messageId, rendered standalone (no avatar bubble), matching the SDK's flat conversation model.
- Reasoning rendered as **plain text** (both states) — avoids half-markdown reflow (AC) and keeps it simple; complete-state expand truncates at `PREVIEW_LIMIT` (160) with 顯示更多/較少.

---

## Acceptance Criteria

- `R1` On `thinking.{start,delta,complete}`, a standalone collapsible thinking block renders, visually separate from tool-calls and the answer. → done
- `R2` Streaming (delta received, not complete): auto-expanded, header `Thinking…`, bottom-anchored auto-scroll window, plain text, top fade mask; honors `prefers-reduced-motion`. → done
- `R3` Complete: collapses to the fixed single-line `Thought for a moment`, re-expandable; expanded truncates at `PREVIEW_LIMIT` with show more/less; collapsed by default in history. → done
- `R4` `complete` self-sufficient; late/replayed `start`/`delta` never roll back the terminal block; delta lazy-inits (F-011 contract for the thinking family). → done (unit-tested)
- `R5` Non-rendering consumers ignore the three events safely; thinking and answer messages coexist as separate entries. → done (unit-tested)
- `R6` (Smoke) Build green; thinking block renders in the react-demo (streaming → collapsed → expandable) with no console errors. → done

---

## Coverage

Use Cases: UC-001, UC-002 (R1–R6)
Files:

- `packages/core/src/constants/enum.ts` — `MESSAGE_THINKING_{START,DELTA,COMPLETE}`.
- `packages/core/src/types/sse-response.ts` — thinking keys on `Fact`.
- `packages/core/src/types/channel.ts` — `ConversationThinkingMessage` variant.
- `packages/core/src/lib/conversation.ts` — 3 thinking handlers + `isTerminalThinkingMessage` (F-011 contract).
- `packages/core/src/lib/conversation.spec.ts` — 7 thinking-family specs.
- `packages/react/src/components/templates/thinking-block/*` — new `ThinkingBlock` component.
- `packages/react/src/components/templates/index.ts` — export.
- `packages/react/src/components/chatbot/chatbot-body/conversation-message-renderer.tsx` — `thinking` branch.
- `apps/react-demo/src/mock-server/sse-mock.ts` — thinking phase before the answer (verification infra).

Verification: Vitest 14/14 (7 message + 7 thinking); lint:packages ✅; build:core + build:react ✅; react-demo smoke ✅ (screenshots `.github/screenshots/f001-thinking/`, 0 console errors).

## Execution Log

- 2026-07-13: Implemented core (events + variant + reducer + 7 specs) and react (`ThinkingBlock` + wiring + mock phase). Verified: 14/14 Vitest, builds green, demo smoke + screenshots. (Status: `in-progress → done`).

---

_Note: on the scroll-bug demo page a send occasionally renders two thinking blocks — a dev/StrictMode double-effect of that demo page, not an SDK double-dispatch (the reducer keys by messageId; unit tests confirm single entries). Flagged for the demo, not a core defect._
