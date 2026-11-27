# 工具授權

## 範圍

- 涵蓋：run 進行中，後端要求使用者允許或拒絕工具呼叫時的四件事：
  - SDK 的授權佇列。
  - 內建授權卡片。
  - 消費端自己做卡片的接法。
  - 回覆後的通知。
- 名稱：
  - 消費端：使用 SDK 的應用。原文的 host 指的也是消費端。
  - 一批：後端一次要求授權的所有工具呼叫，也就是 `pendingConsent` 的 `pendingCalls`。
  - 自動代答：授權佇列不問使用者、自己回覆的呼叫。有兩種：後端已標 `alreadyAllowed` 的呼叫；同一批稍早已用「這個對話都允許」核准過同一個工具的呼叫（`use-tool-call-consent-queue.ts` 的註解）。
  - 續跑：後端收到授權回覆後，繼續執行同一個 run。
- PM 規格：PM 沒有對應規格。來源是 [freyr-pm#331](https://github.com/asgard-ai-platform/asgard-freyr-pm/issues/331)、[freyr-pm#885](https://github.com/asgard-ai-platform/asgard-freyr-pm/issues/885)、[freyr-pm#901](https://github.com/asgard-ai-platform/asgard-freyr-pm/issues/901)。
- 優先順序：產品規則以 PM 規格為準。實際行為以程式為準。本章只記兩者都讀不出來的決定、差異與限制。

## 設計決定

| 編號 | 決定 | 類型 | 為什麼 | 出處 |
|---|---|---|---|---|
| CONSENT-4 | `replyToolCallConsents` 失敗時，core 把 `pendingConsent` 放回送出前的那一批。佇列從這一批的第一個呼叫重新開始作答。如果回覆失敗的這一批全部都是自動代答的呼叫，佇列不自動重送。 | 刻意的行為 | 自動重送會無限重試同一個失敗的回覆。 | 原 BUILD-073、BUILD-086 |
| CONSENT-8 | SDK 提供「`toolCallConsent="off"` ＋ 公開的佇列 hook」，讓消費端就地畫卡片。SDK 不做 render prop，也不只給停用開關。命名比照 `fileExplorer`。 | PM 未定義、前端先決定 | render prop 只能畫在授權元件那一格，也就是 footer 之後，所以就地卡片會落在 composer 下方。如果只給停用開關，消費端得自己重寫四件事：自動代答、同一批的「這個對話都允許」、被拒時還原、重設時作廢。 | 原 BUILD-086 |
| CONSENT-9 | `onToolCallConsentReply` 在續跑的第一個 frame 到達時觸發，不在送出請求時觸發。 | 理由 | 送出不代表後端接受了回覆。以後端開始回應為準，被拒的回覆就不會誤報。 | 原 BUILD-085 |
| CONSENT-15 | 佇列不保留「自己送出中」的例外狀態。不要加回去。 | 刻意的行為 | 佇列只在答完一批時送出，那時丟掉佇列狀態不會失去任何東西。回覆被拒時，core 先還原 `pendingConsent`，佇列會重新 seed。兩種寫法在所有測試下行為相同。 | 原 BUILD-086 |

## 跟 PM 不一致的地方

無

## 已知限制

| 編號 | 限制 | 原因 | 待誰處理 |
|---|---|---|---|
| CONSENT-17 | 同一個 `toolCallId` 可能回報兩次。 | 有一種情況會發生：回覆被接受、續跑送出第一個 frame 之後才斷線，而且沒有續傳游標。這時 callback 已經觸發，但 core 仍會把 `pendingConsent` 放回，使用者可能再答一次。消費端要以 `toolCallId` 去重。這是 #410 的既有取捨。 | 不處理（asgard-ai-platform/asgard-js-sdk#410） |
| CONSENT-18 | `toolCallConsent` 是 `'builtin'` 時，如果消費端再呼叫佇列 hook，內建佇列和消費端的佇列會各自回覆同一批。 | 兩份佇列各自送出，SDK 不偵測這種情況。消費端自己做卡片時，只能搭配 `'off'`。 | 不處理 |
| CONSENT-19 | 被拒過的呼叫，之後使用者每送一則新訊息，後端都先以原 id 再要求一次授權。 | 這是後端行為（2026-09-29 在 dev 實測兩次，REVIEW-085）。後端沒有送新的 `tool_call.start`。其中一次，那個呼叫在前一輪已被允許並執行成功，仍被再問一次。 | 後端；尚未開票（2026-09-30 在 asgard-ai-platform/asgard-freyr-pm#901 請 PM 決定是否開票，該票已關閉） |
| CONSENT-20 | 使用者的答覆以工具為單位，套用到整個續跑。 | 這是後端行為。使用者選「僅此次允許」後，同一支工具的新呼叫不再詢問。使用者選「拒絕」時，拒絕也會套到使用者剛要求的新呼叫。 | 後端 |
| CONSENT-21 | 一批有多筆呼叫時，被允許的呼叫以新 id 重跑。 | 這是後端行為。原 id 之後沒有 `tool_call.complete`，後端改以新 id 各送一次 `start` 和 `complete`。一批只有一筆時，後端以原 id 只回 `complete`。 | 後端 |
