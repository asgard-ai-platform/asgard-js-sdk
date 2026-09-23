# BUILD-083 Keep each subagent child tool-call's result

## Meta

- Task ID: `BUILD-083`
- Status: `done`
- Issue: [asgard-freyr-pm#815](https://github.com/asgard-ai-platform/asgard-freyr-pm/issues/815)（開在 Freyr PM repo，卡住 [asgard-freyr-pm#740](https://github.com/asgard-ai-platform/asgard-freyr-pm/issues/740) 驗收條件 ①；本 repo 無 PM tracking spec）
- Source spec: issue body 即規格。背景決議為 Freyr PM repo 的 `docs/decisions/2026-09-20-tool-call-trace-data-reality.md`
- Complexity: `S`

---

## Brief

`tool_call.complete` 事件本來就帶著 `toolCallResult`（與選填的 `toolUseResultSidecar`），`Conversation` 也已經把它們存進
`ConversationToolCallMessage.result` / `.sidecar`。但 `conversationToSubagentEvents` 把子代理的 child tool-call 轉成
`SubagentEvent.toolComplete` 時只留了 `isError`，於是 `reduceSubagents` 折出來的 `SubagentToolCall` 只回答得了「跑了哪支工具、
成功了沒」。消費端（Freyr web 的子代理 timeline）要逐列顯示「結果摘要」，資料明明送到瀏覽器了、卻在聚合這一步被丟掉。

本 task 讓 `toolComplete` 帶上 `result` / `sidecar`，`reduceSubagents` 把它們掛到 `SubagentToolCall` 上。**原樣帶過**：
不截斷、不遮蔽、不改型別（遮蔽／截斷已裁決歸呈現端）。純 core、純 additive；`<SubagentList>` 不畫它（票面明說不在範圍）。

欄位命名跟 `ConversationToolCallMessage` 一致（`result` / `sidecar`），不跟 wire 名（`toolCallResult` / `toolUseResultSidecar`）：
消費端讀的是 SDK 的型別，同一個值在兩個 SDK 型別上叫兩個名字只會讓人以為是兩種東西。

**Already exists:** `packages/core/src/types/subagent.ts`（`SubagentToolCall`）、`packages/core/src/lib/subagent-reducer.ts`
（`SubagentEvent`、`reduceSubagents`）、`packages/core/src/lib/derived-stores.ts`（`conversationToSubagentEvents`、`toolsEqual` /
`subagentsEqual`）、`packages/core/src/lib/conversation.ts`（`onToolCallComplete` 的 live 與 GET-rejoin 兩條路徑都已寫入 `result` / `sidecar`）。

---

## Relevant Rules

| §    | Rule (summary)                                                                      |
| ---- | ----------------------------------------------------------------------------------- |
| §1.1 | No `any` / `as any`                                                                 |
| §1.2 | No `@ts-ignore` / `eslint-disable`                                                  |
| §1.3 | No `console.log` left in library code                                               |
| §1.6 | core never imports react / react-dom / DOM; react imports core via its public entry |
| §1.7 | **No breaking public-API change without `@deprecated` transition**                  |
| §2.2 | New public types exported from the package entry with explicit `export type`        |
| §3.1 | Exported functions / methods declare explicit return types                          |
| §3.2 | Shared types centralized in `core/src/types/`; no duplicate interfaces              |
| §6   | After implementation: extract repeated logic (≥2×)                                  |
| §7   | No `setTimeout` mock delays, no dead commented code, no untracked TODO / FIXME      |

Extra rows for this task:

| §    | Rule (summary)                                                                                             |
| ---- | ---------------------------------------------------------------------------------------------------------- |
| #815 | 值原樣帶過：不截斷、不遮蔽、不複製成新物件、不改型別語意                                                   |
| #815 | 不動 `<SubagentList>` 的呈現、不處理耗時／`parameter` 呈現／`Subagent.summary`（票面「明確不在這張票裡」） |

---

## Acceptance Criteria

- `R1` When a subagent's child tool-call completes, the system shall expose that call's `toolCallResult` on the matching
  `SubagentToolCall` as `result`, and its `toolUseResultSidecar` as `sidecar` when the frame carries one. → T1, T2, T4
- `R2` When the result reaches `SubagentToolCall`, the system shall hand over the very value the frame carried — no
  truncation, no masking, no reshaping (the same object reference as `ConversationToolCallMessage.result`). → T2, T4
- `R3` While a child tool-call is still `running`, the system shall leave `result` absent (`undefined`), and once it completes
  with an empty result it shall carry `{}` — so "not yet" and "present but empty" stay distinguishable. → T1, T2, T4
- `R4` When the same conversation is replayed (GET rejoin, where `tool_call.complete` arrives without its `start`), the system
  shall derive the same results as the live run, keeping `reduceSubagents` replay-safe. → T2, T4
- `R5` When a child tool-call's result or sidecar changes, `subagents$` shall treat the list as changed; when nothing but an
  unrelated message delta happens, it shall still not re-emit (the F-013 `distinctUntilChanged` property). → T3, T4
- `R6` When an existing consumer compiles against the new types, the system shall require no change from it (all new fields
  optional; react `<SubagentList>` output unchanged). → T1, T5
- `R7` (Smoke check) When the developer runs `npm run typecheck`, `npm run build:core && npm run build:react` and
  `npm run test:packages`, the system shall pass with the new core Vitest cases covering R1–R5. → T5

---

## Implementation Tasks

- [x] T1 (R1, R3, R6): `SubagentToolCall` 加 `result?: Record<string, unknown>` 與 `sidecar?: Record<string, unknown>`（附註解說明
      `undefined` = 尚未完成、`{}` = 完成但空）；`SubagentEvent.toolComplete` 加同名兩欄
- [x] T2 (R1–R4): `conversationToSubagentEvents` 把 `message.result` / `message.sidecar` 帶進 `toolComplete`；`reduceSubagents` 的
      `toolComplete` 分支把它們掛到 tool 上（有值才設，不覆蓋成 `undefined` 以外的東西）
- [x] T3 (R5): `toolsEqual` 以參照比對 `result` / `sidecar`（`Conversation` 以不可變更新保留未變動訊息的參照，所以不會因無關 delta 誤判）
- [x] T4 (R1–R5): Vitest — `subagent-reducer.spec.ts`（帶／不帶 sidecar、running 無 result、`{}` 空結果、參照相同）與
      `derived-stores.spec.ts`（live 與 rejoin 兩條 `onToolCallComplete` 路徑結果一致、`subagentsEqual` 對 result 變化敏感、無關 delta 不 re-emit）
- [x] T5 (R6, R7): `npm run lint:packages` + `npm run format:check` + `npm run typecheck` + `npm run build:core && npm run build:react` + `npm run test:packages`

---

## Coverage

Use Cases: R1, R2, R3, R4, R5, R6, R7

Files:

- `packages/core/src/types/subagent.ts`（core）— `SubagentToolCall.result?` / `.sidecar?`
- `packages/core/src/lib/subagent-reducer.ts`（core）— `SubagentEvent.toolComplete` 加兩欄；`reduceSubagents` 掛到 tool 上
- `packages/core/src/lib/derived-stores.ts`（core）— `conversationToSubagentEvents` 帶入；`toolsEqual` 以參照比對兩欄
- `packages/core/src/lib/subagent-reducer.spec.ts`（core，+4 案）
- `packages/core/src/lib/derived-stores.spec.ts`（core，+5 案，走真實 `Conversation.onMessage` frame）

react 未改動。

---

## Execution Log / Change Log

- 2026-09-23: BUILD task created from asgard-freyr-pm#815 (Status: `draft`).
- 2026-09-23: Plan confirmed；欄位名採 `result` / `sidecar`（對齊 `ConversationToolCallMessage`）確認 (Status: `draft → ready → in-progress`).
- 2026-09-23: TDD — 新增 9 案先失敗 7 案（其餘 2 案為「尚未完成無 result」「rejoin 與 live 相等」，修前兩邊皆無 result 故本來就過），實作後全過。
- 2026-09-23: lint（core 0 error；react 5 warnings 為 `main` 既有）/ format / typecheck（3 projects）/ build core+react / Vitest core 430、react 595 全綠。
- 2026-09-23: 建置產物驗證 — 以 node 載入 `packages/core/dist/index.mjs`，餵 Agent + 4 個 child tool 的 frame：有結果／`{}`／失敗帶結果／running 為 `undefined` 四種皆符合；無關 delta 不 re-emit `subagents$`；僅 complete frame 的 rejoin 與 live 結果逐欄相等。
- 2026-09-23: react-demo `/all-features`（port 5100）— `<SubagentList>` 收到的 `subagents` prop 每個 child tool 帶 `result: { ok: true }`（mock 值）；stash 改動回 `main` 時為無 `result`。子代理面板展開後 before/after 截圖逐像素比對，唯一差異是 spinner 動畫影格（R6）(Status: `in-progress → done`).
