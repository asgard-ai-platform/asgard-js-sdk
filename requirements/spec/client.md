# 連線、SSE run 與錯誤出口

代號 `CLIENT`。

## 範圍

- `@asgard-js/core`：`AsgardServiceClient`（`fetchSse`、`rejoinSse`、`channelMetadata`、`suspendChannel`、`deleteChannel`、`clearChannel`、`detach`、`close`）與 `Channel`（`sendMessage`、`reset`、`restore`、`nudge`、`stopGeneration`）。
- `@asgard-js/react`：`useAsgardServiceClient`、`useChannel`，以及 `<Chatbot>` 上與連線、錯誤有關的 props（`delayTime`、`onSseError`、`onAuthError`、`onSseMessage`）。
- PM：F-002、F-011、F-014、F-015、F-023、F-032、F-039（皆待驗收，見各列標記）；SSE 錯誤出口與批次視窗沒有 PM 票，來源是本 repo 的 issue（#459）與 freyr-pm#331、sdk-pm#87。
- 工具授權（consent）的回覆流程在 [consent.md](consent.md)；sandbox 相關的 client 方法在 [sandbox.md](sandbox.md)。

## 現行行為

### SSE 批次視窗

| 編號     | 項目            | 現行行為                                                                                                                                                                                                          |
| -------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CLIENT-1 | 批次視窗        | `runSse` 以 `bufferTime` 收集 frame，每個視窗（預設 `DEFAULT_SSE_BATCH_WINDOW_MS` = 50ms）關閉時把那一批**逐筆、依原順序**交出。SDK 加上的延遲最多一個視窗，與 frame 數量無關。`fetchSse`、`rejoinSse` 都走這條。 |
| CLIENT-2 | 每筆 frame 照舊 | 視窗只改時機，不合併、不改寫 frame：每一筆依序先呼叫 `onSseMessage`，再交給 `handleEvent`。消費端的 `onSseMessage` 收到的是完整、未修改的每一筆。                                                                 |
| CLIENT-3 | 調整視窗        | `FetchSseOptions.delayTime` 決定視窗長度；`0` 代表不等待。react 端由 `<Chatbot delayTime>`（經 `AsgardServiceContextProvider`）傳到每一次 SSE run（送訊息、重設、還原、nudge、授權回覆、rejoin）。                |
| CLIENT-4 | 結束時          | run 以完成、錯誤或使用者中止（停止生成）結束時，尚未送出的視窗會被送出或丟棄，結束之後不再發出任何 frame；`onRunSettled` 在每一種結束路徑都剛好觸發一次。                                                         |

### client 的生命週期（React）

| 編號     | 項目               | 現行行為                                                                                                                                                                                                                                                                                                             |
| -------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CLIENT-5 | StrictMode／重掛載 | `useAsgardServiceClient` 在 effect 的 cleanup 釋放 client（`keepConnectionOnUnmount` 時 `detach`，否則 `close`），在 setup 時若 client 已被釋放就重建一個。React 對同一元素跑 `setup → cleanup → setup`（StrictMode 開發模式每次掛載都會）時，消費端拿到的是可用的 client，不是已被釋放、會丟掉每一筆 frame 的那個。 |
| CLIENT-6 | 預覽模式           | `botProviderEndpoint: 'skip'`（預覽模式）時不建立 client、不開連線。                                                                                                                                                                                                                                                 |

### 錯誤出口

