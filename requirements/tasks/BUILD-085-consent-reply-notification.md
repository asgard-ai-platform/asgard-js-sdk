# BUILD-085 Notify the host when a tool-call consent reply is accepted

## Meta

- Task ID: `BUILD-085`
- Status: `done`
- Issue: [asgard-freyr-pm#901](https://github.com/asgard-ai-platform/asgard-freyr-pm/issues/901)（issue body 即規格；上游前置於 [asgard-freyr-pm#885](https://github.com/asgard-ai-platform/asgard-freyr-pm/issues/885)，web 端由 Freyr web 的 `BUILD-300` 接手）
- Source spec: 無 PM spec。契約來源是 issue body 的「需求」兩點，以及 asgard-core `develop` @ `605e2160` 的 consent 實作（見 Brief）
- Complexity: `M`

---

## Brief

內建授權卡片（`ToolCallConsentGate`）自己組答案、直接呼叫 context 的 `replyToolCallConsents`，host 拿不到使用者
按了什麼：`<Chatbot>` 沒有 consent callback，`onBeforeSendMessage` 不帶答案，`pendingConsent` 在送出前就被樂觀清掉、
允許與拒絕都一樣。本 task 在 `@asgard-js/react` 加 `onToolCallConsentReply(answers)`：**後端接受了這次回覆**才觸發，
內容是實際送出的整批答案（含卡片自動代答的那幾筆）。

另寫明兩件 host 必須知道、但 SDK 程式碼裡查不到的事：

1. `pendingCalls[].toolCallId` 與 tool-call frame 的 `toolUseId` 是同一個值。後端兩者都取 CLI 自己的 tool_use id
   （`runengine.go` `consentFrame` 填 `ToolCallId: d.ToolUseID`；`framemap.Event.ToolUseId` 註解「the CLI's own
   tool_use id」）。寫進文件前以 dev consent bot 實測確認。
2. 後端自動放行的呼叫（bypass、allow list、先前批次按過「這個對話都允許」）**根本不會出現在 consent frame**：
   consent hook 對 `DecisionAllow` 直接放行、不記進 `deferred`；會把 `alreadyAllowed` 設成 `true` 的
   `ClassifyToolCalls` 已無呼叫者。所以這些呼叫不會有卡片，也不會觸發本 callback。這是後端行為，SDK 無從補上，
   只能寫清楚。

**Already exists:** `use-channel.ts` 的 `replyToolCallConsents`（gate 與 host 自行呼叫都經過這裡；已把
`onSseMessage`／`onSseError` 轉給 core）、`notify`（吞掉 consumer callback 的 throw，避免卡死 run）、
`tool-call-consent-gate.tsx`（`alreadyAllowed` 與同批 ALLOW_ALWAYS 的自動代答）、core `Channel.replyToolCallConsents`
（HTTP 被拒 → `onSseError` → reject → 還原 `pendingConsent`，#410）、demo `/tool-call-consent`（接 dev consent bot，
side panel 已有 SSE log，`reply` 樣式已定義但沒用到）。core 程式不動。

---

## Relevant Rules

| §    | Rule (summary)                                                                      |
| ---- | ----------------------------------------------------------------------------------- |
| §1.1 | No `any` / `as any`                                                                 |
| §1.2 | No `@ts-ignore` / `eslint-disable`                                                  |
| §1.3 | No `console.log` left in library code                                               |
| §1.5 | Every RxJS subscription / EventSource / timer has teardown                          |
| §1.6 | core never imports react / react-dom / DOM; react imports core via its public entry |
| §1.7 | **No breaking public-API change without `@deprecated` transition**                  |
| §2.2 | New public types exported from the package entry with explicit `export type`        |
| §3.1 | Exported functions / methods declare explicit return types                          |
| §3.2 | Shared types centralized in `core/src/types/`; no duplicate interfaces              |
| §6   | After implementation: extract repeated logic (≥2×)                                  |
| §7   | No `setTimeout` mock delays, no dead commented code, no untracked TODO / FIXME      |

Extra rows for this task:

| §    | Rule (summary)                                                                                         |
| ---- | ------------------------------------------------------------------------------------------------------ |
| #901 | Callback 是 host 自己的程式碼：一律經 `notify` 呼叫，throw 不得卡住 run，也不得擋下之後的 consent 回覆 |
| #901 | Payload 用既有的 `ToolCallConsentAnswer[]`，不新增平行型別（§3.2）                                     |
| #901 | 文件只寫實測過的後端行為；「自動放行不會出現在 consent frame」寫成限制，不寫成 SDK 的保證              |
| #901 | 本 task 不改 core 程式、不改 gate 的代答規則、不改後端；web 端（Freyr `BUILD-300`）不在範圍            |

---

## Acceptance Criteria

- `R1` When a consent reply sent through `useChannel`'s `replyToolCallConsents` is accepted by the backend — the
  first frame of the resumed run arrives — the system shall call `onToolCallConsentReply` exactly once with the
  answers that were sent (each `toolCallId`, `result`, `denyReason`), **before** that first frame reaches
  `onSseMessage`. This covers both the built-in consent card and a host calling `replyToolCallConsents` itself. → T1, T3
- `R2` When the resumed run completes without sending any frame, the system shall still call it once, on
  completion. → T1, T3
- `R3` When the reply never reaches an accepted state — the request is refused (HTTP error) or fails before the
  first frame, a reset is in progress, or there is no channel — the system shall not call it; when the user then
  answers the restored card again and that reply is accepted, it shall be called once with the new answers. → T1, T3
- `R4` When the consent card answers calls without showing them (`alreadyAllowed`, or a tool the user chose
  "Allow for This Chat" for earlier in the same batch), those answers shall arrive in the same single callback as
  the user's own answers for that batch. → T3
- `R5` When `onToolCallConsentReply` throws, the system shall swallow it: the run still settles and a later consent
  batch can still be answered. → T1, T3
- `R6` When a developer reads the types or the READMEs, they shall find: that `ToolCallConsentPendingCall.toolCallId`
  equals `toolUseId` on the same call's tool-call frames; that calls the backend auto-approves never appear in a
  consent frame and therefore never reach the card or the callback; and the callback's payload and firing point.
  The id equality shall be confirmed against the dev consent bot before it is written down. → T4, T5
- `R7` (Smoke check) When the developer runs `lint:packages`, `format:check`, `typecheck`, `build:core`,
  `build:react` and `test:packages`, all shall pass; and on the react-demo `/tool-call-consent` route against the
  dev consent bot, Allow and Deny shall each log one callback line carrying the `toolCallId` that matches the
  `tool_call.start` `toolUseId` logged for that call. → T6, T7

---

## Implementation Tasks

- [x] T1 (R1, R2, R3, R5): `use-channel.ts` — `UseChannelProps.onToolCallConsentReply?: (answers: ToolCallConsentAnswer[]) => void`；
      `replyToolCallConsents` 以一次性旗標在第一個 `onSseMessage`（先於轉發給 host）或 `onSseCompleted` 觸發，經
      `notify` 呼叫。
- [x] T2 (R1): `asgard-service-context.tsx` 與 `chatbot.tsx` 透傳 prop（與 `onSseMessage` 同一條路）。
- [x] T3 (R1–R5): react Vitest — 接受後觸發一次且先於 `onSseMessage`；無 frame 完成時觸發；HTTP 被拒不觸發、重答
      被接受後觸發一次；gate 一批含 `alreadyAllowed` 與同批 ALLOW_ALWAYS 時只觸發一次且含代答；callback throw 不卡住。
- [x] T4 (R6): 以 dev consent bot 實測 `toolCallId` 與 `tool_call.start` `toolUseId`（並記錄允許／拒絕後續跑的 frame
      形狀，供 #901 回覆），結果寫進 Execution Log；確認後補 core 型別 JSDoc（`ToolCallConsentPendingCall.toolCallId`、
      `alreadyAllowed`，及 tool-call frame 的 `toolUseId`）。
- [x] T5 (R6): README — core〈Tool Call Consent〉補 id 對應；react〈Tool Call Consent〉新增 host 觀察回覆的段落
      （payload、觸發點、自動放行的限制）並登記到 `<Chatbot>` props 表。
- [x] T6 (R7): demo `/tool-call-consent` — log `onToolCallConsentReply` 與 `tool_call.start` 的 `toolUseId`。
- [x] T7 (R7): `npm run lint:packages && npm run format:check && npm run typecheck`、
      `npm run build:core && npm run build:react`、`npm run test:packages`；demo 對 dev consent bot 走允許與拒絕各一輪。

> 寬窄並排（`AGENTS.md`〈Verify at both widths〉）不適用：本 task 沒有 SDK 畫面變更，demo 只多 side panel 的 log。

---

## Coverage

Use Cases: `R1`–`R7`。R1–R5 由 `consent-reply-notification.spec.tsx`（7 案；反向驗證見 Execution Log），R6 由
dev consent bot 實測後寫入的型別註解與兩份 README，R7 由閘門與 `/tool-call-consent` 接 dev consent bot 走兩輪。

Files:

| File (package)                                                                        | Change                                                                                                              |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `packages/react/src/hooks/use-channel.ts`                                             | `UseChannelProps.onToolCallConsentReply?`；`replyToolCallConsents` 在第一個 frame／完成時經 `notify` 觸發一次（T1） |
| `packages/react/src/context/asgard-service-context.tsx`                               | 透傳 prop（T2）                                                                                                     |
| `packages/react/src/components/chatbot/chatbot.tsx`                                   | `<Chatbot onToolCallConsentReply>` 並透傳（T2）                                                                     |
| `packages/react/src/components/tool-call-consent/consent-reply-notification.spec.tsx` | 新檔 — R1–R5（T3）                                                                                                  |
| `packages/core/src/types/sse-response.ts`                                             | 僅 JSDoc：`toolCallId` ＝ `toolUseId`、`alreadyAllowed` 與後端自動放行（T4）                                        |
| `packages/core/README.md`                                                             | 〈Tool Call Consent〉補 id 對應與自動放行（T5）                                                                     |
| `packages/react/README.md`                                                            | props 列表加一條；〈Tool Call Consent〉新增〈Observing the answers〉、修正 `alreadyAllowed` 說明（T5）              |
| `apps/react-demo/src/app/routes/tool-call-consent/tool-call-consent.tsx`              | log callback 與 `tool_call.start`／`complete` 的 `toolUseId`（T6）                                                  |

**公開 API 影響（§1.7）**：全部 additive。`UseChannelProps`、`AsgardServiceContextProviderProps`、`ChatbotProps` 各多一個選填
callback，payload 沿用既有的 `ToolCallConsentAnswer[]`；core 程式不動。未 bump 版本（仍為 `0.3.87`）。

README 既有的 `alreadyAllowed` 說明寫「例如前一輪按過 Allow for This Chat」，實測與後端程式都證實那類呼叫不會出現在 consent
frame，已一併改正（否則與新段落矛盾）。

---

## Execution Log

- 2026-09-29: BUILD task created from [asgard-freyr-pm#901](https://github.com/asgard-ai-platform/asgard-freyr-pm/issues/901) (Status: `draft`).
- 2026-09-29: Plan confirmed; implementation started (Status: `draft → ready → in-progress`).
- 2026-09-29: 反向驗證（逐一改壞 `use-channel.ts`，每次跑新 spec 後還原）：拿掉 frame 觸發 → 5/7 紅；改成轉發之後才觸發 →
  1 紅（順序案）；拿掉完成時觸發 → 1 紅（R2）；改成送出當下就觸發 → 2 紅（R1「送出不等於接受」、R3）；拿掉 `notify` → 1 紅（R5）。
- 2026-09-29: dev consent bot 實測（demo `/tool-call-consent`，頁內攔 `fetch` 記下每個 run 的 frame 與 request body）：
  - **id 對應成立**：opening turn 的 4 筆 `tool_call.start` `toolUseId` 與隨後 consent frame 的 4 筆 `toolCallId` 逐字相同
    （`call_…` 形式）。後端 `runengine` 兩者都取 CLI 的 tool_use id，與程式碼一致。
  - **callback**：4 筆一批（搜電影「本次對話皆允許」→ 第二筆搜電影被 gate 代答 `ALLOW_ALWAYS`；搜書「僅此次允許」；搜書
    「拒絕」附原因）在續跑第一個 frame 時觸發一次，4 筆齊全，與 request body 的 `toolCallConsents` 相同。
  - **允許後的續跑（多筆）**：只有被拒的那筆以**原 id** 回 `tool_call.complete`（`isError`，無新 `start`）；被允許的 3 筆
    原 id 都沒有再出現，改以 3 個**新 id** 各送 `start`／`complete`。
  - **允許後的續跑（單筆）**：以**原 id** 只回一個 `tool_call.complete`（成功），無新 `start`。與後端 `SeedResumedToolCalls`
    的設計相符。
  - **後端自動放行**：同一輪裡搜電影（先前批次按過「本次對話皆允許」）直接 `start`→`complete`，不在任何 consent frame，
    callback 不觸發 —— R6 的限制成立。
  - 另見兩個後端行為（不在 SDK 範圍，記下供 #901 回覆）：(1) 多筆那輪被拒的搜書，在**下一個使用者訊息**時以原 id 再發
    一次 consent，且沒有新的 `start`；(2) 續跑中對「僅此次允許」過的同一支工具再呼叫一次，未再詢問。
- 2026-09-29: Build complete — lint（0 error；5 warnings 皆為 `main` 既有）/ format / typecheck（core + react + react-demo）/
  build / test（core 430、react 602）全綠 (Status: `in-progress → done`).
