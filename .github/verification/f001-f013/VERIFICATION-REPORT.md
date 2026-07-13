# F-001 ~ F-013 驗測報告

**日期**：2026-07-13 · **分支**：`main`（`3a5b353`，PR #280 merged）· **對照設計稿**：chat-kit prototype（`5480a67`, http://localhost:5173）

## 方法（三層）

1. **自動測試**（正確性底層）：`npx vitest run packages/core` → **27/27 綠**（`conversation.spec` 20 + `derived-state.spec` 7）。
2. **互動實測**（mock，自給自足）：`/subagent`（一次串流跑完 thinking→toolcalls→tasks→subagent→answer）+ `/tool-call`（狀態切換、展開）+ 特殊輸入（`drop` 觸發斷線續傳）。
3. **設計對照**：與 chat-kit prototype 逐 block 比對。

## 逐條結果

| F#                                 | PM 驗收重點                                                                                                                                    | 方法              | 結果                                 | 證據                                                                                                                                                                                                              |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **F-001** thinking                 | 串流「Thinking…」/ 完成固定文案「Thought for a moment」（不顯秒數）/ 可展開看全文                                                              | 互動              | ✅                                   | GIF（串流態）+ `subagent-full-pipeline-zhTW.png`（收合固定文案 + 展開全文）                                                                                                                                       |
| **F-002** 斷線續傳                 | 已建 cursor 後中途斷 → Last-Event-ID 原生續傳、不漏不重；無 cursor 不重送                                                                      | 互動（`drop`）    | ✅                                   | `f002-drop-resume-intact.png`（drop 後答案完整；console 僅 `ERR_INCOMPLETE_CHUNKED_ENCODING` = 誘發的斷線本身，已自動復原）；UC-004 由 `client.spec`/mock `fail` 覆蓋                                             |
| **F-003** run 指示綁連線           | 綁 `isConnecting`、移到 thread↔ 輸入交界、不閃爍、run 中禁送                                                                                   | 互動 + REVIEW-004 | ✅                                   | 交界指示線（GIF）；`isConnecting` 綁定見 `use-channel.ts`                                                                                                                                                         |
| **F-004** 內建工具 variants        | reason→ 合成 →toolName 優先序；七個 native 專屬 icon                                                                                           | 互動              | ✅                                   | `subagent-full-pipeline-zhTW.png`（Read/Write/Edit/WebFetch/Skill 各自 icon + 合成標籤）                                                                                                                          |
| **F-005** i18n                     | `locale` prop、catalog、fallback en-US、Bash description 不譯                                                                                  | 互動              | ✅                                   | zh-TW 標籤全鏈（讀取/搜尋/執行 skill/任務清單/子代理）                                                                                                                                                            |
| **F-006** 分組 + summary           | `{n} steps · Used {s} skills · Processed {f} files`、0 段隱藏、localized                                                                       | 互動              | ✅                                   | 「6 個步驟 · 使用 1 個 skill · 處理 3 個檔案」                                                                                                                                                                    |
| **F-007** diff + 統一狀態          | Write `+n`、Edit `+/−` LCS、completed 無標記 / running 琥珀 / error 紅 alert                                                                   | 互動              | ✅                                   | `+5`、`+2 −1`；`f007-error-status-red-alert.png`（Error→ 紅 alert，siblings 乾淨）                                                                                                                                |
| **F-008** 展開 Initial/Result      | 有內容可展開，顯示 Initial + Result 兩區，標題 i18n                                                                                            | 互動              | ✅                                   | `f008-tool-expand-initial-result.png`（validate_query → Initial 輸入 JSON + Result `{valid,estimatedRows}`）                                                                                                      |
| **F-009** isError                  | error 狀態改由後端 `isError` 驅動；`result.error` 舊啟發式作 fallback；缺 →completed                                                           | 互動 + EXT-003    | ✅                                   | 擷取 api.example.com 紅 alert（mock `isError:true` 驅動）                                                                                                                                                         |
| **F-010** task check list          | 三態渲染 + id 取 `sidecar.task.id`、狀態以 `sidecar.statusChange.to` 為權威（parameter fallback）                                              | 互動 + 後端契約   | ✅（`fix/f010-task-sidecar` 修復後） | `f010-tasks-via-sidecar.png`：subject 來自 `sidecar.task.subject`、completed/in_progress 來自 `sidecar.statusChange.to`、activeForm 來自 `parameter`；`reduceTasks` 4 筆 sidecar 單元測試綠。EXT-002 已解 —— 見下 |
| **F-011** 組裝健壯性               | complete 自足 / 容忍缺前綴 / 終態防回退 / 4 序列 ×（message+thinking）單元測試                                                                 | 自動              | ✅                                   | `conversation.spec.ts`：only-complete / delta-before-start / start&delta-after-complete / duplicate-complete，message + thinking 各一組，20/20 綠                                                                 |
| **F-012** subagent list            | 路由排除 / `subagent.complete` 驅動狀態（非 Agent tool_call）/ replay-safe / 疊在 Task 之上 / 全 terminal 自動收合                             | 互動 + 自動       | ✅                                   | `子代理 2/2` 疊於任務清單上、collapse；`start-after-complete` replay-safe 單元測試（derived-state/conversation spec）                                                                                             |
| **F-013** framework-agnostic store | reducers 進 core / 掛 `ChannelStates` / `tasks$`·`subagents$` distinct / `getSnapshot`+`subscribe` / `useSyncExternalStore` / 不出 delta event | 互動 + 自動       | ✅                                   | DerivedStateMirror `useTaskList()→1/3 · useSubagents()→2/2` 與內建面板一致；`derived-state.spec` 7 綠                                                                                                             |

