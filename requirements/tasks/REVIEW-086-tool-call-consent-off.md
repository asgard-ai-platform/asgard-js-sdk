# REVIEW-086 Review: let the host replace the built-in consent modal

## Meta

- Task ID: `REVIEW-086`
- Status: `done`
- BUILD Task: `BUILD-086`
- Reviewed commit: 未 commit 的工作樹，基於 `add56c1b`
- Reviewed branch: `feat/901-tool-call-consent-off`

---

## §1 Static Code Review

Scope is `BUILD-086 ## Coverage`（react 五個原始檔、兩份 spec、README、demo 新 route 與兩個註冊檔）。`lint` / `format` /
`typecheck` / `build` / `test` 全專案跑。本 repo 沒有 `lint:check` script，以 `lint:packages` 代替（唯讀，不帶 `--fix`）。

### §1.1 Checklist

| Check item                                                         | Rule                           | Result |
| ------------------------------------------------------------------ | ------------------------------ | ------ |
| `any` / `as any`                                                   | FRONTEND_RULE_COMMON §1.1      | ✅     |
| `@ts-ignore` / `eslint-disable`                                    | FRONTEND_RULE_COMMON §1.2      | ✅ ¹   |
| `console.log`                                                      | FRONTEND_RULE_COMMON §1.3 §7   | ✅ ¹   |
| Hardcoded key / endpoint / namespace                               | FRONTEND_RULE_COMMON §1.4      | ✅ ²   |
| Teardown for subscriptions / listeners / timers                    | FRONTEND_RULE_COMMON §1.5      | ✅ ³   |
| react → core through the public entry only                         | FRONTEND_RULE_COMMON §1.6      | ✅     |
| core free of react / react-dom / DOM                               | FRONTEND_RULE_COMMON §1.6 §2.1 | ✅ n/a |
| **No breaking public-API change**                                  | FRONTEND_RULE_COMMON §1.7      | ✅ ⁴   |
| New public API exported from the package entry                     | FRONTEND_RULE_COMMON §2.2      | ✅ ⁵   |
| Explicit return types on exported functions                        | FRONTEND_RULE_COMMON §3.1      | ✅     |
| Shared types centralized; no duplicates                            | FRONTEND_RULE_COMMON §3.2      | ✅ ⁶   |
| Component props fully typed                                        | FRONTEND_RULE_COMMON §4.1      | ✅     |
| No hardcoded colour values (library)                               | FRONTEND_RULE_COMMON §4.2      | ✅ ⁷   |
| core and react share a version number                              | FRONTEND_RULE_COMMON §5        | ✅ ⁸   |
| Repeated logic extracted (≥2×)                                     | FRONTEND_RULE_COMMON §6        | ✅ ⁹   |
| `setTimeout` mock, dead code, untracked TODO / FIXME               | FRONTEND_RULE_COMMON §7        | ✅     |
| 佇列邏輯只有一份，Gate 經 hook                                     | #901                           | ✅     |
| 預設 `'builtin'` 行為不變；既有 consent spec 除 #455 R5 外原樣通過 | #901                           | ✅ ¹⁰  |
| 不帶 Freyr 產品規則（`ALLOW_ALWAYS`、modal 外觀與文案未動）        | #901                           | ✅     |
| 不改 core、不改後端                                                | #901                           | ✅     |

¹ 三組命中（`use-tool-call-consent-queue.ts:131/132`、`148/149`、`223/224`）都是自 Gate 原樣搬入的 `client?.debugMode` 守門
log；`git diff main -- packages/react/src` 中同樣的 6 行在 Gate 被刪除，未新增任何 log 或 disable。
² demo 的 endpoint／key 來自 `import.meta.env`。
³ 沒有新增訂閱或 timer；hook 的 effect 與 ref 是自 Gate 搬入的同一組。
⁴ `ChatbotProps` 多一個選填 prop，預設 `'builtin'` 等於舊行為；新增 `useToolCallConsentQueue` / `ToolCallConsentQueue`。
`ToolCallConsentDecision` 定義搬到 hook 檔，以暫時的消費端檔案 import `ToolCallConsentDecision`、`ToolCallConsentModalProps`、
`ToolCallConsentGate`、`ToolCallConsentModal` 與新 API 後跑 `typecheck:demo`（`--skip-nx-cache`）通過，同時放入型別錯誤的 canary
確認該閘門會失敗；兩檔已刪。
⁵ `dist/hooks/index.d.ts` 含 `export * from './use-tool-call-consent-queue'`，`dist/index.js` 有 `as useToolCallConsentQueue`，
`dist/components/chatbot/chatbot.d.ts` 有 `toolCallConsent?: 'builtin' | 'off'`。
⁶ `ToolCallConsentDecision` 只剩 hook 檔一份定義，modal 以 `import type` 取用；`ToolCallConsentPendingCall` 沿用 core。
⁷ react 原始檔的 `#xxx` 命中全是註解與測試名稱裡的票號（`#331`、`#455`、`#901`…）。demo route 的 scss 有 4 個字面色（log 邊框、
成功／錯誤字色），與其他 demo route 同寫法；host 卡片本身用 `--asg-color-*`。
⁸ 未 bump（兩者仍為 `0.3.89`）。
⁹ 佇列邏輯從 Gate 移入 hook，非複製；Gate 現為 hook ＋ modal 的 20 行。
¹⁰ 重構後首跑 15 案只紅 #455 R5（預期中），改寫後全綠。

