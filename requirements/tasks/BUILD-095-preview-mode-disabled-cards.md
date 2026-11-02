# BUILD-095 Show action cards disabled with a tooltip in preview mode

## Meta

- Task ID: `BUILD-095`
- Status: `done`
- Issue: [asgard-sdk-pm#124](https://github.com/asgard-ai-platform/asgard-sdk-pm/issues/124)（F-040）
- Source spec: `references/asgard-sdk-pm/tracking/asgard-js-sdk/features/F-040-預覽模式下動作卡照樣顯示-呈現-disabled-tooltip.md`；契約以 `docs/spec/asgard-js-sdk/preview-mode-cards.md`（§2 哪些卡、§3 呈現、§4 文案、§5 JS API 面、§6 不做的事）為準，決議見 `docs/decisions/2026-10-31-preview-mode-disabled-cards.md`；UI 參考 prototype @ `6541a3f` 的 `src/SandboxCards.tsx`（`ActionCardShell`、`DisabledTip`、`.sbc-card[aria-disabled]` / `.sbc-tip` 樣式）與 `src/demo/PreviewModeDemo.tsx`
- Complexity: `M`

---

## Brief

預覽模式（`botProviderEndpoint: 'skip'`，沒有 client、沒有 channel 連線）下，五種要靠連線的卡——`sandbox://` 的 open-browser／open-file／open-folder／download-file，以及舊的 `channel-home://` 下載卡——今天點下去安靜地什麼都不做。改成：卡片照樣顯示，但呈現 disabled（次要色、右側鎖頭、無 hover、`not-allowed`），點擊／Enter／Space 不做任何事，hover 或鍵盤聚焦時顯示一句 tooltip（`aria-disabled="true"` + `aria-describedby`）。預設文案為新 i18n key `sandboxCard.unavailable`，宿主可用 `<Chatbot>` 的新選填 prop 整句覆寫（不隨 locale 換）。按鈕卡（button／carousel 共用的 `Card`）上指向這五種 URI 的按鈕同樣 disabled + tooltip；一般連結與有連線時的所有行為不變。

**React + demo only，不動 core。公開 API 只增不改**（`<Chatbot>` 新增一個選填 prop）。

**計畫階段的決定**（spec 沒寫死、需確認）：

1. **預覽模式判斷**：與輸入框一致，`!sendMessage`（`chat-composer.tsx:89`）。抽成一個內部 hook，三處卡片共用；不新增宿主開關（決議 #5）。
2. **覆寫 prop 命名**：`disabledActionTooltip?: string`，沿用 spec §5.2 與 prototype `ChatContext` 的暫稱，經 `AsgardTemplateContext` 傳到卡片。spec §5.2 要求「最終名稱寫回本節」——那是 PM repo 的檔案，cycle 收尾時另外回報，不在本 repo 改。
3. **「這張卡要不要 disabled」由 URI 判斷**：`resolveSandboxUri(uri) !== null || isChannelHomeUri(uri)`，集中成一個 util，chip、按鈕卡共用（與 `dispatchUriAction` 同一個解析器，判斷與副作用不會對不上）。chip 的 `defaultAction` 與 `downloadAction` 各自判斷：body 是一般連結、download 鈕是 `channel-home://` 的 chip，只鎖 download 鈕。
4. **按鈕卡的 disabled 樣子**（prototype 沒有按鈕卡，需確認）：按鈕維持原位與文字，改成次要色背景／文字、`cursor: not-allowed`、label 前加一個小鎖頭，hover／focus 顯示同一個 tooltip。
5. **tooltip 實作**：照 prototype，純 CSS（`role="tooltip"` 的 span，卡片 `:hover` / `:focus-visible` 時顯示），不引入 portal 或第三方套件；顏色走 `--asg-*` token。卡片外層若有 `overflow: hidden` 會裁到 tooltip，build 時實測兩種寬度確認。
6. **既有 demo `/sandbox-cards`**：它用 `'skip'` 驗 F-020／F-034 的點擊回呼，本張做完後那頁的卡會全部 disabled、log 不再出現。改接 `/mock-asgard`（有連線），讓那頁繼續驗「有連線時點擊照常」——同時是 R10 的對照組。

**Already exists:** `resolveSandboxUri`（core）、`isChannelHomeUri`（`utils/channel-home-download.ts`）、`dispatchUriAction`（`utils/dispatch-uri-action.ts`）、`AttachmentChip`（`templates/attachment-template/chip.tsx`）、`SandboxDownloadCard`（`sandbox-download/sandbox-download-card.tsx`）、按鈕卡 `Card`（`templates/button-template/card.tsx`，carousel 共用）、i18n catalog + `t()`（`i18n.ts`）、`AsgardTemplateContext`、file-explorer 的 icon 集（`components/file-explorer/icons.tsx`，尚無鎖頭）、react-demo 的 `/mock-asgard` middleware。

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
| a11y | Disabled cards use `aria-disabled="true"`, never native `disabled` (it swallows hover / focus); stay in the Tab order     |

---

## Acceptance Criteria

EARS form: `When <event/condition>[, while <state>], the system shall <observable behavior>`.
Each criterion is mapped to one or more Implementation Tasks (→ T#).

- `R1` (AC1) While the `<Chatbot>` is in preview mode, when a message carries any of the five gated cards (`sandbox://` open-browser / open-file / open-folder / download-file, `channel-home://`), the system shall still render that card in place — not hidden, not replaced by another card. → T3, T4, T5
- `R2` (AC2) While in preview mode, the system shall render each gated card disabled: icon and text in the secondary color, a lock glyph on the right (replacing the download glyph / button), no hover highlight, cursor `not-allowed`. → T3, T4, T5
- `R3` (AC3) While in preview mode, the download-file card shall show neither the "Sandbox not running" nor the "waking" hint, and no Cancel / Retry button. → T4
- `R4` (AC4) While in preview mode, when the user clicks a gated card or presses Enter / Space on it, the system shall do nothing: no host callback (`onSandboxOpen*`), no new tab, no request, no error. → T3, T4, T5, T7
- `R5` (AC5) While in preview mode, when the pointer hovers a gated card or it receives keyboard focus, the system shall show the tooltip; the card is reachable with Tab, carries `aria-disabled="true"`, and references the tooltip through `aria-describedby`. → T2, T3, T4, T5
- `R6` (AC6) When no override is given, the tooltip shall read the `sandboxCard.unavailable` string for the current `locale`: zh-TW「無法開啟這個項目」, en-US "This item can't be opened", ja-JP「この項目は開けません」. → T1
- `R7` (AC7) When the host passes `disabledActionTooltip` to `<Chatbot>`, every gated card's tooltip shall show that exact string, unchanged across locales. → T2
- `R8` (AC8) While in preview mode, a button-template / carousel card button whose action is one of the five gated URIs shall be disabled with the same tooltip; other buttons on the same card (plain links, MESSAGE, EMIT) keep their current behavior. → T5
- `R9` (AC9) While in preview mode, a plain link (http / https / mailto / tel) on a chip or a card button shall still open as it does today. → T3, T5
- `R10` (AC10) While connected (not preview mode), every card shall behave exactly as before this task: same look, same click / keyboard behavior, download states and hints unchanged. → T3, T4, T5, T7
- `R11` (Smoke check) When the developer runs `npm run lint:packages && npm run format:check && npm run typecheck` and `npm run build:core && npm run build:react`, all pass; `npm run test:packages` passes including new Vitest for R1–R10; and on the react-demo (`npm run serve:react-demo -- -- --port 5100`) the new preview-mode route shows the cards disabled with the tooltip at both the narrow (375px) and full-bleed widths, while `/sandbox-cards` (connected) still logs every click. → T6, T8, T9

---

## Implementation Tasks

Run in order; each task maps to the R# it satisfies.

- [x] T1 (R6): Add `sandboxCard.unavailable` to the three locales in `packages/react/src/i18n.ts`.
- [x] T2 (R5, R7): `<Chatbot disabledActionTooltip?: string>` → `AsgardTemplateContext`; add an internal `usePreviewModeGate()` (`!sendMessage` + resolved tooltip text), an `isConnectionGatedAction(action)` util (`resolveSandboxUri` ∪ `isChannelHomeUri`), a `LockIcon`, and a shared disabled-tooltip piece (text = override ?? `t(locale, 'sandboxCard.unavailable')`, `useId` for `aria-describedby`).
- [x] T3 (R1, R2, R4, R5, R9, R10): `AttachmentChip` — in preview mode, a gated `defaultAction` makes the chip focusable `role="button"` + `aria-disabled` + tooltip, no-op on click / Enter / Space, lock on the right; a gated `downloadAction` swaps the download button for the lock. Non-gated actions untouched.
- [x] T4 (R1–R5, R10): `SandboxDownloadCard` — in preview mode render the idle look only (no cold / waking hint, no Cancel / Retry, no progress), lock instead of the download glyph, `aria-disabled` + tooltip, no call to the download controller.
- [x] T5 (R1, R2, R4, R5, R8, R9): button-template `Card` — per button, gated URI in preview mode → `aria-disabled` + lock + tooltip + no-op; others untouched (carousel inherits).
- [x] T6 (R11): Styles in the existing `.module.scss` files with `--asg-*` tokens only; verify the tooltip is not clipped at both widths.
- [x] T7 (R4, R10): Vitest — preview vs connected for chip / download card / button card: render, `aria-*`, tooltip text (default per locale + override), click / Enter / Space call nothing in preview, call the existing handler when connected, plain link still opens in preview.
- [x] T8 (R11): react-demo — new route `/preview-mode-cards` (all five cards + a button card with gated and plain buttons + a plain link; preview narrow + preview full-bleed side by side, locale and override toggles); switch `/sandbox-cards` to `/mock-asgard` so it keeps verifying connected clicks.
- [x] T9: Run `npm run lint:packages` + `npm run format:check` + `npm run typecheck` + `npm run build:core && npm run build:react` + `npm run test:packages`; walk every R# in the demo at both widths.

---

## Coverage

Use Cases: R1, R2, R3, R4, R5, R6, R7, R8, R9, R10, R11

Files:

- `packages/react/src/components/disabled-action/disabled-action.tsx` (new, react) — `isConnectionGatedAction`, `usePreviewModeGate`, `DisabledActionTooltip`, `placeDisabledActionTooltip`, `disabledActionHostClass`
- `packages/react/src/components/disabled-action/disabled-action.module.scss` (new, react) — tooltip, hover / focus reveal, below-placement
- `packages/react/src/components/disabled-action/disabled-action.spec.tsx` (new, react) — 16 cases: gate util, chip preview × 4 kinds, locale, override, plain link, chip / button card connected vs preview
- `packages/react/src/components/templates/attachment-template/chip.tsx` (react) — locked state
- `packages/react/src/components/templates/attachment-template/attachment-template.module.scss` (react) — `.chip--locked`, `.lock`
- `packages/react/src/components/templates/attachment-template/chip.spec.tsx` (react) — now renders connected (mocked `sendMessage`)
- `packages/react/src/components/sandbox-download/sandbox-download-card.tsx` (react) — preview-mode branch
- `packages/react/src/components/sandbox-download/sandbox-download-card.module.scss` (react) — `.locked`
- `packages/react/src/components/sandbox-download/sandbox-download.spec.tsx` (react) — connected by default; 2 preview cases
- `packages/react/src/components/templates/button-template/card.tsx` (react) — locked gated buttons
- `packages/react/src/components/templates/button-template/card.module.scss` (react) — `.button_locked`, `.button_lock`
- `packages/react/src/components/file-explorer/icons.tsx` / `icons.spec.tsx` (react) — `LockIcon` (lucide 0.487.0 `lock`) + its geometry guard
- `packages/react/src/components/chatbot/chatbot.tsx` (react) — `disabledActionTooltip` prop → template context
- `packages/react/src/context/asgard-template-context.tsx` (react) — `disabledActionTooltip`
- `packages/react/src/i18n.ts` (react) — `sandboxCard.unavailable` × 3 locales
- `apps/react-demo/src/app/routes/preview-mode-cards/{preview-mode-cards.tsx,preview-mode-cards.module.scss,index.ts}` (new, demo)
- `apps/react-demo/src/app/routes/sandbox-cards/sandbox-cards.tsx` (demo) — connected via `/mock-asgard`
- `apps/react-demo/src/app/app.tsx`, `apps/react-demo/src/app/components/layout/layout.tsx` (demo) — route + nav entry

---

## Execution Log / Change Log

- 2026-11-02: BUILD task created from [asgard-sdk-pm#124](https://github.com/asgard-ai-platform/asgard-sdk-pm/issues/124) (Status: `draft`).
- 2026-11-02: Plan confirmed as proposed (button-card look, `disabledActionTooltip`, `/sandbox-cards` moved to the mock backend) (Status: `draft → ready`).
- 2026-11-02: Implementation started (Status: `ready → in-progress`).
- 2026-11-02: Existing specs assumed a connected chip without supplying `sendMessage`; with no service provider the default context reads as preview mode, so 19 cases went red. `chip.spec` / `sandbox-download.spec` now mock a connected context explicitly (preview has its own cases). `LockIcon` added to the lucide geometry guard (`icons.spec`), copied from the prototype's lucide-react 0.487.0 `lock`.
- 2026-11-02: Mutation check — forcing `isPreviewMode` to `false` turns all 13 preview cases red; restored.
- 2026-11-02: Browser walk (react-demo :5100) found the tooltip clipped by the message list when the card is at the top of the thread (CSS-only placement is always "above"). Added `placeDisabledActionTooltip` (host `onPointerEnter` / `onFocus`): measures the room above against every non-`visible` overflow ancestor and flips the tooltip below when it does not fit; a `data-tooltip-placement` attribute, no state. Re-verified: top card → below, middle cards → above, card buttons → above and inside the card.
- 2026-11-02: Browser walk results — both preview shells: 7 gated items each (`aria-disabled="true"`, `tabIndex=0`, no native `disabled`, `cursor: not-allowed`, tooltip linked by `aria-describedby`); click / Enter / Space on all 14 → host log empty, no new tab, no request; Tab onto the download card → focus ring + tooltip; locales zh-TW / en-US / ja-JP and the override (same sentence in all three) correct; plain-link chip and card button open `example.com/pricing`. Connected shell: no disabled items, channel-home download button and cold hint present, clicks reach the host callbacks; `/sandbox-cards` (now connected) logs open-browser / open-file / open-folder on click.
- 2026-11-02: lint (0 errors; the 5 warnings are in untouched files) / format / typecheck (core + react + demo) / build / test (core 458, react 738) green (Status: `in-progress → done`).
