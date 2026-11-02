# REVIEW-095 Review: preview-mode disabled action cards

## Meta

- Task ID: `REVIEW-095`
- Status: `done`
- BUILD Task: `BUILD-095`
- Reviewed commit: `76160467`
- Reviewed branch: `feat/124-preview-mode-disabled-cards`

---

## §1 Static Code Review

Scope is `BUILD-095 ## Coverage`（react `disabled-action/`、`attachment-template/chip.tsx`、`button-template/card.tsx`、`sandbox-download/sandbox-download-card.tsx`、`file-explorer/icons.tsx`、`chatbot.tsx`、`asgard-template-context.tsx`、`i18n.ts` 及其樣式與 spec；demo `preview-mode-cards/`、`sandbox-cards/`、`app.tsx`、`layout.tsx`）. `lint` / `format` / `typecheck` / `build` / `test` run project-wide.

### §1.1 Checklist

| Check item                                           | Rule                         | Result |
| ---------------------------------------------------- | ---------------------------- | ------ |
| `any` / `as any`                                     | FRONTEND_RULE_COMMON §1.1    | ✅     |
| `@ts-ignore` / `eslint-disable`                      | FRONTEND_RULE_COMMON §1.2    | ✅     |
| `console.log`                                        | FRONTEND_RULE_COMMON §1.3 §7 | ✅     |
| No hardcoded API key / endpoint / namespace          | FRONTEND_RULE_COMMON §1.4    | ✅ ¹   |
| Teardown for subscriptions / listeners / timers      | FRONTEND_RULE_COMMON §1.5    | ✅ ²   |
| core has no react / DOM import                       | FRONTEND_RULE_COMMON §1.6    | ✅     |
| react → core through the public entry only           | FRONTEND_RULE_COMMON §1.6    | ✅     |
| No breaking public-API change                        | FRONTEND_RULE_COMMON §1.7    | ✅ ³   |
| New public API exported from the entry               | FRONTEND_RULE_COMMON §2.2    | ✅ ³   |
| `botProviderEndpoint`, not `endpoint`                | FRONTEND_RULE_COMMON §2.4    | ✅     |
| Explicit return types on exported functions          | FRONTEND_RULE_COMMON §3.1    | ✅     |
| Shared types centralized, no duplicates              | FRONTEND_RULE_COMMON §3.2    | ✅     |
| React props fully typed                              | FRONTEND_RULE_COMMON §4.1    | ✅     |
| No hardcoded colour values                           | FRONTEND_RULE_COMMON §4.2    | ✅ ⁴   |
| UI verified at both widths                           | FRONTEND_RULE_COMMON §4.3+   | ✅     |
| core and react share a version number                | FRONTEND_RULE_COMMON §5      | ✅ ⁵   |
| Repeated logic extracted (≥2×)                       | FRONTEND_RULE_COMMON §6      | ✅ ⁶   |
| `setTimeout` mock, dead code, untracked TODO / FIXME | FRONTEND_RULE_COMMON §7      | ✅ ⁷   |

¹ demo 的連線 shell 用 `${window.location.origin}/mock-asgard`，與其他 demo 路由相同。
² 沒有新增訂閱、listener 或 timer；tooltip 顯示走 CSS，`placeDisabledActionTooltip` 只是 `onPointerEnter` / `onFocus` handler，寫一個 DOM attribute，無狀態可清。
³ 只增不改：`<Chatbot>` 新增 optional `disabledActionTooltip`（`ChatbotProps` 已由 entry 匯出；`AsgardTemplateContextValue` 同步多一個 optional 欄位）。`disabled-action` 模組是內部實作，刻意不匯出。
⁴ library 端新增的色值全部是 `var(--asg-*, fallback)`；唯一的裸值是 tooltip 的中性陰影 `rgba(0, 0, 0, 0.22)`，既有 SCSS 有 15 處同寫法（`upload-queue`、`tool-call-consent` …）。`#888` / `#444` / `#1677ff` 只在 demo 路由樣式，沿用 `prompt-suggestion.module.scss`。
⁵ 皆為 `0.3.95`，未 bump。
⁶ 「是否為靠連線的 action」與「預覽模式 + tooltip 文案」各只寫一次（`isConnectionGatedAction`、`usePreviewModeGate`），三個元件共用；`LockIcon` 進共用 icon 集並納入 lucide 幾何守衛。host 的接線（`aria-*` + 兩個 handler + tooltip）三處形狀不同，見 Findings Minor 1。
⁷ grep 命中 `sandbox-download.spec.tsx:169` 的 `flush()`（`setTimeout(resolve, 0)`），既有 test helper、非模擬延遲。

