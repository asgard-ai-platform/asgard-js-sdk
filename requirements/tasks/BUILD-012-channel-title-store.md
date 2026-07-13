# BUILD-012 Channel title 動態狀態 + `channelTitle$` store (F-016)

## Meta

- Task ID: `BUILD-012`
- Status: `done`
- Issue: `asgard-sdk-pm#16 (F-016)`
- Source spec: `F-016-channel-title-動態狀態與-title-update-事件.md` (UC-027)
- Complexity: `M`

## Brief

Channel title is first-class on asgard-core (agents set it via `update_channel_title`; `GET /channel/metadata` returns it; `GET|POST /message/sse` push `asgard.channel.title.update`). The SDK only had a static `title` prop. F-016 does the **data layer** (not UI — that's F-017, prototype-first): consume `channel.title.update`, expose the title as a per-slice framework-agnostic store (`channelTitle$`, reusing the F-013 mechanism), hang it on `ChannelStates`, and seed it from `GET /channel/metadata.title` on entry (F-015 integration). Replay-safe: `title.update` is ephemeral (not in rejoin replay), so the title after a rejoin comes from the metadata seed and is never cleared by the missing event.

- **Channel** — `channelTitle$: BehaviorSubject<string | null>` seeded from `config.initialTitle`; folds `CHANNEL_TITLE_UPDATE` (guarded so a repeated title doesn't re-notify); exposed as `ReactiveStore<string | null>` + added to `ChannelStates`; completed in `close()`.
- **React** — `useChannel` seeds `initialTitle` from the metadata probe (`titleSeedRef`) and surfaces `channelTitleStore`; `useChannelTitle()` hook via `useSyncExternalStore`; threaded through `AsgardServiceContext`.
- **Demo** — mock emits `channel.title.update`; `/multi-panel` renders the title **outside** the Chatbot via `useChannelTitle()`.

**Already exists (reused):** F-014 `CHANNEL_TITLE_UPDATE` enum + `ChannelTitleUpdateEventData`; F-015 `ChannelMetadata.title`; F-013 `toReactiveStore` + per-slice store pattern.

## Acceptance Criteria

- `R1` core consumes `asgard.channel.title.update` → updates the title state (from `fact.channelTitleUpdate.title`). → T1, T5
- `R2` title exposed as a per-slice `channelTitle$` (`BehaviorSubject` + change-guard) `ReactiveStore`, and added to `ChannelStates` (reuse F-013). → T1, T5
- `R3` on entry the title is seeded from `GET /channel/metadata.title` (`null` = unnamed); wired through F-015 mount. → T2, T5
- `R4` `title.update` is ephemeral (not in replay): after a rejoin the title stays correct (from the metadata seed), not cleared by the missing event. → T5
- `R5` a consumer can subscribe `channelTitle$` and render the title outside the chatbox, not redrawn by high-frequency `message.delta` (`useChannelTitle()`). → T3, T6
- `R6` (Smoke) build + `/multi-panel` shows the external title updating live; no build/console errors. → T4, T6

## Implementation Tasks

- [x] T1 (R1,R2): `channel.ts` — `channelTitle$` + fold `CHANNEL_TITLE_UPDATE` (guarded) + `ReactiveStore` + `combineLatest`→`ChannelStates`; `types/channel.ts` — `ChannelStates.title` + `ChannelConfig.initialTitle`.
- [x] T2 (R3): `use-channel.ts` — `titleSeedRef` from the metadata probe → `initialTitle` on every Channel factory.
- [x] T3 (R5): `use-derived-stores.ts` — `useChannelTitle()`; context threads `channelTitleStore`.
- [x] T4 (R6): `sse-mock.ts` — emit `channel.title.update`; `/multi-panel` — external `ChannelTitleBar`.
- [x] T5 (R1-R4): `channel.spec.ts` — seed, default null, title.update fold + ChannelStates, distinctUntilChanged.
- [x] T6 (R5,R6): `lint:packages` + `format:check` + `build:core && build:react`; browser verify + screenshot.

## Coverage

Use Cases: UC-027 (title dynamic state + `title.update` event)

Files:

- `packages/core/src/lib/channel.ts` — `channelTitle$` + fold + store + `ChannelStates`.
- `packages/core/src/lib/channel.spec.ts` (new) — 4 tests.
- `packages/core/src/types/channel.ts` — `ChannelStates.title`, `ChannelConfig.initialTitle`.
- `packages/react/src/hooks/use-channel.ts` — `titleSeedRef` seed + `channelTitleStore`.
- `packages/react/src/hooks/use-derived-stores.ts` — `useChannelTitle()`.
- `packages/react/src/context/asgard-service-context.tsx` — thread `channelTitleStore`.
- `apps/react-demo/src/mock-server/sse-mock.ts` — emit `channel.title.update`.
- `apps/react-demo/src/app/routes/multi-panel/{panels,multi-panel}.tsx` + `.module.scss` — external `ChannelTitleBar`.

Verification: build:core + build:react ✅ · **core 44/44** (channel.spec +4) ✅ · prettier ✅. Browser `/multi-panel` (zh-TW): external title bar renders `useChannelTitle()` outside the Chatbot, updating live to `上週各通路訂單分析` from the `channel.title.update` event; console clean (lone 404 = intended metadata probe). Screenshot: `.github/screenshots/f016-channel-title/multi-panel-external-title.png`.

## Follow-ups (out of scope)

- **F-017**: title display UI (default header slot + custom renderer + hideable) — prototype-first, `docs/prototype-gaps.md`.

## Execution Log / Change Log

- 2026-07-14: BUILD created from asgard-sdk-pm#16 (F-016). Data-layer title store; built on F-013/F-014/F-015. `channelTitle$` + fold + seed + `useChannelTitle()` + demo; core 44/44; browser-verified. (Status: `draft` → `done`).
