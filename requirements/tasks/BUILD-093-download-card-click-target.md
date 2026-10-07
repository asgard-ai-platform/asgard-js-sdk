# BUILD-093 Make the whole idle download card its click target

## Meta

- Task ID: `BUILD-093`
- Status: `done`
- Issue: [asgard-sdk-pm#118](https://github.com/asgard-ai-platform/asgard-sdk-pm/issues/118)（F-038 PM 驗收回報：[留言 6022279521](https://github.com/asgard-ai-platform/asgard-sdk-pm/issues/118#issuecomment-6022279521)「按右手邊 icon 的時候沒反應，但是按字的部分是可以正常下載的」）
- Source spec: `references/asgard-sdk-pm/tracking/asgard-js-sdk/features/F-038-sandbox-下載卡-download-file-與-channel-層共用喚醒.md`；行為以 `docs/spec/asgard-js-sdk/sandbox-download.md` §5 狀態機「idle ── 點擊 ──▶」為準
- Complexity: `S`

---

## Brief

BUILD-089 的下載卡在 idle 時，右側的下載圖示是放在 `.main` 按鈕**外面**的裝飾 `<span className={styles.side}>`，點它不會觸發任何事；同樣點不到的還有卡片外框的 padding（沿用 chip 的 `10px 12px`）與按鈕和右側圖示之間的 `12px` gap。使用者看到的是一張整體的卡，右側還畫著下載圖示，自然會去點它。原型（`SandboxCards.tsx` 的 `.sbc-dl-side`）是同一個結構，原型本身也有這個死區，所以這是照搬下來的缺陷，不是設計意圖。

做法：idle 的下載圖示移進 `.main` 按鈕裡（放在 body 後面），卡片外框的 padding / gap 改由 `.main` 承擔，讓按鈕撐滿整張卡；`.side` 只留給 waiting 的「取消」與 error 的「重試」兩顆獨立按鈕（按鈕不能巢狀，這兩顆維持在 `.main` 外面）。`.main` 的 focus outline 改成內縮，因為卡片 `overflow: hidden` 會把外擴的 outline 裁掉。

**不在範圍**：卡片 hover 底色（目前沒有，PM 沒提）；原型本身的同一個死區（原型 repo 非本 repo）。

**Already exists:** `sandbox-download-card.tsx`、`sandbox-download-card.module.scss`（BUILD-089）、`sandbox-download.spec.tsx`、react-demo `/sandbox-download`（寬窄並排）。

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

- `R1` When the user clicks the download glyph on the right of an idle download card, the system shall start the download exactly as a click on the title does (same `controller.download(sandboxName, absolutePath)` call, same wake path on a cold sandbox). → T1, T3
- `R2` When the user clicks anywhere inside an idle card's border — including its edges and the space between the text and the glyph — the system shall start the download; the pointer cursor shall show over that whole area. → T1, T2, T4
- `R3` While a card is waiting or failed, the system shall keep Cancel / Retry as separate buttons that do only their own action (Cancel never starts a download; Retry downloads once), and the main area shall stay disabled exactly as in BUILD-089 (busy / not-found). → T1, T3
- `R4` When the card is reached by keyboard, the system shall offer one tab stop for the download (the glyph adds none), and its focus ring shall be fully visible inside the card. → T1, T2, T4
- `R5` When rendered, the card shall look the same as before in every phase (same size, padding, glyph position, colors) at both the narrow (375) and full-bleed widths. → T2, T4
- `R6` (Smoke check) When the developer runs `npm run build:core && npm run build:react`, `npm run typecheck`, the Vitest suites, and the react-demo route `/sandbox-download` (`npm run serve:react-demo -- -- --port 5100`, wide + narrow side by side), the system shall show R1–R5 with real pointer clicks on the glyph and on the card edge, with no build or type errors. → T5, T6

---

## Implementation Tasks

- [x] T1 (R1, R3, R4): `sandbox-download-card.tsx` — move the idle `DownloadIcon` from `.side` into `.main` after the body (the icon already renders `aria-hidden`); `.side` keeps only Cancel / Retry.
- [x] T2 (R2, R4, R5): `sandbox-download-card.module.scss` — `.card` drops the chip's padding / gap, `.main` takes them over and stretches to the card's height; `.side` pads its right edge only when it holds a button; focus outline inset.
- [x] T3 (R1, R3): `sandbox-download.spec.tsx` — regression: a click on the idle glyph downloads; the glyph is inside the download button; Cancel / Retry still do only their own action.
- [x] T4 (R2, R4, R5): Before / after screenshots of every phase at both widths in the demo; measure that the `.main` button's box equals the card's box.
- [x] T5: Run `npm run lint:packages` + `npm run format:check` + `npm run typecheck` + `npm run build:core && npm run build:react` + `npm run test:packages`.
- [x] T6 (R6): Smoke check in the react-demo `/sandbox-download` with real pointer clicks on the glyph and the card corner (live and cold sandbox).

---

## Coverage

Use Cases: R1, R2, R3, R4, R5, R6
Files:

- `packages/react/src/components/sandbox-download/sandbox-download-card.tsx`（react）— idle 下載圖示移進 `.main` 按鈕
- `packages/react/src/components/sandbox-download/sandbox-download-card.module.scss`（react）— padding / gap 從 `.card` 移到 `.main`、`.side` 只在有按鈕時佔位、focus ring 內縮
- `packages/react/src/components/sandbox-download/sandbox-download.spec.tsx`（react）— 回歸測試：點右側圖示會下載

---

## Execution Log / Change Log

- 2026-10-07: BUILD task created from [asgard-sdk-pm#118 comment 6022279521](https://github.com/asgard-ai-platform/asgard-sdk-pm/issues/118#issuecomment-6022279521) (Status: `draft`).
- 2026-10-07: Implementation started (Status: `draft → in-progress`). 先看原型：`SandboxCards.tsx` 的 `.sbc-dl` 已把 padding 移到 `.sbc-dl-main`（邊緣點得到），但 `.sbc-dl-side` 的下載圖示同樣在按鈕外（實測點了停在 idle），所以原型也有 PM 回報的這個死區；BUILD-089 沒照原型搬 padding，SDK 另外多了邊緣與 gap 的死區。原型另有整張卡的 hover 底色與圖示變主色，SDK 卡片沒有，本 task 未加（不在 PM 回報範圍）。
- 2026-10-07: 回歸測試先在未修正的程式上跑出 FAIL（圖示不在下載按鈕內），修正後 17/17 通過。
- 2026-10-07: lint / format / typecheck（exit 0）、build core + react、`test:packages`（core 448、react 703）全綠。demo `/sandbox-download` 以 Playwright 真實滑鼠驗證：8 張卡（寬窄兩個 shell）下載按鈕的 box 與卡片 box 完全相同，網格 hit-test 全卡皆落在按鈕上（只剩圓角外的四個角點）；點圖示：冷 sandbox → waiting → 取消回 idle 無下載、再點 → 喚醒 → 下載 1 次；live 點卡片左下角直接下載（修正前同一點停在 idle、無下載）；404 只剩一顆按鈕；喚醒失敗出現重試、按重試下載恰 1 次；鍵盤一個 tab stop、focus ring 框住整張卡。修正前後六個狀態截圖逐像素比對：idle / done / 兩種 error 0 像素差異，waiting 只差 spinner 動畫格，focus 為預期的整卡框線。兩個 shell 的卡片寬度皆為 320（chip `.root` 固定），版面相同。非 idle 且右側無按鈕的狀態（downloading / done / not-found），描述文字可用寬度比修正前多 12px（原本 gap 12 + padding 12，現在只剩 padding 12）；截圖中無可見差異。 (Status: `in-progress → done`).
