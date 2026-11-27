# 版面、主題預設與文字排版

## 範圍

- 涵蓋：
  - `@asgard-js/react` 的 chat column 版面：內距、內容最大寬度。
  - theme 的合併與預設值。
  - 訊息文字的換行。
- 名稱：
  - chat column：`<Chatbot>` 裡由 header、訊息串、docked 面板與 composer 組成的那一欄（`packages/react/src/styles/layout/_variables.scss` 的註解）。
  - 訊息串：chat column 裡可捲動的訊息清單。
  - 第一方消費端：Asgard 自己的產品前端，例如 Mimir、Sindri、Odin。
- PM 規格：[F-022 統一 chat heading bar ChatHeader](../../references/asgard-sdk-pm/tracking/asgard-js-sdk/features/F-022-統一-chat-heading-bar-chatheader.md)。其餘來源是 [sdk-pm#52](https://github.com/asgard-ai-platform/asgard-sdk-pm/issues/52)、[sdk-pm#54](https://github.com/asgard-ai-platform/asgard-sdk-pm/issues/54)、[sdk-pm#31](https://github.com/asgard-ai-platform/asgard-sdk-pm/issues/31)。內距、換行、主題 token 自我指涉這三項沒有 PM 規格，來源是 PM 的口頭回饋（2026-08-06）與它衍生的修正。
- 優先順序：產品規則以 PM 規格為準。實際行為以程式為準。本章只記兩者都讀不出來的決定、差異與限制。

## 設計決定

| 編號 | 決定 | 類型 | 為什麼 | 出處 |
|---|---|---|---|---|
| LAYOUT-7 | chat header 不受內容最大寬度限制，貼齊 column 邊緣。只有訊息串、docked 面板與 composer 置中在上限內。 | 刻意的行為 | 這跟 ChatGPT、Claude 的做法相同。建置前已跟使用者確認，刻意保留。只有決定 header 也要共用上限時才改。 | 原 BUILD-062、REVIEW-062 |
| LAYOUT-9 | 預設 theme 是 375×640 的行動版 widget。第一方消費端（Mimir、Sindri、Odin）一律以 `width`、`height` 100% 滿版掛載。驗 UI 時，兩種寬度都要看。 | 刻意的行為 | 預設值是給嵌入的 widget 用的。只看一種寬度，就看不到另一種寬度下被裁切的問題。 | 原 BUILD-062 |
| LAYOUT-15 | 機器人訊息維持無氣泡、滿寬。 | 刻意的行為 | 內距問題用 column 的內距解決，不改訊息外觀。 | 原 BUILD-047 |
| LAYOUT-20 | `theme.chatbot.backgroundColor` 和 `borderColor` 不給 `var(--asg-*)` 預設值，交給 palette 在 `.chatbot_root` 宣告的 token。不要補預設值。 | 刻意的行為 | 這是跨三處的約束。第一，theme context 的預設值。第二，`styles/palette/_palette.scss` 在 `.chatbot_root` 宣告的 `--asg-color-bg` 和 `--asg-color-border`。第三，`themeVars` 把這兩個欄位寫回同一個元素。如果給 `var(--asg-color-bg)` 當預設值，就會自我指涉，在 computed-value 時失效，連帶污染 `--asg-color-surface`。完整說明在 `asgard-theme-context.tsx` 的預設值註解。 | 原 BUILD-049 |

## 跟 PM 不一致的地方

無

## 已知限制

| 編號 | 限制 | 原因 | 待誰處理 |
|---|---|---|---|
| LAYOUT-17 | `asgard-theme-context.tsx` 把 annotations 的 theme 疊到預設 theme 時，那次 `deepMerge` 仍無條件建構值是 `undefined` 的欄位。 | 目前靠 `deepMerge` 略過 `undefined` 擋住。如果日後把 `deepMerge` 換成別的合併函式，預設層對六個顏色欄位失效的問題會復發。 | 需另立票 |
| LAYOUT-18 | tool-call 展開內容的 JSON 區塊仍用 `word-break: break-all`。 | JSON 是程式碼，不是散文，所以不套用散文的 `overflow-wrap: anywhere`。 | 不處理 |
| LAYOUT-19 | 使用者泡泡與附件樣式有寫死的顏色。 | `user-image-template.module.scss` 有 `#4767eb` 與幾個 `rgba(...)`，應該改讀 theme。 | 需另立票 |
