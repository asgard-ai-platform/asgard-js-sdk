# 對話內容：訊息模型與 thread 呈現

代號 `CONVO`。

## 範圍

- `@asgard-js/core`：`Conversation` reducer（訊息、thinking、tool-call、subagent 的折疊）、`reduceSubagents`、`reduceTaskEvents`、衍生 store（`conversationToSubagentEvents` 等）。
- `@asgard-js/react`：thread 內的訊息呈現——文字訊息、錯誤泡泡、tool-call 群組、subagent／task 面板、run 進行中指示、spinner，以及給自組訊息列用的 `BotMessageText`、`UserMessageText`、`Time`、`TemplateBox`。
- PM：F-001、F-003 ～ F-014、F-016、F-017、F-028 ～ F-030、F-033、BUG-001、BUG-003、BUG-007、heimdall-pm#200、sindri-pm#142、freyr-pm#740／#815。已驗收的列沒有標記，其餘標「待驗收」。
- 使用者訊息上的附件 chip 在 [attachments.md](attachments.md)；版面寬度與文字換行在 [layout.md](layout.md)。

## 現行行為

### 自組訊息列

| 編號    | 項目              | 現行行為                                                                                                                                                                                                                                                                                                            |
| ------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CONVO-1 | `BotMessageText`  | 從套件入口匯出。只畫機器人文字的內容——`.text .text--bot` 外框包住 `StreamdownClient`（markdown 與串流）——不含頭像、時間與 `TemplateBox`；顏色與背景讀 theme context。預設的 `TextTemplate` 也用它畫機器人文字，輸出與自組結果相同。                                                                                 |
| CONVO-2 | `UserMessageText` | 從套件入口匯出，`children` 是 `ReactNode`（自組使用者訊息的目的就是放 JSX，例如把開頭的 `@mention` 畫成 chip）。畫 `.text .text--user` 泡泡：theme 的 `userMessage.color`／`backgroundColor`、`8px 12px` 內距、`8px` 圓角且右上角是直角、最寬 75%；不含 `TemplateBox`、`Time` 與外距。                              |
| CONVO-3 | `Time`            | 與 `TimeProps` 一起從套件入口匯出，輸出與預設訊息列的時間相同（同一個 `formatTime`、`asgard-time` class、`template.time.style` 顏色）；沒傳 `time` 時不畫任何東西。                                                                                                                                                 |
| CONVO-4 | 組回預設的樣子    | 在 `renderMessageContent` 回傳 `<TemplateBox type="user" direction="horizontal"><UserMessageText>…</UserMessageText><Time time={…} /></TemplateBox>`，畫面與預設的使用者訊息列相同（靠右、泡泡、時間），只差自訂的內容。`MessageContainer` 依 `message.type` 回傳對應的外框（機器人、靠右的使用者、其他原樣傳過）。 |

### run 進行中與 spinner

| 編號    | 項目                 | 現行行為                                                                                                                                                                                                                                                                                |
| ------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CONVO-5 | run 進行中指示的位置 | 指示線是 chat column grid 的獨立一列（`header / thread / menu / seam / footer` 五列），由 `RunIndicatorSlot` 畫在 footer slot **之前**，不屬於 `ChatbotFooter`。所以 consumer 用 `renderFooter` 換掉整個 footer，指示線仍在它正上方；沒有自訂 footer 時位置與外觀不變。指示線只畫一次。 |
| CONVO-6 | 指示線的動態         | 綁整條連線的 `isRunning`：run 進行中掃動，到終止事件停成靜態的一條線。transcript 重播不算 run。（綁連線與移到交界處的規格本身待驗收：BUILD-005）                                                                                                                                        |
| CONVO-7 | docked 面板的位置    | 有 task／subagent 面板時，它在指示線的正上方，不在下方也不重疊。（面板移出 thread 捲動區的部分待驗收：BUILD-031）                                                                                                                                                                       |
| CONVO-8 | spinner 同相位       | SDK 內所有 loading spinner 共用同一個相位來源：`useSyncedSpin` 以 Web Animations API 旋轉並把 `startTime` 釘在 0（document timeline 原點），所以不論何時掛載，同一瞬間的角度都相同。週期一律 1 秒線性；`Spinner` 元件包著這個 hook，附件縮圖的環形進度直接用 hook。                     |
| CONVO-9 | spinner 的例外狀況   | `prefers-reduced-motion: reduce` 時所有 spinner 都不轉。執行環境沒有 `Element.animate`（例如 jsdom）時靜態顯示、不丟例外。卸載時取消動畫，不在 timeline 上留下 `Animation`。原始碼裡沒有各元件自己的 spin `@keyframes`。                                                                |