| 編號      | 項目                   | 現行行為                                                                                                                                                                                                                                                                                                                                          |
| --------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CLIENT-7  | 五個入口一致           | `useChannel` 的五個 SSE 入口——送訊息、重設（reset）、還原（restore）、nudge、工具授權回覆——失敗時都把錯誤交給消費端的 `onSseError`。nudge 只回報、不在畫面上呈現（它本來就是看不見的 turn）。                                                                                                                                                     |
| CLIENT-8  | auth 形狀的錯誤        | 錯誤帶有 `{ isAuthError, isBotProviderError }` 形狀時，先呼叫 `onAuthError`、再呼叫 `onSseError`；兩者分開保護，`onAuthError` 丟例外不會吞掉 `onSseError`。                                                                                                                                                                                       |
| CLIENT-9  | `onAuthError` 已棄用   | `ChatbotProps.onAuthError` 與另外兩個宣告處（`useChannel`、service context）都標 `@deprecated`，指向 `onSseError`，預定下一個 major 移除。執行期行為不變：第一方 `AsgardServiceClient` 從不產生 auth 形狀的錯誤（真的 401／403 以 `HTTP 403: Forbidden` 之類的一般錯誤到 `onSseError`），只有自訂 `IAsgardServiceClient` 丟出那個形狀時才會觸發。 |
| CLIENT-10 | 消費端 callback 丟例外 | 五個入口都經 `notify` 呼叫消費端的 `onSseError`／`onAuthError`：callback 丟出的例外被吞掉，run 照樣結束（`isConnecting` 回到 false、promise 會 settle），輸入框不會永久停用。                                                                                                                                                                     |

### 尚待 PM 驗收的連線行為

| 編號      | 項目                  | 現行行為                                                                                                                                                                                                                 |
| --------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| CLIENT-11 | 串流組裝健壯性        | 後端跳過 `start`／`delta` 直接送 `complete`、或續傳造成 frame 重複與亂序時，訊息不會倒退或重複；完成的訊息不會被晚到的 `start`／`delta` 改回進行中。（待驗收：BUILD-001）                                                |
| CLIENT-12 | 斷線續傳              | 以標準 `Last-Event-ID` 游標在串流中途透明重連；沒有游標時不重送。背景分頁的 `openWhenHidden` 與 `detach` 改為游標 rejoin 兩項延後，見 `requirements/tasks/FOLLOWUP-f002-background-tab-detach.md`。（待驗收：BUILD-002） |
| CLIENT-13 | transcript 冷啟動重播 | channel 已存在時，以空 `Last-Event-ID` 的 `GET /message/sse` 重播收合後的歷史（使用者與助理訊息），重播出的訊息與即時串流同形。（待驗收：BUILD-003）                                                                     |
| CLIENT-14 | 進房初始化            | 掛載到既有 channel 時不再無條件重設；`autoResetChannel` 依 channel metadata 決定要初始化、還原或重設。（待驗收：BUILD-017）                                                                                              |
| CLIENT-15 | 停止生成              | 停止鈕會呼叫 `suspendChannel` 讓後端真的中止背景 run，不只是停止接收；run 進行中 `sendMessage` 以 `ChannelBusyError` 拒絕。（待驗收：BUILD-030）                                                                         |
| CLIENT-16 | nudge 帶 payload      | `Channel.nudge()` 與送訊息一樣解析 payload 並經 `onBeforeSendMessage`，NUDGE turn 的 `prevPayload` 不再是空的。（待驗收：BUILD-032）                                                                                     |
| CLIENT-17 | run 進行中拒絕 nudge  | run 佔用 channel 時 `nudge` 以 `ChannelBusyError` 拒絕，與 `sendMessage` 相同。（待驗收：BUILD-033）                                                                                                                     |
| CLIENT-18 | 刪除與清除 channel    | `deleteChannel` 結束整個對話（transcript、blobs、sandbox、Channel Home 一起清掉）；`clearChannel` 只清對話、保留檔案；`Channel.reset` 依重設模式選其中一種。（待驗收：BUILD-071、BUILD-072、BUILD-094）                  |

## 設計決定

