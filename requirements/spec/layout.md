# 版面、主題預設與文字排版

代號 `LAYOUT`。

## 範圍

- `@asgard-js/react` 的 chat column 版面（內距、內容最大寬度、grid 列）、theme 的合併與預設值、訊息文字的換行。
- 公開面：`<Chatbot theme>`（`ChatbotTheme`）、`theme.chatbot.contentMaxWidth`、`DEFAULT_CONTENT_MAX_WIDTH`；內部常數 `$chat-gutter`、`$chat-content-max-width`。
- PM：sdk-pm#52、#54（Done）；F-022、sdk-pm#31（待驗收）。內距與換行、主題 token 自我指涉沒有 PM 票，來源是 PM 口頭回饋（2026-08-06）與其衍生的修正。

## 現行行為

### theme 合併

| 編號     | 項目             | 現行行為                                                                                                                                                                                                                                                                                  |
| -------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LAYOUT-1 | 三層優先序       | props theme ＞ bot provider metadata 的 annotations ＞ 預設值。某一層對某個欄位沒有意見（值是 `undefined`）時，不覆蓋下一層：`deepMerge` 遇到 `undefined` 直接略過。所以沒有 annotations、也沒傳 props theme 時，每個欄位都拿到預設值；props 只設群組裡的一個欄位，其他欄位的預設值保留。 |
| LAYOUT-2 | 明確的 falsy 值  | `''`、`0`、`null` 是明確的值，照樣勝出；只有 `undefined` 代表「沒有意見」。                                                                                                                                                                                                               |
| LAYOUT-3 | 底色與框線的預設 | `theme.chatbot.backgroundColor`、`borderColor` 沒有預設值，交給 SCSS palette 在 `.chatbot_root` 上宣告的 `--asg-color-bg: #141414`、`--asg-color-border: #434343`。沒設定時 `.chatbot_container` 的背景是 `#141414`，不是透明；有設定（props 或 annotations）時以設定值為準。             |

### chat column 版面

| 編號     | 項目             | 現行行為                                                                                                                                                                                                                                              |
| -------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LAYOUT-4 | 水平內距         | 隨 chat column 自己的寬度變化：`max(16px, min(4%, 32px))`。column 寬 ≤400px 時 16px，400 ～ 800px 之間線性增加（4%），≥800px 封頂 32px。百分比以 column 的寬度解析，所以檔案總管側欄打開讓 column 變窄時一起縮。                                      |
| LAYOUT-5 | 內距四處一致     | 訊息串、docked run-chrome 面板、header、composer 四個區域用同一個 `$chat-gutter`，任何寬度下左緣在同一條線上。                                                                                                                                        |
| LAYOUT-6 | 內距不是公開 API | 沒有 prop、沒有可依賴的 CSS 變數；值是 SCSS 編譯期常數，要調整得改 SDK 發版。                                                                                                                                                                         |
| LAYOUT-7 | 內容最大寬度     | 沒有設定 `theme.chatbot.contentMaxWidth` 時，訊息串、docked run-chrome 面板、composer 內容的最大寬度是 `800px`（`DEFAULT_CONTENT_MAX_WIDTH`），三者置中在同一條軸線。column 比 800px 窄時這個上限不起作用，內距照 LAYOUT-4。header 不受這個上限限制。 |
| LAYOUT-8 | 自訂最大寬度     | 設了 `theme.chatbot.contentMaxWidth` 就原樣套到同樣三個區域。TS 與 SCSS 各只有一個具名常數（`DEFAULT_CONTENT_MAX_WIDTH`、`$chat-content-max-width`），`packages/react/src` 裡沒有其他寫死的內容寬度。                                                 |
| LAYOUT-9 | 預設尺寸         | 預設 theme 把整個 shell 畫成 375×640 的行動版 widget；第一方消費端（Mimir、Sindri、Odin）一律以 `theme={{ chatbot: { width: '100%', height: '100%' } }}` 滿版掛載。                                                                                   |

### 文字換行

| 編號      | 項目           | 現行行為                                                                                                                                                                                                  |
| --------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LAYOUT-10 | 英文不從字中斷 | 文字訊息、references、錯誤泡泡（hint）的散文用 `overflow-wrap: anywhere`：正常英文在單字邊界換行，只有一整行都放不下的 token（例如長網址）才在 token 內強制斷開，容器不會水平溢出。中日文的換行不受影響。 |

### 尚待 PM 驗收的版面行為

