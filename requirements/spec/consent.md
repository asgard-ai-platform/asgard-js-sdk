# 工具授權（tool-call consent）

代號 `CONSENT`。

## 範圍

- 後端在 run 中送出 consent frame（一批 `pendingCalls`）要求使用者允許或拒絕工具呼叫；使用者回覆後 run 續跑。
- `@asgard-js/core`：`Channel.replyToolCallConsents`、`pendingConsent`，以及型別 `ToolCallConsentPendingCall`、`ToolCallConsentAnswer`。
- `@asgard-js/react`：內建授權卡片 `ToolCallConsentGate`／`ToolCallConsentModal`、公開 hook `useToolCallConsentQueue()`、`<Chatbot>` 的 `toolCallConsent` 與 `onToolCallConsentReply`。
- 來源：freyr-pm#331、#885、#901（皆 Done），以及本 repo #410、#455。

## 現行行為

### 佇列與回覆

| 編號      | 項目         | 現行行為                                                                                                                                                                                                                                                                                                    |
| --------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CONSENT-1 | 佇列         | `useToolCallConsentQueue()` 回傳 `{ pendingCall, currentIndex, totalCount, decide }`：`pendingCall` 是這一批裡下一個要使用者回答的呼叫（沒有時為 `null`），`currentIndex` 從 1 起算，`totalCount` 含佇列自動代答的呼叫。`decide(decision)` 記下答案並前進。內建卡片也由這個 hook 驅動，沒有第二份佇列邏輯。 |
| CONSENT-2 | 自動代答     | 標了 `alreadyAllowed` 的呼叫以 `ALLOW_ONCE` 代答；同一批裡較早已對同一個 toolset／tool 選「這個對話都允許」的，以 `ALLOW_ALWAYS` 代答。這些呼叫不會成為 `pendingCall`。                                                                                                                                     |
| CONSENT-3 | 送出         | 一批每個呼叫都有答案後，經 `replyToolCallConsents` 送出**一次**。整批都是自動代答時也由佇列送出，所以 run 可能觸發授權的期間，佇列必須保持掛載，否則 run 會一直停著。                                                                                                                                       |
| CONSENT-4 | 回覆被拒     | 回覆被後端拒絕（HTTP 錯誤）時，錯誤交給 `onSseError`（auth 形狀先到 `onAuthError`），core 把 `pendingConsent` 還原，卡片回到畫面、從這一批的第一個呼叫重新回答。整批都是自動代答的被拒批次不會自動重送，避免無限重試同一個被拒的回覆。                                                                      |
| CONSENT-5 | channel 換掉 | 重設或 `customChannelId` 改變時，佇列丟掉這一批、不送出任何回覆。                                                                                                                                                                                                                                           |
| CONSENT-6 | 別處已回覆   | 同一個 channel 上 `pendingConsent` 變成 `null`，代表這一批已經被回覆（例如 host 直接呼叫 `replyToolCallConsents`）：佇列丟掉這一批、不另外送出；內建卡片卸載、`body` 的 `overflow` 還原。                                                                                                                   |

### 內建卡片與替換

| 編號      | 項目          | 現行行為                                                                                                                                                                                                                                                                         |
| --------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CONSENT-7 | 預設內建卡片  | `toolCallConsent` 省略或為 `'builtin'` 時，`<Chatbot>` 掛內建的全螢幕授權對話框；開著時把 `document.body.style.overflow` 設成 `hidden`，關閉時還原。                                                                                                                             |
| CONSENT-8 | 自己做授權 UI | `toolCallConsent="off"` 時不掛內建對話框，也不碰 `body` 的 `overflow`。host 在 `<Chatbot>` 樹內任何位置（例如 `renderComposerAbove`）呼叫 `useToolCallConsentQueue()` 就能就地畫自己的卡片。只能搭配 `'off'` 使用：`'builtin'` 時再呼叫 hook，兩份佇列會各回覆一次，SDK 不偵測。 |

### 回覆通知

| 編號       | 項目            | 現行行為                                                                                                                                                                                                                            |
| ---------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CONSENT-9  | 觸發時機        | `onToolCallConsentReply(answers)` 在後端**接受**這次回覆時觸發一次：續跑的第一個 frame 到達、交給 `onSseMessage` 之前；續跑完全沒送 frame 就結束時，在完成時觸發。內建卡片與 host 自己呼叫 `replyToolCallConsents` 兩條路都會觸發。 |
| CONSENT-10 | 內容            | 實際送出的整批答案（每筆的 `toolCallId`、`result`、`denyReason`），包含自動代答的那幾筆，同一批只有一次 callback。                                                                                                                  |
| CONSENT-11 | 不觸發          | 請求被拒、在第一個 frame 之前失敗、正在重設、或沒有 channel 時不觸發。使用者再次回答還原的卡片、且被接受時，以新的答案觸發一次。                                                                                                    |
| CONSENT-12 | callback 丟例外 | 被吞掉：run 照樣結束，之後的授權批次照樣可以回答。                                                                                                                                                                                  |
| CONSENT-13 | id 對應         | `ToolCallConsentPendingCall.toolCallId` 與同一個呼叫在 tool-call frame 上的 `toolUseId` 是同一個值（後端兩者都取 CLI 自己的 tool_use id，已對 dev consent bot 實測）。型別註解與兩份 README 都寫明。                                |
| CONSENT-14 | 後端自動放行    | 後端自動放行的呼叫（bypass、allow list、先前批次選過「這個對話都允許」）不會出現在 consent frame，所以不會有卡片，也不會觸發 `onToolCallConsentReply`。這是後端行為，SDK 無從補上，型別與 README 寫明。                             |