### 錯誤泡泡

| 編號     | 項目       | 現行行為                                                                                                                                                                                                                                              |
| -------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CONVO-10 | 摘要與展開 | 錯誤泡泡收合時摘要最多兩行；展開「Show more」後摘要不再截斷，下方是 `JSON.stringify(details, null, 2)` 的完整內容（換行轉成字面 `\n`，所以多行 stack 會變成一長行），區塊最高 280px、超過在泡泡內捲動。`message` 也留在這段內容裡，方便整段貼進回報。 |
| CONVO-11 | 無障礙     | 每個「Show more」的無障礙名稱帶著該錯誤的摘要（`Show more: …`），展開時以 `aria-controls` 指向它控制的區塊。thinking 區塊的標頭與內層「show more」也有 `aria-expanded`。收合時區塊被卸載，所以 `aria-controls` 只在展開時存在。                       |

### tool-call 與 subagent 的資料

| 編號     | 項目                         | 現行行為                                                                                                                                                                                                                                                                                                                                                                                              |
| -------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CONVO-12 | 只收到 complete 的 tool-call | `tool_call.complete` 到達時若沒有對應的 `start`（GET rejoin 只重播終態 frame），以 complete frame 本身建立 tool-call 訊息，內容與 live 時相同；已經是終態的 tool-call 不會被晚到的 `start` 改回進行中。                                                                                                                                                                                               |
| CONVO-13 | subagent 恢復執行            | `reduceSubagents` 承認「有新活動就是又在跑」：已終態的 subagent 再收到 `subagentStart`（同一 turn 內恢復），或收到子 tool-call 的 `toolStart`（跨 turn 恢復，後端不發任何 lifecycle event），狀態回到 `running`，新的工具放在同一張卡上，並清掉上一次的 `summary`。之後的 `complete` 決定最後狀態；重放同一串事件得到相同結果。                                                                       |
| CONVO-14 | lifecycle 的到達順序         | `conversationToSubagentEvents` 讓同一個 `parentToolUseId` 第二次出現的 `subagent.start`／`complete` 依真實到達順序排在子 tool-call 之間；thread 的呈現不受影響（subagent lifecycle 訊息本來就不畫在 thread）。                                                                                                                                                                                        |
| CONVO-15 | 子 tool-call 的結果          | `SubagentToolCall` 帶 `result`（frame 的 `toolCallResult`）與 `sidecar`（frame 有 `toolUseResultSidecar` 時），原樣交出：不截斷、不遮蔽、不改型別，與 `ConversationToolCallMessage.result` 是同一個物件參照。進行中時 `result` 為 `undefined`；完成但結果為空時是 `{}`。重播與 live 推導出相同結果。`subagents$` 在結果改變時發出新值，其他無關的訊息 delta 不觸發。`<SubagentList>` 不畫這兩個欄位。 |

### 尚待 PM 驗收的呈現

