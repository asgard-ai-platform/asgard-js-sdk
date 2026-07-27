# Task Index

## Config

- SPEC_DIR: `references/asgard-sdk-pm/tracking/asgard-js-sdk`
- framework_profile: `ts-library-nx-vite`
- ui_stack: `react-component-lib`

> Static reference (not a running server): `references/asgard-chat-kit-prototype` (chat kit prototype). The spec source of truth is SPEC_DIR (`features/` + `use-cases/` + `tasks/`) linked from a PM issue on `asgard-sdk-pm`. See `requirements/_index.md` → "Working from a PM issue".

## Convention

- Executable task specs (Single-file SDD) live here as `TASK-*.md`. Create new tasks from `_template.md`. Per-issue cycles use the `BUILD-*` / `REVIEW-*` pair (`_build_template.md` / `_review_template.md`).
- Each task spec has `Meta`, `1) Requirements`, `2) Design`, `3) Implementation Tasks`, `4) Execution Log / Change Log`; acceptance criteria use EARS `R#` and map to implementation tasks + an Acceptance Test Matrix.
- Full rules: `docs/spec-driven-development.md`.

## Status Legend

- `draft` — 撰寫中，尚未定案。
- `ready` — 規格完成、通過 readiness gate，可被指派實作（需使用者明確指示才開工）。
- `in-progress` — 實作進行中。
- `done` — 驗收條件達成、驗證完成。

> 一律使用 `in-progress`（連字號），**禁止**使用 `in_progress`（底線）。Task spec 的 `Meta` status 與本表必須同步更新。

## Covered Specs

