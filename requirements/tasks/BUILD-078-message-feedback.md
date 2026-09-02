# BUILD-078 Message feedback (Good / Bad response)

## Meta

- Task ID: `BUILD-078`
- Status: `done`
- Issue: https://github.com/asgard-ai-platform/asgard-sdk-pm/issues/96
- Source spec: `references/asgard-sdk-pm/tracking/asgard-js-sdk/features/F-033-回應評價-good-bad-response.md`（UC-055 ～ UC-059 同目錄 `use-cases/`）
- Complexity: `L`（core 新事件 + 新 HTTP 端點 + react 新元件與 modal + 三語文案 + demo mock）

---

## Brief

讓使用者對 **每一則 assistant 回覆**按 👍/👎，並可選填原因。後端已整條就緒（`POST {base}/message/feedback` + SSE `asgard.message.feedback` + audit log），前端純接。三個語意直接決定實作：**append-only / latest-wins / v1 無取消評價**（已評狀態要能從伺服器重播還原，不是本地記憶）；**只有 assistant 回覆可評**（評 thinking、user 訊息、不存在的 id 一律 404）；**「同時告訴 AI」是兩段式**——評價 API 成功後，另外照常送一則以 `[Response Feedback: Good]` / `[Response Feedback: Bad]` 開頭的普通訊息（前綴是平台契約字面，不得改寫）。

改動範圍：`@asgard-js/core` 加 `EventType.MESSAGE_FEEDBACK` 與 fact 型別、`ConversationBotMessage.feedback` 欄位與 reducer、`AsgardServiceClient.sendMessageFeedback()`、`Channel.sendMessageFeedback()`、前綴常數與組訊息 helper；`@asgard-js/react` 加 `enableFeedback` prop、`MessageFeedbackBar`（👍/👎 列）與 `MessageFeedbackModal`、`feedback.*` 三語文案；`apps/react-demo` 加 `/message-feedback` 路由與 mock（POST 端點、rejoin 重播、`[Response Feedback:` 插曲回應）。

**與 prototype 刻意不同的三點（依 UC 決議，見 Decisions）**：(1) 評價列掛在 **`ConversationMessageRenderer` 的 bot 分支之後、不在 `renderDefaultContent()` 裡**，所以 Mimir 那種 TABLE / CHART 不呼叫 `renderDefaultContent()` 的自訂 renderer 也看得到（asgard-sdk-pm#96 留言第 1 點）；(2) 送出失敗時 **modal 不關、保留文字、顯示錯誤**（UC-055 Alt A），prototype 是 fire-and-forget 立即關閉；(3) 已評狀態在 POST 回 200 後**由 SDK 直接寫進 conversation**（伺服器已確認，不是樂觀更新），因為 SDK 只在 run 進行中才有開著的 SSE 串流，live echo 到不了 idle 的 client；重整後由 rejoin 重播接手（UC-058）。

**Already exists:** `MessageActions`（`template-box-content.tsx` 裡的訊息層級 chrome 前例）、`ToolCallConsentModal`（modal 的 scss/theme CSS 變數寫法：`--asgard-consent-modal-*` 鏈到 `--asg-color-*`）、`i18n.ts`（`t()` + 三語 catalog）、`client.deleteChannel()` / `HttpError`（非 2xx 的錯誤形狀）、`Channel.buildRunHandlers()`（run-level 事件的折疊點）、`Conversation.onMessage()` reducer、`QuestionTemplate` 透過 `useAsgardContext().sendMessage` 送普通訊息的路徑、demo `/prompt-suggestion`（寬窄並排的參考路由）、`sse-mock.ts` 的 `handleMockSuspend`（POST mock 形狀）與 `handleMockTranscriptRejoin`（重播 mock）。

---

## Relevant Rules

Distilled from `FRONTEND_RULE_COMMON.md`; builder reads this table instead of the full corpus.

