# BUILD-014 Sandbox-name derived store (sandbox Files/Browser foundation)

## Meta

- Task ID: `BUILD-014`
- Status: `done`
- Source: **user direction (2026-07-14)** — bring the Sindri Files/Browser panels into the SDK. No PM ticket yet (F-017 is the last PM feature); UI authority = Sindri prototype `asgard-sindri-prototype`; data = `asgard-core` sandbox APIs.
- Complexity: `S/M`
- Part: **1 of 3** (Foundation → Browser → Files)

## Brief

The sandbox Files/Browser panels need the channel's **sandbox name** to key the `/sandbox/{name}/…` REST APIs. asgard-core emits it on the ephemeral `asgard.sandbox.launch` / `asgard.sandbox.ready` events (`{ sandboxName, blueprintName }`) — there is **no metadata seed**. This adds a `sandboxName` derived store on `Channel` (same F-013 mechanism as tasks/subagents/title): fold the two events into `sandboxName$`, expose it as a `ReactiveStore` + on `ChannelStates`, and add a `useSandboxName()` React hook. Foundation only — no UI/API components yet (those are Browser = part 2, Files = part 3).

- **Enum/types** — `SANDBOX_LAUNCH` / `SANDBOX_READY`; `SandboxLaunchEventData` / `SandboxReadyEventData`; `Fact.sandboxLaunch` / `.sandboxReady`.
- **Channel** — `sandboxName$` (folded from the events, change-guarded), `ReactiveStore`, `ChannelStates.sandboxName`, teardown.
- **React** — `useSandboxName()` + `sandboxStore` through context.
- **Demo** — mock emits `sandbox.launch`/`ready`; `/multi-panel` title bar shows the name.

## Acceptance Criteria

- `R1` core consumes `sandbox.launch`/`sandbox.ready` → updates the sandbox-name state (from `fact.{sandboxLaunch|sandboxReady}.sandboxName`). → T1, T2, T4
- `R2` exposed as a per-slice `ReactiveStore` (`BehaviorSubject` + change-guard) + on `ChannelStates`. → T1, T4
- `R3` `useSandboxName()` React hook via `useSyncExternalStore`; `null` in preview / before any sandbox event. → T2, T4
- `R4` (Cold-start limitation, documented) the events are **ephemeral** (no metadata seed), so a cold rejoin has `null` until the next sandbox event — recorded as a follow-up (a `sandboxName` on `ChannelMetadata` would fix it; backend gap). → doc
- `R5` (Smoke) build + `/multi-panel` shows the folded sandbox name; core tests green. → T3, T4

## Implementation Tasks

- [x] T1 (R1,R2): `enum.ts` + `sse-response.ts` types/Fact; `channel.ts` `sandboxName$` fold + store + `ChannelStates` + close(); `types/channel.ts`.
- [x] T2 (R3): `use-channel.ts` `sandboxStore`; `use-derived-stores.ts` `useSandboxName()`; context thread.
- [x] T3 (R5): `sse-mock.ts` emit `sandbox.launch`/`ready`; `/multi-panel` title bar shows the name.
- [x] T4 (R1-R3,R5): `channel.spec.ts` +2 (fold + ChannelStates, change-guard); build + browser verify.

## Coverage

Files: `constants/enum.ts`, `types/sse-response.ts`, `types/channel.ts`, `lib/channel.ts`, `lib/channel.spec.ts`, `hooks/use-channel.ts`, `hooks/use-derived-stores.ts`, `context/asgard-service-context.tsx`, `mock-server/sse-mock.ts`, `routes/multi-panel/*`.

Verification: build:core + build:react ✅ · core **46/46** (channel.spec +2) ✅ · prettier ✅. Browser `/multi-panel`: title bar shows `sandbox: sbx-mock-0001` from `useSandboxName()` (folded from `sandbox.ready`). Screenshot: `.github/screenshots/f-sandbox-foundation/sandbox-name-store.png`.

## Follow-ups

- **Cold-start seed**: ask backend to add `sandboxName` to `GET /channel/metadata` so a cold rejoin has it before any live sandbox event (open a cross-team issue in `asgard-sdk-pm`/`asgard-core`).
- **Part 2** BUILD-015 `<SandboxBrowser>` (browser/open-url → Neko iframe); **Part 3** BUILD-016 `<SandboxFiles>` (fs/list + viewer/upload/download).

## Execution Log

- 2026-07-14: Foundation built from user direction + Sindri prototype + asgard-core sandbox contract. `sandboxName$` store + `useSandboxName()`; mock + demo; core 46/46; browser-verified. (Status: `draft` → `done`).
