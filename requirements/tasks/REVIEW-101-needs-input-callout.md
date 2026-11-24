# REVIEW-101 Render the agent's [NEEDS_INPUT]: line as a callout

## Meta

- Task ID: `REVIEW-101`
- Status: `done`
- BUILD Task: `BUILD-101`
- Reviewed commit: `7a8963c0`
- Reviewed branch: `feat/129-needs-input-callout`

---

## §1 Static Code Review

Scope: the files in BUILD-101 `## Coverage`. Checklist from `REVIEW_RULE.md` §1.1 (the SDK one).

### §1.1 Checklist

| Check item                                               | Rule      | Result | Note                                                                                                                       |
| -------------------------------------------------------- | --------- | ------ | -------------------------------------------------------------------------------------------------------------------------- |
| `any` / `as any`                                         | §1.1      | ✅     | demo route uses `as never` for the partial `message` object, same as `prompt-suggestion`                                   |
| `@ts-ignore` / `eslint-disable`                          | §1.2      | ✅     |                                                                                                                            |
| `console.log` in library code                            | §1.3 §7   | ✅     |                                                                                                                            |
| Hardcoded API key / endpoint / namespace                 | §1.4      | ✅     | demo uses the existing `/mock-asgard` origin-relative endpoint                                                             |
| Subscriptions / timers torn down                         | §1.5      | ✅     | no subscriptions or timers added                                                                                           |
| react imports core only via its public entry             | §1.6      | ✅     |                                                                                                                            |
| core imports no react / DOM                              | §1.6 §2.1 | ✅     | core untouched                                                                                                             |
| Public API changes go through `@deprecated`              | §1.7      | ✅     | additive only: `BotMessageTextProps.streaming?`, `BotMessageTextProps.answered?`                                           |
| New public API exported from the entry                   | §2.2      | ✅     | no new public symbols; `needs-input.ts` and `NeedsInputCallout` are internal on purpose                                    |
| Template type / enum prerequisites                       | §2.3      | ✅     | not a new template                                                                                                         |
| `botProviderEndpoint`, not `endpoint`                    | §2.4      | ✅     |                                                                                                                            |
| Explicit return types on exported functions              | §3.1      | ✅     | `splitNeedsInput`, `holdBackPendingMarker`, `mayBecomeNeedsInputMarker`, `NeedsInputCallout`, `BotMessageText`             |
| Shared types centralized, no duplicate interfaces        | §3.2      | ✅     | `NeedsInputSegment` is render-only and lives with its only user                                                            |
| Props fully typed                                        | §4.1      | ✅     |                                                                                                                            |
| No hardcoded colors in components                        | §4.2      | ✅     | colors only in `needs-input-callout.module.scss` through `var(--asg-color-*, fallback)`, the existing SCSS convention      |
| react / react-dom stay peer dependencies                 | §4.4      | ✅     | no dependency changes                                                                                                      |
| core / react versions match                              | §5        | ✅     | both `0.3.97`                                                                                                              |
| Repeated logic / types / JSX extracted                   | §6        | ✅     | see Minor: the inline check glyph matches `question-template.tsx`'s private one (per-file glyphs are the existing pattern) |
| No `setTimeout` mocks, dead commented code, TODO / FIXME | §7        | ✅     |                                                                                                                            |

### §1.2 Mechanical Grep

Coverage files: `text-template/{needs-input.ts, needs-input.spec.ts, needs-input-callout.tsx, bot-message-text.tsx, bot-message-text.spec.tsx, bot-typing-box.tsx, text-template.tsx}`, `packages/react/src/i18n.ts`, `apps/react-demo/src/app/routes/needs-input/`.

```
any / as any                 → (empty)
ts-ignore / eslint-disable   → (empty)
console.log                  → (empty)
core → react                 → (empty)
react deep-imports core/src  → (empty)
hardcoded colors             → packages/react/src/i18n.ts:51:    // #448 — stand-in label for a replayed attachment …
                               (false positive: an issue number in an existing comment; packages/react/src total 241 matches, same as main)
setTimeout                   → (empty)
TODO / FIXME                 → (empty)
```

### §1.3 Build / Lint / Format

```
lint:packages: PASS — 0 errors, 5 warnings (all pre-existing, none in Coverage files)
format:check:  PASS for Coverage files — 7 warnings, all in requirements/spec/*.md, unchanged since main
typecheck:     PASS — core + react + react-demo (also enforced by the pre-push hook)
build:         PASS — build:core, build:react
test:          PASS — core 458/458, react 859/859
```