| 編號     | 項目                     | 現行行為                                                                                                                                                                                                                                             |
| -------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CONVO-16 | thinking 訊息            | `asgard.message.thinking.*` 畫成獨立、可收合的區塊，完成後標題固定。（待驗收：BUILD-004）                                                                                                                                                            |
| CONVO-17 | tool-call 呈現           | 內建工具（Bash／Read／Write／Edit／Skill／WebFetch／WebSearch）以合成的標籤與圖示呈現；連續的 tool-call 分組並顯示動態摘要；Write／Edit 顯示 `+/-` 行數；展開後是 Initial 與 Result；失敗以後端的 `isError` 判定。（待驗收：BUILD-006 ～ BUILD-011） |
| CONVO-18 | task 與 subagent 面板    | `TaskCreate`／`TaskUpdate` 累積成一份目前的 task 清單；`Agent` tool-call 與 `subagent.*` 累積成 subagent 清單；兩者以 framework-agnostic 的 store 對外提供。（待驗收：BUILD-012 ～ BUILD-014）                                                       |
| CONVO-19 | 隱藏 subagent 自己的訊息 | `parentToolUseId` 非空的 message／thinking frame 不畫在主對話。（待驗收：BUILD-020）                                                                                                                                                                 |
| CONVO-20 | channel 標題             | `channelTitle$` 提供動態標題（metadata 與 `asgard.channel.title.update`），畫在 thread 頂端並可自訂 renderer。（待驗收：BUILD-015、BUILD-016）                                                                                                       |
| CONVO-21 | 下一句建議               | `asgard.prompt_suggestion` 顯示在 composer 的 placeholder，可按 Tab 採用。（待驗收：BUILD-051）                                                                                                                                                      |
| CONVO-22 | 問卷卡                   | `QUESTION` 訊息畫成可填寫的單選／複選卡片。（待驗收：BUILD-052）                                                                                                                                                                                     |
| CONVO-23 | 畫布卡片                 | canvas 串流事件折疊進對話狀態，以 sandboxed iframe 串流渲染。（待驗收：BUILD-055、BUILD-056）                                                                                                                                                        |
| CONVO-24 | 回應評價                 | 每則助理回覆可按 👍／👎 並選填原因；已評狀態從伺服器重播還原。（待驗收：BUILD-078）                                                                                                                                                                  |
| CONVO-25 | `file://` 連結           | 回覆裡的 `[檔名](file://…)` 顯示為可複製的路徑，不再是「檔名 [blocked]」。（待驗收：BUILD-099）                                                                                                                                                      |

## 設計決定

| 決定                                                                                                    | 理由                                                                                                                                                        | 出處                    |
| ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| 匯出內容元件讓 consumer 自組訊息列，不加 `hideAvatar` 之類的開關 prop                                   | 開關 prop 已被明確排除，方向是「讓 consumer 自己客製訊息」；外框（`TemplateBox`）本來就公開，缺的只是有主題的內容                                           | 原 BUILD-026、BUILD-042 |
| 不預設拿掉 SDK 的頭像與時間                                                                             | `asgard-embed-frontend` 刻意傳 `avatar`，拿掉會造成回歸                                                                                                     | 原 BUILD-026            |
| run 指示線提到 chat column，不放在 footer 裡                                                            | 它綁的是整條連線的狀態，語意上屬於 chat column 的版面；放在 footer 裡會被 `renderFooter` 一起換掉（heimdall-pm#200 就是這樣中招）                           | 原 BUILD-034            |
| `RunningIndicator` 不加進公開匯出                                                                       | 指示線已經在所有 footer 路徑上都出現，consumer 不需要自己掛                                                                                                 | 原 BUILD-034            |
| spinner 用 Web Animations API 並固定 `startTime`，不用 CSS animation                                    | CSS animation 從各自掛載的那一刻起算，沒有共同的時間原點；滿畫面不同相位的 spinner 看起來像在扭動（BUG-007）                                                | 原 BUILD-050            |
| reduced-motion 一律停轉（chat-header 原本是減速到 2s）                                                  | 規格〈修復方向〉要求把停轉統一收進 Spinner；計畫階段已確認                                                                                                  | 原 BUILD-050            |
| 錯誤細節保留 `message`、區塊上限 280px                                                                  | 細節的用途是一整段貼進回報，為了省三行拿掉欄位反而違背用途；280px 讓 demo 三個案例都不必捲動，數 KB 的 `inner` 仍在泡泡內捲動                               | 原 BUILD-063            |
| subagent 結果原樣交出，欄位名跟 `ConversationToolCallMessage` 一致（`result`／`sidecar`），不跟 wire 名 | 遮蔽與截斷已裁決歸呈現端；同一個值在兩個 SDK 型別上叫兩個名字，會讓人以為是兩種東西                                                                         | 原 BUILD-083            |
| 以 complete frame 直接建立 tool-call，並加上終態保護                                                    | complete frame 已帶 `start` 用到的所有欄位；建立之後「完成卻沒看過 start」變得可能，所以晚到的 `start` 不能把它改回進行中（會丟掉結果、讓 task 清單少一筆） | 原 BUILD-036            |

