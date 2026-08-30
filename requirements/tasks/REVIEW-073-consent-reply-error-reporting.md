# REVIEW-073 Review: Report consent reply failures through onSseError

## Meta

- Task ID: `REVIEW-073`
- Status: `done`
- BUILD Task: `BUILD-073`
- Reviewed commit: `working tree on fix/331-consent-sse-error` (branched from `8ee3e3881170986cea10094cd46b68ffc3af04aa`)
- Reviewed branch: `fix/331-consent-sse-error`

---

## §1 Static Code Review

Scope: the six files in `BUILD-073 ## Coverage`.

### §1.1 Checklist

| Check item                                                                | Rule                      | Result                                                                                              |
| ------------------------------------------------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------- |
| `any` / `as any`                                                          | FRONTEND_RULE_COMMON §1.1 | ✅ none                                                                                             |
| `@ts-ignore` / `eslint-disable` to bypass type or lint errors             | §1.2                      | ✅ four `eslint-disable-next-line no-console`, all on debug-gated logs — none bypasses a type error |
| `console.log` left in library code (not behind a debug option)            | §1.3 §7                   | ✅ all four are inside `if (client?.debugMode)`                                                     |
| Hardcoded API key / endpoint / namespace                                  | §1.4                      | ✅ none                                                                                             |
| Teardown for every RxJS subscription / EventSource / timer                | §1.5                      | ✅ nothing new subscribed; `notify` is a plain call guard                                           |
| `@asgard-js/react` imports core via the public entry only                 | §1.6                      | ✅ grep for `@asgard-js/core/src` / `core/src/lib` empty                                            |
| `@asgard-js/core` imports react / react-dom / DOM                         | §1.6 §2.1                 | ✅ core untouched; grep over `packages/core/src/` empty                                             |
| Public API change without a `@deprecated` transition                      | §1.7                      | ✅ no signature change — `onSseError` simply now also fires on this path                            |
| New public types / functions / components exported from the package entry | §2.2                      | ✅ `AuthShapedError` / `asAuthShapedError` are module-private, deliberately not public API          |
| New template type / enum / component prerequisites                        | §2.3                      | n/a — no template                                                                                   |
| `botProviderEndpoint` rather than the deprecated `endpoint`               | §2.4                      | ✅ demo route already uses `botProviderEndpoint`                                                    |
| Exported functions / methods declare explicit return types                | §3.1                      | ✅ `asAuthShapedError(): AuthShapedError \| null`, `notify(): void`, demo callbacks `: void`        |
| Shared types centralized; no duplicate interfaces                         | §3.2                      | ⚠️ Minor — see Findings                                                                             |
| React component props fully typed                                         | §4.1                      | ✅                                                                                                  |
| Hardcoded color values in components                                      | §4.2                      | ✅ the one new color is a demo-only `.logLineError` in SCSS, matching the two sibling log classes   |
| `react` / `react-dom` stay peerDependencies                               | §4.4                      | ✅ unchanged                                                                                        |
| core and react share a version number                                     | §5                        | ✅ both `0.3.76`                                                                                    |
| Repeated logic (≥2×) / types / JSX (≥3×) extracted                        | §6                        | ✅ the auth-shape predicate is now written once instead of a fourth time                            |
| `setTimeout` mock delays, dead commented code, untracked TODO / FIXME     | §7                        | ✅ the two `setTimeout`s are spec-only queue drains, not mock latency                               |

### §1.2 Mechanical Grep

**First run was a false green** — the same trap REVIEW-072 recorded. `$FILES` unquoted was passed as a
single path and every check printed `No such file or directory` instead of a result. Re-run per file:

```
=== any / as any ===            (empty)
=== ts-ignore / eslint-disable ===
packages/react/src/hooks/use-channel.ts:610:        // eslint-disable-next-line no-console
packages/react/src/components/tool-call-consent/tool-call-consent-gate.tsx:91:          // eslint-disable-next-line no-console
packages/react/src/components/tool-call-consent/tool-call-consent-gate.tsx:108:          // eslint-disable-next-line no-console
packages/react/src/components/tool-call-consent/tool-call-consent-gate.tsx:183:        // eslint-disable-next-line no-console
=== console.log ===
packages/react/src/hooks/use-channel.ts:611
packages/react/src/components/tool-call-consent/tool-call-consent-gate.tsx:92, 109, 184
=== core imports react ===      (empty)
=== react digs into core/src === (empty)
=== setTimeout ===
packages/react/src/components/tool-call-consent/consent-reply-error.spec.tsx:195, 232
=== TODO / FIXME ===            (empty)
```

Adjudication: three of the four `console.log` sites pre-date this task; the fourth (gate:109) is the
new refusal log and follows the same `client?.debugMode` gate. Both `setTimeout`s are in the spec file,
draining the microtask / effect queue before asserting — not simulated latency in library code.

