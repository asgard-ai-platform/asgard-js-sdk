# BUILD-013 Channel title 顯示 UI + 客製 renderer (F-017)

## Meta

- Task ID: `BUILD-013`
- Status: `done`
- Issue: `asgard-sdk-pm#17 (F-017)`
- Source spec: `F-017-channel-title-顯示-ui-與客製-renderer.md` (UC-028)
- UI authority: pinned prototype `asgard-chat-kit-prototype@5480a67` — `docs/.../2026-07-13-channel-title-design.md` + `src/ChannelTitle.tsx`
- Complexity: `M`

## Brief

Render the F-016 channel title (the `channelTitle$` store) at the top of the chat thread. Today the SDK header only shows a static bot-name `title`. F-017 adds a `<ChannelTitle>` chrome row — its own header line below the bot-name header, distinct from it — per the pinned prototype: surface bg + bottom seam, `MessageSquare` muted icon, single-line truncate title, muted placeholder when unnamed (no residual value), 200ms ease-out fade on title change (honors `prefers-reduced-motion`). Custom/hide escape hatch: `renderChannelTitle({ title, renderDefault })` (return `null` to hide) + `hideChannelTitle` shortcut + `channelUntitledLabel`. It reads the store via `useChannelTitle()` and renders only for a live channel (nothing in preview). The prototype's Tailwind is adapted to the SDK's CSS variables (not ported verbatim).

- **Component** — `channel-title/channel-title.tsx` (+ scss + index): self-contained chrome component (like `RunningIndicator`), reads `useChannelTitle()` + `channelTitleStore` from context.
- **Chatbot** — new props `renderChannelTitle` / `hideChannelTitle` / `channelUntitledLabel`; render `<ChannelTitle>` between the header and the body.
- **Export** — `ChannelTitle` from the react entry for standalone placement.

**Already exists (reused):** F-016 `channelTitle$` store + `useChannelTitle()`; F-015 metadata seed; prototype design authority.

## Acceptance Criteria

- `R1` chat thread top shows the current channel title (bound to F-016 `channelTitle$`), per the pinned prototype `ChannelTitle`. → T1, T2, T4
- `R2` titled → foreground single-line truncate + hover full name (`title=`); unnamed (`null`) → muted placeholder (overridable via `channelUntitledLabel`), no residual value. → T1, T4
- `R3` a `channel.title.update`-driven change fades in (200ms ease-out; `prefers-reduced-motion` → no motion). → T1, T4
- `R4` `renderChannelTitle({ title, renderDefault })` escape hatch replaces the default row (return `null` hides); `hideChannelTitle` shortcut. → T1, T2
- `R5` semantically separate from the static bot-name `title`; placement doesn't conflict (its own row below the header). → T2, T4
- `R6` (Smoke) build + demo shows a seeded title (`還原的頻道`) and a live-updated title (`上週各通路訂單分析`); no build/console errors. → T3, T4

## Implementation Tasks

- [x] T1 (R1-R4): `channel-title/channel-title.tsx` + `.module.scss` + `index.ts` — component, default renderer, `renderTitle`/`hidden`/`untitledLabel`, fade + reduced-motion, CSS-var theming.
- [x] T2 (R4,R5): `chatbot.tsx` — `renderChannelTitle`/`hideChannelTitle`/`channelUntitledLabel` props; render `<ChannelTitle>` between header and body; export from `components/index.ts`.
- [x] T3 (R6): `lint:packages` + `format:check` + `build:core && build:react`.
- [x] T4 (R6): browser verify on `/channel-restore` (seed) + live update; screenshot.

## Coverage

Use Cases: UC-028 (title display UI + custom renderer)

Files:

- `packages/react/src/components/chatbot/channel-title/{channel-title.tsx,channel-title.module.scss,index.ts}` (new).
- `packages/react/src/components/chatbot/chatbot.tsx` — props + render.
- `packages/react/src/components/index.ts` — export `ChannelTitle`.

Verification: build:core + build:react ✅ · core 44/44 ✅ (no new core) · prettier ✅. Browser `/channel-restore` (zh-TW): left `existing-demo` title bar shows the **metadata-seeded** `還原的頻道`; right `fresh-demo` shows the **live** `上週各通路訂單分析` (from `channel.title.update`), both as a chrome row below the bot-name header, MessageSquare icon + truncate. Console clean (lone 404 = intended metadata probe). Screenshot: `.github/screenshots/f017-channel-title-ui/channel-restore-seeded-title.png`.

## Execution Log / Change Log

- 2026-07-14: BUILD created from asgard-sdk-pm#17 (F-017). UI per pinned prototype `asgard-chat-kit@5480a67` (Tailwind adapted to SDK CSS vars). `<ChannelTitle>` chrome row + Chatbot props + custom/hide slot; browser-verified seed + live update. (Status: `draft` → `done`).
