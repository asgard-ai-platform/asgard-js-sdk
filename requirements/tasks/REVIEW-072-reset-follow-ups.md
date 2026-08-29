# REVIEW-072 Review: close the three reset follow-ups

## Meta

- Task ID: `REVIEW-072`
- Status: `done`
- BUILD Task: `BUILD-072`
- Reviewed commit: `d08e9779`
- Reviewed branch: `fix/455-reset-follow-ups`

---

## §1 Static Code Review

Scope: the six files in `BUILD-072 ## Coverage`. Typecheck and lint run project-wide.

### §1.1 Checklist

| Check item                                                     | Rule        | Result                           |
| -------------------------------------------------------------- | ----------- | -------------------------------- |
| `any` / `as any`                                               | §1.1        | ✅                               |
| `@ts-ignore` / `eslint-disable` bypassing a type or lint error | §1.2        | ✅                               |
| `console.log` in library code, not behind a debug option       | §1.3 / §7   | ✅                               |
| Hardcoded API key / endpoint / namespace                       | §1.4        | ✅                               |
| Teardown for every subscription / timer                        | §1.5        | ✅                               |
| react imports core through its public entry only               | §1.6        | ✅                               |
| core free of react / react-dom / DOM                           | §1.6 / §2.1 | ✅                               |
| Public-API change carries a `@deprecated` transition           | §1.7        | ✅ (n/a — no public API changed) |
| New public types / functions exported from the entry           | §2.2        | ✅ (n/a — nothing new is public) |
| Type / enum prerequisites exist before first use               | §2.3        | ✅                               |
| Uses `botProviderEndpoint`                                     | §2.4        | ✅                               |
| Exported functions declare explicit return types               | §3.1        | ✅                               |
| Shared types centralized; no duplicate interfaces              | §3.2        | ✅                               |
| Component props fully typed                                    | §4.1        | ✅                               |
| No hardcoded colors                                            | §4.2        | ✅                               |
| `react` / `react-dom` stay peerDependencies                    | §4.4        | ✅                               |
| core and react share a version number                          | §5          | ✅ (both `0.3.75`)               |
| Repeated logic (≥2×) extracted                                 | §6          | ⚠️ see Minor 1                   |
| No `setTimeout` mock delays, dead code, untracked TODO / FIXME | §7          | ✅                               |

**18 ✅ / 0 ❌ / 1 ⚠️.**

Two things worth stating rather than just ticking:

- **`@asgard-js/core` is untouched** — `git diff main...HEAD -- packages/core` is empty. The whole task
  lives in react, which matches Decision 2 in BUILD-072 (the delete runs before any `Channel` exists, so
  the old instance cannot know it is being torn down).
- **No public API was added.** `refuseWhileResetting` is a local helper; the two new effects are internal.
  `ChannelBusyError` was already exported and already documented as the programmatic-send refusal, so the
  new rejection reuses an existing contract rather than widening one.

### §1.2 Mechanical Grep

First run produced a false all-clear: the file list was passed unquoted and the grep read it as a single
missing path, so every check printed empty. Re-run file by file:

```
### 1. any / as any            → (empty)
### 2. ts-ignore / eslint-disable → 3 hits, all pre-existing `no-console` beside a `client?.debugMode`
                                 guard (use-channel.ts:611, tool-call-consent-gate.tsx:80 and :152).
                                 None is in the diff — the two touched files are +17 / +17 lines and do
                                 not go near them. §1.3 permits debug-option-controlled logging.
### 3. console.log             → the same 3, same guards.
### 6. hardcoded colors        → 7 hits, all false positives: issue references (`#409`, `#405`, `#455`)
                                 matching the hex pattern inside comments and test titles.
### 7. setTimeout              → 2 hits: chat-composer.tsx:275 is the pre-existing iOS Safari focus-scroll
                                 workaround; use-channel.spec.ts:406 is a microtask flush in a test.
                                 Neither is a mock delay.
### core → react reverse dep   → (empty)
### react deep-import into core/src → (empty)
```

### §1.3 TypeScript and Lint

```
typecheck (core + react + react-demo): PASS
lint:packages:                          PASS — 0 errors, 5 warnings, all pre-existing and in files this
                                        task did not touch
