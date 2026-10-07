# REVIEW-093 Review: whole idle download card as its click target

## Meta

- Task ID: `REVIEW-093`
- Status: `done`
- BUILD Task: `BUILD-093`
- Reviewed commit: `79332008`（第二輪；第一輪 `00321a6e`）
- Reviewed branch: `fix/118-download-card-click-target`

---

## §1 Static Code Review

Scope is `BUILD-093 ## Coverage`（`packages/react/src/components/sandbox-download/`）. `lint` / `format` / `typecheck` / `build` / `test` run project-wide.

### §1.1 Checklist

| Check item                                           | Rule                         | Result |
| ---------------------------------------------------- | ---------------------------- | ------ |
| `any` / `as any`                                     | FRONTEND_RULE_COMMON §1.1    | ✅     |
| `@ts-ignore` / `eslint-disable`                      | FRONTEND_RULE_COMMON §1.2    | ✅     |
| `console.log`                                        | FRONTEND_RULE_COMMON §1.3 §7 | ✅     |
| Teardown for subscriptions / listeners / timers      | FRONTEND_RULE_COMMON §1.5    | ✅ n/a |
| react → core through the public entry only           | FRONTEND_RULE_COMMON §1.6    | ✅     |
| No breaking public-API change                        | FRONTEND_RULE_COMMON §1.7    | ✅ ¹   |
| Explicit return types on exported functions          | FRONTEND_RULE_COMMON §3.1    | ✅     |
| No hardcoded colour values                           | FRONTEND_RULE_COMMON §4.2    | ✅ ²   |
| UI verified at both widths                           | FRONTEND_RULE_COMMON §4.3+   | ✅     |
| core and react share a version number                | FRONTEND_RULE_COMMON §5      | ✅ ³   |
| Repeated logic extracted (≥2×)                       | FRONTEND_RULE_COMMON §6      | ✅ n/a |
| `setTimeout` mock, dead code, untracked TODO / FIXME | FRONTEND_RULE_COMMON §7      | ✅ ⁴   |

¹ `SandboxDownloadCardProps` 不變；只動 DOM 結構（idle 圖示從 `.side` 移進 `.main`）、卡片 class（可點擊時加 `chip--interactive`）與 scss。卡片原本就只有一個帶 aria-label 的下載按鈕，idle 時仍是一個。
² 色值 grep 在 Coverage 內只命中 spec 註解裡的票號 `#118`；scss 新增的顏色只有既有 token `var(--asg-color-primary, #4767eb)`（同檔已有的寫法）；hover 底色沿用家族的 `chip--interactive`，沒有新增色值。
³ 未 bump。
⁴ `setTimeout` 命中皆為既有：spec 的 `flush`（微任務排隊）與 `sandbox-download-context.tsx` 的 done → idle 計時器（有清理），都不在本次 diff。

### §1.2 Mechanical grep

```text
any / as any            : (empty)
ts-ignore / eslint-dis. : (empty)
console.log             : (empty)
core → react            : (empty)
react → core/src        : (empty)
colour (coverage)       : sandbox-download.spec.tsx:235  // asgard-sdk-pm#118 …   ← 票號，非色值
setTimeout (coverage)   : sandbox-download.spec.tsx:167（flush）、sandbox-download-context.tsx:115、187（既有 done 計時器）
TODO / FIXME in diff    : (empty)
```

### §1.4 Build / Lint / Format

```text
lint:packages: PASS — 0 errors；5 warnings 皆為既有，不在 Coverage 內
format:check:  PASS
typecheck:     PASS — core + react + react-demo
build:         PASS — core, react
test:          PASS — core 448、react 703（新增 1 案）；第二輪（hover）重跑全綠
```

---

## §3 Functional Validation

驗證手段：Vitest ＋ react-demo `/sandbox-download`（port 5100，寬窄兩個 shell）以 Playwright 真實滑鼠點擊；每次點擊前重新量卡片位置，並確認落點的 `elementFromPoint` 在目標卡片內。

| R#   | Result | Evidence                                                                                                                                                                                                                            |
| ---- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `R1` | ✅     | spec 新案在修正前紅（圖示不在按鈕內）、修正後綠。demo：冷 sandbox 點圖示 → waiting → 喚醒 → 下載 1 次；窄版 shell 點圖示同樣下載                                                                                                    |
| `R2` | ✅     | 8 張卡的按鈕 box 與卡片 box 完全相同；40×6 網格 hit-test 全落在按鈕上（只剩圓角外的 4 個角點）；live 點卡片左下角 → downloading（修正前同一點停在 idle、無下載）；整卡 cursor 為 pointer                                            |
| `R3` | ✅     | waiting 按取消回 idle、0 次下載；喚醒失敗出現重試，按一次下載恰 1 次；404 只剩一顆按鈕且不能按；既有 16 案不改即通過                                                                                                                |
| `R4` | ✅     | spec：idle 卡內 `getAllByRole('button')` 為 1；demo 鍵盤聚焦落在「下載 2026-Q3-營收報告.pdf」，focus ring 內縮後框住整張卡（修正前只框左側按鈕區）                                                                                  |
| `R5` | ✅     | 修正前後六個狀態截圖尺寸相同；逐像素比對 idle / done / not-found / wake-failed 0 差異，waiting 只差 spinner 動畫格，focus 為預期變化                                                                                                |
| `R7` | ✅     | demo 滑鼠真實移動：idle（圖示／右緣）→ 卡片 rgb(51,51,51) → rgb(64,64,64)、圖示 rgb(71,103,235)、pointer；waiting、not-found → 不變、default；喚醒失敗 → 卡片變亮、「重試」右側空白為 default。未 hover 的 idle 與修正前 0 像素差異 |
| `R6` | ✅     | 閘門全綠；demo 走查見 BUILD-093 Execution Log                                                                                                                                                                                       |

---

## Findings

### Critical (must fix before done)

None.

### Important (should fix in this cycle)

None.

### Minor (nice to have)

- `.card { padding: 0 }` 與 `.chip { padding }` 同權重，靠 dist 內的規則順序取勝（`card.tsx` 先 import chip 樣式，dist/index.css 中 `.card` 在 `.chip` 之後，已確認）。react-demo 另外載入 dist CSS，dist 過期時會看到 padding 回來的假象，重 build 即恢復。
- 宿主若在 ATTACHMENT theme 的 `style` 上覆寫 `padding`，會套在外層卡片上，邊緣死區會回來（右側圖示不受影響，仍在按鈕內）。
- 原型 `SandboxCards.tsx` 的 `.sbc-dl-side` 有同一個圖示死區（實測點了停在 idle）；原型不在本 repo。

---

## Execution Log

- 2026-10-07: REVIEW task created, paired with BUILD-093 (Status: `draft`).
- 2026-10-07: BUILD-093 done (Status: `draft → ready`).
- 2026-10-07: §1 — 12 項 ✅、0 違規；§3 — R1–R6 全 Pass；3 Minor 不改 (Status: `ready → in-progress → done`).
- 2026-10-07: 第二輪（BUILD-093 追加 R7 hover，`79332008`）：§1 仍 12 項 ✅、0 違規；§3 — R1–R7 全 Pass；2 Minor 不改 (Status: `done → in-progress → done`).