The §4.2 color grep matched only issue numbers (`#331`, `#409`, `#410`) caught by the hex pattern —
same false positive REVIEW-072 recorded.

### §1.3 Build / Lint / Format

```
lint:packages:   PASS — 0 errors, 5 warnings (all pre-existing; none in the changed files)
lint react-demo: PASS — 0 errors, 15 warnings (all pre-existing)
format:check:    PASS
typecheck:       PASS — core + react + react-demo
build:           PASS — build:core and build:react both clean
test:packages:   PASS — core 275, react 408 (402 + 6 new)
```

### §1.4 Static Review Acceptance

- [x] All §1.1 items checked
- [x] No ❌ violations
- [x] All §1.2 greps re-run per file and output pasted
- [x] `npm run typecheck` clean
- [x] `npm run lint:packages` — no errors

---

## §3 Functional Validation

### R# Result Matrix

| R#  | Description                                                    | Result | Note                                                                                                   |
| --- | -------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------ |
| R1  | A refused consent reply reaches `onSseError`                   | Pass   | Vitest + browser: `onSseError · HTTP 403: Forbidden` in the demo log; zero such lines before the fix   |
| R2  | An auth-shaped failure is mirrored to `onAuthError`            | Pass   | Vitest only — see Findings: core never constructs that shape, so no live route exercises it            |
| R3  | The rejection is not left unhandled                            | Pass   | Vitest asserts no `unhandledRejection`; browser console shows no `Uncaught (in promise)` after the 403 |
| R4  | The card comes back so the answer can be retried               | Pass   | Vitest (same-batch failure). The live 403 lands a render later and re-seeds unaided — see Findings     |
| R5  | A throwing consumer `onSseError` does not wedge the gate       | Pass   | Vitest; reverting `notify` on this path turns exactly this one red                                     |
| R6  | A refused all-`alreadyAllowed` batch does not resubmit forever | Pass   | Vitest; reverting the auto-advance guard turns exactly this one red                                    |
| R7  | Browser smoke against the dev consent bot                      | Pass   | 403 injected at the network layer → error logged, card answerable, retry completed and the run resumed |

### §3.1 Acceptance

- [x] Every R# executed (static read + unit test + browser operation)
- [x] Each fix reverted individually to confirm which cases it holds up:
      `onSseError` off → R1, R2 red · `notify` off → R5 red · gate `catch` off → R3, R4, R5, R6 red ·
      seeding-effect key off → R4, R5 red · auto-advance guard off → R6 red. All six red on `main`.
- [x] Error path confirmed against the real dev consent bot, not a mock
- [x] Retry path confirmed end to end: the restored card, answered again with the refusal lifted, went
      through to the backend and the agent raised its next batch

---

## Findings

### Critical (must fix before done)

None.

### Important (should fix in this cycle)

None.

### Minor (nice to have)

1. **`onAuthError` is dead against the first-party client.** Nothing in `@asgard-js/core` constructs
   `{ isAuthError, isBotProviderError }`; the live 403 arrived as a plain `HTTP 403: Forbidden` and only
   `onSseError` saw it. The predicate has been inert on all four paths since before this task — R2 pins
   that the consent path now applies the same rule as the others, not that a 403 reaches `onAuthError`.
   Worth a separate ticket to decide whether `onAuthError` should be populated or deprecated. Filed as
   #459 §2 — that ticket asks for the decision, not for an implementation.
2. **`AuthShapedError` is a local alias for a shape written inline in three more places**
   (`use-channel.ts:56`, `asgard-service-context.tsx:210`, `chatbot.tsx:125`). Centralizing it per §3.2
   means promoting it into `@asgard-js/core`'s public types, which changes the emitted `.d.ts` for a
   public prop — out of proportion to this task. Left as is deliberately.
3. **`nudge` still has no `onSseError`.** Recorded under BUILD-073 "Out of scope"; the same one-line
   omission on an invisible path. Filed as #459 §1.

---

## Execution Log

- 2026-08-30: REVIEW task created, paired with BUILD-073 (Status: `draft`).
- 2026-08-30: §1 static review — 19 checklist items, 0 violations (3 adjudicated: debug-gated
  `console.log`, spec-only `setTimeout`, issue numbers matched by the color grep). First grep pass was a
  false green from an unquoted file list; re-run per file. lint / format / typecheck / build / tests all
  green (Status: `draft → in-progress`).
- 2026-08-30: §3 functional — R1–R7 all Pass; each of the five pieces reverted once to confirm the
  cases it covers, and all six unit cases confirmed red on `main`. Three Minor findings, none blocking
  (Status: `in-progress → done`).
- 2026-08-30: Minor 1 and 3 filed as #459, together with BUILD-073's third "Out of scope" item. Writing
  that issue turned up a miss this review shares: the throw-guard gap covers `restoreChannel` as well as
  `sendMessage`, and neither §1 nor §3 caught it. Minor 2 (`AuthShapedError` centralization) stays out —
  it is a deliberate scope call, not a defect.
