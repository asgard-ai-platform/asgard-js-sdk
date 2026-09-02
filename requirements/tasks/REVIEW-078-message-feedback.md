# REVIEW-078 Review: message feedback (Good / Bad response)

## Meta

- Task ID: `REVIEW-078`
- Status: `done`
- BUILD Task: `BUILD-078`
- Reviewed commit: `2b0d5906`（分支基底；本 cycle 的 commit 於審查後才建立，見 Execution Log）
- Reviewed branch: `feat/96-message-feedback`

---

## §1 Static Code Review

Scope：BUILD-078 `## Coverage` 所列 28 個檔案（core 10、react 13、demo 4、README 2）。

### §1.1 Checklist

| Check item                                                | Rule                           | Result                                                                                                                                 |
| --------------------------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| 有無 `any` / `as any`                                     | FRONTEND_RULE_COMMON §1.1      | ✅                                                                                                                                     |
| 有無 `@ts-ignore` / `eslint-disable` 規避型別或 lint 錯誤 | FRONTEND_RULE_COMMON §1.2      | ✅（6 個 hit 全是既有的 debug-gated `no-console` 行，不在本次 diff 內）                                                                |
| library code 有無殘留 `console.log`                       | FRONTEND_RULE_COMMON §1.3 §7   | ✅（3 個 hit 皆既有、皆受 `debugMode` 控制）                                                                                           |
| 有無 hardcode API key / endpoint / namespace              | FRONTEND_RULE_COMMON §1.4      | ✅（feedback 端點由 `botProviderEndpoint` 推導，與 `/message/sse` 同源）                                                               |
| RxJS 訂閱 / EventSource / timer 是否都有 teardown         | FRONTEND_RULE_COMMON §1.5      | ✅（本次未新增任何訂閱或 timer；modal 只有一個 `useEffect` focus，無需 cleanup）                                                       |
| react 只從 `@asgard-js/core` 公開進入點 import            | FRONTEND_RULE_COMMON §1.6      | ✅                                                                                                                                     |
| core 無 import `react` / `react-dom` / DOM API            | FRONTEND_RULE_COMMON §1.6 §2.1 | ✅（`TextEncoder` 是 Node ≥ 11 與瀏覽器共有的全域，非 DOM）                                                                            |
| 公開 API 變更是否經 `@deprecated` 過渡                    | FRONTEND_RULE_COMMON §1.7      | ✅（純加法：新 prop、新 optional 方法、新 optional 欄位；`IAsgardServiceClient.sendMessageFeedback?` 為 optional，自訂 client 不會斷） |
| 新增公開型別 / 函式 / 元件是否從 package 進入點導出       | FRONTEND_RULE_COMMON §2.2      | ✅（core：`export type *` 涵蓋新型別 + 四個 helper 明確導出；react：`components/index.ts` 導出 `message-feedback` barrel）             |
| 型別 / enum 前置依賴齊備                                  | FRONTEND_RULE_COMMON §2.3      | ✅（T1 先於元件）                                                                                                                      |
| 使用 `botProviderEndpoint`                                | FRONTEND_RULE_COMMON §2.4      | ✅                                                                                                                                     |
| 導出函式 / 方法 explicit return type                      | FRONTEND_RULE_COMMON §3.1      | ✅（ESLint `explicit-function-return-type` 0 error）                                                                                   |
| 共用型別集中於 core `src/types/`，無跨檔重複              | FRONTEND_RULE_COMMON §3.2      | ✅（`FeedbackVerdict` / `MessageFeedbackState` 只在 core 定義；react 的 `FeedbackSubmission` 是 UI 層專屬形狀）                        |
| React 元件 props 完整型別化                               | FRONTEND_RULE_COMMON §4.1      | ✅                                                                                                                                     |
| 元件無 hardcode 色值                                      | FRONTEND_RULE_COMMON §4.2      | ✅（兩份新 scss 全走 `--asgard-feedback-*` → `--asg-color-*`，零 hex / rgba）                                                          |
| `react` / `react-dom` 維持 peerDependencies               | FRONTEND_RULE_COMMON §4.4      | ✅（未新增相依）                                                                                                                       |
| core 與 react 版本號一致                                  | FRONTEND_RULE_COMMON §5        | ✅（0.3.80 / 0.3.80）                                                                                                                  |
| 重複邏輯 / 型別 / JSX 是否已抽出                          | FRONTEND_RULE_COMMON §6        | ✅（bar 的兩顆按鈕以 `renderButton(verdict)` 共用；theme 變數解析與 consent modal 各自一份——第二次出現，第三次才抽）                   |
| 無 `setTimeout` 模擬 delay、註解死碼、TODO / FIXME        | FRONTEND_RULE_COMMON §7        | ✅（4 個 `setTimeout` hit 皆既有真計時器且有 teardown；demo mock 的 `sleep()` 是 mock server 端，不在 library）                        |

