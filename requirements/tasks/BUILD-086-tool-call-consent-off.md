# BUILD-086 Let the host replace the built-in tool-call consent modal

## Meta

- Task ID: `BUILD-086`
- Status: `done`
- Issue: [asgard-freyr-pm#901 留言 2026-10-01](https://github.com/asgard-ai-platform/asgard-freyr-pm/issues/901#issuecomment-5928013125)（同一張票的第二件事；第一件是 BUILD-085。形狀已在 [評估回覆](https://github.com/asgard-ai-platform/asgard-freyr-pm/issues/901#issuecomment-5928886722) 對外說明）
- Source spec: 無 PM spec。契約來源是上述留言的「需求」段與評估回覆中定下的形狀
- Complexity: `M`

---

## Brief

`<Chatbot>` 無條件掛 `<ToolCallConsentGate />`（`chatbot.tsx:598`），沒有 prop 能停用或替換，所以 README 對
`pendingConsent`／`replyToolCallConsents` 寫的「build a custom consent UI」實際做不到。用 CSS 藏起來也不行：host 自己呼叫
`replyToolCallConsents` 後，core 把 `pendingConsent` 清成 `null`，但 Gate 的 seeding effect 遇到 `null` 直接 return，佇列只在
Gate 自己送出時才清 ⇒ modal 保持掛載，`body` 的 `overflow: hidden` 不放。

本 task 在 `@asgard-js/react`：

1. `<Chatbot toolCallConsent?: 'builtin' | 'off'>`，預設 `'builtin'`。命名與語意比照既有的 `fileExplorer`（`'off'` = 不掛內建、
   host 自己放）。
2. 把 Gate 的佇列邏輯抽成公開 hook `useToolCallConsentQueue()`，回傳 `{ pendingCall, currentIndex, totalCount, decide }`；Gate
   改成「hook + modal」。host 在 `<Chatbot>` 樹內任何位置（例如 `renderComposerAbove`）呼叫它即可就地渲染自己的卡片。
3. 佇列在「`pendingConsent` 於同一個 channel 變 `null`」時丟掉該批 —— 那代表這批已被回覆（若是繞過佇列直接回覆，舊版會殘留）。

**為什麼不是留言提的兩種**（已在評估回覆說明）：`renderToolCallConsent` 的渲染位置只能在 Gate 那一格，即 chat column grid
（`max-content 1fr max-content max-content max-content`）footer 之後；內建 modal 是 `position: fixed` 不佔格，in-flow 的卡片則會
落在 composer 下方，做不到 Freyr 要的就地呈現。只給 disable 開關則逼 host 重寫 `alreadyAllowed` 代答、同批 ALLOW_ALWAYS、#331
被拒還原、#455 reset 作廢。

**與既有決定的衝突（2026-10-01 確認改寫）**：`consent-queue-invalidation.spec.tsx` 的 #455 `R5` 釘的是「同一 channel 上 `pendingConsent` 變
`null` 時佇列必須留著」，理由寫「streaming update 的暫時性 null 不可把 modal 抽走」。查 core：`pendingConsent` **唯一**被清成
`null` 的地方是 `Channel.replyToolCallConsents`（`channel.ts:730`），其餘所有 `Conversation` 轉換都原樣帶過、channel rebuild
也帶過（`channel.ts:504`）——所以那種暫時性 null 不存在，同 channel 上的 null 只可能是「有人回覆了」。該測試改寫成「同 channel
上變 `null` → 丟掉佇列、不送出」。

> **實作時的偏離（Decision）**：計畫原本保留「佇列自己送出中 → 保留該批」的例外（以 `submittingProcessIdRef` 判斷），實作時拿掉。
> 理由：佇列只在答完（`remaining` 為空）時才送出，此時丟掉它不會失去任何東西；送出被拒時 core 會先 `restorePendingConsent`，佇列
> 依 #331 的 `failedProcessId` 機制重新 seed。保留與丟掉兩種寫法在所有既有與新增測試下行為相同，例外分支無法被任何測試觀察到，
> 故依「以簡為先」移除。R4 的最後一句與 T3 隨之調整。

**Already exists:** `tool-call-consent-gate.tsx`（佇列、代答、#331 `failedProcessId`、#455 channel 失效、debug log）、
`ToolCallConsentDecision`（modal 已 export）、`ToolCallConsentPendingCall`（core 已 export）、`useChannel` 的
`onToolCallConsentReply`（BUILD-085；hook 經同一個 `replyToolCallConsents` 送出，觸發時機不變）、demo `/tool-call-consent`
（接 dev consent bot）。core 程式不動。

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

| §    | Rule (summary)                                                                                                     |
| ---- | ------------------------------------------------------------------------------------------------------------------ |
| #901 | 佇列邏輯只有一份：Gate 必須經由 `useToolCallConsentQueue()`，不得保留平行實作（§6）                                |
| #901 | 預設 `'builtin'` 的行為一個位元都不變：既有 consent spec 除 #455 R5 改寫外全部原樣通過                             |
| #901 | 不帶 Freyr 產品規則：SDK 不拿掉 `ALLOW_ALWAYS`、不改內建 modal 的外觀或文案                                        |
| #901 | 既有 debug-gated `console.log`（`client?.debugMode`）隨邏輯搬進 hook，不新增 log；既有 `eslint-disable` 註解一併搬 |
| #901 | 本 task 不改 core、不改後端；Freyr web 的卡片不在範圍                                                              |

---

## Acceptance Criteria

- `R1` When `toolCallConsent` is `'off'` and a consent batch arrives, `<Chatbot>` shall not render the built-in consent
  dialog and shall not touch `document.body.style.overflow`. When it is omitted or `'builtin'`, behavior shall be
  unchanged. → T4, T5
- `R2` When a component inside the `<Chatbot>` tree calls `useToolCallConsentQueue()`, it shall receive the head call
  that needs an answer (`pendingCall`, or `null` when none), its 1-based `currentIndex` and the batch `totalCount`, and a
  `decide(decision)` that records the answer; calls marked `alreadyAllowed` (as `ALLOW_ONCE`) and calls whose
  toolset/tool was answered `ALLOW_ALWAYS` earlier in the same batch (as `ALLOW_ALWAYS`) shall be answered without ever
  being exposed as `pendingCall`; once every call is answered the batch shall be sent exactly once through
  `replyToolCallConsents`, so `onToolCallConsentReply` fires as in BUILD-085. → T1, T5
- `R3` When that reply is refused, the hook shall expose the same batch again from its first call (#331); when the
  channel is replaced (reset, `customChannelId` change) it shall drop the batch and send nothing (#455). → T1, T5
- `R4` When a consent reply for the current batch is sent by anything other than the queue itself — the host calling
  `replyToolCallConsents` directly — the queue shall drop that batch: `pendingCall` becomes `null`, the built-in dialog
  (if mounted) unmounts and `body` overflow is restored, and the queue sends no reply of its own. → T3, T5
- `R5` The built-in consent modal shall be driven by `useToolCallConsentQueue()` with no second copy of the queue
  logic, and every existing consent spec (`consent-reply-error`, `consent-reply-notification`,
  `consent-queue-invalidation`) shall pass — the last with #455 R5 rewritten per the Brief. → T2, T5
- `R6` When a developer reads the react README, they shall find `toolCallConsent` in the `<Chatbot>` props table; a
  section on building a custom consent UI with `toolCallConsent="off"` + `useToolCallConsentQueue()` (return shape, an
  example in `renderComposerAbove`); and two stated constraints — use the hook only with `'off'` (two queues would each
  reply), and keep it mounted while a run may raise consent (a batch of only auto-answered calls is sent by the hook,
  so with nothing mounted the run stays paused). The `pendingConsent` / `replyToolCallConsents` rows shall point to the
  hook instead of claiming they alone build a custom UI. → T6
- `R7` (Smoke check) When the developer runs `lint:packages`, `format:check`, `typecheck`, `build:core`, `build:react`
  and `test:packages`, all shall pass; and on a new react-demo route rendering a narrow (375×640) and a full-bleed shell
  side by side with `toolCallConsent="off"` and a host card above the composer showing only Allow-once / Deny, against
  the dev consent bot, Allow and Deny shall each resume the run, no full-screen dialog shall appear, the page shall stay
  scrollable, and `onToolCallConsentReply` shall log once per batch. → T7, T8

---

## Implementation Tasks

- [x] T1 (R2, R3): 新檔 `packages/react/src/hooks/use-tool-call-consent-queue.ts` —— 把 Gate 的 `QueueState`、
      `allowAlwaysSetRef`、`submittingProcessIdRef`、`failedProcessId`、channel 失效、seeding、`submit`、auto-advance、
      `handleDecide` 原樣搬入；回傳 `ToolCallConsentQueue`（`export interface`，含 explicit return type）。從
      `hooks/index.ts` export。`ToolCallConsentDecision` 型別移到 hook 檔並由 modal re-import（避免 hooks → components 依賴），
      對外 export 名稱不變。
- [x] T2 (R5): `tool-call-consent-gate.tsx` 改為 `useToolCallConsentQueue()` + `<ToolCallConsentModal>`。
- [x] T3 (R4): hook 的 seeding effect —— `pendingConsent` 為 `null` 時清掉佇列與 `allowAlwaysSetRef`（見 Brief 的 Decision）。
- [x] T4 (R1): `ChatbotProps.toolCallConsent?: 'builtin' | 'off'`（JSDoc 比照 `fileExplorer`），`'off'` 時不掛 Gate。
- [x] T5 (R1–R5): react Vitest —— 新檔 `use-tool-call-consent-queue.spec.tsx`（hook 經 harness 驗 R2–R4，含「佇列送出中
      保留」與「host 直接回覆後清掉、不重送、body overflow 還原」）；`chatbot` 層驗 `'off'` 不出 dialog；改寫
      `consent-queue-invalidation.spec.tsx` 的 R5。每條新測試以反向改壞實作確認會紅。
- [x] T6 (R6): `packages/react/README.md` —— props 表加 `toolCallConsent`；〈Tool Call Consent〉新增 custom UI 段落與
      兩條限制；修 `pendingConsent`／`replyToolCallConsents` 兩列說明。
- [x] T7 (R7): demo 新 route（不動既有 `/tool-call-consent`）—— 窄寬兩個 shell 並排、各自 `customChannelId`、
      `toolCallConsent="off"`、`renderComposerAbove` 放只有兩顆鈕的 host 卡片、side panel log `onToolCallConsentReply`。
- [x] T8 (R7): `npm run lint:packages && npm run format:check && npm run typecheck`、
      `npm run build:core && npm run build:react`、`npm run test:packages`；demo 對 dev consent bot 兩個寬度各走允許與拒絕。

---

## Coverage

Use Cases: `R1`–`R7`。R1 由 hook spec（host 卡片單獨掛載無 dialog、`body` 不鎖）＋ `chatbot.tsx` 掛載條件的 source 斷言＋ demo；
R2–R4 由 `use-tool-call-consent-queue.spec.tsx`（6 案；反向驗證見 Execution Log）；R5 由既有三份 consent spec（除改寫的 #455 R5
外原樣通過）；R6 由 README；R7 由閘門與 `/tool-call-consent-custom` 接 dev consent bot 兩寬度各走一輪。

Files:

| File (package)                                                                            | Change                                                                                                         |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `packages/react/src/hooks/use-tool-call-consent-queue.ts`                                 | 新檔 — 自 Gate 搬入的佇列；`ToolCallConsentQueue`、`ToolCallConsentDecision`；null 即丟佇列（T1、T3）          |
| `packages/react/src/hooks/index.ts`                                                       | export 新 hook（T1）                                                                                           |
| `packages/react/src/components/tool-call-consent/tool-call-consent-gate.tsx`              | 改為 hook ＋ modal（T2）                                                                                       |
| `packages/react/src/components/tool-call-consent/tool-call-consent-modal.tsx`             | `ToolCallConsentDecision` 改自 hook import（T1）                                                               |
| `packages/react/src/components/chatbot/chatbot.tsx`                                       | `toolCallConsent?: 'builtin' \| 'off'`，`'builtin'` 才掛 Gate（T4）                                            |
| `packages/react/src/hooks/use-tool-call-consent-queue.spec.tsx`                           | 新檔 — R1–R4（T5）                                                                                             |
| `packages/react/src/components/tool-call-consent/consent-queue-invalidation.spec.tsx`     | 改寫 #455 R5（T5）                                                                                             |
| `packages/react/README.md`                                                                | props 列表、Hooks 章節、〈Building your own consent UI〉、`pendingConsent`／`replyToolCallConsents` 兩列（T6） |
| `apps/react-demo/src/app/routes/tool-call-consent-custom/*`                               | 新 route — 窄寬並排、host 卡片、reply log（T7）                                                                |
| `apps/react-demo/src/app/app.tsx`、`apps/react-demo/src/app/components/layout/layout.tsx` | 註冊 route（T7）                                                                                               |

**公開 API 影響（§1.7）**：全部 additive。`ChatbotProps` 多一個選填 prop（預設維持舊行為）；新增 `useToolCallConsentQueue` 與
`ToolCallConsentQueue`。`ToolCallConsentDecision` 的定義從 modal 檔搬到 hook 檔，從 package 進入點 export 的名稱與形狀不變。
行為變更一項：host 直接呼叫 `replyToolCallConsents` 後，內建 modal 會關閉（舊版殘留，即本票要修的缺陷）。core 不動。未 bump 版本。

---

## Execution Log

- 2026-10-01: BUILD task created from [asgard-freyr-pm#901 留言](https://github.com/asgard-ai-platform/asgard-freyr-pm/issues/901#issuecomment-5928013125) (Status: `draft`). 形狀（`'off'` + 公開 hook）於建檔前決定，並已回覆 issue。
- 2026-10-01: Plan confirmed; implementation started (Status: `draft → ready → in-progress`).
- 2026-10-01: 重構後既有 consent spec 只有 #455 R5 紅（預期中），其餘 14 案原樣通過；R5 依 Brief 改寫。
- 2026-10-01: 反向驗證（逐一改壞 hook，每次跑 consent specs 後還原）：M1 null 不清佇列 → 3 紅（#455 R5 與兩條 R4）；M2 不過濾
  `alreadyAllowed` 的 head → 起初 0 紅（`findByText` 只看最終狀態），R2 改為逐 render 記錄露出過的 `pendingCall` 後 1 紅；M3
  `totalCount` 只算 remaining → 3 紅；M4 不過濾同批 ALLOW_ALWAYS → 1 紅。
- 2026-10-01: demo `/tool-call-consent-custom` 對 dev consent bot（開場 run 即觸發 4 筆 consent）：兩寬度卡片都在 composer 上方
  （寬 712px、窄 319px，皆在 textarea 之上）、`[role=dialog]` 0 個、`body.style.overflow` 為空；寬版答 允許 ×3 ＋拒絕、窄版 拒絕 ×4，
  每次露出 1/4→4/4 依序，`onToolCallConsentReply` 各觸發一次、4 筆 id 與結果與按下的一致，兩個 run 都續跑完成、composer 恢復可用。
  對照 `/tool-call-consent`（預設 `'builtin'`）：內建 dialog 照常出現、`body` overflow 為 `hidden`。
- 2026-10-01: Build complete — lint（0 error；5 warnings 皆為 `main` 既有）/ format / typecheck（core + react + react-demo）/
  build / test（core 430、react 619）全綠 (Status: `in-progress → done`).
- 2026-10-01: demo 改為 zh-TW，並加「重現 #901」區（`'builtin'` shell、modal 以 CSS 藏起、host 直接回覆鈕、`body` overflow 即時指示）。暫時拿掉 null 分支重拍：回覆被收下後指示器仍為 `hidden`；還原後轉為空。
- 2026-10-01: 補驗被拒（頁內攔截 `RESPONSE_TOOL_CALL_CONSENT` 回 HTTP 500）：`onSseError` 一次、無 reply callback、卡片回到 1/4 同 id；解除後重答，回覆一次。