| §    | Rule (summary)                                                                                                            |
| ---- | ------------------------------------------------------------------------------------------------------------------------- |
| §1.1 | No `any` / `as any` — use precise types, generics, or `unknown` + narrowing                                               |
| §1.2 | No `@ts-ignore` / `eslint-disable` to bypass type or lint errors                                                          |
| §1.3 | No `console.log` left in library code (gate behind an explicit debug option if needed)                                    |
| §1.4 | No hardcoded API key / endpoint / namespace — pass via `config`                                                           |
| §1.5 | Every RxJS subscription / EventSource / timer has teardown (`takeUntil` / `unsubscribe` / `useEffect` cleanup)            |
| §1.6 | `@asgard-js/core` never imports `react` / `react-dom` / DOM; react imports core via its public entry only (no `core/src`) |
| §1.7 | No breaking public-API change without `@deprecated` transition                                                            |
| §2.2 | New public types / functions / components exported from the package entry with explicit `export type`                     |
| §2.3 | Template type (`core/src/types/sse-response.ts`) + enum (`core/src/constants/enum.ts`) exist before the react component   |
| §2.4 | Use `botProviderEndpoint`, not the deprecated `endpoint`                                                                  |
| §3.1 | Exported functions / methods declare explicit return types                                                                |
| §3.2 | Shared types centralized in `core/src/types/`; no duplicate interfaces across files                                       |
| §4.1 | React component props fully typed (no `any`)                                                                              |
| §4.2 | No hardcoded color values in components — theme via CSS variables / theme context                                         |
| §4.4 | `react` / `react-dom` stay peerDependencies (not bundled)                                                                 |
| §5   | `@asgard-js/core` and `@asgard-js/react` keep the same version number                                                     |
| §6   | After implementation: extract repeated logic (≥2×), duplicate types, repeated JSX (≥3×)                                   |
| §7   | No `setTimeout` mock delays, no `console.log`, no dead commented code, no untracked TODO / FIXME                          |

Extra rows for this task:

| §        | Rule (summary)                                                                                                                                                           |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| §5.3     | All user-facing text via `t()`; `feedback.*` keys present in **all three** locales (`en-US` / `ja-JP` / `zh-TW`), wording copied from the pinned prototype `src/i18n.ts` |
| Contract | `[Response Feedback: Good]` / `[Response Feedback: Bad]` 字面是平台契約（asgard-core `ResponseFeedbackPrefixGood/Bad`），一字不得改；`verdict` 只有 `GOOD` / `BAD`       |
| Contract | comment 上限 8 KiB（UTF-8 **bytes**，不是字元數）；超過在送出前就擋，不打後端（UC-056 Alt B）                                                                            |
| Layout   | 評價列是 **message-level chrome**：不進 template、不進 `renderDefaultContent()`，自訂 renderer 也看得到（asgard-sdk-pm#96 留言）                                         |

---

## Acceptance Criteria

