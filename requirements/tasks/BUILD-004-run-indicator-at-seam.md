# BUILD-004 Run Indicator Bound to Connection, At the Seam (F-003)

## Meta

- Task ID: `BUILD-004`
- Status: `done`
- Issue: `https://github.com/asgard-ai-platform/asgard-sdk-pm/issues/3`
- Source spec: `references/asgard-sdk-pm/tracking/asgard-js-sdk/features/F-003-*.md` (UC-005, UC-006)
- Complexity: `M`

## Brief

Move the "responding" indication from per-message typing to a single indeterminate progress line bound to the whole SSE connection (`isConnecting`), placed at the thread↔input seam; remove the per-message typing workarounds (keep the streaming text). React-only; the `isConnecting` chain (channel → context) is untouched, per spec.

## Acceptance Criteria

- `R1` Indicator binds `isConnecting` (whole run), not per-message events — no flicker, no disappearance in message gaps. → done (verified: `isConnecting` true 82ms after send through the whole run)
- `R2` Rendered as an indeterminate progress line at the thread↔input seam (persistent divider that "comes alive" during a run). → done (`RunningIndicator` between `renderMenu` and footer)
- `R3` Input stays disabled during the run (same signal). → unchanged (footer already binds `isConnecting`)
- `R4` Stays lit through `complete`→`done` tail until the connection actually closes (`onSseCompleted`). → done (bound to `isConnecting$`, set false only on complete/error in `channel.ts`)
- `R5` Honors `prefers-reduced-motion` (static bar, no sweep). → done (media query in scss)
- `R6` Streaming message text still shows live (removed the dots/placeholder, not the text). → done (`BotTypingBox` renders `typingText` only)

## Cleanup (pre-resume / per-message workarounds removed)

- Deleted `bot-typing-placeholder.tsx` + its `<BotTypingPlaceholder>` usage in `chatbot-body.tsx` and its 3 suppression conditions.
- `BotTypingBox`: removed the 3-dot animation + `useDebounce(isTyping, 500)`; renders streaming `typingText` only.
- `botTypingPlaceholder` context/prop kept for API compat (no longer consumed internally).

## Coverage

Use Cases: UC-005, UC-006 (R1–R6)
Files:

- `packages/react/src/components/chatbot/running-indicator/*` — new `RunningIndicator` (binds `isConnecting`, seam line + indeterminate bar, reduced-motion, `--asg-color-*`).
- `packages/react/src/components/chatbot/chatbot.tsx` — `<RunningIndicator/>` at the seam.
- `packages/react/src/components/chatbot/chatbot-body/chatbot-body.tsx` — removed `BotTypingPlaceholder`.
- `packages/react/src/components/templates/text-template/bot-typing-box.tsx` — stripped dots + debounce.
- `packages/react/src/components/templates/text-template/{index.ts,bot-typing-placeholder.tsx}` — removed export + deleted file.

Verification: lint:packages ✅ · build:react ✅ · Playwright — **definitive functional proof**: a single-evaluate send+poll captured `isConnecting`/`data-connecting` = `true` 82ms after send with the indicator bar rendered (`children.length===2`) through the run; earlier separate-call polls false only due to MCP call latency exceeding the run duration. Screenshot (seam placement): `.github/screenshots/f003-run-indicator/seam.png`. The bar is a subtle 2px animated line best seen live.

## Execution Log

- 2026-07-13: Implemented `RunningIndicator` + seam placement + workaround cleanup. Verified lint/build + Playwright functional proof (isConnecting true@82ms + bar). (Status: `in-progress → done`).