### §1.2 Mechanical grep

以 zsh 陣列 `"${F[@]}"` 帶入 11 個 Coverage 檔（先 `ls` 確認全部存在，避免整串被當成單一路徑而給出假空輸出）。

```text
[any]              (empty)
[ignore]           use-tool-call-consent-queue.ts:131 / 148 / 223（搬入的 debugMode log）  ← 見 ¹
[console]          use-tool-call-consent-queue.ts:132 / 149 / 224（同上）                   ← 見 ¹
[setTimeout]       (empty)
[TODO/FIXME]       (empty)
[react → core/src] chatbot.tsx:160 —— 既有 JSDoc 文字提到 `packages/core/src`，非 import
[color]            react 僅票號誤報；demo scss 4 個字面色                                   ← 見 ⁷
```

### §1.4 Build / Lint / Format

```text
lint:packages: PASS — core 0；react 5 warnings（皆在本次未動的檔案，與 main 相同）；demo route 另以 eslint 單跑 0 problem
format:check:  PASS
typecheck:     PASS — core + react + react-demo
build:         PASS — core, react
test:          PASS — core 430、react 619
```

---

## §3 Functional Validation

| R#   | Result | Evidence                                                                                                                                                                                                                                                                    |
| ---- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `R1` | ✅     | dev（`/tool-call-consent-custom`，`toolCallConsent="off"`）：consent 抵達時 `[role=dialog]` 0 個、`body.style.overflow` 為空。對照 `/tool-call-consent`（預設）：dialog 出現、overflow 為 `hidden`。spec：host 卡片單獨掛載無 dialog；`chatbot.tsx` 掛載條件的 source 斷言  |
| `R2` | ✅     | spec：`alreadyAllowed` 與同批 ALLOW_ALWAYS 的呼叫逐 render 都未曾露出、`currentIndex`/`totalCount` 為 2/4→4/4、答完送出一次且 4 筆依序。dev：兩個 shell 各 1/4→4/4 依序露出，`onToolCallConsentReply` 每批一次、內容與按下的一致                                            |
| `R3` | ✅     | spec：被拒後同一批從第一筆重新露出、未重送；reset（channel 替換）由 `consent-queue-invalidation` R4 經 Gate（即 hook）覆蓋。dev 上造不出被拒的回覆，被拒只有 spec 覆蓋                                                                                                      |
| `R4` | ✅     | spec：host 直接呼叫 `replyToolCallConsents` 後內建 dialog 卸載、overflow 還原、只送出 host 那一次；hook 端卡片同樣變空。反向驗證：拿掉 null 分支 → 3 紅                                                                                                                     |
| `R5` | ✅     | Gate 為 hook ＋ modal；`consent-reply-error` 6 案、`consent-reply-notification` 7 案、`nudge-consent-gate` 3 案原樣通過，`consent-queue-invalidation` 2 案（R5 改寫）通過                                                                                                   |
| `R6` | ✅     | README：props 列表 `toolCallConsent`；Hooks 章節 `useToolCallConsentQueue()` 入口；〈Building your own consent UI〉含回傳欄位表、`renderComposerAbove` 範例、兩條限制與「直接呼叫 `replyToolCallConsents` 也可」；`pendingConsent`／`replyToolCallConsents` 兩列改指向 hook |
| `R7` | ✅     | 閘門全綠（§1.4）；dev consent bot 兩寬度並排：卡片皆在 composer 上方（寬 712px／窄 319px），寬版 允許 ×3 ＋拒絕、窄版 拒絕 ×4，兩個 run 都續跑完成、composer 恢復可用，無 dialog、頁面可捲動                                                                                |

---

## Findings

### Critical (must fix before done)

None.

### Important (should fix in this cycle)

None.

### Minor (nice to have)

- **#901 評估回覆寫的 `denyReason?` 與實際型別不符**：回覆中 `decide` 的形狀寫成 `denyReason?`（選填），實際沿用既有
  `ToolCallConsentDecision`，`DENY_ONCE` 的 `denyReason: string` 為必填（沒有原因時傳 `''`）。改型別會動到既有公開型別，
  不值得；發版回覆時附上正確寫法即可。不擋。
- **同一棵樹掛兩個佇列會重複回覆**：`'builtin'` 時 host 若又呼叫 hook，兩個佇列各送一次。README 與 hook JSDoc 已寫明只搭配
  `'off'` 使用；SDK 端不偵測。不擋。

---

## Execution Log

- 2026-10-01: REVIEW task created, paired with BUILD-086 (Status: `draft`).
- 2026-10-01: BUILD-086 done (Status: `draft → ready`).
- 2026-10-01: §1 — 20 項 ✅、0 違規；§3 — R1–R7 全 Pass（R3 被拒情境僅 spec 覆蓋）；2 Minor (Status: `ready → in-progress → done`).