### §1.2 Mechanical Grep

```
## any                       → (empty)
## ts-ignore/eslint-disable  → packages/core/src/lib/client.ts:76,508,514,557,563 ; packages/react/src/hooks/use-channel.ts:648
                                （全部是 `// eslint-disable-next-line no-console`，既有、debug-gated；`git diff -U0 | grep '^+'` 對這些 pattern 為 0 hit）
## console.log               → packages/core/src/lib/client.ts:509,558 ; packages/react/src/hooks/use-channel.ts:649（同上，既有）
## core->react               → (empty)
## react deep import         → (empty)
## hardcoded colors (new scss) → (empty)
## setTimeout                → packages/core/src/lib/channel.ts:97,878 ; packages/core/src/lib/client.ts:45,445（既有 force-stop / detach 計時器，皆有 clear）
## TODO/FIXME                → (empty)
```

> 第一輪 grep 又給了假空輸出——zsh 不對 `$F` 做字串拆分，整串路徑被當成一個不存在的檔案（`_index.md` 對 BUILD-072 記過同一件事）。改用陣列 `"${F[@]}"` 重跑後才拿到上面的結果。

### §1.3 / §1.4 Lint / Format / Typecheck / Build / Test

```
lint:packages:  PASS — 0 errors（5 個既有 warning：aria-description、exhaustive-deps ×2、useless-fragment ×2，皆不在本次檔案）
format:check:   PASS
typecheck:      PASS — 3 projects（core / react / react-demo）
build:          PASS — build:core、build:react 皆乾淨（dist 內含 `asgard-message-feedback`）
test:packages:  PASS — core 295 / react 464（本 cycle 新增 20 + 22）
```

### §1.5 Static Review Acceptance

- [x] §1.1 全部項目核對並回報
- [x] 無 ❌ 違規
- [x] §1.2 全部 grep 已執行、輸出已貼
- [x] `npm run lint:packages` 0 error
- [x] `npm run build:core && npm run build:react` 綠燈

---

## §3 Functional Validation

驗收環境：`npm run serve:react-demo -- -- --port 5100`，`/message-feedback`，Playwright（chromium，1600×1000），寬版（full-bleed）與窄版（375×640）並排。單元測試以 Vitest。

### R# Result Matrix

| R#  | Description                                                                       | Result | Note                                                                                                                                                         |
| --- | --------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R1  | `asgard.message.feedback` 折進目標 bot 訊息，latest-wins                          | Pass   | Vitest ×4；瀏覽器：重播第一則 GOOD→BAD 後亮 👎                                                                                                               |
| R2  | 事件早於目標 / 目標非 bot 不丟、不炸                                              | Pass   | Vitest ×3（parked → complete 套用；user 目標忽略；其他 reducer 帶著 pending 走）                                                                             |
| R3  | `client.sendMessageFeedback` POST `{base}/message/feedback`，非 2xx → `HttpError` | Pass   | Vitest ×5（URL / header / body、comment 為空不帶、envelope 與 bare、404/400/500、network）；瀏覽器 Network 看到 body `{customChannelId, messageId, verdict}` |
| R4  | `channel.sendMessageFeedback` 成功寫入、失敗不動                                  | Pass   | Vitest ×3（含無方法的 client 拒絕）                                                                                                                          |
| R5  | `composeFeedbackMessage` 前綴 + 空行 + trimmed comment                            | Pass   | Vitest ×4；瀏覽器：續送訊息文字為 `[Response Feedback: Good]`                                                                                                |
| R6  | `enableFeedback` 下每則完成 bot 訊息一列，自訂 renderer 也有，user / typing 無    | Pass   | Vitest ×6（含 `renderMessageContent` 不呼叫 `renderDefaultContent()`）；瀏覽器：3 則回覆 3 列、3 則 user 0 列、插曲回應也有列                                |
| R7  | modal 形狀、focus、預設勾選、順序、Esc / 取消 / 點外側                            | Pass   | Vitest ×5；瀏覽器：title `提供正面回饋`、activeElement=TEXTAREA、checkbox checked、textarea→checkbox→submit 順序、Esc 與點外側皆關閉且零請求                 |
| R8  | 送出 → POST → 關閉 → 亮起；8 KiB 超長前端擋                                       | Pass   | Vitest ×5（含 pending disabled）；瀏覽器：送出中按鈕 `送出中…` disabled、200 後 👍 亮；2800 個中文字 → 錯誤行、0 request                                     |
| R9  | 失敗時 modal 不關、文字保留、錯誤行、不亮、不續送                                 | Pass   | Vitest ×1；瀏覽器：404 → `回饋送出失敗，請再試一次。`、textarea 值保留、submit 可再按、bar 不亮、user 訊息數不變                                             |
| R10 | 勾選才續送；評價失敗不續送                                                        | Pass   | Vitest ×3；瀏覽器：預設勾選 → 續送並收到插曲；取消勾選改評 → 不續送                                                                                          |
| R11 | 改評換亮；再點已亮那顆同 modal                                                    | Pass   | Vitest ×2；瀏覽器：第一則 BAD→GOOD 後 `GOOD:true BAD:false`                                                                                                  |
| R12 | 三語 `feedback.*` 全解析                                                          | Pass   | Vitest ×2（16 key × 3 locale parity + zh-TW 端到端）；瀏覽器：en-US / ja-JP 的 aria-label、title、modal 標題 / placeholder / checkbox / 按鈕全部切換         |
| R13 | run 進行中兩顆 disabled                                                           | Pass   | Vitest ×1；瀏覽器：串流中 4 列 8 顆全 disabled，`run.done` 後全恢復                                                                                          |
| R14 | 閘門全綠 + demo 兩寬度走查                                                        | Pass   | 見 §1.4；重整後兩個 shell 的已評狀態皆由 rejoin 重播還原（mock 記住本次送出的評價）                                                                          |

### §3.1 Acceptance

- [x] Coverage 所列 R1–R14 全部執行 Step 1–3
- [x] 每個 R# 皆標記 Pass 並附實際結果
- [x] 對應 Vitest 全數執行並通過
- [x] 邊界：404 / 500 / 超長 / 網路失敗 / run 中 / 重整重播 / 事件早於目標 皆確認

---

## Findings

### Critical (must fix before done)

None.

### Important (should fix in this cycle)

None.

### Minor (nice to have)

1. **modal 相對 viewport 置中，不相對 chatbot shell。** 與既有 consent modal 同一做法（`position: fixed; inset: 0`），在 375 寬的嵌入 widget 裡 modal 會蓋在宿主頁面中央而不是 widget 中央。prototype 也是 fixed，且消費端多為 full-bleed，先不動；若日後有嵌入式消費端反映再一起處理兩個 modal。
2. **`renderMessageContent` 回傳 `null` 的 bot 訊息仍會長出評價列。** BUILD-078 Decisions 已記，README 已註明；renderer 的回傳值不可觀察，這是掛在 renderer 之外的代價。
3. **theme 變數解析在 consent modal 與 feedback modal 各有一份（第二次出現）。** §6 門檻是三次，先不抽。

---

## Execution Log

- 2026-09-02: REVIEW task created, paired with BUILD-078 (Status: `draft`).
- 2026-09-02: BUILD-078 done (Status: `draft → ready`).
- 2026-09-02: §1 靜態審查 —— 19 項 ✅ / 0 ❌，grep 7 組（第一輪 zsh 未拆字串給了假空輸出，改陣列重跑），lint / format / typecheck / build / test 全綠；§3 功能驗收 —— R1–R14 全 Pass（Vitest 42 案 + Playwright 兩寬度實走）。Minor ×3 記錄、不擋（Status: `ready → in-progress → done`）。