| 編號      | 項目                | 現行行為                                                                                                                                                                                                      |
| --------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LAYOUT-11 | 統一的 chat header  | bot 名稱列與 channel 標題列合成一條 `ChatHeader`，提供三層客製（L1 props、L2 slot、L3 整條接管）。（待驗收：BUILD-027）                                                                                       |
| LAYOUT-12 | theme 型別與 token  | `ChatbotTheme`、`ChatbotProps` 等 theme 型別從套件匯出，SCSS 讀得到但 provider 沒寫入的 CSS 變數補上寫入。（待驗收：BUILD-039）                                                                               |
| LAYOUT-13 | chat column 的 grid | `.chatbot__chat_column` 是五列 grid（`max-content 1fr max-content max-content max-content`，即 header／thread／menu／seam／footer），目前靠子元素順序對應。（明確指定列與允許 null header：BUILD-040，draft） |
| LAYOUT-14 | header 的 L3 逃生口 | `renderHeader` 收到內建 header 的材料（檔案總管開關、匯出按鈕、channel 標題），不再讓它們在提供 `renderHeader` 時一起消失。（待驗收：BUILD-058）                                                              |

## 設計決定

| 決定                                                                        | 理由                                                                                                                                                                                                                   | 出處         |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| `deepMerge` 略過 `undefined`（issue 的選項 A），不只修 theme context 那一處 | 一行修正、語意正確（那一層沒意見就不該覆蓋下一層），涵蓋現在與未來所有呼叫端；只修一處，同樣的錯換個地方還會犯                                                                                                         | 原 BUILD-046 |
| 內距跟著 column 寬度，不跟視窗斷點                                          | 同一個 SDK 會被放進 375px 的懸浮面板也會被放進滿版頁面；百分比內距以 containing block 解析，四個區域都在同一個 column 裡，算出來永遠一樣                                                                               | 原 BUILD-047 |
| 內距不開放公開接口                                                          | 使用者明示決定：用 SCSS 編譯期常數，改一次四處都動。代價是消費端無法自行覆寫                                                                                                                                           | 原 BUILD-047 |
| 機器人訊息維持無氣泡滿寬（`.text--bot` 的 `padding: 0`）                    | 內距問題用 column 內距解，不改訊息外觀                                                                                                                                                                                 | 原 BUILD-047 |
| 內容最大寬度預設 800px                                                      | 1200px 時一行約 147 個英文字元，是舒適範圍（45 ～ 90）的 1.6 倍；800 − 2×32 = 736px，約 95 字元。PM 已在 sdk-pm#54 核准這個視覺變更                                                                                    | 原 BUILD-062 |
| `overflow-wrap: anywhere` 而不是 `break-word`                               | `anywhere` 同時縮小 min-content 尺寸，長 token 不會把泡泡撐出 flex 父容器；`break-word` 不會                                                                                                                           | 原 BUILD-048 |
| 底色與框線兩個欄位不給 `var(--asg-*)` 預設                                  | `themeVars` 會把這兩個欄位寫回宣告同名 token 的那個元素，`var(--asg-color-bg)` 就變成自我指涉、在 computed-value 時失效，連帶 `--asg-color-surface` 也被污染。其他 `var(--asg-*)` 預設指向的是別的 token，沒有這個問題 | 原 BUILD-049 |

## 已知限制與未交付

| 項目                                              | 說明                                                                                                                                                        | 交接                  |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| 沒設 `contentMaxWidth` 的消費端升級後 column 變窄 | 沒有公開簽章改變，但 Odin、Heimdall、embed widget 升級後會看到較窄的內容欄；Sindri（768px）與 Mimir（896px）自己有設，不受影響                              | 發版 changelog 要點名 |
| header 不受內容最大寬度限制                       | header 吃 `$chat-gutter` 但沒有上限，寬螢幕時 bot 名稱／channel 標題在 column 邊緣，訊息串與 composer 置中在 800px。與 ChatGPT、Claude 相同的做法，刻意保留 | 若要共用上限再開票    |
| annotations 那一段仍無條件建構 `undefined` 欄位   | LAYOUT-1 由 `deepMerge` 處理；日後若把 `deepMerge` 換成別的合併函式，同一個問題會復發                                                                       | 需另立票              |
| JSON 檢視器仍用 `word-break: break-all`           | tool-call 展開內容的 JSON 程式碼區塊不是散文，不在 LAYOUT-10 範圍                                                                                           | —                     |
| 使用者泡泡與附件樣式有寫死的顏色                  | `user-image-template.module.scss` 有 `#4767eb` 與幾個 `rgba(...)`，應改讀 theme                                                                             | 需另立票              |

## 程式位置

- `packages/react/src/utils/deep-merge.ts`
- `packages/react/src/context/asgard-theme-context.tsx`（預設 theme、`DEFAULT_CONTENT_MAX_WIDTH`、`themeVars`）
- `packages/react/src/styles/layout/_variables.scss`（`$chat-gutter`、`$chat-content-max-width`）、`packages/react/src/styles/palette/_palette.scss`
- `packages/react/src/components/chatbot/chatbot.module.scss`（`.chatbot__chat_column`）
- `packages/react/src/components/templates/text-template/text-template.module.scss`、`packages/react/src/components/templates/references/references.module.scss`、`packages/react/src/components/templates/hint-template/hint-template.module.scss`
