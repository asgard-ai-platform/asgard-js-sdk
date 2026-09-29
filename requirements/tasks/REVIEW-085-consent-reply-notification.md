# REVIEW-085 Review: notify the host when a tool-call consent reply is accepted

## Meta

- Task ID: `REVIEW-085`
- Status: `done`
- BUILD Task: `BUILD-085`
- Reviewed commit: `97a4f766`
- Reviewed branch: `feat/901-consent-reply-notification`

---

## §1 Static Code Review

Scope is `BUILD-085 ## Coverage` (three react source files, one new spec, core `sse-response.ts` JSDoc, two READMEs,
one demo route). `lint` / `format` / `typecheck` / `build` / `test` run project-wide.

### §1.1 Checklist

| Check item                                           | Rule                           | Result |
| ---------------------------------------------------- | ------------------------------ | ------ |
| `any` / `as any`                                     | FRONTEND_RULE_COMMON §1.1      | ✅     |
| `@ts-ignore` / `eslint-disable`                      | FRONTEND_RULE_COMMON §1.2      | ✅ ¹   |
| `console.log`                                        | FRONTEND_RULE_COMMON §1.3 §7   | ✅ ¹   |
| Hardcoded key / endpoint / namespace                 | FRONTEND_RULE_COMMON §1.4      | ✅ ²   |
| Teardown for subscriptions / listeners / timers      | FRONTEND_RULE_COMMON §1.5      | ✅ ³   |
| react → core through the public entry only           | FRONTEND_RULE_COMMON §1.6      | ✅     |
| core free of react / react-dom / DOM                 | FRONTEND_RULE_COMMON §1.6 §2.1 | ✅ ⁴   |
| **No breaking public-API change**                    | FRONTEND_RULE_COMMON §1.7      | ✅ ⁵   |
| New public type exported from the package entry      | FRONTEND_RULE_COMMON §2.2      | ✅ n/a |
| Explicit return types on exported functions          | FRONTEND_RULE_COMMON §3.1      | ✅     |
| Shared types centralized; no duplicates              | FRONTEND_RULE_COMMON §3.2      | ✅ ⁶   |
| Component props fully typed                          | FRONTEND_RULE_COMMON §4.1      | ✅     |
| No hardcoded colour values                           | FRONTEND_RULE_COMMON §4.2      | ✅ ⁷   |
| core and react share a version number                | FRONTEND_RULE_COMMON §5        | ✅ ⁸   |
| Repeated logic extracted (≥2×)                       | FRONTEND_RULE_COMMON §6        | ✅ ⁹   |
| `setTimeout` mock, dead code, untracked TODO / FIXME | FRONTEND_RULE_COMMON §7        | ✅     |
| Callback 經 `notify` 呼叫，throw 不卡住 run          | #901                           | ✅ ¹⁰  |
| Payload 沿用 `ToolCallConsentAnswer[]`，無平行型別   | #901                           | ✅     |
| 文件只寫實測過的後端行為；自動放行寫成限制           | #901                           | ✅ ¹¹  |
| 不改 core 程式、gate 代答規則、後端                  | #901                           | ✅     |

¹ 唯一命中是 `use-channel.ts:662-663` 既有的 `debugMode` 守門 log（`// eslint-disable-next-line no-console` +
`console.log`），不在本次 diff 內。
² demo 的 endpoint／key 來自 `import.meta.env`，未新增任何值。
³ 沒有新增訂閱或 timer；一次性旗標 `accepted` 是 `replyToolCallConsents` 每次呼叫的區域變數，隨該次呼叫結束。
⁴ core 只改 `sse-response.ts` 的 JSDoc，註解刻意不提 react 的 prop 名稱。
⁵ `UseChannelProps`、`AsgardServiceContextProviderProps`、`ChatbotProps` 各多一個選填 callback；未傳時行為與 `main` 相同。
⁶ 後兩個 props 型別以 `UseChannelProps['onToolCallConsentReply']` 衍生，沒有第二份簽章。
⁷ react diff 的 `#xxx` 命中只有註解與測試名稱裡的票號（`#901`、`#331`、`#410`）。
⁸ 未 bump（兩者仍為 `0.3.87`）。
⁹ 觸發點兩處（第一個 frame、完成）共用同一個 `accept`。
¹⁰ spec R5 一案；反向驗證拿掉 `notify` 後該案轉紅。
¹¹ id 對應、自動放行不進 consent frame、多筆允許後改以新 id 回報，三者皆有 dev 實測（見 BUILD-085 Execution Log 與下方 §3）。

### §1.2 Mechanical grep

```text
[any]              (empty)
[ignore]           use-channel.ts:662（既有 debugMode log，非本次 diff）   ← 見 ¹
[console]          use-channel.ts:663（同上）                              ← 見 ¹
[setTimeout]       (empty)
[TODO/FIXME]       (empty)
[core → react]     (empty)
[react → core/src] (empty)
[color, react]     僅票號 #901 / #331 / #410 誤報
```

