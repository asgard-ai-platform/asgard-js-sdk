# BUILD-071 Wire `deleteChannel` and retire `RESET_CHANNEL`

## Meta

- Task ID: `BUILD-071`
- Status: `in-progress`
- Issue: `https://github.com/asgard-ai-platform/asgard-sdk-pm/issues/91`
- Source spec: `references/asgard-sdk-pm/tracking/asgard-js-sdk/features/F-032-頻道刪除-deletechannel-與-reset-channel-退場.md`
- Complexity: `L`

---

## Brief

The backend now offers `DELETE /ns/{ns}/bot-provider/{name}/channel?custom_channel_id=` — an explicit
"end this conversation" endpoint that tears down the run, transcript, blobs, consent allow-list, Sandbox
and Channel Home before answering `204` (idempotent; verified live on dev: `204` for an unknown id,
`400` when the query param is missing). This task wires it into `@asgard-js/core`, splits the header
reset button into **DELETE → `action=NONE` opening turn**, changes the mount-time opening turn
(metadata `404` + `autoResetChannel`) to a plain `NONE` with **no** delete, exposes `deleteChannel()` to
hosts so they can sequence "delete → upload → send with `blobIds`", and leaves the SDK with **zero**
paths that emit `RESET_CHANNEL` (the enum member stays, marked `@deprecated`).

The reason for the split is a data-loss hole that cannot be fixed inside one request: blobs are rows on
the channel that was live when they were uploaded, and `RESET_CHANNEL` deletes that channel before the
message is dispatched, so `blobIds` resolve to nothing and the attachment vanishes with no error. The
backend now answers `400` to `RESET_CHANNEL` + non-empty `blobIds`.

**Already exists:** `packages/core/src/lib/client.ts` (`channelMetadata` / `suspendChannel` — the REST
shape, `apiHeaders()`, `getBaseEndpoint()`, `HttpError` to copy), `packages/core/src/lib/channel.ts`
(`Channel.reset` / `Channel.restore` / private `resetChannel` / `buildRunHandlers` / `RunKind`),
`packages/react/src/hooks/use-channel.ts` (`resetChannel`, `initChannel`, `restoreChannel`, the F-015
mount gate, `makeStatesObserver`), `packages/react/src/context/asgard-service-context.tsx` (the
`resetChannel` / `stopGeneration` exposure pattern),
`packages/react/src/components/chatbot/chat-header/chat-header-host.tsx` (reset button, `busy`),
`apps/react-demo/vite.config.ts` + `src/mock-server/sse-mock.ts` (mock middlewares for
`/message/suspend`, `/channel/metadata`, `/blob`).

---

## Relevant Rules

Distilled from `FRONTEND_RULE_COMMON.md`; builder reads this table instead of the full corpus.

| §    | Rule (summary)                                                                                                            |
| ---- | ------------------------------------------------------------------------------------------------------------------------- |
| §1.1 | No `any` / `as any` — use precise types, generics, or `unknown` + narrowing                                               |
| §1.2 | No `@ts-ignore` / `eslint-disable` to bypass type or lint errors                                                          |
| §1.3 | No `console.log` left in library code (gate behind an explicit debug option if needed)                                    |
| §1.4 | No hardcoded API key / endpoint / namespace — pass via `config`                                                           |
| §1.5 | Every RxJS subscription / EventSource / timer has teardown (`takeUntil` / `unsubscribe` / `useEffect` cleanup)            |
| §1.6 | `@asgard-js/core` never imports `react` / `react-dom` / DOM; react imports core via its public entry only (no `core/src`) |
| §1.7 | No breaking public-API change without `@deprecated` transition                                                            |
| §2.2 | New public types / functions / components exported from the package entry with explicit `export type`                     |
| §2.3 | Template type (`core/src/types/sse-response.ts`) + enum (`core/src/constants/enum.ts`) exist before the react component   |
| §2.4 | Use `botProviderEndpoint`, not the deprecated `endpoint`                                                                  |
| §3.1 | Exported functions / methods declare explicit return types                                                                |
| §3.2 | Shared types centralized in `core/src/types/`; no duplicate interfaces across files                                       |
| §4.1 | React component props fully typed (no `any`)                                                                              |
| §4.2 | No hardcoded color values in components — theme via CSS variables / theme context                                         |
| §4.4 | `react` / `react-dom` stay peerDependencies (not bundled)                                                                 |
| §5   | `@asgard-js/core` and `@asgard-js/react` keep the same version number                                                     |
| §6   | After implementation: extract repeated logic (≥2×), duplicate types, repeated JSX (≥3×)                                   |
| §7   | No `setTimeout` mock delays, no `console.log`, no dead commented code, no untracked TODO / FIXME                          |