## 已知限制與未交付

| 項目                                              | 說明                                                                                                                                                                 | 交接                            |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| 重播出的 tool-call 時間是「現在」                 | 不是原始時間，所以跨 rejoin 以 `time` 排序不準。畫面依串流順序與 `${processId}-${callSeq}` 排列，目前看不出差異                                                      | 需要依時間排序時再處理          |
| 跨 turn 恢復的 subagent 結束後不會回到終態        | 後端在跨 turn 恢復全程不發 lifecycle event，包括結束時的 `subagent.complete`，卡片在那個 turn 之後一直顯示 running                                                   | 後端（asgard-core）             |
| 冷啟動重播出的 subagent 卡片缺資料                | 重播不含 subagent lifecycle event，只由子 tool-call 重建的卡片沒有 `subagentType`／`description`，而且一直顯示 running                                               | 後端決定 history 帶什麼         |
| `Subagent.status` 不再單調收斂                    | 可以由終態回到 `running`，且 `summary` 會被清成 `undefined`。簽章沒變；把「出現終態」當一次性事件的消費端行為會變                                                    | 發版 changelog 要點名           |
| 自組列不帶 `asgard-text-template--user` class     | 那是 `TextTemplate` 自己掛的 global class；`BotMessageText` 也一樣。消費端要對這個 class 下樣式得自己掛                                                              | —                               |
| 非 TEXT 的訊息類型仍自己畫頭像或時間              | 圖片、輪播、附件自己畫頭像，表格、圖表帶時間；不在自組列的範圍                                                                                                       | 需另立票                        |
| `location` 欄位的假設沒有對真實流量驗證過         | 錯誤泡泡的 `location` 判斷只依 fixture 寫成；若真實的 `asgard.run.error` 總是帶 `location`，「沒有細節就不顯示 Show more」的分支在正式環境就不會發生。程式註解已寫明 | 取得真實流量時重看              |
| 收合時 `aria-controls` 不存在                     | 區塊收合時被卸載，懸空的 IDREF 比沒有更糟；要無條件帶，就得讓每個錯誤泡泡都掛著 JSON 內容                                                                            | —                               |
| tool-call 群組與檔案總管的 spinner 未在瀏覽器實測 | 兩者的 loading 在 demo 中是瞬時的；依據是 scss 原文核對、型別檢查與測試                                                                                              | 需要能停在 pending 的 demo 路由 |

## 程式位置

- core：`packages/core/src/lib/conversation.ts`（`onToolCallComplete`、`isTerminalToolCall`）、`packages/core/src/lib/subagent-reducer.ts`、`packages/core/src/lib/derived-stores.ts`、`packages/core/src/lib/task-reducer.ts`
- react：`packages/react/src/components/templates/text-template/`（`bot-message-text.tsx`、`user-message-text.tsx`、`text-template.tsx`）、`packages/react/src/components/templates/time/`、`packages/react/src/components/templates/hint-template/`、`packages/react/src/components/chatbot/running-indicator/`、`packages/react/src/components/spinner/`、`packages/react/src/hooks/use-synced-spin.ts`
