# BUILD-091 Keep the FileExplorer clipboard stable and attributed to the right source

## Meta

- Task ID: `BUILD-091`
- Status: `draft`
- Issue: [asgard-js-sdk#482](https://github.com/asgard-ai-platform/asgard-js-sdk/issues/482)（issue 開在本 repo，無 PM tracking spec；issue body 即規格。本 task 只做第 2、3、4 項）
- Source spec: 無 PM spec。契約來源是 `Clipboard` 型別註解（`packages/react/src/components/file-explorer/file-explorer-context.tsx`）：「It is optional so a host calling `setClipboard({ op, entry })` keeps compiling: the context fills in the active source.」
- Complexity: `S`

---

## Brief

#480 把剪貼簿綁到來源之後，留下三個邊角行為（#482 第 2、3、4 項），目前的消費端都碰不到：

- `setClipboard` 依賴 `activeSourceId`，每次切換來源都換一個新函式；放進消費端 `useEffect` deps 的話，切來源會讓 effect 重跑。存進 state 的一律是展開後的新物件，host 以 `===` 比對自己 set 的物件會失敗。
- 同一個 handler 裡 `controller.selectSource('B'); setClipboard({ op, entry })`：缺省的 `sourceId` 用的是當次 render 的 active source，條目被記在 A。
- 「已剪下」的淡化只比對來源，不看 `move`；同一個來源拿掉 `move` 之後項目仍變淡，但已經貼不了。

做法：`setClipboard` 原樣存入（有帶 `sourceId` 的物件保持同一參照），缺 `sourceId` 時在 commit 後以 `useLayoutEffect` 用「那次 commit 的 active source」補上——同一個 handler 切來源時補的是 B，分開的「在 A 設、之後切到 B」仍補 A。`setClipboard` 因此不再依賴任何 state，回到穩定參照。`selectSource` 屬於 host 持有的 controller、不經過 context，所以不能在 set 當下同步得知，只能等 commit。淡化改成同時要求來源有 `move`。

**不在範圍**：#482 第 1 項（來源 id 重複使用／來源被移除時清空剪貼簿）是行為變更，需要先決定語意，另議。`SourceSetFileExplorer` 自己的剪貼簿不動。

**Already exists:** `file-explorer-context.tsx`（`Clipboard`、`setClipboard`、`canPaste`、`actPaste`）、`file-explorer-tree.tsx:85`（`isCut`）、`read-only-source-actions.spec.tsx`／`paste-dedupe.spec.tsx`（剪貼簿既有測試，可沿用 harness）。

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

- `R1` When the active source changes, the `setClipboard` function the context provides shall stay the same reference, so a host effect that depends on it does not re-run. → T1, T2
- `R2` When a host sets a clipboard that carries its own `sourceId`, the context shall store and expose that same object (`===`), not a copy. → T1, T2
- `R3` When a host calls `controller.selectSource('B')` and then `setClipboard({ op, entry })` without a `sourceId` in the same handler, the entry shall be attributed to `B`; when `setClipboard` runs while `A` is active and the source changes to `B` in a later handler, the entry shall stay attributed to `A` (paste disabled in `B`, enabled back in `A`). → T1, T2
- `R4` When the clipboard holds a cut entry from the active source but that source has no `move` provider, the tree shall not draw the entry as cut (it cannot be pasted); with `move` present it is drawn as cut as before. → T1, T3
- `R5` When the developer runs lint / format / typecheck / build / `test:packages` and walks the react-demo `/file-explorer` copy / cut / paste across two sources at both the narrow and the full-bleed shell, existing clipboard behaviour (#476 R1–R6, paste de-dupe) shall be unchanged, with no build errors. → T4

---

## Implementation Tasks

- [ ] T1 (R1–R4): Vitest first — `setClipboard` identity across a source switch; stored object identity when `sourceId` is given; same-handler switch + set attributes to the new source, separate handlers keep the old one; cut entry without `move` not dimmed. Confirm the R1–R4 cases fail before T2/T3.
- [ ] T2 (R1–R3): `file-explorer-context.tsx` — `setClipboard` stores `next` as given; a `useLayoutEffect` fills a missing `sourceId` with the committed `activeSourceId`; update the `Clipboard` JSDoc to say when the fill happens.
- [ ] T3 (R4): `file-explorer-tree.tsx` — `isCut` also requires the context's `canCut`.
- [ ] T4-1: Run `npm run lint:packages` + `npm run format:check` + `npm run typecheck` + `npm run build:core && npm run build:react` + `npm run test:packages`
- [ ] T4 (R5): Smoke check in the react-demo at both widths; screenshots go to the local verification handover, not the repo.

---

## Coverage

Use Cases: [filled during build]
Files: [filled during build]

---

## Execution Log / Change Log

- 2026-10-06: BUILD task created from [asgard-js-sdk#482](https://github.com/asgard-ai-platform/asgard-js-sdk/issues/482) items 2–4 (Status: `draft`).