## 結論

**13 / 13 符合 PM 驗收條件**（F-010 的 sidecar gap 已在 `fix/f010-task-sidecar` 修復）。

### EXT-002 —— F-010 未讀後端 task sidecar → 已修復（`fix/f010-task-sidecar`）

- **PM 要求**（F-010 驗收）：`id 取 sidecar.task.id`；`TaskUpdate 狀態以 sidecar.statusChange.to 為權威（parameter.status fallback）`。
- **現況**：`reduceTasks` 只從 `parameter` 讀 `id`/`status`/`subject`（當初 inferred fallback，因 sidecar 未落地）。
- **後端契約（已查 `asgard-core@dev-1.16.19` `internal/models/edgeserver.go:165-182`）**：`tool_call.complete` 事件帶 **`toolUseResultSidecar`**：
  - `TaskCreate → { task: { id, subject } }`
  - `TaskUpdate → { taskId, statusChange, ... }`
- **影響**：demo mock 自洽故畫面正常，但**接真實後端**時 TaskUpdate 的權威狀態在 sidecar，不在 parameter → 現況會漏讀。
- **修法（已完成，`fix/f010-task-sidecar` ← main）**：
  - `sse-response.ts` 新增 `ToolUseResultSidecar` 型別 + `ToolCallCompleteEventData.toolUseResultSidecar`；
  - `channel.ts` `ConversationToolCallMessage` 加 `toolUseResultSidecar`；`conversation.ts` `onToolCallComplete` 帶入；
  - `derived-state.ts` `reduceTasks` 改 sidecar-first（`sidecar.task.id`/`taskId`/`statusChange.to`）、`parameter` fallback；
  - demo mock task 事件補 `toolUseResultSidecar`；`derived-state.spec` +4 sidecar 單元測試（11/11 綠）。
  - 消費端零改動；舊 frame（無 sidecar）走 parameter fallback、行為不變。

> 其餘背景項：**EXT-003**（F-012 subagent 契約）已對 `asgard-core@dev-1.16.19` 逐欄確認、**已關**。F-002 的「背景分頁 drop/resume + `openWhenHidden` 回預設 + `detach→GET rejoin`」當初 defer 待 real-backend 回歸；F-015 已補 GET rejoin transport，可回頭做。