### §1.4 Build / Lint / Format

```text
lint:packages: PASS — core 0；react 5 warnings（皆在本次未動的檔案：chat-composer、兩個 file-view、兩個 spec）
format:check:  PASS
typecheck:     PASS — core + react + react-demo
build:         PASS — core, react
test:          PASS — core 430、react 602
```

---

## §3 Functional Validation

| R#   | Result | Evidence                                                                                                                                                                                                                                                          |
| ---- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `R1` | ✅     | spec 三案：送出後未收到 frame 前不觸發、第一個 frame 時觸發一次且先於 `onSseMessage`（順序斷言）、拒絕帶 `DENY_ONCE` 與原因、host 直接呼叫同樣回報。dev：4 筆一批、單筆允許、單筆拒絕三次回覆，callback 各一次，內容與 request body 的 `toolCallConsents` 相同    |
| `R2` | ✅     | spec：續跑零 frame 直接完成時觸發一次                                                                                                                                                                                                                             |
| `R3` | ✅     | spec：`onSseError`（HTTP 403）在任何 frame 前到達時不觸發；卡片放回、改按「本次對話皆允許」被接受後觸發一次且只含新答案。dev 上造不出被拒的回覆，此條只有 spec 覆蓋                                                                                               |
| `R4` | ✅     | spec：`alreadyAllowed` ＋ 同批 ALLOW_ALWAYS 代答與使用者答案同一次回報，且與送出內容相同。dev：搜電影按「本次對話皆允許」，第二筆搜電影由 gate 代答，4 筆同一次回報                                                                                               |
| `R5` | ✅     | spec：callback throw 後，同一個 frame（下一批 consent）照樣被 core 收進，下一批可回覆                                                                                                                                                                             |
| `R6` | ✅     | 型別 JSDoc（`toolUseId`、`toolCallId`、`alreadyAllowed`）與兩份 README 已寫明 id 對應、自動放行的限制、payload 與觸發點；皆與 dev 實測一致：4／4 筆 id 逐字相同；「本次對話皆允許」過的工具在後續輪次直接 `start`→`complete`，不進 consent frame、不觸發 callback |
| `R7` | ✅     | 閘門全綠（§1.4）；`/tool-call-consent` 接 dev consent bot，允許（單筆）與拒絕（單筆）各一行 callback，`toolCallId` 與該呼叫 `tool_call.start` 的 `toolUseId` 相同                                                                                                 |

寬窄並排不適用：本 task 沒有 SDK 畫面變更（BUILD-085 已註明）。

---

## Findings

### Critical (must fix before done)

None.

### Important (should fix in this cycle)

None.

### Minor (nice to have)

- 回覆被接受、續跑送出第一個 frame 之後才斷線（且沒有 resume cursor）時，callback 已觸發，但 core 仍會因 `reject` 把
  `pendingConsent` 放回（#410 既有行為），使用者可能再答一次，同一個 `toolCallId` 會回報第二次。host 以 `toolCallId`
  去重即可；這是 #410 的既有取捨，不在本票範圍。不擋。

### Out of scope — backend behaviour seen on dev (for the #901 reply)

以下皆為後端行為，SDK 無從修正，記下供回覆 #901 與後端追蹤：

1. **舊呼叫在之後每個新訊息都被重新詢問**：`call_D1Z4…`（第一輪 4 筆中被拒的搜書）在之後兩次送出新訊息時，都在模型
   處理新訊息前以原 id 再發一次 consent，沒有新的 `tool_call.start`；其中一次它前一輪已被允許並成功執行。
2. **答覆以工具為單位套用到整個續跑**：續跑中模型對同一支工具的新呼叫不再詢問，直接沿用答覆 —— 「僅此次允許」後
   新的搜書照跑；「拒絕」上述舊呼叫後，使用者剛要求的新搜書（`call_Irl5…`，gardening）也被以同一個原因拒絕。
3. **多筆一批時，被允許的呼叫以新 id 重跑**：4 筆一批中被允許的 3 筆，原 id 此後都沒有 `tool_call.complete`，改以 3 個
   新 id 各送 `start`／`complete`；單筆時則以原 id 只回 `complete`（符合後端 `SeedResumedToolCalls` 的設計）。

---

## Execution Log

- 2026-09-29: REVIEW task created, paired with BUILD-085 (Status: `draft`).
- 2026-09-29: BUILD-085 done (Status: `draft → ready`).
- 2026-09-29: §1 — 20 項 ✅、0 違規；§3 — R1–R7 全 Pass（R3 僅 spec 覆蓋）；1 Minor；另記 3 項後端行為 (Status: `ready → in-progress → done`).
