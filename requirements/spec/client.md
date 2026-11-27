# 連線、SSE run 與錯誤出口

## 範圍

- 涵蓋：
  - core 的 client 與 Channel 怎麼跑一次 SSE run：分批、結束、刪除與清除 channel。
  - React 端 client 的生命週期，以及錯誤怎麼交給消費端。
  - F-002（斷線續傳）還沒結案。`openWhenHidden` 與 `detach` 的後續留在 [`FOLLOWUP-f002-background-tab-detach.md`](../tasks/FOLLOWUP-f002-background-tab-detach.md)，不在本章。
- 名稱：
  - 消費端：使用 SDK 的應用。
  - channel：後端的一串對話，對應 `@asgard-js/core` 的 `Channel` 類別。
  - run：channel 在後端的一次執行。SDK 用 SSE 接收 run 的 frame。`GET /channel/metadata` 回 `RUNNING` 表示有 run 正在進行（`packages/core/src/types/channel.ts`）。
  - GET rejoin：重新進入 channel 時，SDK 用 GET `/message/sse` 接上 channel。run 還在進行時接續 run；run 已結束時重播已存的 transcript（`packages/core/src/types/channel.ts` 的 `restore`／`replay`）。
- PM 規格：[清除對話、保留檔案](../../references/asgard-sdk-pm/docs/spec/asgard-js-sdk/channel-clear.md)、[F-002 Last-Event-ID 斷線續傳](../../references/asgard-sdk-pm/tracking/asgard-js-sdk/features/F-002-last-event-id-斷線續傳.md)、[F-011 message 與 thinking 串流組裝健壯性](../../references/asgard-sdk-pm/tracking/asgard-js-sdk/features/F-011-message-與-thinking-串流組裝健壯性.md)、[F-014 transcript 冷啟動重播內核與 message.user 事件](../../references/asgard-sdk-pm/tracking/asgard-js-sdk/features/F-014-transcript-冷啟動重播內核與-message-user-事件.md)、[F-015 進房初始化編排與 autoResetChannel metadata-gated 改版](../../references/asgard-sdk-pm/tracking/asgard-js-sdk/features/F-015-進房初始化編排與-autoresetchannel-metadata-gated-改版.md)、[F-023 停止生成改為真正中止背景 run](../../references/asgard-sdk-pm/tracking/asgard-js-sdk/features/F-023-停止生成改為真正中止背景-run.md)、[F-032 頻道刪除 deleteChannel 與 RESET_CHANNEL 退場](../../references/asgard-sdk-pm/tracking/asgard-js-sdk/features/F-032-頻道刪除-deletechannel-與-reset-channel-退場.md)、[F-039 清除對話保留檔案：clearChannel 與 reset 鈕 resetMode](../../references/asgard-sdk-pm/tracking/asgard-js-sdk/features/F-039-清除對話保留檔案-clearchannel-與-reset-鈕-resetmode.md)。錯誤出口沒有 PM 規格，來源是 [freyr-pm#331](https://github.com/asgard-ai-platform/asgard-freyr-pm/issues/331)。SSE 送出節奏（CLIENT-2）的來源是 [sdk-pm#87](https://github.com/asgard-ai-platform/asgard-sdk-pm/issues/87)。
- 優先順序：產品規則以 PM 規格為準。實際行為以程式為準。本章只記兩者都讀不出來的決定、差異與限制。

## 設計決定

| 編號 | 決定 | 類型 | 為什麼 | 出處 |
|---|---|---|---|---|
| CLIENT-2 | SSE 批次視窗只改變交出 frame 的時機，不合併同一則訊息的相鄰 delta。批次視窗是 `runSse` 收集 frame 再一起交出的時間，由 `delayTime` 設定。`onSseMessage` 照舊收到每一筆未修改的 frame。 | 刻意的行為 | 延遲來自計時器序列化，不是 reducer 跑了幾次。如果合併 delta，會改到公開的 `onSseMessage` 的語意，不然就得重排每筆 frame 的副作用。這兩種做法都換不到任何好處。 | 原 BUILD-068 |
| CLIENT-7 | 錯誤只交給 `onSseError`。SDK 不自己畫錯誤橫幅。送訊息、重設、還原、nudge、授權回覆五個入口都一致。 | PM 未定義、前端先決定 | `@asgard-js/react` 沒有自己的錯誤呈現面。如果硬做一個，消費端會得到一條無法套主題、也拿不掉的橫幅。 | 原 BUILD-074 |
| CLIENT-9 | `onAuthError` 標 `@deprecated`，並指向 `onSseError`。core 不補出 auth 形狀的錯誤。三個宣告處都標。不加執行期警告。 | PM 未定義、前端先決定 | `onSseError` 已經收得到每一個錯誤。補出 auth 形狀的錯誤是真正的實作工作，多一條平行的 callback 只是多一條要維護的路。如果只標公開的那一處，下次寫文件的人會照沒標的那份抄。函式庫不在消費端的 console 印東西（2026-09-02 定案）。 | 原 BUILD-077 |
| CLIENT-10 | 消費端的 `onSseError` 和 `onAuthError` 一律經 `notify` 呼叫。新增入口也一樣。不要在入口直接呼叫 callback。 | 刻意的行為 | 如果 callback 丟例外，run 的 promise 會永遠不 settle，composer 在整個掛載期間都不能用。完整理由在 `use-channel.ts` 的 `notify` 註解。 | 原 BUILD-074 |
| CLIENT-25 | `onAuthError` 和 `onSseError` 在每個入口各用一次 `notify` 呼叫。不要合成一次。 | 刻意的行為 | `onAuthError` 丟例外時，不能連帶吞掉 `onSseError`。所以五個入口看起來像重複的程式。不要把它們抽成共用的尾段。 | 原 BUILD-073、BUILD-074 |
| CLIENT-26 | run 到達終態時，後端關閉 GET rejoin 的連線。SDK 不必在終態時自己斷線。 | 理由 | `asgard-core` 對 `/message/sse` 帶 `stopOnTerminal=true`。dev 實測約 350ms 收到 EOF。遇到「rejoin 一直不結束」時，先查是不是拿到已釋放的 client（見 `use-asgard-service-client.ts` 的註解）。不要先假設後端把連線掛著。 | 原 BUILD-037 |
| CLIENT-27 | `<Chatbot>` 建好 channel 之後，`customChannelId` 改變不會換 channel。消費端要換 channel，就重掛 `<Chatbot>`。 | PM 未定義、前端先決定 | 初始化只在還沒有 channel 時執行。`customChannelId` 改變時，只會讓進行中的開啟流程作廢、不採用它的結果。第一方消費端換 channel 時都會重掛 `<Chatbot>`，所以 SDK 沒有做「換 id 就重建」。README 的 prop 說明沒有寫這一點。 | 原 REVIEW-096、BUILD-086 |

## 跟 PM 不一致的地方

無

## 已知限制

| 編號 | 限制 | 原因 | 待誰處理 |
|---|---|---|---|
| CLIENT-20 | `delayTime` 從 react 傳到 core 的過程沒有自動化測試。 | 這個值經過 `use-channel.ts` 裡的五個 `FetchSseOptions` 物件。如果之後重構漏掉其中一個，只有讀程式才看得出來。 | 需另立票 |
| CLIENT-21 | 在背景分頁量不到真實的批次延遲。 | Chrome 在隱藏的分頁把計時器夾到約 1Hz，批次視窗因此放大約 20 倍。量延遲必須在前景可見的分頁做。 | 不處理 |
| CLIENT-22 | auth 形狀錯誤的型別，在三處以 inline 型別重寫。 | 抽成共用型別，等於新增一個馬上要棄用的公開符號，所以刻意不做。這三處會隨 `onAuthError` 移除一起消失。 | 不處理 |