### §1.4 Static Review Acceptance

- [x] All §1.1 items checked and marked
- [x] No ❌ violations
- [x] All §1.2 grep commands run and output pasted
- [x] Type check run — no errors
- [x] `npm run lint:packages` run — no errors

---

## §3 Functional Validation

Harness: Vitest for recognition, splitting and render structure; react-demo `/needs-input` (`npm run serve:react-demo -- -- --port 5100`, full-bleed and 375×640 side by side) driven with Playwright for UI and streaming.

### R# Result Matrix

| R#  | Description                                                                   | Result | Note                                                                                                                                                                                        |
| --- | ----------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Recognition rule matches spec §2                                              | Pass   | `needs-input.spec.ts`: every `asgard-core` `needsinput_test.go` positive case plus tab indent and all legacy separators                                                                     |
| R2  | Mid-line / bold / quote / list / no colon / `blocked:` / fenced stay markdown | Pass   | unit cases for each, including a ```fence that a`~~~` line does not close; demo transcript and the 「程式」 script show a fenced marker printed as code and only the last line as a callout |
| R3  | Callout in place, text after marker, markdown, title only when empty          | Pass   | unit + demo: link inside the callout is clickable; 「空」 renders a 38px callout with only its title                                                                                        |
| R4  | Consecutive marker lines merge                                                | Pass   | unit + demo 「連續」: one callout, two paragraphs                                                                                                                                           |
| R5  | "Needs your reply" look, tokens only                                          | Pass   | computed styles: 3px primary bar, primary at 10% background, 12px / 500 title in primary; overriding `--asg-color-primary` moves bar, fill and title together                               |
| R6  | "Replied" look, derived from message order                                    | Pass   | opening transcript shows the first callout replied (order-derived, same as a replay); sending a message flips the previous callout to replied in that shell only                            |
| R7  | Streaming hold-back                                                           | Pass   | unit: char-by-char stream never shows the marker; demo: MutationObserver over a full reply and 39 sampled frames of the legacy script — 0 raw markers                                       |
| R8  | i18n keys in three locales                                                    | Pass   | wording matches spec §5; locale switch shows `Needs your reply`／`Replied`, `返信が必要です`／`返信済み`, `需要你回覆`／`已回覆`                                                            |
| R9  | `role="note"`, accessible name = title                                        | Pass   | unit + live DOM                                                                                                                                                                             |
| R10 | Host-composed `BotMessageText` gets the callout                               | Pass   | `bot-message-text.spec.tsx` renders `BotMessageText` directly; default state is "needs your reply"                                                                                          |
| R11 | No marker, not streaming → identical output                                   | Pass   | temporary side-by-side test against main's `BotMessageText`: 8 marker-free messages (fenced, mid-line, bold markers, empty string) render byte-identical HTML; test removed after           |
| R12 | Unit tests cover R1, R2, R4, R7                                               | Pass   | 44 cases in `needs-input.spec.ts`, 10 in `bot-message-text.spec.tsx`                                                                                                                        |
| R13 | Build + demo smoke at both sizes                                              | Pass   | builds green; both shells walked                                                                                                                                                            |

### §3.1 Acceptance

- [x] All R# in BUILD-101 executed
- [x] Each R# marked with explanation
- [x] No e2e spec covers these routes
- [x] Boundary cases: empty marker, fenced marker, half-streamed marker, replied vs not

---

## Findings

### Critical (must fix before done)

None.

### Important (should fix in this cycle)

None.

### Minor (nice to have)

- The check glyph in `needs-input-callout.tsx` is the same lucide path as the private `CheckIcon` in `question-template.tsx` (different stroke width). Per-file inline glyphs are the existing pattern (`question-template`, `channel-title`, `file-explorer/icons.tsx`), so it is left as is.
- Pre-existing behavior seen during validation, not caused by this change: a `[NEEDS_INPUT]: word` line whose content is a single token without spaces is a valid CommonMark link reference definition, so inside a blockquote or list (where it is not a callout) markdown hides the whole line. At the start of a line it becomes a callout, so the case that matters is unaffected. While streaming, an unfinished link shows Streamdown's `[blocked]` placeholder until the URL completes.

---

## Execution Log

- 2026-11-24: REVIEW task created, paired with BUILD-101 (Status: `draft`).
- 2026-11-24: §1 Static review — 19/19 ✅, 0 ❌; §3 Functional validation — R1–R13 all Pass; 0 BLOCKERs (Status: `ready → done`).