EARS form. Each criterion maps to Implementation Tasks (→ T#).

**core**

- `R1` When an `asgard.message.feedback` frame arrives (live or replayed) whose `targetMessageId` names a bot message in the conversation, the system shall set that message's `feedback` to `{ verdict, comment }` from the frame; a later frame for the same target shall replace it (latest wins). → T1, T2
- `R2` When an `asgard.message.feedback` frame arrives before its target message (or names a non-bot / unknown id), the system shall not throw and shall apply it once the target bot message materializes (`message.complete`); a frame whose target never appears is ignored. → T2
- `R3` When `client.sendMessageFeedback({ customChannelId, messageId, verdict, comment? })` is called, the system shall `POST {botProviderEndpoint}/message/feedback` with that JSON body (`comment` omitted when empty) and the same auth / custom headers as other API calls, resolve to `{ messageId, seq }` on 2xx, and reject with `HttpError(status)` otherwise. → T3
- `R4` When `channel.sendMessageFeedback(messageId, { verdict, comment? })` resolves, the system shall write `{ verdict, comment }` into that bot message's `feedback` and publish the new conversation; when it rejects, the conversation shall be unchanged. → T4
- `R5` When `composeFeedbackMessage(verdict, comment?)` is called, the system shall return `[Response Feedback: Good]` / `[Response Feedback: Bad]` followed by a blank line and the trimmed comment, or the prefix alone when the comment is empty. → T5

**react**

- `R6` When `enableFeedback` is true, the system shall render a 👍/👎 bar under every completed bot message (`type === 'bot'`, `isTyping === false`) — including when the host supplies `renderMessageContent` — and shall render nothing for user / error / thinking / canvas / tool-call messages; when `enableFeedback` is false or absent, nothing renders. → T6, T7
- `R7` When a verdict button is clicked, the system shall open a modal (`role="dialog"`, `aria-modal`) titled per verdict, with an optional textarea (placeholder per verdict) that receives focus on open, a "send to AI as well" checkbox **checked by default** positioned between the textarea and the buttons, and Cancel / Submit; Escape, Cancel, or a backdrop click shall close it without sending. → T8
- `R8` When Submit is pressed with the comment within 8 KiB, the system shall call `channel.sendMessageFeedback` (Submit disabled while pending); on success the modal closes and the rated button shows the active state (`aria-pressed="true"`, filled icon); when the comment exceeds 8 KiB (UTF-8), the system shall show an inline error and not call the endpoint. → T8, T9
- `R9` When the feedback call rejects (404 / 400 / network), the system shall keep the modal open with the typed comment intact, show a localized error line, and leave the message's rated state unchanged. → T9
- `R10` When the feedback call succeeds and "send to AI as well" is checked, the system shall then send one ordinary message via the context `sendMessage` whose text is `composeFeedbackMessage(verdict, comment)`; when unchecked, no message is sent; when the feedback call fails, no message is sent. → T9
- `R11` When a bot message already carries `feedback` (from replay or a prior submit) and the user submits the other verdict, the system shall light the new button and unlight the old one after success (latest wins); re-clicking the active button opens the same modal and resubmits the same verdict (no un-rate). → T7, T9
- `R12` When `locale` is `en-US`, `ja-JP` or `zh-TW`, the system shall resolve every `feedback.*` key (buttons, titles, labels, placeholders, checkbox, tooltips, rated-state titles, error lines) in that locale with no fallback to the key. → T10
- `R13` While a run is in flight (`isRunning`), the system shall render the bar with both buttons disabled, so the follow-up message of R10 cannot be refused by a busy channel. → T7

**demo / smoke**

- `R14` (Smoke check) When the developer runs `npm run lint:packages && npm run format:check && npm run typecheck`, `npm run build:core && npm run build:react`, `npm run test:packages`, and opens `/message-feedback` in the react-demo (`npm run serve:react-demo -- -- --port 5100`), the system shall pass every gate and the route shall exercise R6–R13 side by side at wide and 375px widths: mock `POST /mock-asgard/message/feedback` (200 default; a scripted 404 / 400 path), a rejoin mock that replays `asgard.message.feedback` for one message, and an SSE mock that answers a `[Response Feedback:` message as an interlude. → T11, T12

---

## Implementation Tasks

Run in order; each task maps to the R# it satisfies.

- [x] T1 (R1): core types + enum first (§2.3) — `EventType.MESSAGE_FEEDBACK = 'asgard.message.feedback'`; `FeedbackVerdict`, `MessageFeedbackState`, `MessageFeedbackEventData { messageId, targetMessageId, verdict, text?, identityHint? }`, `Fact.messageFeedback`; `ConversationBotMessage.feedback?: MessageFeedbackState`; `MessageFeedbackRequest` / `MessageFeedbackReply` in `types/client.ts`.
- [x] T2 (R1, R2): `Conversation.onMessageFeedback()` in `lib/conversation.ts` (+ `onMessage` case), with an orphan map applied in `onMessageComplete`; `applyFeedback(targetMessageId, state)` public helper reused by T4. Vitest: latest-wins, orphan-then-complete, non-bot target ignored.
- [x] T3 (R3): `AsgardServiceClient.sendMessageFeedback()` + optional `IAsgardServiceClient.sendMessageFeedback?`; derive URL from `botProviderEndpoint` like `deriveChannelEndpoint()`. Vitest: URL / body / headers / 2xx parse / non-2xx → `HttpError`.
- [x] T4 (R4): `Channel.sendMessageFeedback(messageId, submission)` — awaits the client, then `conversation$.next(conversation.applyFeedback(...))`; rejects untouched. Vitest.
- [x] T5 (R5): `RESPONSE_FEEDBACK_PREFIX` constant + `composeFeedbackMessage()` in core; export from package entry (§2.2). Vitest.
- [x] T6 (R6): `enableFeedback?: boolean` on `ChatbotProps` → `AsgardTemplateContextValue.enableFeedback`; `useChannel` / service context expose `sendMessageFeedback`.
- [x] T7 (R6, R11, R13): `components/message-feedback/message-feedback-bar.tsx` (+ scss module, theme CSS vars, `aria-pressed`, filled icon when active, disabled while `isRunning`); mount in `ConversationMessageRenderer` **after** the rendered content for completed bot messages, on both the default and the `renderMessageContent` path.
- [x] T8 (R7, R8): `message-feedback-modal.tsx` — dialog semantics, autofocus textarea, default-checked checkbox between textarea and buttons, Esc / Cancel / backdrop close, 8 KiB UTF-8 pre-check with inline error, Submit disabled while pending.
- [x] T9 (R8–R11): submit flow inside the bar — `sendMessageFeedback` → on success close + (if checked) `sendMessage({ text: composeFeedbackMessage(...) })`; on failure keep modal open with error. Vitest (mock channel / context): success path, failure path keeps text + no resend, unchecked → no resend, re-rate flips state.
- [x] T10 (R12): `feedback.*` keys × 3 locales in `i18n.ts` (13 keys copied verbatim from the pinned prototype `src/i18n.ts` + 2 new: `feedback.submitFailed`, `feedback.tooLong`); locale-parity Vitest.
- [x] T11 (R14): demo — `/message-feedback` route (wide + narrow shells, locale switcher, script legend), `handleMockMessageFeedback` POST handler wired in `vite.config.ts`, rejoin mock channel replaying one `asgard.message.feedback`, SSE mock interlude reply for `[Response Feedback:` text.
- [x] T12 (R14): READMEs — document `enableFeedback` on `packages/react/README.md`, `sendMessageFeedback` / `composeFeedbackMessage` on `packages/core/README.md`; run `npm run lint:packages && npm run format:check && npm run typecheck`, `npm run build:core && npm run build:react`, `npm run test:packages`; walk R6–R13 in the browser at both widths.

---

## Coverage

Use Cases: `R1`–`R14` — all fourteen verified. `R1`–`R5` by 20 core Vitest cases（`message-feedback.spec.ts`）; `R6`–`R13` by 22 react Vitest cases（`message-feedback.spec.tsx`，透過 `ConversationMessageRenderer` 掛載，含 `renderMessageContent` 不呼叫 `renderDefaultContent()` 的情境）; `R6`–`R14` 另以 Playwright（chromium）在 `/message-feedback` 兩個寬度實走：重播三則回覆各一列、第一則以最新一筆（BAD）亮起、user 訊息無列；modal 標題／focus／預設勾選／順序；Esc 與點外側關閉不送出；不填字送出 → `POST /message/feedback` body `{customChannelId, messageId, verdict}`、送出中按鈕 disabled、關閉後亮起、續送 `[Response Feedback: Good]` 並收到插曲回應；改評 BAD→GOOD 帶 comment 且取消勾選 → 亮起換邊、不續送；404 → 錯誤行、文字保留、不亮、不續送；8 KiB 超長 → 零請求；run 中兩顆 disabled、結束後恢復；重整後兩個 shell 的已評狀態皆由重播還原；三語 aria-label／title／modal 文案全數解析。

Files:

| File (package)                                                                                       | Change                                                                                                                                               |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core/src/constants/enum.ts`                                                                | `EventType.MESSAGE_FEEDBACK` (T1)                                                                                                                    |
| `packages/core/src/types/sse-response.ts`                                                            | `FeedbackVerdict`, `MessageFeedbackEventData`, `Fact.messageFeedback` (T1)                                                                           |
| `packages/core/src/types/channel.ts`                                                                 | `MessageFeedbackState`, `ConversationBotMessage.feedback` (T1)                                                                                       |
| `packages/core/src/types/client.ts`                                                                  | `MessageFeedbackRequest` / `MessageFeedbackReply`, `IAsgardServiceClient.sendMessageFeedback?` (T1, T3)                                              |
| `packages/core/src/lib/conversation.ts`                                                              | `pendingFeedback`, `onMessageFeedback`, `applyFeedback`; `onMessageComplete` carries / applies rating (T2)                                           |
| `packages/core/src/lib/client.ts`                                                                    | `sendMessageFeedback()` — `POST {base}/message/feedback` (T3)                                                                                        |
| `packages/core/src/lib/channel.ts`                                                                   | `sendMessageFeedback()`; traceId rebuild carries `pendingFeedback` (T4)                                                                              |
| `packages/core/src/lib/feedback-message.ts` (new)                                                    | `RESPONSE_FEEDBACK_PREFIX`, `FEEDBACK_COMMENT_MAX_BYTES`, `feedbackCommentByteLength`, `composeFeedbackMessage` (T5)                                 |
| `packages/core/src/index.ts`                                                                         | exports of the above (T5)                                                                                                                            |
| `packages/core/src/lib/message-feedback.spec.ts` (new)                                               | 20 cases — reducer / helper / client / channel (T2–T5)                                                                                               |
| `packages/react/src/i18n.ts`                                                                         | `feedback.*` × 16 keys × 3 locales (T10)                                                                                                             |
| `packages/react/src/hooks/use-channel.ts`                                                            | `sendMessageFeedback` (T6)                                                                                                                           |
| `packages/react/src/context/asgard-service-context.tsx`                                              | `sendMessageFeedback` on the context (T6)                                                                                                            |
| `packages/react/src/context/asgard-template-context.tsx`                                             | `enableFeedback` (T6)                                                                                                                                |
| `packages/react/src/components/chatbot/chatbot.tsx`                                                  | `enableFeedback` prop wired to the template provider (T6)                                                                                            |
| `packages/react/src/components/message-feedback/message-feedback-bar.tsx` (new)                      | `MessageFeedbackBar`, `isRatableReply`, submit flow (T7, T9)                                                                                         |
| `packages/react/src/components/message-feedback/message-feedback-modal.tsx` (new)                    | `MessageFeedbackModal`, `FeedbackSubmission` (T8)                                                                                                    |
| `packages/react/src/components/message-feedback/*.module.scss` (new)                                 | bar / modal styles — `--asgard-feedback-*` → `--asg-color-*` (T7, T8)                                                                                |
| `packages/react/src/components/message-feedback/index.ts` (new)                                      | barrel (T7)                                                                                                                                          |
| `packages/react/src/components/index.ts`                                                             | export `./message-feedback` (T7)                                                                                                                     |
| `packages/react/src/components/chatbot/chatbot-body/conversation-message-renderer.tsx`               | mount the bar after the content on both render paths (T7)                                                                                            |
| `packages/react/src/components/chatbot/chatbot-body/conversation-message-renderer.module.scss` (new) | `.rated_message` wrapper (T7)                                                                                                                        |
| `packages/react/src/components/message-feedback/message-feedback.spec.tsx` (new)                     | 22 cases — R6–R13 (T9, T10)                                                                                                                          |
| `apps/react-demo/src/app/routes/message-feedback/*` (new)                                            | `/message-feedback` route, wide + narrow, locale switcher (T11)                                                                                      |
| `apps/react-demo/src/app/app.tsx`, `components/layout/layout.tsx`                                    | route + nav entry (T11)                                                                                                                              |
| `apps/react-demo/vite.config.ts`                                                                     | `/mock-asgard/message/feedback` middleware (T11)                                                                                                     |
| `apps/react-demo/src/mock-server/sse-mock.ts`                                                        | feedback POST mock (404 / 400 / 500 scripts, in-memory persistence), SSE interlude reply, rejoin transcript with feedback frames, metadata 200 (T11) |
| `packages/react/README.md`, `packages/core/README.md`                                                | `enableFeedback` prop; `sendMessageFeedback` on client / channel / context; "Message feedback" section (T12)                                         |

---

## Decisions

- **開關是 `enableFeedback: boolean`，不是 prototype 的 `onSubmitFeedback` callback。** prototype 是純呈現的 chat-kit，副作用交宿主；在 js-sdk 裡 **SDK 自己就是宿主**——它知道 `botProviderEndpoint`（各產品 BFF 的 relay 路徑一律是同一個 base 接 `message/feedback`，與 `message/sse` 同源）也握有 `sendMessage`。用 boolean 開關與 `enableUpload` / `enableExport` 同一套語法，消費端接起來就是一行。F-033 AC 寫「未提供送出評價的 callback，整列不渲染」是 chat-kit 層的說法，這裡對應的就是 `enableFeedback` 未開。
- **評價列掛在 `ConversationMessageRenderer` 的 bot 分支之後，不掛在 `TemplateBoxContent`。** `MessageActions` 掛在 `TemplateBoxContent`，但那只在自訂 renderer 用了 `MessageContainer` / `renderDefaultContent()` 時才會出現；Mimir 的 TABLE / CHART 兩條都不呼叫它，評價列會消失（asgard-sdk-pm#96 留言第 1 點）。bot 訊息自 chat-kit 對齊後已是 content-first、無 avatar 欄，所以掛在 renderer 輸出之後、同一欄位，左緣對齊沒有問題。代價：自訂 renderer 若對某則 bot 訊息回傳 `null`，那則仍會長出評價列——這是 `renderMessageContent` 回傳值不可觀察的既有限制，先接受，README 註明。
- **已評狀態在 POST 成功後由 SDK 直接寫進 conversation。** prototype 設計文件 §3 說「同一 client 剛送出的那筆也會從 live plane 回來、以伺服器回音為準」，前提是 client 有一條常開的 SSE。**SDK 沒有**：`fetchSse` 在 `run.done` 就結束，idle 時沒有任何連線，echo 到不了。所以 200 之後直接以「送出的 verdict / comment」寫入（伺服器已確認，不是樂觀更新；UC-059 Alt B「不做樂觀更新」仍成立），重整後由 rejoin 重播接手（UC-058）。不做輪詢、不為此開連線。
- **送出失敗時 modal 不關。** UC-055 Alt A 明寫「modal 保留使用者已輸入的文字讓他重試」，prototype 卻是按下就關、fire-and-forget。原型與決議衝突以決議為準。錯誤文案是 SDK 內的一行（`feedback.submitFailed`），不另開 toast 系統；**不**轉給 `onSseError`——那條線的語意是 SSE 連線出錯，而這裡的錯誤已經有可見的出口（modal 內），再丟一份只會讓消費端收到兩次同一件事。
- **run 進行中評價列 disabled。** 不在 spec 裡，但少了它 R10 的續送會撞 `ChannelBusyError`，而 `wrappedSendMessage` 會把它吞掉、只走 `onSseError`——使用者看到的是「勾了同時告訴 AI 卻沒有回應」。與 composer 送出鈕在忙碌時 disabled 是同一條規則。
- **一則 assistant 訊息一列，不做「一個 turn 只顯示最後一則」。** 平台評的對象就是單一則 `message.complete`（asgard-sdk-pm#96 留言第 2 點）。宿主若要收斂是宿主的呈現決定，SDK 不替它猜；先不加 filter prop，等有人要再加。
- **8 KiB 用 UTF-8 bytes 算。** 後端 `len(req.Comment)` 是 Go 的 byte 長度；中文一字 3 bytes，用字元數擋會漏。前端以 `TextEncoder` 量。
- **canvas 訊息不掛評價列。** 後端說可評的是 `asgard.message.complete` 的 messageId；canvas 走 `asgard.message.canvas.complete`，能不能評未經確認，先不掛，避免 404。

---

## Execution Log / Change Log

- 2026-09-02: BUILD task created from https://github.com/asgard-ai-platform/asgard-sdk-pm/issues/96 (Status: `draft`).
- 2026-09-02: Plan confirmed; implementation started on `feat/96-message-feedback` (Status: `draft → ready → in-progress`).
- 2026-09-02: T1–T12 完成（Status: `in-progress → done`）。閘門全綠 —— `lint:packages` 0 error（5 個既有 warning）、`format:check` 乾淨、`typecheck` 三專案綠、`build:core` / `build:react` 乾淨、`test:packages` core 295 + react 464 全數通過（新增 20 + 22）。瀏覽器實走見 Coverage。兩個實作中才浮現的點：(1) react 的 Vitest 把 `@asgard-js/core` 解析到 `packages/core/dist`，core 改完沒先 `build:core` 時 `feedbackCommentByteLength is not a function`——照 index 記的順序 lint → format → typecheck → build → test 就對了；(2) demo mock 原本沒把送出的評價記住，重整後只會看到 seed 的兩筆，於是加了記憶體內的 `acceptedFeedback` 讓 rejoin 也重播使用者剛評的（真後端本來就會，mock 得補上才能示範 UC-058）。
