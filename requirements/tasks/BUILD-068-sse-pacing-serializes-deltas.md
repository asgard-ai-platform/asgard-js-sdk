# BUILD-068 Stop the SSE pacing from serializing stream deltas

## Meta

- Task ID: `BUILD-068`
- Status: `done`
- Issue: `https://github.com/asgard-ai-platform/asgard-sdk-pm/issues/87`
- Source spec: `references/asgard-sdk-pm/tracking/asgard-js-sdk/features/F-030-畫布卡片-sandboxed-iframe-渲染與串流.md`
- Complexity: `L`

---

## Brief

`AsgardServiceClient.runSse` 目前對**每一個** SSE 事件套 `concatMap(event => of(event).pipe(delay(delayTime ?? 50)))`。`concatMap` 是嚴格序列化，所以成本隨**筆數**累加，與資料量、與後端速度都無關。Node 端量測同一條管線（372 筆事件、全部即時可取用、無瀏覽器計時器節流）：現況 **19.2s**、`delay(0)` **0.6s**、`mergeMap + delay(50)` **0.07s**。canvas 的 delta 是 token 級的（實測 7 字元／筆，一張 2.6KB 的畫布 372 筆、F-030 自己記錄 2.3KB 來 349 筆），因此 SDK 自己就墊掉約 19–27 秒——直接違反 F-030 描述的「使用者看到的是一張圖慢慢長出來，不是等一段空白後突然蹦出成品」。

改法是把「逐筆 pacing」換成「時間窗批次」：`concatMap + delay` 換成 `bufferTime(delayTime ?? 50)`，視窗關閉時把該批 frame **逐筆、依序**交出去。原本「不要一次 flush 幾百次 render 給消費端」的意圖保留，但 SDK 加上的延遲從 `N × delayTime` 變成一個視窗，與筆數無關。同時把 `@asgard-js/react` 宣告卻未接線的 `delayTime` prop 真正接到 core，讓消費端有逃生口。

**設計途中撤回的一步（保留紀錄）**：原計畫要在視窗內合併相鄰同 `messageId` 的 delta。實作到一半發現兩件事讓它變成純多餘的複雜度：(1) 19 秒的成本全部來自計時器序列化，不是來自「跑 N 次 reducer」——每次 fold 是 O(訊息數) 不是 O(frame 數)，同一 tick 內跑幾百次是毫秒級，React 18 也會把同 task 的 setState 併成一次 render；(2) Conversation reducer 其實掛在 `onSseMessage`（`channel.ts` 的 `buildRunHandlers`）而不是 `handleEvent`，所以要讓合併對對話狀態生效，就得動公開 callback 的語意、或把 reducer 從 `onSseMessage` 搬走並重排 `channel.ts` 那七件 per-frame 副作用（sandbox HUD 與 consent 兩條踩過雷）。合併的價值是推測的、代價是確定的，因此不做。

**Already exists:** `packages/core/src/lib/client.ts`（`runSse`、`fetchSse`、`rejoinSse`）、`packages/core/src/types/client.ts`（`FetchSseOptions.delayTime`）、`packages/core/src/lib/channel.ts`（options 轉交、`onSseMessage` 包裝）、`packages/react/src/context/asgard-service-context.tsx`（已宣告未接線的 `delayTime`）、`packages/react/src/hooks/use-channel.ts`（組 `FetchSseOptions`）、`packages/core/src/lib/client.spec.ts`、`packages/core/src/lib/canvas-stream.spec.ts`

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

- `R1` ~~Adjacent same-message deltas in one window are coalesced into a single event.~~ **Withdrawn during build** — the latency came from timer serialization, not from the number of reducer folds, so coalescing bought nothing and would have cost either the public `onSseMessage` contract or a reordering of `channel.ts`'s per-frame side effects. Rationale in `## Brief`. Not renumbered: the other R# are referenced from `sse-pacing.spec.ts` and REVIEW-068.
- `R2` When a window closes, the system shall deliver every frame it holds **individually and in the original relative order**, calling `onSseMessage` and then `handleEvent` per frame exactly as the per-frame pipeline did. → T2, T3
- `R3` When N frames are all available at once, the added latency shall be bounded by **one** window (not `N × delayTime`); with N = 372 and `delayTime = 50`, advancing virtual time by a single 50ms window shall deliver all 372 frames (old behavior: 1 frame, and 18.6s to drain the rest). → T2, T3
- `R4` When a consumer supplies `onSseMessage`, the callback shall receive **every frame, unmodified**, in original order — the public contract changes in timing only. → T2, T3
- `R5` When a `@asgard-js/react` consumer passes `delayTime` to the provider, the value shall reach `FetchSseOptions.delayTime` on every SSE run (`fetchSse` and `rejoinSse`); `delayTime: 0` shall remove the window wait entirely. → T4, T5
- `R6` When the stream terminates by completion, error, or a user-initiated unsubscribe (stop generation), the system shall flush or discard any pending window without emitting after teardown, and `onRunSettled` shall still fire exactly once on every termination path. → T2, T3
- `R7` When the existing core suites run unchanged (`canvas-stream.spec.ts`, `conversation.spec.ts`, `client.spec.ts`, `channel.spec.ts`, `stop-generation.spec.ts`), they shall all pass — the terminal guards and reducer semantics of F-011 / F-030 are untouched. → T3
- `R8` (Smoke check) When the developer runs `npm run build:core && npm run build:react` and exercises the canvas stream in the react-demo (`npm run serve:react-demo`, `/canvas-card`, script 「畫」) **in a foreground, visible tab**, the system shall paint the canvas progressively and finish within about the mock's own wire schedule (372 chunks × 25ms ≈ 9–10s) rather than roughly twice it, with no build errors. → T6, T7