### §1.2 Mechanical grep

```text
any / as any            : (empty)
ts-ignore / eslint-dis. : (empty)
console.log             : (empty)
core → react            : (empty)
react → core/src        : (empty)
colour (tsx/ts, added)  : (empty)
colour (scss, added)    : library — var() fallbacks + 1 neutral box-shadow（見 ⁴）；demo — #888 / #444 / #1677ff
setTimeout              : sandbox-download.spec.tsx:169 — 既有 flush() helper
TODO / FIXME (diff)     : (empty)
```

### §1.4 Build / Lint / Format

```text
lint:packages: PASS — 0 errors；5 warnings 皆為既有，Coverage 內檔案逐檔 lint 0 problems
format:check:  PASS
typecheck:     PASS — core + react + react-demo
build:         PASS — core, react
test:          PASS — core 458、react 738（+18：disabled-action.spec 16、sandbox-download.spec 2；icons.spec 多 1 個 glyph）
```

---

## §3 Functional Validation

驗證手段：Vitest（jsdom，真 `AsgardTemplateContextProvider`，mock service context 切換預覽／連線；突變測試：把 `isPreviewMode` 改成恆 `false` → 13 個預覽案例全紅）＋ react-demo `/preview-mode-cards`（port 5100；預覽寬版 full-bleed 與窄版 375×640 並排，另一個連線 shell 當對照組）以 Playwright 實際操作 ＋ `/sandbox-cards`（改為連線）回歸。

| R#    | Result | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `R1`  | ✅     | spec：open-browser / open-file / open-folder / channel-home 四種 chip 預覽下仍渲染標題；download-file 卡仍渲染標題與描述。demo：兩個預覽 shell 各 7 個鎖定項（4 chip、下載卡、2 顆卡片按鈕），對話內容與連線 shell 相同                                                                                                                                                                                                                                                                                             |
| `R2`  | ✅     | demo：鎖定項 `cursor: not-allowed`、標題／描述／icon 為次要色、右側鎖頭取代下載鈕／下載圖示，無 hover 底色（截圖比對預覽與連線）。spec：channel-home chip 預覽下不渲染 `Download` 鈕                                                                                                                                                                                                                                                                                                                                |
| `R3`  | ✅     | spec：冷 sandbox 下預覽卡不顯示 coldHint；喚醒進行中不顯示 wakingHint，也沒有 Cancel / Retry。demo：連線 shell 同一張卡顯示「Sandbox 未啟動」提示，預覽 shell 沒有                                                                                                                                                                                                                                                                                                                                                  |
| `R4`  | ✅     | spec：四種 chip 的 click / Enter / Space 不呼叫 `onSandboxOpen*`、不 `window.open`，Space / Enter `defaultPrevented`；下載卡 click / Enter 不 nudge、不讀檔；按鈕卡 gated 按鈕 click 無動作。demo：14 個鎖定項逐一 click + Enter + Space → host log 空、無新分頁、無 `/mock-asgard` 請求                                                                                                                                                                                                                            |
| `R5`  | ✅     | spec：`aria-disabled="true"`、無原生 `disabled`、`tabindex=0`、`aria-describedby` 指向 `role="tooltip"`。demo：hover 顯示（opacity 1）；Tab 移到下載卡 → 焦點框＋ tooltip；最上方卡片 tooltip 翻到下方不被訊息列裁切，中段卡片與卡片按鈕在上方且不超出卡片寬度                                                                                                                                                                                                                                                      |
| `R6`  | ✅     | spec 與 demo：zh-TW「無法開啟這個項目」、en-US "This item can't be opened"、ja-JP「この項目は開けません」                                                                                                                                                                                                                                                                                                                                                                                                           |
| `R7`  | ✅     | spec 與 demo：覆寫字串在三個 locale 下皆原樣顯示，五種卡（含按鈕卡）一致                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `R8`  | ✅     | spec：按鈕卡只鎖 open-file 那顆，一般連結與 MESSAGE 按鈕無 `aria-disabled`、無 tooltip，一般連結 click → `window.open`。demo：「開啟比較表」「下載比較表」鎖定，「各家公開價目表」照常                                                                                                                                                                                                                                                                                                                              |
| `R9`  | ✅     | spec：預覽下一般連結 chip 無 `aria-disabled`，click → `window.open('https://example.com/pricing', '_blank')`。demo：預覽 shell 的一般連結 chip 與按鈕各開出一個 `example.com/pricing` 分頁；內文 markdown 連結照常渲染                                                                                                                                                                                                                                                                                              |
| `R10` | ✅     | spec：連線時 open-file / open-browser（click、Enter）照常呼叫宿主；channel-home 保有 `Download` 鈕、無 tooltip；按鈕卡 open-file 呼叫宿主、MESSAGE 呼叫 `sendMessage`；既有 `chip.spec` / `sandbox-download.spec` 全數維持綠燈（改為明確 mock 連線狀態）。demo：連線 shell 0 個 disabled、0 個 tooltip，點擊三種卡＋按鈕皆記錄；`/sandbox-cards` 點擊照常記錄 open-browser / open-file / open-folder。另讀 code 確認連線模式 client 於首次 render 建立，`sendMessage` 不會短暫為 `undefined`，卡片不會閃成 disabled |
| `R11` | ✅     | 見 §1.4；demo 兩種寬度並排走過上列各項                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

