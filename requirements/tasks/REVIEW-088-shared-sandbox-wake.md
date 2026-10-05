# REVIEW-088 Review: Make sandbox wake a single channel-level store shared by every entry point

## Meta

- Task ID: `REVIEW-088`
- Status: `done`
- BUILD Task: `BUILD-088`
- Reviewed commit: uncommitted working tree on top of `35e32adf`
- Reviewed branch: `feat/118-sandbox-download-card`

---

## §1 Static Code Review

Scope is `BUILD-088 ## Coverage`（core `channel.ts` / `types/channel.ts`；react hooks、context、file-explorer 四檔、aside、i18n；
demo route 與 mock）。`lint` / `format` / `typecheck` / `build` / `test` run project-wide.

### §1.1 Checklist

| Check item                                           | Rule                           | Result |
| ---------------------------------------------------- | ------------------------------ | ------ |
| `any` / `as any`                                     | FRONTEND_RULE_COMMON §1.1      | ✅     |
| `@ts-ignore` / `eslint-disable`                      | FRONTEND_RULE_COMMON §1.2      | ✅     |
| `console.log`                                        | FRONTEND_RULE_COMMON §1.3 §7   | ✅     |
| Hardcoded key / endpoint / namespace                 | FRONTEND_RULE_COMMON §1.4      | ✅ n/a |
| Teardown for subscriptions / listeners / timers      | FRONTEND_RULE_COMMON §1.5      | ✅ ¹   |
| react → core through the public entry only           | FRONTEND_RULE_COMMON §1.6      | ✅     |
| core free of react / react-dom / DOM                 | FRONTEND_RULE_COMMON §1.6 §2.1 | ✅     |
| **No breaking public-API change**                    | FRONTEND_RULE_COMMON §1.7      | ✅ ²   |
| New public type exported from the package entry      | FRONTEND_RULE_COMMON §2.2      | ✅ ³   |
| Explicit return types on exported functions          | FRONTEND_RULE_COMMON §3.1      | ✅     |
| Shared types centralized; no duplicates              | FRONTEND_RULE_COMMON §3.2      | ✅     |
| Component props fully typed                          | FRONTEND_RULE_COMMON §4.1      | ✅     |
| No hardcoded colour values                           | FRONTEND_RULE_COMMON §4.2      | ✅ ⁴   |
| UI verified at both widths, side by side             | FRONTEND_RULE_COMMON §4.3+     | ✅     |
| core and react share a version number                | FRONTEND_RULE_COMMON §5        | ✅ ⁵   |
| Repeated logic extracted (≥2×)                       | FRONTEND_RULE_COMMON §6        | ✅ ⁶   |
| `setTimeout` mock, dead code, untracked TODO / FIXME | FRONTEND_RULE_COMMON §7        | ✅ ⁷   |
| 喚醒路徑沒有任何計時器 / 逾時                        | F-038 AC3                      | ✅     |
| `nudge()` 對外簽章與拒絕語意不變                     | BUILD-088 補充規則             | ✅ ⁸   |

¹ `sandboxWakeSubject` 在 `close()` complete；`trackWake` 的收尾檢查 `closed` 才寫入。react 端訂閱走 `useSyncExternalStore`，
unsubscribe 由 subscribe 回傳。demo 的 1 秒輪詢在 effect cleanup 清掉。
² 全為新增：`Channel.wakeSandbox` / `sandboxWake$` / `getSandboxWake`、`UseChannelReturn.wakeSandbox?`、context
`wakeSandbox?`、`FileExplorerProvider` / `FileExplorerPanel` 的 `wakePhase?`。`FileExplorerContextValue` 多一個 `wakeFailed`，
但它是 `useFileExplorer()` 的回傳型別、消費端只讀不建（agent-hub-web 的同名 context 是自己的型別）。仍用舊 API 的 react-demo
typecheck 通過；未傳 `wakePhase` 的行為由 `panel-wake-phase.spec.tsx` 釘住。
³ core 經 `export type * from './types'`；react 經 `hooks/index.ts` 匯出 `useSandboxWake`、`useSandboxWakeState`、
`UseSandboxWakeReturn`。
⁴ 新增 `#xxx` 4 處：demo SCSS 的 `#888` / `#444`（沿用 `prompt-suggestion` 的 demo 慣例）、`var(--asg-color-error, #ef4444)`
的 fallback（同檔既有寫法）、票號 `#459`（搬移的註解）。
⁵ 未 bump（兩者仍為 `0.3.91`）。
⁶ `nudge` 與 `wakeSandbox` 共用的 SSE handler 已抽成 `nudgeSseOptions`。
⁷ 唯一的 `setTimeout` 是 `sandbox-wake.spec.ts` 的 `flush()`（等 microtask），不是模擬延遲。mock server 的 `sleep()` 屬 demo。
⁸ nudge turn 進行中直接呼叫仍丟 `ChannelBusyError`、consent pending 仍丟 `ChannelAwaitingConsentError`（`sandbox-wake.spec.ts`
兩案＋既有 `channel.spec.ts` 58 案全過）。唯一的新行為是 metadata 重拉期間呼叫會接上而不送第二次，已寫進 JSDoc。

