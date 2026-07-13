# REVIEW-013 Channel title UI (F-017)

## Meta

- Task ID: `REVIEW-013`
- Status: `done`
- BUILD Task: `BUILD-013`
- Reviewed branch: `feat/f017-channel-title-ui`

## §1 Static Code Review

Scope: `channel-title/*`, `chatbot.tsx`, `components/index.ts`.

- ✅ No `any` / `@ts-ignore` / `eslint-disable`. Inline SVG (no new dep; SDK has no lucide).
- ✅ Additive public surface: `ChannelTitle` + `ChannelTitleProps`/`ChannelTitleRenderArgs`; `<Chatbot>` gains `renderChannelTitle`/`hideChannelTitle`/`channelUntitledLabel`. No removals — **not breaking**.
- ✅ Self-contained chrome component (mirrors `RunningIndicator`): reads `useChannelTitle()` + `channelTitleStore` from context; renders `null` in preview / no-channel, so existing preview routes get no stray bar.
- ✅ Theming via CSS variables (`--asg-color-surface/border/text-primary/text-secondary`) — no hard-coded palette beyond fallbacks; honors `prefers-reduced-motion`.
- ✅ Semantically separate from the bot-name `title` (its own row); pure presentation over the store value.
- ✅ `build:core` + `build:react` clean; prettier clean.

No §1 BLOCKERs.

## §3 Functional Validation

Verified on `/channel-restore` (zh-TW).

| R#  | Criterion                                                        | Result                                                                                                    |
| --- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| R1  | Thread-top title bound to `channelTitle$`, per prototype         | ✅ chrome row below the bot-name header, MessageSquare icon + truncate                                    |
| R2  | Titled → fg truncate + hover; unnamed → muted placeholder        | ✅ seeded `還原的頻道` shown foreground; `channelUntitledLabel` overrides placeholder                     |
| R3  | title.update change fades in (200ms; reduced-motion off)         | ✅ key-swap fade; `@media (prefers-reduced-motion)` → `animation: none`                                   |
| R4  | `renderChannelTitle` replaces / `null` hides; `hideChannelTitle` | ✅ props threaded to `ChannelTitle.renderTitle`/`hidden`                                                  |
| R5  | Separate from static bot-name `title`, no placement conflict     | ✅ two distinct rows (bot header + title row)                                                             |
| R6  | Smoke: seed + live update, no errors                             | ✅ left `還原的頻道` (seed), right `上週各通路訂單分析` (live); console clean (lone 404 = intended probe) |

No §3 BLOCKERs.

## Execution Log

- 2026-07-14: §1 static ✅ (no BLOCKERs), §3 functional ✅ (R1–R6, seed + live update browser-verified). Status: `draft → done`.