format:check:                           PASS
build:core && build:react:              PASS
```

### §1.4 Static Review Acceptance

- [x] All §1.1 items checked
- [x] No ❌ violations
- [x] All §1.2 greps run — and re-run after the first pass silently returned nothing
- [x] Typecheck clean
- [x] Lint clean

---

## §3 Functional Validation

### R# Result Matrix

| R#  | Description                                                              | Result                 | Note                                                                                                                                                                                                                                                                                         |
| --- | ------------------------------------------------------------------------ | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Replacing the channel drops pending attachments and revokes preview URLs | Pass                   | 2 Vitest cases including the negative (a re-render that does not change the channel keeps the attachment). Browser `/delete-channel`: an attached PNG's thumbnail is present before a reset and gone after.                                                                                  |
| R2  | The attachment entrance is refused while a reset is in flight            | Pass                   | 2 Vitest cases. Browser: with the DELETE held open, the button reports `disabled` and computed `opacity: 0.6` (the pre-existing `:disabled` rule), and is live again once the reset settles.                                                                                                 |
| R3  | `sendMessage` / `replyToolCallConsents` rejected with `ChannelBusyError` | Pass (partial harness) | Vitest with the delete held open: both reject with `ChannelBusyError`, `sent` stays empty, and releasing the delete lets the `NONE` opening turn through. **Browser covers only the composer half** — see Gap 1.                                                                             |
| R4  | Replacing the channel drops the consent queue                            | Pass                   | 2 Vitest cases including the R5 negative. Browser against the **real dev consent bot**: modal open on `processId=7d1ef33d…`, reset pressed, modal gone; the modal now on screen belongs to `processId=ae9ef035…` from the new conversation, and no consent reply was submitted at any point. |
| R5  | No regression on the ordinary paths                                      | Pass                   | The two negative cases above, plus the full suite: core 275 / react 402 green (was 275 / 395).                                                                                                                                                                                               |
| R6  | Build + browser walk                                                     | Pass                   | Gate green in order lint → format → typecheck → build → test; both routes walked.                                                                                                                                                                                                            |

**Each of the four fixes was reverted individually and the suite re-run**, confirming exactly one test
turns red per fix. That is the check that separates "a test exists" from "a test is holding something".

### §3.1 Acceptance

- [x] Every R# executed
- [x] Each marked with its evidence
- [x] No e2e spec for this SDK; Vitest + demo used
- [x] Boundary conditions: the held-open teardown window, a re-render that does not change the channel,
      and `pendingConsent` going null on the _same_ channel (which must NOT clear the queue)

---

## Findings

### Critical (must fix before done)

None.

### Important (should fix in this cycle)

None.

### Minor (nice to have)

1. **§6 — the "did the channel instance change" boilerplate now exists twice.** `chat-composer.tsx:118`
   and `tool-call-consent-gate.tsx:44` both hold a ref, compare it to the current channel, and act. The
   bodies differ (one clears attachments, the other resets three pieces of consent state), so what
   repeats is the detection, not the behavior — a `useChannelChanged(channel, fn)` hook would remove
   about four lines per site. Left alone deliberately: at two call sites in two different components the
   indirection costs roughly what it saves, and a third site would be the point to extract. Worth
   revisiting if one appears.
2. **R3's programmatic half has no browser evidence.** The demo has no affordance that calls
   `sendMessage` during a reset, and adding one purely to photograph it would be building a feature for
   the screenshot. Vitest pins it precisely, including the error type. Recorded rather than papered over.
3. **The mount-time opening also sets `isResetting`**, so the reset button is briefly `disabled` while a
   channel first opens — visible on `/tool-call-consent`, where the sandbox cold start makes the window
   several seconds long. Pre-existing (F-032 did not introduce it) and arguably correct, but the flag's
   name suggests it only covers resets. Not in this task's scope.

---

## Execution Log

- 2026-08-29: REVIEW task created, paired with BUILD-072 (Status: `draft`).
- 2026-08-29: §1 Static review — 18 ✅ / 0 ❌ / 1 ⚠️ (§6, Minor 1). The first grep pass returned a false all-clear from an unquoted file list and was re-run per file; every remaining hit is pre-existing, debug-gated, or a false positive on an issue reference. Typecheck / lint / format / build green. `@asgard-js/core` untouched, no public API added.
- 2026-08-29: §3 Functional validation — R1–R6 all Pass, on core 275 / react 402 plus browser walks of `/delete-channel` and `/tool-call-consent` (the latter against the real dev consent bot, which is the only way to raise a genuine consent prompt — the demo mock cannot emit one). R3's programmatic half is Vitest-only and recorded as such. 0 BLOCKERs (Status: `in-progress → done`).