| 決定                                                                            | 理由                                                                                                                                                                                                           | 出處                            |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| 逐筆 `concatMap + delay` 改成時間窗 `bufferTime`                                | 逐筆延遲是嚴格序列化，成本隨 frame 數累加：一張 2.6KB 的畫布有 372 筆 token 級 delta，舊做法光 SDK 就墊 19 秒。時間窗保留「不要一次 flush 幾百次 render」的用意，延遲卻與筆數無關                              | 原 BUILD-068                    |
| 不在視窗內合併同一則訊息的相鄰 delta                                            | 延遲來自計時器序列化，不是 reducer 跑幾次；合併會改到公開 `onSseMessage` 的語意，或要重排 `channel.ts` 每筆 frame 的副作用，換不到任何東西                                                                     | 原 BUILD-068 R1（撤回）         |
| `onAuthError` 選擇「廢它」而不是「在 core 填出 auth 形狀」                      | `onSseError` 已經收得到每一個錯誤；填出那個形狀是真正的實作工作（辨識 401／403 與 bot provider 初始化失敗），多一條平行的 callback 只是多一條要維護的路                                                        | 原 BUILD-077（2026-09-02 定案） |
| 棄用不加執行期警告                                                              | 函式庫不在消費端 console 印東西；而且接了這個 prop 的人本來就收不到任何呼叫，警告會出現在一個什麼都沒發生的地方                                                                                                | 原 BUILD-077                    |
| 三個 `onAuthError` 宣告處都標 `@deprecated`，即使只有 `ChatbotProps` 是公開 API | README 當初就是照其中一個宣告寫的；只標公開那個，下一次寫文件的人照樣會從沒標的那份抄。README 與型別的一致性由測試釘住                                                                                         | 原 BUILD-077                    |
| 錯誤只交給 `onSseError`，SDK 不自己畫錯誤橫幅                                   | `@asgard-js/react` 沒有自己的錯誤呈現面；硬做一個是消費端無法套主題、也拿不掉的橫幅                                                                                                                            | 原 BUILD-073、BUILD-074         |
| 消費端 callback 一律經 `notify` 呼叫                                            | core 在 `settleRun()` 與 `reject()` **之前**呼叫 `onSseError`；callback 丟例外會讓 promise 永遠不 settle、`isConnecting` 停在 true，輸入框在整個掛載期間都不能用。送訊息與還原兩條路原本也有這個問題，一併收進 | 原 BUILD-074                    |

## 已知限制與未交付

| 項目                                                 | 說明                                                                                                                 | 交接                          |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `delayTime` 從 react 傳到 core 沒有自動化測試        | 值經過 `use-channel.ts` 裡五個 `FetchSseOptions` 物件；之後重構漏掉其中一個，只有讀程式才看得出來                    | 需另立票                      |
| 背景分頁量不到真實延遲                               | Chrome 在隱藏分頁把計時器夾到約 1Hz，`bufferTime` 的視窗因此被放大約 20 倍；量測 CLIENT-1 的延遲必須在前景可見分頁做 | —（量測注意事項）             |
| `AuthShapedError` 的形狀在多處以 inline 型別重寫     | `use-channel.ts`、service context、`chatbot.tsx` 各寫一次；抽成共用型別等於新增一個馬上要棄用的公開符號，刻意不做    | 隨 `onAuthError` 移除一起消失 |
| demo `/nudge-payload` 的註解仍寫「後端會拒絕 NUDGE」 | 實測 dev bot 連續兩次 nudge 都成功；那段註解是舊的 BUG-005 前提                                                      | 需另立票                      |

## 程式位置

- core：`packages/core/src/lib/client.ts`（`runSse`、`DEFAULT_SSE_BATCH_WINDOW_MS`）、`packages/core/src/lib/channel.ts`（`buildRunHandlers`、`settleRun`）、`packages/core/src/types/client.ts`（`FetchSseOptions`）
- react：`packages/react/src/hooks/use-asgard-service-client.ts`、`packages/react/src/hooks/use-channel.ts`（`notify`、`asAuthShapedError`）、`packages/react/src/context/asgard-service-context.tsx`、`packages/react/src/components/chatbot/chatbot.tsx`（`ChatbotProps`）
- 測試：`packages/core/src/lib/sse-pacing.spec.ts`、`packages/react/src/hooks/use-asgard-service-client.spec.ts`、`packages/react/src/hooks/sse-error-exits.spec.tsx`
