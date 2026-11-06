# 版面、主題預設與文字排版

## 範圍

- 涵蓋：`@asgard-js/react` 的 chat column 版面（內距、內容最大寬度）、theme 的合併與預設值、訊息文字的換行。
- PM 規格：[F-022 統一 chat heading bar ChatHeader](../../references/asgard-sdk-pm/tracking/asgard-js-sdk/features/F-022-統一-chat-heading-bar-chatheader.md)；其餘來源是 [sdk-pm#52](https://github.com/asgard-ai-platform/asgard-sdk-pm/issues/52)、[sdk-pm#54](https://github.com/asgard-ai-platform/asgard-sdk-pm/issues/54)、[sdk-pm#31](https://github.com/asgard-ai-platform/asgard-sdk-pm/issues/31)。內距、換行、主題 token 自我指涉沒有 PM 規格，來源是 PM 口頭回饋（2026-08-06）與其衍生的修正。
- 優先順序：產品規則以 PM 規格為準，實際行為以程式為準；本章只記兩者都讀不出來的決定、差異與限制。

## 設計決定

| 編號      | 決定                                                                                                                                   | 類型                  | 為什麼                                                                                                                                                                                  | 出處         |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| LAYOUT-1  | theme 三層合併時，某一層的值是 `undefined` 就不覆蓋下一層，修在 `deepMerge` 本身；`''`、`0`、`null` 仍是明確的值、照樣勝出             | 刻意的行為            | 那一層沒有意見就不該覆蓋下一層。修在 `deepMerge` 涵蓋現在與未來所有呼叫端；只修 theme context 那一處，同樣的錯換個地方還會犯                                                            | 原 BUILD-046 |
| LAYOUT-3  | `theme.chatbot.backgroundColor`、`borderColor` 不給 `var(--asg-*)` 預設，交給 palette 在 `.chatbot_root` 宣告的 token。不要補預設      | 刻意的行為            | `themeVars` 會把這兩個欄位寫回宣告同名 token 的那個元素，`var(--asg-color-bg)` 就變成自我指涉、在 computed-value 時失效，連帶 `--asg-color-surface` 也被污染                            | 原 BUILD-049 |
| LAYOUT-4  | 水平內距隨 chat column 自己的寬度變化（百分比、上下限），不跟視窗斷點；訊息串、docked 面板、header、composer 四處共用一個值            | 理由                  | 同一個 SDK 會被放進 375px 的懸浮面板，也會被放進滿版頁面；百分比內距以 containing block 解析，四個區域都在同一個 column 裡，算出來永遠一樣                                              | 原 BUILD-047 |
| LAYOUT-6  | 內距是 SCSS 編譯期常數，不開放 prop 或 CSS 變數                                                                                        | PM 未定義、前端先決定 | 使用者明示決定：改一次四處都動。代價是消費端無法自行覆寫                                                                                                                                | 原 BUILD-047 |
| LAYOUT-7  | 內容最大寬度預設 800px；header 不受這個上限限制                                                                                        | 理由                  | 1200px 時一行約 147 個英文字元，是舒適範圍（45 ～ 90）的 1.6 倍；800 − 2×32 = 736px，約 95 字元。PM 已在 sdk-pm#54 核准。header 置於 column 邊緣與 ChatGPT、Claude 的做法相同，刻意保留 | 原 BUILD-062 |
| LAYOUT-9  | 預設 theme 是 375×640 的行動版 widget；第一方消費端（Mimir、Sindri、Odin）一律以 `width`、`height` 100% 滿版掛載。驗 UI 要兩種寬度都看 | 刻意的行為            | 預設值是給嵌入 widget 用的；只看一種寬度，另一種寬度下被裁切的問題看不到                                                                                                                | 原 BUILD-062 |
| LAYOUT-10 | 散文（文字訊息、references、錯誤泡泡）用 `overflow-wrap: anywhere`，不用 `break-word`                                                  | 理由                  | `anywhere` 同時縮小 min-content 尺寸，長 token 不會把泡泡撐出 flex 父容器；`break-word` 不會。正常英文仍在單字邊界換行                                                                  | 原 BUILD-048 |
| LAYOUT-15 | 機器人訊息維持無氣泡、滿寬                                                                                                             | 刻意的行為            | 內距問題用 column 內距解，不改訊息外觀                                                                                                                                                  | 原 BUILD-047 |

## 跟 PM 不一致的地方

無

## 已知限制

| 編號      | 限制                                                       | 原因                                                                                         | 待誰處理 |
| --------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------- |
| LAYOUT-17 | annotations 那一段仍無條件建構 `undefined` 欄位            | 目前由 `deepMerge` 處理（LAYOUT-1）；日後若把 `deepMerge` 換成別的合併函式，同一個問題會復發 | 需另立票 |
| LAYOUT-18 | tool-call 展開內容的 JSON 區塊仍用 `word-break: break-all` | 那是程式碼不是散文，不在 LAYOUT-10 範圍                                                      | —        |
| LAYOUT-19 | 使用者泡泡與附件樣式有寫死的顏色                           | `user-image-template.module.scss` 有 `#4767eb` 與幾個 `rgba(...)`，應改讀 theme              | 需另立票 |