## 設計決定

| 決定                                                                                         | 理由                                                                                                                                                                                                                                                     | 出處                           |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| 開放「`'off'` ＋ 公開佇列 hook」，不做 `renderToolCallConsent` render prop，也不只給停用開關 | render prop 只能畫在授權元件那一格（chat column grid 的 footer 之後），就地卡片會落在 composer 下方；只給停用開關，則要 host 自己重寫自動代答、同批 ALLOW_ALWAYS、被拒還原與重設作廢                                                                     | 原 BUILD-086                   |
| `toolCallConsent` 的命名與語意比照 `fileExplorer`（`'off'` = 不掛內建、host 自己放）         | 同一個元件上一致的開關形狀                                                                                                                                                                                                                               | 原 BUILD-086                   |
| 同 channel 上 `pendingConsent` 變 `null` 就丟掉佇列（CONSENT-6）                             | core 裡 `pendingConsent` 唯一被清成 `null` 的地方是 `Channel.replyToolCallConsents`，其他轉換與 channel 重建都原樣帶過；所以「串流中的暫時性 null」不存在，同 channel 的 null 只可能是「有人回覆了」。原本 #455 R5 的反向規則因此改寫（2026-10-01 確認） | 原 BUILD-086                   |
| 不保留「佇列自己送出中」的例外                                                               | 佇列只在答完時送出，那時丟掉不會失去任何東西；被拒時 core 先還原 `pendingConsent`，佇列會重新 seed。兩種寫法在所有測試下行為相同，依「以簡為先」移除                                                                                                     | 原 BUILD-086（實作時偏離計畫） |
| 授權卡片 catch 回覆失敗但不畫任何東西                                                        | 錯誤的出口是 `onSseError`，呈現方式由消費端決定（同 [CLIENT-7](client.md)）                                                                                                                                                                              | 原 BUILD-073                   |
| 通知時機定在「續跑的第一個 frame」而不是送出請求時                                           | 送出不代表被接受；以後端開始回應為準，被拒的回覆不會誤報                                                                                                                                                                                                 | 原 BUILD-085                   |

## 已知限制與未交付

| 項目                                         | 說明                                                                                                                                                                                | 交接                |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| 同一個 `toolCallId` 可能回報兩次             | 回覆被接受、續跑送出第一個 frame 之後才斷線（且沒有續傳游標）時，callback 已觸發，但 core 仍因 `reject` 把 `pendingConsent` 放回，使用者可能再答一次。host 以 `toolCallId` 去重即可 | —（#410 既有取捨）  |
| `DENY_ONCE` 的 `denyReason` 是必填           | 沿用既有 `ToolCallConsentDecision`，沒有原因時傳 `''`。#901 的評估回覆曾寫成選填                                                                                                    | —                   |
| 後端行為：舊呼叫在之後每個新訊息被重新詢問   | dev 實測：被拒過的舊呼叫在之後送新訊息時以原 id 再發一次 consent，沒有新的 `tool_call.start`                                                                                        | 後端（asgard-core） |
| 後端行為：答覆以工具為單位套用到整個續跑     | 「僅此次允許」後同一支工具的新呼叫不再詢問；「拒絕」也會套到使用者剛要求的新呼叫                                                                                                    | 後端（asgard-core） |
| 後端行為：多筆一批時被允許的呼叫以新 id 重跑 | 原 id 之後沒有 `tool_call.complete`，改以新 id 各送 `start`／`complete`；單筆時以原 id 只回 `complete`                                                                              | 後端（asgard-core） |

## 程式位置

- react：`packages/react/src/hooks/use-tool-call-consent-queue.ts`、`packages/react/src/components/tool-call-consent/`（`tool-call-consent-gate.tsx`、`tool-call-consent-modal.tsx`）、`packages/react/src/hooks/use-channel.ts`（`replyToolCallConsents`、`onToolCallConsentReply`）
- core：`packages/core/src/lib/channel.ts`（`replyToolCallConsents`、`pendingConsent` 還原）
- 測試：`packages/react/src/components/tool-call-consent/consent-reply-error.spec.tsx`、`consent-reply-notification.spec.tsx`、`consent-queue-invalidation.spec.tsx`、`packages/react/src/hooks/use-tool-call-consent-queue.spec.tsx`