---

## Acceptance Criteria

EARS form: `When <event/condition>[, while <state>], the system shall <observable behavior>`.

- `R1` When a caller invokes `client.deleteChannel(customChannelId)`, the system shall issue
  `DELETE {base}/channel?custom_channel_id=<id>` carrying the same auth headers as the other REST calls,
  resolve on any `2xx`, and reject with an error exposing the HTTP status on any non-`2xx`. → T2
- `R2` When `Channel.reset()` runs, the system shall await `client.deleteChannel()` first and only then
  dispatch exactly one opening turn with `action=NONE`, emitting **no** `RESET_CHANNEL` on the wire. → T3
- `R3` When `resetChannel({ text, payload })` is called with a text / payload, the system shall carry both
  onto that `NONE` opening turn (matching today's reset payload behavior, including `resolvePayload`). → T3
- `R4` When the DELETE fails (non-`2xx` or a network error), the system shall dispatch **no** opening turn,
  leave the existing `channel` and `conversation` untouched, return `isResetting` / `isConnecting` to
  `false`, and report the error through `onSseError`. → T3, T5
- `R5` When the component mounts and `GET /channel/metadata` answers `404` while `autoResetChannel` is not
  `false`, the system shall open with `action=NONE` **without** calling `deleteChannel`; when metadata
  answers `200` it shall still restore (F-015 unchanged). → T5
- `R6` When a tool-call consent is pending, the system shall still allow a reset (#411), performing
  `deleteChannel` before the `NONE` turn. → T3
- `R7` When a host calls `deleteChannel()` from `useChannel` / `AsgardServiceContext`, the system shall
  delete the channel only — no opening turn, no change to the local conversation — so the host can
  sequence `deleteChannel` → `uploadBlob` → `sendMessage(NONE + blobIds)`. → T5, T6
- `R8` When the SDK source is grepped for `RESET_CHANNEL`, the system shall show it only as the
  `@deprecated` enum member and its documentation — no code path emits it, and the member is retained for
  type compatibility. → T1, T8
- `R9` While the DELETE is in flight (up to the backend's ~60 s Sandbox teardown), the system shall keep
  `isResetting` true and the header reset button `busy`, applying no client-side timeout shorter than the
  backend's. → T5
- `R10` When the opening run is in flight, the system shall keep `RunKind` `'reset'` so stop-generation
  refuses to fire on it (F-023). → T3
- `R11` When an existing consumer upgrades without code changes (`autoResetChannel` `true` or `false`),
  the system shall behave as before apart from the wire (`NONE` instead of `RESET_CHANNEL`, plus the
  DELETE that precedes an explicit reset). → T5, T7
- `R12` (Smoke check) When the developer runs `npm run build:core && npm run build:react` and walks the
  new `/delete-channel` demo route (`npm run serve:react-demo -- -- --port 5100`) at both the default
  narrow shell and the full-bleed wide shell, the system shall show the mount opening turn as `NONE`, the
  reset button issuing `DELETE` then `NONE`, a failed DELETE leaving the transcript intact, and the
  host-driven delete → upload → send sequence completing — with no build errors. → T10

---

## Implementation Tasks

- [ ] T1 (R8): `constants/enum.ts` — mark `FetchSseAction.RESET_CHANNEL` `@deprecated` (retained for
      compatibility; point at `deleteChannel` + `NONE`).
- [ ] T2 (R1): `types/client.ts` — add `deleteChannel?(customChannelId: string): Promise<void>` to
      `IAsgardServiceClient` (optional, matching `channelMetadata?` / `suspendChannel?`); implement it in
      `lib/client.ts` next to `suspendChannel` (derive `{base}/channel`, `X-API-KEY` + custom headers,
      any `2xx` resolves, everything else throws `HttpError`; **no** special-casing of `404`).
- [ ] T3 (R2, R3, R6, R10): `lib/channel.ts` — split the opening turn out of `Channel.reset` into a new
      `Channel.open()` static (create + subscribe + `onChannelCreated` + `action=NONE` opening turn, run
      kind `'reset'`), and make `Channel.reset()` await `client.deleteChannel()` **before** constructing
      the channel, then delegate to `Channel.open()`. A DELETE failure must therefore create nothing and
      dispatch nothing. Handle a client without `deleteChannel` explicitly (see Decisions below).
- [ ] T4 (R1, R2, R3, R4, R6, R10): core Vitest — `client.spec` for the request shape and the reject path;
      `channel.spec` for the two-phase order, zero `fetchSse` on a rejected DELETE, the payload carry, and
      the rewritten `#411` assertion; `stop-generation.spec` for the `'reset'` run kind on the new wire.
- [ ] T5 (R4, R5, R7, R9, R11): `hooks/use-channel.ts` — route the header reset through the new two-phase
      `Channel.reset` (stop wiping `conversation` up front; let the states observer adopt the new one),
      catch a failed DELETE and restore `isResetting` / `isConnecting` + report via `onSseError`; add an
      `openChannel` path built on `Channel.open` for the mount `404` + auto-reset branch; expose a new
      `deleteChannel(): Promise<void>`. Extract the shared body of reset / open (§6).
- [ ] T6 (R7): `context/asgard-service-context.tsx` — expose `deleteChannel` on the context value
      (mirroring `resetChannel` / `stopGeneration`), documented.
- [ ] T7 (R11): confirm `chat-header-host.tsx` needs no behavior change (`resetChannel` + `busy` on
      `isResetting` now spans the DELETE); update its comment if it names `RESET_CHANNEL`.
- [ ] T8 (R4, R5, R7): react Vitest — `use-channel.spec` for the failed-DELETE path (channel and
      conversation preserved), the mount `404` opening turn being `NONE` with no `deleteChannel` call, and
      the exposed `deleteChannel` leaving the conversation alone.
- [ ] T9 (R12): `apps/react-demo` — mock `DELETE /mock-asgard/channel` in `vite.config.ts` +
      `sse-mock.ts`; replace the two `action !== 'RESET_CHANNEL'` opening-turn discriminators with an
      "opening turn" predicate that also recognizes an empty-text `NONE`; add a `/delete-channel` route
      (narrow + full-bleed shells side by side per `AGENTS.md`) covering mount open, reset, a forced
      DELETE failure, and host-driven delete → upload → send. Refresh the demo copy and the two READMEs
      where they describe `RESET_CHANNEL`.
- [ ] T10: Run `npm run lint:packages` + `npm run format:check` + `npm run typecheck` +
      `npm run build:core && npm run build:react` + `npm run test:packages` (in that order — `typecheck`
      restores a stale `packages/core/dist` from the Nx cache that the react tests resolve against).
- [ ] T11 (R12): Smoke check — walk every R# in the browser at both widths; screenshots stay local
      (verification handover), never committed.

---

## Decisions (spec gaps settled here)

1. **A client without `deleteChannel`.** `IAsgardServiceClient.deleteChannel` is optional for type
   compatibility, so `Channel.reset` must handle its absence. It **rejects with a descriptive error**
   rather than silently skipping the DELETE (which would clear the screen while the backend keeps the old
   conversation — the exact failure the spec forbids) or falling back to `RESET_CHANNEL` (which R8
   forbids). Only a hand-rolled `IAsgardServiceClient` can hit this: `useChannel` is typed against the
   concrete `AsgardServiceClient`, which always has the method. The mount opening path is unaffected —
   it never deletes.
2. **Error channel for a failed DELETE.** Reported through the existing `onSseError`; no `onResetError`
   is added (the spec leaves the choice open, and this keeps the public surface unchanged).
3. **The no-metadata-gate mount fallback** (`!client.channelMetadata`, unreachable through the built-in
   client) keeps calling `resetChannel`, i.e. it now deletes first. That branch's documented contract is
   "mount always resets", and reset now means delete + open.

---

## Coverage

Use Cases: R1, R2, R3, R4, R5, R6, R7, R8, R9, R10, R11, R12 (UC-025 / UC-026 wire update; F-015, F-023 regression)

Files:

**`@asgard-js/core`**

- `packages/core/src/constants/enum.ts` — `FetchSseAction.RESET_CHANNEL` marked `@deprecated` (retained)
- `packages/core/src/types/client.ts` — `IAsgardServiceClient.deleteChannel?`
- `packages/core/src/types/channel.ts` — `RunKind` docs for the `'reset'` kind
- `packages/core/src/lib/client.ts` — `deriveChannelEndpoint()` + `deleteChannel()`
- `packages/core/src/lib/channel.ts` — new `Channel.open()`; `Channel.reset()` now deletes first; `resetChannel` → `openChannel` sending `action=NONE`
- `packages/core/src/lib/client.spec.ts` — 4 new cases (request shape, url-encoding, non-2xx, network error)
- `packages/core/src/lib/channel.spec.ts` — 8 new cases + the rewritten `#411` assertion
- `packages/core/src/lib/stop-generation.spec.ts` — run-kind cases rewritten for both entry points; harness gains `deleteChannel`

**`@asgard-js/react`**

- `packages/react/src/hooks/use-channel.ts` — shared `startChannel(mode)` behind `resetChannel` / `openChannel`, re-entrancy ref, exposed `deleteChannel()`, mount `404` branch now opens
- `packages/react/src/context/asgard-service-context.tsx` — `deleteChannel` on the context value
- `packages/react/src/components/chatbot/chat-header/chat-header-host.tsx` — comment only (behavior unchanged)
- `packages/react/src/components/chatbot/chatbot.tsx` — `autoResetChannel` doc comment
- `packages/react/src/hooks/use-channel.spec.ts` — 6 new cases (mount opens with `NONE`, two-step reset, failed delete preserves everything, exposed `deleteChannel`, its rejection, same-tick double reset)

**Docs**

- `packages/core/README.md`, `packages/react/README.md`

**`apps/react-demo`**

- `src/mock-server/sse-mock.ts` — `isOpeningTurn()` replacing two `action !== 'RESET_CHANNEL'` checks, `handleMockChannelDelete`, `handleDeleteChannelMock` with server-side turn / delete counters
- `vite.config.ts` — `DELETE /mock-asgard/channel` middleware (registered after `/channel/metadata`)
- `src/app/routes/delete-channel/{delete-channel.tsx,delete-channel.module.scss,index.ts}` — new route, four scenarios × wide + narrow shells
- `src/app/app.tsx`, `src/app/components/layout/layout.tsx` — route registration
- `src/app/routes/{join-init,auto-reset-channel,stop-generation,all-features}/*` — copy refresh only

---

## Execution Log / Change Log

- 2026-08-28: BUILD task created from https://github.com/asgard-ai-platform/asgard-sdk-pm/issues/91 (Status: `draft`). Dev backend pre-check done: `DELETE …/channel` answers `204` for an unknown id and `400` with `INVALID_ARGUMENT` when `custom_channel_id` is missing.
- 2026-08-28: Plan confirmed by the user (Status: `draft → ready`); implementation started (Status: `ready → in-progress`).
- 2026-08-28: All R# verified. Static gate green in order lint → format → typecheck → build → test (core 275 / react 391, +13). Browser walk of `/delete-channel` at both widths covered R2 / R4 / R5 / R7 / R9; `/join-init` (three branches), `/all-features` and `/docked-run-chrome` cover the regression surface. Contract re-verified end to end against the dev backend: metadata `404` → `action=NONE` opens → metadata `200` → `DELETE` `204` in 0.78s → metadata `404` → second `DELETE` `204` (idempotent); and `RESET_CHANNEL` + `blobIds` is refused there with `400 INVALID_ARGUMENT` (Status: `in-progress → done`).
- 2026-08-28: **Scope added during the browser walk.** Three synchronous clicks on the reset button issued three `DELETE`s and three opening turns: `chat-header-host`'s `if (isResetting) return;` is React state and all three clicks read the stale `false`. Pre-existing in shape, but the consequence changed — before F-032 the loser produced a harmless second welcome run, whereas now its `DELETE` can land _after_ the winner opened the new conversation and destroy it. Closed with a `useRef` re-entrancy guard in `startChannel` (state lag does not apply to a ref) plus a fail-before/pass-after test; re-measured in the browser at three synchronous clicks → one `DELETE`, one opening turn.