---

## Findings

### Critical (must fix before done)

None.

### Important (should fix in this cycle)

- **已修**：react README 沒有記載新 prop 與預覽模式下卡片的行為。props 清單與「Sandbox handoff cards」一節都寫到這些卡，近期功能 commit 皆同步 README。以 `76160467` 補上。
- **已修（BUILD 期間）**：純 CSS 的 tooltip 一律放在卡片上方，最上方一張卡的 tooltip 會被訊息列裁掉（瀏覽器實走發現）。改由 `placeDisabledActionTooltip` 在顯示前量上方空間，不夠就翻到下方。詳見 BUILD-095 Execution Log。

### Minor (nice to have)

1. host 的接線（`aria-disabled` / `aria-describedby` / `onPointerEnter` / `onFocus` / host class / tooltip 元素）出現在三處，形狀各不相同：chip 是 `div role="button"`、下載卡是外層 div 掛 handler ＋內層 button 掛 `aria-*`、按鈕卡是逐顆 button 且 id 依 index。抽成共用 helper 得同時接受兩個目標，複雜度高於重複本身，未抽。
2. tooltip 元素在 host 內，所以它的文字同時進了 host 的 accessible name 與 description，螢幕閱讀器可能念兩次。prototype 同樣如此；未改。
3. 宿主若用 theme 對 chip / 標題 / 按鈕下 inline 色彩（`customStyle`），會蓋過鎖定態的次要色。已查 Sindri / Mimir / Odin 皆未對這三種 template 下 inline 樣式；未處理。
4. 範圍外（spec §6 同類）：預覽模式下卡片「出現」時仍會觸發宿主的 open-file / open-folder / open-browser 回呼（arrival），demo 的 log 說明有標示。若 Sindri 分享頁看到面板自行展開，需另開票。

---

## Execution Log

- 2026-11-02: REVIEW task created, paired with BUILD-095 (Status: `draft`).
- 2026-11-02: BUILD-095 done; ready for review (Status: `draft → ready`).
- 2026-11-02: §1 — 18 項 ✅、0 違規；§3 — R1–R11 全 Pass；2 Important 已修（README、tooltip 裁切），4 Minor 不改 (Status: `ready → in-progress → done`).