### §1.2 Mechanical grep（本次 diff 新增的行）

```text
[any]              0
[ignore]           0
[console]          0
[setTimeout]       1 — spec 的 flush()，見 ⁷
[TODO/FIXME]       0
[color]            4 — 見 ⁴
[core → react/DOM] 0
[react → core/src] 0
```

### §1.4 Build / Lint / Format

```text
lint:packages: PASS — 0 errors；5 warnings 皆為既有、不在本 task 的檔案
format:check:  PASS
typecheck:     PASS — core + react + react-demo
build:         PASS — core, react
test:          PASS — core 445（新增 15）、react 639（新增 7）
```

---

## §3 Functional Validation

| R#    | Result | Evidence                                                                                                                                        |
| ----- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `R1`  | ✅     | spec「starts idle and exposes a snapshot」；型別經 core entry 匯出（react 端 import 通過 typecheck）                                            |
| `R2`  | ✅     | spec：三個並發 `wakeSandbox` → 1 個 NUDGE、1 次 metadata；metadata 重拉期間 `wakeSandbox` 與直接 `nudge()` 都接上、不送第二次                   |
| `R3`  | ✅     | spec：nudge 結束、metadata 未回應時仍 `waking`；放行後 `idle` + `live`；未列出 → `failed`。demo：外部喚醒 4s 後 `live`、樹出現                  |
| `R4`  | ✅     | spec：nudge 錯誤 → `failed` 且不重拉 metadata；metadata 丟錯 → `failed`；下一次喚醒 phase 序列 `idle→waking→failed→waking→idle`                 |
| `R5`  | ✅     | spec：user run 中、consent pending 時皆 `blocked`、不送 NUDGE、store 停在 `idle`                                                                |
| `R6`  | ✅     | spec：直接 `nudge()` → `waking`，同時的 `wakeSandbox` 接上（1 個 NUDGE）、結束回 `idle`；被拒的直接 `nudge()` 不動 store                        |
| `R7`  | ✅     | spec：已 live 直接回 `live` 不送；發起者 `sbx-b`（未列出）/ joiner `sbx-a`（列出）/ 不具名 → `failed` / `live` / `live`，store `failed`         |
| `R8`  | ✅     | `asgard-service-context.spec`：`wakeSandbox('sbx-1')` 經 `onBeforeSendMessage`，名稱與回傳的 payload 一起送到 hook                              |
| `R9`  | ✅     | `aside-shared-wake.spec` 2 案（真 `Channel`）。demo：寬版外部喚醒 → 檔案總管立即「Waking…」且 disabled；窄版 `wake-failed` → 紅字提示、按鈕可按 |
| `R10` | ✅     | `panel-wake-phase.spec`：未傳 `wakePhase` 時點喚醒仍顯示本地轉圈；傳 `idle` 時不自建轉圈                                                        |
| `R11` | ✅     | 閘門全綠（§1.4）；demo 走查見 BUILD-088 Execution Log                                                                                           |

---

## Findings

### Critical (must fix before done)

None.

### Important (should fix in this cycle)

None.

### Minor (nice to have)

- `failed` 會一直留到下一次喚醒開始，即使之後 sandbox 經由別的路徑起來（例如使用者送訊息）又被回收，檔案總管空狀態仍顯示「上次
  喚醒失敗」。這與原型 `useSandboxWake`「下一次喚醒開始時清掉」的語意一致，只影響空狀態的提示文字，不影響可否再按。BUILD-089 的
  卡片 idle 提示不讀 `failed`（只讀 live / waking），不會被它誤導。
- agent-hub-web 的 nudge payload 帶法（呼叫端傳 `model`、`onBeforeSendMessage` 對無文字早退）在內建入口下拿不到 `model`；
  已記在 BUILD-088 Notes / Risks，待 agent-hub 整合時確認。

---

## Execution Log

- 2026-10-05: REVIEW task created, paired with BUILD-088 (Status: `draft`).
- 2026-10-05: BUILD-088 done (Status: `draft → ready`).
- 2026-10-05: §1 — 19 項 ✅、0 違規；§3 — R1–R11 全 Pass；2 Minor（皆不需改碼）(Status: `ready → in-progress → done`).
