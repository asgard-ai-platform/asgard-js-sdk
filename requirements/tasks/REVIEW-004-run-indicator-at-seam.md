# REVIEW-004 Run Indicator Bound to Connection, At the Seam (F-003)

## Meta

- Task ID: `REVIEW-004`
- Status: `done`
- BUILD Task: `BUILD-004`
- Reviewed branch: `feat/stream-robustness-and-resume`

## §1 Static Code Review

- No `any`/`@ts-ignore`/`eslint-disable`/`console.log` in the change. ✅
- `RunningIndicator` uses `--asg-color-*` vars + `asgard-running-indicator` class + module.scss; keyframes in scss (no inline `<style>`, unlike the prototype). ✅
- `prefers-reduced-motion` handled. ✅
- Public API: `botTypingPlaceholder` prop kept (no break); `BotTypingPlaceholder` removed — internal workaround, spec-sanctioned, no in-repo consumer, SDK pre-1.0. ✅
- lint:packages ✅ · build:react ✅.

**§1: 0 violations.**

## §3 Functional Validation

| R#                                | Result | Note                                                                   |
| --------------------------------- | ------ | ---------------------------------------------------------------------- |
| R1 bind isConnecting (whole run)  | Pass   | Playwright: `isConnecting`=true 82ms after send, sustained through run |
| R2 indeterminate line at seam     | Pass   | `RunningIndicator` present at input boundary (screenshot)              |
| R3 input disabled during run      | Pass   | footer already binds `isConnecting` (unchanged)                        |
| R4 lit through complete→done tail | Pass   | `isConnecting$` false only on `onSseCompleted`/error (`channel.ts`)    |
| R5 prefers-reduced-motion         | Pass   | scss media query                                                       |
| R6 streaming text still shown     | Pass   | `BotTypingBox` renders `typingText` (dots/debounce removed)            |

**§3: all Pass.** Note: separate-call Playwright polls initially read false — an MCP-latency artifact (run finished before each call's JS ran); a single-evaluate send+poll gave the definitive true@82ms. The bar is a 2px animated seam line, best seen live.

## Findings

None. Minor: unused `.dot`/`.typing-indicator` CSS remains in `text-template.module.scss` (dead after removing the dots) — harmless, candidate for a later sweep.

## Execution Log

- 2026-07-13: §1 0 violations; §3 R1–R6 Pass (Playwright functional proof + build). 0 BLOCKERs (Status: `draft → done`).
