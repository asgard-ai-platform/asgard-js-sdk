# 連線、SSE run 與錯誤出口

## 範圍

- 涵蓋：core 的 client 與 Channel 怎麼跑一次 SSE run（分批、結束、刪除與清除 channel），以及 React 端 client 的生命週期與錯誤怎麼交給消費端。F-002（斷線續傳）還沒結案，`openWhenHidden` 與 `detach` 的後續留在 [`FOLLOWUP-f002-background-tab-detach.md`](../tasks/FOLLOWUP-f002-background-tab-detach.md)，不在本章。
- PM 規格：[清除對話、保留檔案](../../references/asgard-sdk-pm/docs/spec/asgard-js-sdk/channel-clear.md)、[F-002 Last-Event-ID 斷線續傳](../../references/asgard-sdk-pm/tracking/asgard-js-sdk/features/F-002-last-event-id-斷線續傳.md)、[F-011 message 與 thinking 串流組裝健壯性](../../references/asgard-sdk-pm/tracking/asgard-js-sdk/features/F-011-message-與-thinking-串流組裝健壯性.md)、[F-014 transcript 冷啟動重播內核與 message.user 事件](../../references/asgard-sdk-pm/tracking/asgard-js-sdk/features/F-014-transcript-冷啟動重播內核與-message-user-事件.md)、[F-015 進房初始化編排與 autoResetChannel metadata-gated 改版](../../references/asgard-sdk-pm/tracking/asgard-js-sdk/features/F-015-進房初始化編排與-autoresetchannel-metadata-gated-改版.md)、[F-023 停止生成改為真正中止背景 run](../../references/asgard-sdk-pm/tracking/asgard-js-sdk/features/F-023-停止生成改為真正中止背景-run.md)、[F-032 頻道刪除 deleteChannel 與 RESET_CHANNEL 退場](../../references/asgard-sdk-pm/tracking/asgard-js-sdk/features/F-032-頻道刪除-deletechannel-與-reset-channel-退場.md)、[F-039 清除對話保留檔案：clearChannel 與 reset 鈕 resetMode](../../references/asgard-sdk-pm/tracking/asgard-js-sdk/features/F-039-清除對話保留檔案-clearchannel-與-reset-鈕-resetmode.md)；錯誤出口沒有 PM 規格，來源是 [freyr-pm#331](https://github.com/asgard-ai-platform/asgard-freyr-pm/issues/331)、[sdk-pm#87](https://github.com/asgard-ai-platform/asgard-sdk-pm/issues/87)。
- 優先順序：產品規則以 PM 規格為準，實際行為以程式為準；本章只記兩者都讀不出來的決定、差異與限制。

## 設計決定

| 編號      | 決定                                                                                                              | 類型                  | 為什麼                                                                                                                                                                                                                                        | 出處         |
| --------- | ----------------------------------------------------------------------------------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| CLIENT-1  | SSE frame 以時間窗（`bufferTime`）分批交出，SDK 加上的延遲最多一個視窗。不要改回逐筆 `concatMap` + `delay`        | 刻意的行為            | 逐筆延遲是嚴格序列化，成本隨 frame 數累加：一張 2.6KB 的畫布有 372 筆 token 級 delta，舊做法光 SDK 就墊 19 秒。時間窗保留「不要一次 flush 幾百次 render」的用意，延遲卻與筆數無關                                                             | 原 BUILD-068 |
| CLIENT-2  | 視窗只改時機，不合併同一則訊息的相鄰 delta；`onSseMessage` 照舊收到每一筆、未修改的 frame                         | 刻意的行為            | 延遲來自計時器序列化，不是 reducer 跑幾次；合併會改到公開 `onSseMessage` 的語意，或得重排每筆 frame 的副作用，換不到任何東西。公開型別 `FetchSseOptions.delayTime` 的 JSDoc 仍寫「相鄰 delta 會合併」，那是合併方案撤回前的舊說明，以程式為準 | 原 BUILD-068 |
| CLIENT-5  | `useAsgardServiceClient` 在 setup 時若發現 client 已被釋放就重建一個。不要把這段「看似多餘」的重建拿掉            | 刻意的行為            | React StrictMode 對同一元素跑 setup → cleanup → setup；cleanup 已經 `close`／`detach` 了 client，不重建的話消費端拿到的是會丟掉每一筆 frame 的死 client                                                                                       | 原 BUILD-037 |
| CLIENT-7  | 錯誤只交給 `onSseError`，SDK 不自己畫錯誤橫幅；送訊息、重設、還原、nudge、授權回覆五個入口一致                    | PM 未定義、前端先決定 | `@asgard-js/react` 沒有自己的錯誤呈現面；硬做一個是消費端無法套主題、也拿不掉的橫幅                                                                                                                                                           | 原 BUILD-074 |
| CLIENT-9  | `onAuthError` 標 `@deprecated`、指向 `onSseError`，不在 core 補出 auth 形狀的錯誤；三個宣告處都標，不加執行期警告 | PM 未定義、前端先決定 | `onSseError` 已經收得到每一個錯誤，補出那個形狀是真正的實作工作，多一條平行 callback 只是多一條要維護的路。只標公開那處，下次寫文件的人會照沒標的那份抄。函式庫不在消費端 console 印東西（2026-09-02 定案）                                   | 原 BUILD-077 |
| CLIENT-10 | 消費端的 `onSseError`／`onAuthError` 一律經 `notify` 呼叫，callback 丟的例外被吞掉。不要在入口直接呼叫 callback   | 刻意的行為            | core 在 `settleRun()` 與 `reject()` **之前**呼叫 `onSseError`；callback 一丟例外，promise 永遠不 settle、`isConnecting` 停在 true，輸入框在整個掛載期間都不能用                                                                               | 原 BUILD-074 |

## 跟 PM 不一致的地方

無

## 已知限制

| 編號      | 限制                                                 | 原因                                                                                              | 待誰處理                      |
| --------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------- |
| CLIENT-20 | `delayTime` 從 react 傳到 core 沒有自動化測試        | 值經過 `use-channel.ts` 裡五個 `FetchSseOptions` 物件；之後重構漏掉其中一個，只有讀程式才看得出來 | 需另立票                      |
| CLIENT-21 | 背景分頁量不到真實的批次延遲                         | Chrome 在隱藏分頁把計時器夾到約 1Hz，批次視窗因此被放大約 20 倍；量延遲必須在前景可見的分頁做     | 量測注意事項                  |
| CLIENT-22 | auth 形狀錯誤的型別在三處以 inline 型別重寫          | 抽成共用型別等於新增一個馬上要棄用的公開符號，刻意不做                                            | 隨 `onAuthError` 移除一起消失 |
| CLIENT-23 | demo `/nudge-payload` 的註解仍寫「後端會拒絕 NUDGE」 | 實測 dev bot 連續兩次 nudge 都成功；那段註解是舊的 BUG-005 前提                                   | 需另立票                      |