> ⚠️ R8 必須在**前景可見**的分頁執行。`visibilityState: "hidden"` 時 Chrome 把 `setTimeout` 夾到約 1Hz（實測 `setTimeout(…, 50)` 每 1002ms 才觸發），`delay()` 因此被放大約 20 倍，量到的數字無效。

---

## Implementation Tasks

Run in order; each task maps to the R# it satisfies.

- [x] T1: ~~Add coalescing types~~ — dropped with R1; no new types were needed.
- [x] T2 (R2, R3, R4, R6): `client.ts` `runSse` — replace `concatMap(of(e).pipe(delay(…)))` with `bufferTime(options?.delayTime ?? DEFAULT_SSE_BATCH_WINDOW_MS)` + `filter(batch => batch.length > 0)`, and deliver the batch frame-by-frame inside `next`. `takeUntil(destroy$)` / `finalize(onRunSettled)` semantics unchanged.
- [x] T3 (R2, R3, R4, R6, R7): add `packages/core/src/lib/sse-pacing.spec.ts`; confirm the existing core + react suites stay green.
- [x] T4 (R5): `asgard-service-context.tsx` — document and destructure `delayTime`, forward it to `useChannel`.
- [x] T5 (R5): `use-channel.ts` — add `delayTime` to `UseChannelProps`, destructure it, include it in all five `FetchSseOptions` objects (reset / restore / sendMessage / replyToolCallConsents / nudge) and in their `useCallback` dependency arrays.
- [x] T6: `npm run lint:packages` + `npm run format:check` + `npm run typecheck` + `npm run build:core && npm run build:react`
- [x] T7 (R8): Smoke check — `npm run test:packages`, then react-demo `/canvas-card` script 「畫」 with a before/after comparison.

---

## Coverage

Use Cases: R2, R3, R4, R5, R6, R7, R8 (R1 withdrawn — see Acceptance Criteria)

Files:

- `packages/core/src/lib/client.ts` (core) — `runSse` pipeline; `DEFAULT_SSE_BATCH_WINDOW_MS`; rxjs imports
- `packages/core/src/types/client.ts` (core) — doc comment on `FetchSseOptions.delayTime`
- `packages/core/src/lib/sse-pacing.spec.ts` (core, new) — 5 cases
- `packages/react/src/context/asgard-service-context.tsx` (react) — `delayTime` doc + destructure + forward
- `packages/react/src/hooks/use-channel.ts` (react) — `delayTime` prop, destructure, 5 options objects, 5 dep arrays

---

## Execution Log / Change Log

- 2026-08-24: BUILD task created from https://github.com/asgard-ai-platform/asgard-sdk-pm/issues/87 (Status: `draft`).
- 2026-08-24: Plan confirmed; implementation started (Status: `draft → ready → in-progress`).
- 2026-08-24: R1 (delta coalescing) withdrawn mid-build — the cost was timer serialization, not reducer count; see `## Brief`. The coalescing module written for it was deleted rather than kept unused.
- 2026-08-24: Red/green confirmed — with the old per-frame pipeline restored, 3 of the 5 new cases fail (R3 delivers 1 frame instead of 372); with the new pipeline all 5 pass.
- 2026-08-24: `lint:packages` ✅ · `format:check` ✅ · `typecheck` (3 projects) ✅ · `build:core` + `build:react` ✅ · `test:packages` 610 passed (257 core / 353 react).
- 2026-08-24: R8 browser smoke on react-demo `/canvas-card` (「畫」). Same tab and conditions before and after: **before** — 113s elapsed, html 658/2602 (25%), skeleton never lifted, still drawing; **after** — html 2602/2602 and drawing ended at **9s**, skeleton lifted at 5s, canvas visually complete. 9s tracks the mock's own wire schedule (372 × 25ms ≈ 9.3s), so the SDK now adds essentially nothing. ⚠️ Absolute figures are inflated by Chrome's ~1Hz hidden-tab timer clamping (measured: a 50ms `setTimeout` fires every ~1000ms); the before/after ratio is the valid result, and a foreground-tab pass is still outstanding (Status: `in-progress → done`).