- `F-011` message 與 thinking 串流組裝健壯性 (UC-017, UC-018) → BUILD-001 / REVIEW-001 (done, **merged to main** via PR #291). Scope: message assembly only; thinking delegated to F-001.
- `F-002` Last-Event-ID 斷線續傳 (UC-003 透明續傳, UC-004 無 cursor 不重送) → BUILD-002 / REVIEW-002 (done, **merged** via PR #292). R4/R5 deferred (dev backend).
- `F-014` transcript 冷啟動重播內核 + message.user (UC-023) → BUILD-003 / REVIEW-003 (done, **merged to main** via PR #293). Phase 0 prerequisite for F-015/F-016. Depends F-002 (GET transport) + F-011 (complete assembly).
- `F-001` thinking message 顯示 (UC-001 串流、UC-002 完成) → BUILD-004 / REVIEW-004 (done, **merged to main** via PR #294). roadmap ② 顯示層第一張。Depends F-011 (assembly robustness). 完成態固定「Thought for a moment」不計耗時（EXT-001 已取消）。
- `F-003` run 進行中指示改綁連線並移至輸入交界 (UC-005 呈現、UC-006 移除舊 typing) → BUILD-005 / REVIEW-005 (done, **merged to main** via PR #295). roadmap ② 顯示層第二張。React-only（綁既有 `isConnecting`，不動 core）。清掉 BotTypingPlaceholder + 三點 + 500ms debounce，保留 `typingText` 串流文字。
- `F-004` 內建工具 tool-call variants 顯示與 label 合成 (UC-007; pinned spec §1–§3) → BUILD-006 / REVIEW-006 (done, **merged to main** via PR #296). roadmap ③ tool-call 一叢第一張。React-only。顯示序 `reason → 合成 → toolName`；native 七工具 variant icon（對齊 lucide 0.487.0）+ 合成（en-US；i18n locale 歸 F-005）；不動 core。
- `F-005` tool-call i18n locale prop (UC-008; pinned spec §3) → BUILD-007 / REVIEW-007 (done, **merged to main** via PR #297). roadmap ③ 第二張。React-only。`<Chatbot>` 加 `locale` prop（default en-US）→ AsgardTemplateContext → 把 F-004 的 `EN_LABEL` 換成 catalog + `t()`（en/ja/zh）；Bash description 不翻；不動 core。**自製 catalog、零外部套件**（未用 Tolgee/i18next）。
- `F-006` tool-call 分組與 group summary (UC-009/UC-010; pinned spec §4/§5) → BUILD-008 / REVIEW-008 (done, **merged to main** via PR #298). roadmap ③ 第三張。React-only。動態 summary `{n} steps · Used {s} skills · Processed {f} files`（localized、s/f=0 隱藏）取代靜態「Answer preparation steps」；分組已由 groupMessages 達成，加 `summary.*` catalog key；不動 core。
- `F-007` Write/Edit diff 與統一狀態呈現 (UC-011/UC-012; pinned spec §6/§3.5) → BUILD-009 / REVIEW-009 (done, **merged to main** via PR #299). roadmap ③ 第四張。React-only。Write=`+content 行數`、Edit=old↔new 行級 LCS 概算 `+/-`（右側）；狀態 completed 不加標記 / running 琥珀 spinner / error 紅 alert；不動 core（IsError 判定另案 F-009）。
- `F-008` tool-call 展開內容對齊 Initial/Result (UC-013; pinned spec §8) → BUILD-010 / REVIEW-010 (done, **merged to main** via PR #300). roadmap ③ 第五張。React-only。展開 Initial/Result JsonViewer 已存在，本張把標題 localize（加 `expand.*` catalog key、locale 串進 ToolCallGroup）；無內容不顯示 chevron；不動 core。
- `F-009` tool-call 失敗判定改用後端 isError (UC-014; pinned spec §7) → BUILD-011 / REVIEW-011 (done, **merged to main** via PR #301). roadmap ③ 第六張（最後）。**動 core**：SSE `ToolCallCompleteEventData` + `ConversationToolCallMessage` 加 `isError?`、`onToolCallComplete` 帶入；react status 用 `isError`（涵蓋 native/platform/general）、`result.error` 留 fallback。後端契約已在（go SDK）。**roadmap ③ 至此完結**。
- `F-010` Task Check List 面板（TaskCreate/TaskUpdate 累積） (UC-015/UC-016; pinned spec @ `4b879b7`) → BUILD-012 / REVIEW-012 (done, **merged to main** via PR #302). roadmap ④ 第一張。**動 core**：SSE `ToolCallCompleteEventData` 加 `toolUseResultSidecar?`、`ConversationToolCallMessage` 加 `sidecar?`；core 新增 framework-agnostic `isTaskTool` + `reduceTaskEvents` + `Task`/`TaskStatus`（資料層 SoT，為 F-013 泛化 store 鋪路）。react：`groupMessages` 把 task 工具攔出群組、新 docked `<TaskList>`（三態、activeForm、可展開、header 計數）置於 RunningIndicator seam 之上、`task.*` i18n。
- `F-012` Subagent 清單面板（Agent tool-call + subagent._） (UC-019/UC-020; pinned spec @ `f73545c`) → BUILD-013 / REVIEW-013 (done, **merged to main** via PR #303). roadmap ④ 第二張。**動 core 較多**：新 `SUBAGENT_START/COMPLETE` 事件 + Fact；`toolUseId?`/`parentToolUseId?` 上 tool-call wire 型別 + `ConversationToolCallMessage`；新 `ConversationSubagentMessage` 變體 + `onSubagentStart/Complete`；core 新增 framework-agnostic `isAgentTool`/`isSubagentChildTool`/`reduceSubagents` + `Subagent`/`SubagentStatus`/`SubagentEvent`。**關鍵**：subagent 狀態只由 `subagent.complete` 驅動，非 Agent 的 tool_call.complete（async_launched 早退）。react：`groupMessages` 再排除 Agent + child 工具、新 docked `<SubagentList>`（疊在 TaskList 之上、自動收合、current-tool/tool-count、展開 child 工具）、`subagent._`i18n。**順修 i18n bug**：footer 移進`AsgardTemplateContextProvider`（一併修好 F-010 TaskList i18n）。
- `F-013` 衍生狀態以 framework-agnostic store 對外暴露 (UC-021/UC-022; 純資料層、無 prototype) → BUILD-014 / REVIEW-014 (done, **merged to main** via PR #304). roadmap ④ 第三張（最後，④ 收尾）。core：`deriveTasks`/`deriveSubagents`（把 react `conversationToSubagentEvents` adapter 搬進 core）+ `tasksEqual`/`subagentsEqual` + `createDerivedStores(conversation$)`（BehaviorSubject + `distinctUntilChanged`）；`Channel` 加 `tasks$`/`subagents$` + snapshot accessor；`ChannelStates` 加 `tasks`/`subagents`。react：`useTaskList`/`useSubagents`（`useSyncExternalStore`），footer 改用共用 derive helper。docs 示範 Vue/Svelte/Angular/vanilla。**決策**：暴露 store（快照+訂閱），不出 delta event。
- `F-016` channel title 動態狀態與 title.update 事件 (UC-027; 純資料層、UI 為 F-017) → BUILD-015 / REVIEW-015 (done, **merged to main** via PR #305). roadmap ⑤ 第一張。core：新 `ChannelTitleUpdateEventData` + Fact；`Channel` 加 `channelTitle$`（BehaviorSubject + distinctUntilChanged）+ `getChannelTitle()`、消費 `asgard.channel.title.update`、`ChannelStates` 加 `channelTitle`、`ChannelConfig.channelTitle` seed。**關鍵**：title 放 `Channel`（seed + live 更新），非 conversation 衍生 —— 因 title.update ephemeral、rejoin 重播不含它（replay-safe）。react：`useChannelTitle`。**F-015 seed 串接押後**（本張只提供 seed slot）。
- `F-017` channel title 顯示 UI 與客製 renderer (UC-028; UI 權威=pinned prototype @ `5480a67`) → BUILD-016 / REVIEW-016 (done, **merged to main** via PR #306; footer 固定 regression 隨後由 PR #308 修). roadmap ⑤ 第二張，⑤ 收尾。
- `F-015` 進房初始化編排與 autoResetChannel metadata-gated 改版 (UC-024/UC-025/UC-026; 決議 `2026-07-13-transcript-first-class-init-lifecycle`) → BUILD-017 / REVIEW-017 (done，等授權合併). roadmap ⑥ 最後一張（整合票）。**動 core + react**：core 新增 `client.channelMetadata()`（`GET /channel/metadata`，404→null）+ `ChannelMetadata`/`ChannelRunState` 型別 + `Channel.restore()`（seed 標題 + `rejoinSse` 重播 + `isConnecting` 閘門；抽共用 `buildRunHandlers`）。react：`use-channel.ts` mount 改 metadata-gated 三向（restore / reset / 空狀態）+ 非 404 安全 fallback。**Breaking behavior**：`autoResetChannel` 語意「mount 無條件 reset」→「僅在房不存在時 reset」（修「進已存在的房砍歷史」資料流失；預設仍 true）。**依賴**：F-014（GET replay）+ F-016（title seed）+ F-003（isConnecting）。驗證靠 core Vitest（+8）+ `/join-init` mock-client demo（無真後端）。roadmap ①–⑥ 至此全數完成。**react-only UI**（綁 F-016 的 `channelTitle`）：新 `<ChannelTitle>`（thread 頂端 header 列、MessageSquare muted icon、單行 truncate、未命名 muted placeholder、標題變更 200ms 淡入 honor reduced-motion、純中性無 accent）；`renderTitle({title,renderDefault})` 客製逃生口 + `hidden` 捷徑 + `untitledLabel`（進 AsgardTemplateContext → Chatbot props）；置於 renderContent 頂端、bot-name ChatbotHeader 之下、語意分離。prototype-first gate 已 pin、不卡。

- `TASK-003` Channel Home rename（`cwd://` → `channel-home://`，wire + 公開 API breaking，硬切無 fallback） → BUILD-018 done / REVIEW-018 done（§1 0 violation、§3 R1–R5 全 Pass；等使用者授權收 cycle）. Issue #21，母票 asgard-sdk-go TASK-002（PR #13 已對齊）。**動 core + react + demo + README**：URI scheme / HTTP route `/channel-home/download` / client `downloadChannelHomeFile` / 型別 `ChannelHomeDownloadResult` / react util `channel-home-download.ts`（`isChannelHomeUri`/`downloadChannelHomeUri`）+ consumer chip/card + demo route `/channel-home-download`。只認 `channel-home://`，歷史 `cwd://` 卡片不再支援（PM 決議）。§1.7 刻意豁免（硬切、version bump 承擔）。**version bump / publish / tag 不在本票**，屬 release 流程、需與 asgard-core 上線窗口綁定。

- `F-019` consume launchedSandboxes 並以 Rx 通道對外暴露（純資料層） (UC-032/033; prototype `useLaunchedSandboxes.ts`) → BUILD-021 / REVIEW-021 (done，等授權合併). Issue #27。**動 core + react（純資料層、無 UI）**：`GET /channel/metadata` 多回 `launchedSandboxes[]`（頻道當下 live 的 sandbox 集合，可多台；metadata 為「誰 live」唯一權威、`sandbox.launch` 只是提示）。core 補 `LaunchedSandbox` 型別＋`ChannelMetadata`/`ChannelStates`/`ChannelConfig` 欄位、`client.channelMetadata` 白名單解碼、純函式 `reconcileLaunched`（去重排序）、`Channel.launchedSandboxes$`（BehaviorSubject + distinctUntilChanged，比照 F-016 `channelTitle$`）＋ `applyLaunchedSandboxes`/`dropSandbox`/`noteSandboxLaunch`/`refetchMetadata`/`getPendingLaunches`、把 `SANDBOX_LAUNCH` 接成「pending + 重拉坐實」。react `useLaunchedSandboxes`（useSyncExternalStore 橋接 + `visibilitychange`/輪詢重拉；§1.6 core 不碰 DOM）。core Vitest 101/101（+17）。UI 驗證留 F-021（比照 F-016→F-017）。F-020/F-021 的共同資料源。

- `BUG-001` subagent 訊息／thinking（`parentToolUseId` 非空）被當 main agent 顯示 — 本階段應隱藏 (issue body 為 spec + SSE 證據) → BUILD-020 / REVIEW-020 (done, **merged to main** via PR #339、發版 0.3.13). Issue #26。**動 core only**：`Message` 型別補 `parentToolUseId?`；`conversation.ts` 六個 message/thinking handler（`onMessage{Start,Delta,Complete}` / `onThinking{Start,Delta,Complete}`）在寫入主 conversation 前加 `if (message.parentToolUseId) return this;` 守衛，非空即丟棄（本階段隱藏；累積成子對話屬 backlog、不在本票）。TDD：先 4 個 failing 測試再修，core Vitest 84/84（+4）。demo `/all-features` showcase 的 `spawnSubagent` 補串一組帶 `parentToolUseId` 的 subagent thinking + message（含外洩系統提示尾巴），瀏覽器實證洩漏已消失（主答案 + subagent 面板摘要仍在）。

- `F-018` Sandbox 冷啟動指示浮層 Launch HUD (UC-029/UC-030/UC-031; UI 權威=pinned prototype @ `aa0899d`) → BUILD-019 (done) / REVIEW-019 (ready). Issue #24。**動 core + react**：core 補 `SANDBOX_LAUNCH`/`SANDBOX_READY` 事件 + `SandboxEventData {sandboxName, blueprintName}` Fact、新 `SandboxPhase` 型別 + `Channel.sandboxPhase$`（BehaviorSubject + distinctUntilChanged，mirror `channelTitle$`）+ `getSandboxPhase()`、`ChannelStates.sandboxPhase`（launch→launching / ready→ready / init·error→idle）。react：port latch hook `useSandboxLaunch`（1s 門檻靜音熱啟動、ready 收尾拍 → 慢速 fade）+ `SandboxLaunchHud`（grid 掃描、`--asg-color-*` token、`.module.scss`、reduced-motion、i18n `sandbox.*`），`position:absolute` 掛 `ChatbotContainer`（與 `RunningIndicator` 獨立、`pointer-events:none`）。prototype 為視覺權威、以本 repo SCSS-module + token + i18n 慣例落地（非逐行照抄）。

- `BUILD-026` Export bot text content renderer（`BotMessageText`）→ done（build/lint/format/test 全綠、react-demo `/templates` 目視無回歸；**未發版**、Sindri 端另計）。內部票，源自 Sindri REVIEW-025 Minor 1（SDK 訊息列有 chat-kit 設計稿沒有的 avatar／timestamp，Sindri 無 prop 可關；使用者明確不要開關 prop）。**react-only、純新增 + 內部重構**：把 `TextTemplate` bot 分支的內文（主題化 `.text .text--bot` wrapper + `StreamdownClient`）抽成可 export 的 `BotMessageText`，`TextTemplate` 改用它（輸出不變 → embed/react-demo 零回歸），從套件進入點導出。消費端（Sindri）可用 `renderMessageContent` + 已 export 的 `TemplateBox`/`TemplateBoxContent` 自組 bot 列、不放 Avatar／不傳 time。**不改 SDK 預設行為**（不全面移除 avatar/time —— 會回歸 `asgard-embed-frontend` 刻意的頭像）、**不含 Sindri 端改動**、**不含發版**。僅解 TEXT（其他型別另案）。

## ▶ Next Task

`BUILD-024`（F-021 Cycle 2：mutations + context menu + Nudge；plan 完成、**待使用者確認範圍後開工**）。後端已 ready（asgard-core `dev-1.16.34`：完整 fs API + `action=NUDGE`，契約已對 develop 核實）。**Cycle 3** 續延：`fs/watch` 自動重載 + CodeMirror。F-021 Cycle 1（BUILD-023 / REVIEW-023）已 **merged to main** via PR #342（含完整讀 prototype 後的 fidelity 對齊：cwd/AC2、樹排序、單擊選取+雙擊開檔、reveal 展開祖先；順修 `useChannel` 未回傳 `channel` 的 bug）。**Backlog**：(1) **F-021 Cycle 2** —— 等後端補 `fs/mkdir|item|all|copy|move` + `fs/watch` + `action=NUDGE`，做變更操作 + context menu + 自動重載 + Nudge + CodeMirror；(2) **F-020 sandbox 動作卡視覺** —— port prototype 的 `SandboxBrowserHandoffCard`/`SandboxOpenFileCard`（目前沿用既有附件 chip，屬當初核准的範圍決策，非缺陷）。**未發版**：F-019 / F-020 / F-021-C1 都在 main 未發（現 0.3.13），待使用者決定版號一起發。F-020（BUILD-022）已 **merged to main** via PR #341。**F-021 拆兩 cycle**：Cycle 1 = 瀏覽（`fs/list`）+ FileView 預覽/編輯存檔（`fs/file` read/write, CodeMirror）+ 側欄 slot/controller + open-file intent 抵達即通知（AC9）+ 編輯中狀態（AC10）+ 生命週期；Cycle 2（等後端補 `fs/mkdir|item|all|copy|move` + `fs/watch` + `action=NUDGE`）= 變更操作 + context menu + 自動重載 + Nudge。後端契約已對 asgard-core 核實（目前僅 3 支 fs 端點）。F-019（BUILD-021）已 **merged to main** via PR #340。F-021（#29 File Explorer）為下一張，與 F-020 共用 `launchedSandboxes$`。BUG-001（BUILD-020）已 **merged to main** via PR #339、發版 0.3.13；F-018（BUILD-019）已 merged via PR #331、發版 0.3.12。BUILD-018 / REVIEW-018 皆 done（§1 0 violation、§3 R1–R5 全 Pass），cycle 收尾、開 PR（base `main`）。version bump / npm publish 待 asgard-core 上線窗口由使用者驅動。

## Task Queue

| Task ID      | Title                                             | Priority | Status | Spec                                                                                   |
| ------------ | ------------------------------------------------- | -------- | ------ | -------------------------------------------------------------------------------------- |
| `BUILD-001`  | Message Stream Assembly Robustness                | High     | done   | [BUILD-001-stream-assembly-robustness.md](./BUILD-001-stream-assembly-robustness.md)   |
| `REVIEW-001` | Review: Message Stream Assembly Robustness        | —        | done   | [REVIEW-001-stream-assembly-robustness.md](./REVIEW-001-stream-assembly-robustness.md) |
| `BUILD-002`  | Last-Event-ID Resume                              | High     | done   | [BUILD-002-last-event-id-resume.md](./BUILD-002-last-event-id-resume.md)               |
| `REVIEW-002` | Review: Last-Event-ID Resume                      | —        | done   | [REVIEW-002-last-event-id-resume.md](./REVIEW-002-last-event-id-resume.md)             |
| `BUILD-003`  | Transcript Replay Kernel + message.user           | High     | done   | [BUILD-003-transcript-replay-kernel.md](./BUILD-003-transcript-replay-kernel.md)       |
| `REVIEW-003` | Review: Transcript Replay Kernel                  | —        | done   | [REVIEW-003-transcript-replay-kernel.md](./REVIEW-003-transcript-replay-kernel.md)     |
| `BUILD-004`  | Thinking Message Display                          | High     | done   | [BUILD-004-thinking-message-display.md](./BUILD-004-thinking-message-display.md)       |
| `REVIEW-004` | Review: Thinking Message Display                  | —        | done   | [REVIEW-004-thinking-message-display.md](./REVIEW-004-thinking-message-display.md)     |
| `BUILD-005`  | Run Indicator Bound to Connection at Seam         | High     | done   | [BUILD-005-run-indicator-at-seam.md](./BUILD-005-run-indicator-at-seam.md)             |
| `REVIEW-005` | Review: Run Indicator at Seam                     | —        | done   | [REVIEW-005-run-indicator-at-seam.md](./REVIEW-005-run-indicator-at-seam.md)           |
| `BUILD-006`  | Built-in Tool-Call Variants + Label Synth         | High     | done   | [BUILD-006-builtin-tool-call-variants.md](./BUILD-006-builtin-tool-call-variants.md)   |
| `REVIEW-006` | Review: Built-in Tool-Call Variants               | —        | done   | [REVIEW-006-builtin-tool-call-variants.md](./REVIEW-006-builtin-tool-call-variants.md) |
| `BUILD-007`  | Tool-Call i18n Locale Prop                        | High     | done   | [BUILD-007-tool-call-i18n-locale.md](./BUILD-007-tool-call-i18n-locale.md)             |
| `REVIEW-007` | Review: Tool-Call i18n Locale Prop                | —        | done   | [REVIEW-007-tool-call-i18n-locale.md](./REVIEW-007-tool-call-i18n-locale.md)           |
| `BUILD-008`  | Tool-Call Grouping + Group Summary                | High     | done   | [BUILD-008-tool-call-grouping-summary.md](./BUILD-008-tool-call-grouping-summary.md)   |
| `REVIEW-008` | Review: Tool-Call Grouping + Group Summary        | —        | done   | [REVIEW-008-tool-call-grouping-summary.md](./REVIEW-008-tool-call-grouping-summary.md) |
| `BUILD-009`  | Write/Edit Diff + Unified Status                  | High     | done   | [BUILD-009-write-edit-diff-status.md](./BUILD-009-write-edit-diff-status.md)           |
| `REVIEW-009` | Review: Write/Edit Diff + Unified Status          | —        | done   | [REVIEW-009-write-edit-diff-status.md](./REVIEW-009-write-edit-diff-status.md)         |
| `BUILD-010`  | Tool-Call Expanded Content + Localized Titles     | High     | done   | [BUILD-010-tool-call-expand-localize.md](./BUILD-010-tool-call-expand-localize.md)     |
| `REVIEW-010` | Review: Tool-Call Expanded Content                | —        | done   | [REVIEW-010-tool-call-expand-localize.md](./REVIEW-010-tool-call-expand-localize.md)   |
| `BUILD-011`  | Tool-Call Failure Detection via isError           | High     | done   | [BUILD-011-toolcall-iserror.md](./BUILD-011-toolcall-iserror.md)                       |
| `REVIEW-011` | Review: Tool-Call Failure Detection               | —        | done   | [REVIEW-011-toolcall-iserror.md](./REVIEW-011-toolcall-iserror.md)                     |
| `BUILD-012`  | Task Check List Panel                             | High     | done   | [BUILD-012-task-check-list.md](./BUILD-012-task-check-list.md)                         |
| `REVIEW-012` | Review: Task Check List Panel                     | —        | done   | [REVIEW-012-task-check-list.md](./REVIEW-012-task-check-list.md)                       |
| `BUILD-013`  | Subagent List Panel                               | High     | done   | [BUILD-013-subagent-list.md](./BUILD-013-subagent-list.md)                             |
| `REVIEW-013` | Review: Subagent List Panel                       | —        | done   | [REVIEW-013-subagent-list.md](./REVIEW-013-subagent-list.md)                           |
| `BUILD-014`  | Derived-State Stores                              | High     | done   | [BUILD-014-derived-state-stores.md](./BUILD-014-derived-state-stores.md)               |
| `REVIEW-014` | Review: Derived-State Stores                      | —        | done   | [REVIEW-014-derived-state-stores.md](./REVIEW-014-derived-state-stores.md)             |
| `BUILD-015`  | Channel Title Store                               | Normal   | done   | [BUILD-015-channel-title-store.md](./BUILD-015-channel-title-store.md)                 |
| `REVIEW-015` | Review: Channel Title Store                       | —        | done   | [REVIEW-015-channel-title-store.md](./REVIEW-015-channel-title-store.md)               |
| `BUILD-016`  | Channel Title UI                                  | High     | done   | [BUILD-016-channel-title-ui.md](./BUILD-016-channel-title-ui.md)                       |
| `REVIEW-016` | Review: Channel Title UI                          | —        | done   | [REVIEW-016-channel-title-ui.md](./REVIEW-016-channel-title-ui.md)                     |
| `BUILD-017`  | Join-Init Orchestration + metadata gate           | High     | done   | [BUILD-017-join-init-metadata-gate.md](./BUILD-017-join-init-metadata-gate.md)         |
| `REVIEW-017` | Review: Join-Init Orchestration                   | —        | done   | [REVIEW-017-join-init-metadata-gate.md](./REVIEW-017-join-init-metadata-gate.md)       |
| `BUILD-018`  | Channel Home Rename (cwd → channel-home)          | High     | done   | [BUILD-018-channel-home-rename.md](./BUILD-018-channel-home-rename.md)                 |
| `REVIEW-018` | Review: Channel Home Rename                       | —        | done   | [REVIEW-018-channel-home-rename.md](./REVIEW-018-channel-home-rename.md)               |
| `BUILD-019`  | Sandbox Launch HUD                                | High     | done   | [BUILD-019-sandbox-launch-hud.md](./BUILD-019-sandbox-launch-hud.md)                   |
| `REVIEW-019` | Review: Sandbox Launch HUD                        | —        | done   | [REVIEW-019-sandbox-launch-hud.md](./REVIEW-019-sandbox-launch-hud.md)                 |
| `BUILD-020`  | Hide Subagent Message / Thinking Frames           | High     | done   | [BUILD-020-hide-subagent-messages.md](./BUILD-020-hide-subagent-messages.md)           |
| `REVIEW-020` | Review: Hide Subagent Message / Thinking          | —        | done   | [REVIEW-020-hide-subagent-messages.md](./REVIEW-020-hide-subagent-messages.md)         |
| `BUILD-021`  | Consume launchedSandboxes + Rx Store              | High     | done   | [BUILD-021-launched-sandboxes-store.md](./BUILD-021-launched-sandboxes-store.md)       |
| `REVIEW-021` | Review: launchedSandboxes Rx Store                | —        | done   | [REVIEW-021-launched-sandboxes-store.md](./REVIEW-021-launched-sandboxes-store.md)     |
| `BUILD-022`  | sandbox:// Handoff Cards                          | High     | done   | [BUILD-022-sandbox-handoff-cards.md](./BUILD-022-sandbox-handoff-cards.md)             |
| `REVIEW-022` | Review: sandbox:// Handoff Cards                  | —        | done   | [REVIEW-022-sandbox-handoff-cards.md](./REVIEW-022-sandbox-handoff-cards.md)           |
| `BUILD-023`  | File Explorer Side Panel — Cycle 1                | High     | done   | [BUILD-023-file-explorer-panel.md](./BUILD-023-file-explorer-panel.md)                 |
| `REVIEW-023` | Review: File Explorer Side Panel — Cycle 1        | —        | done   | [REVIEW-023-file-explorer-panel.md](./REVIEW-023-file-explorer-panel.md)               |
| `BUILD-024`  | File Explorer Mutations + Context Menu + Nudge    | High     | done   | [BUILD-024-file-explorer-mutations.md](./BUILD-024-file-explorer-mutations.md)         |
| `REVIEW-024` | Review: File Explorer Mutations + Nudge           | —        | done   | [REVIEW-024-file-explorer-mutations.md](./REVIEW-024-file-explorer-mutations.md)       |
| `BUILD-025`  | Guard the File Explorer glyphs against drift      | Normal   | done   | [BUILD-025-file-explorer-icon-guard.md](./BUILD-025-file-explorer-icon-guard.md)       |
| `BUILD-026`  | Export bot text content renderer (BotMessageText) | Normal   | done   | [BUILD-026-export-bot-message-text.md](./BUILD-026-export-bot-message-text.md)         |
| `BUILD-027`  | Unified Chat Heading Bar (ChatHeader)             | High     | done   | [BUILD-027-unified-chat-header.md](./BUILD-027-unified-chat-header.md)                 |
| `REVIEW-027` | Review: Unified Chat Heading Bar                  | —        | done   | [REVIEW-027-unified-chat-header.md](./REVIEW-027-unified-chat-header.md)               |
| `BUILD-028`  | Chat-kit Composer (SDK footer rewrite)            | High     | done   | [BUILD-028-chat-kit-composer.md](./BUILD-028-chat-kit-composer.md)                     |
| `BUILD-030`  | Unify the composer's attachment previews          | Normal   | done   | [BUILD-030-unify-attachment-chips.md](./BUILD-030-unify-attachment-chips.md)           |
