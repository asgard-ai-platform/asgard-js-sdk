# REVIEW-083 Review: keep each subagent child tool-call's result

## Meta

- Task ID: `REVIEW-083`
- Status: `done`
- BUILD Task: `BUILD-083`
- Reviewed commit: `bced9a5`
- Reviewed branch: `feat/815-subagent-tool-result`

---

## §1 Static Code Review

Scope is `BUILD-083 ## Coverage` (five core files; react untouched). `typecheck` / `lint` / `build` run project-wide.

### §1.1 Checklist

| Check item                                                   | Rule                           | Result |
| ------------------------------------------------------------ | ------------------------------ | ------ |
| `any` / `as any`                                             | FRONTEND_RULE_COMMON §1.1      | ✅ ¹   |
| `@ts-ignore` / `eslint-disable`                              | FRONTEND_RULE_COMMON §1.2      | ✅     |
| `console.log`                                                | FRONTEND_RULE_COMMON §1.3 §7   | ✅     |
| Hardcoded key / endpoint / namespace                         | FRONTEND_RULE_COMMON §1.4      | ✅ n/a |
| Teardown for subscriptions / listeners / timers              | FRONTEND_RULE_COMMON §1.5      | ✅ ²   |
| react → core through the public entry only                   | FRONTEND_RULE_COMMON §1.6      | ✅     |
| core free of react / react-dom / DOM                         | FRONTEND_RULE_COMMON §1.6 §2.1 | ✅     |
| **No breaking public-API change**                            | FRONTEND_RULE_COMMON §1.7      | ✅ ³   |
| New public type exported from the package entry              | FRONTEND_RULE_COMMON §2.2      | ✅ ⁴   |
| Explicit return types on exported functions                  | FRONTEND_RULE_COMMON §3.1      | ✅     |
| Shared types centralized in `core/src/types/`; no duplicates | FRONTEND_RULE_COMMON §3.2      | ✅     |
| Component props fully typed                                  | FRONTEND_RULE_COMMON §4.1      | ✅ n/a |
| No hardcoded colour values                                   | FRONTEND_RULE_COMMON §4.2      | ✅ n/a |
| core and react share a version number                        | FRONTEND_RULE_COMMON §5        | ✅ ⁵   |
| Repeated logic extracted (≥2×)                               | FRONTEND_RULE_COMMON §6        | ✅     |
| `setTimeout` mock, dead code, untracked TODO / FIXME         | FRONTEND_RULE_COMMON §7        | ✅     |
| 值原樣帶過：不截斷、不遮蔽、不複製成新物件                   | #815                           | ✅ ⁶   |
| 不動 `<SubagentList>` 呈現與票面排除項                       | #815                           | ✅     |

¹ 唯一命中是既有測試名稱 `'R5: any prefix folds …'`（`subagent-reducer.spec.ts:126`），非型別。新 spec 的 frame helper 用
`as unknown as SseResponse<EventType>`，與 `conversation.spec.ts:352` 既有的 frame helper 同一慣例，非 `any`。
² 新測試的每個 `subscribe` 都有 `unsubscribe()` + `stores.teardown()`。
³ 三個新欄位（`SubagentToolCall.result?` / `.sidecar?`、`SubagentEvent.toolComplete` 的同名兩欄）皆選填，純 additive。
⁴ `SubagentToolCall` 經 `types/index.ts` 的 `export type * from './subagent'`、`SubagentEvent` 經 `index.ts:27` 既有導出，
新欄位隨型別一起露出；`dist/types/subagent.d.ts:21,23` 與 `dist/lib/subagent-reducer.d.ts:34-35` 已確認。
⁵ 未 bump 版本（兩者仍為 `0.3.86`）。
⁶ reducer 直接指派 `event.result` / `event.sidecar`；測試以 `toBe`（參照相同）斷言，含對 `ConversationToolCallMessage.result` 的參照。

### §1.2 Mechanical grep

```text
[any]            packages/core/src/lib/subagent-reducer.spec.ts:126:  it('R5: any prefix folds to a consistent snapshot', () => {   ← 測試名稱，誤報
[ignore]         (empty)
[console]        (empty)
[setTimeout]     (empty)
[TODO/FIXME]     (empty)
[core → react]   (empty)
[react → core/src] (empty)
[color, react]   (n/a — react 無改動)
```

### §1.4 Build / Lint / Format

```text
lint:packages: PASS — core 0 problems；react 5 warnings（皆為 main 既有，本次未觸及 react）
format:check:  PASS
typecheck:     PASS — core + react + react-demo
build:         PASS — core, react
```

---

## §3 Functional Validation

| R#   | Result | Evidence                                                                                                                                                                                               |
| ---- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `R1` | ✅     | `subagent-reducer.spec`「carries the result and sidecar」、`derived-stores.spec`「a live run exposes …」；建置產物以真實 frame 驗證 Bash 帶 `{stdout}` + `sidecar {lines:2}`                           |
| `R2` | ✅     | 兩處 `toBe` 參照斷言（對 frame 物件、對 `ConversationToolCallMessage.result`）                                                                                                                         |
| `R3` | ✅     | running → `result` 為 `undefined`（reducer 與 derive 各一案）；空結果 → `{}` 且 `completed`；失敗呼叫仍帶結果                                                                                          |
| `R4` | ✅     | `derived-stores.spec`「a GET rejoin … derives the same tool as the live run」（`toEqual`）；建置產物重播僅 complete frame，與 live 已完成 tool 逐欄相等                                                |
| `R5` | ✅     | `subagentsEqual` 對同一組物件為 true、換 result／缺 sidecar 為 false；`subagents$` 在結果到達時 emit、其後無關 bot 訊息不 re-emit（spec 與建置產物各驗一次）                                           |
| `R6` | ✅     | react 零改動；react Vitest 595 全綠；react-demo `/all-features` 子代理面板展開後與 `main` before/after 截圖逐像素比對，唯一差異為 spinner 動畫影格；`<SubagentList>` 的 `subagents` prop 已帶 `result` |
| `R7` | ✅     | typecheck / build / Vitest（core 430、react 595）全綠                                                                                                                                                  |

---

## Findings

None — 0 BLOCKER.

---

## Execution Log / Change Log

- 2026-09-23: REVIEW task created, paired with BUILD-083 (Status: `draft`).
- 2026-09-23: §1 — 18 項 ✅、0 違規；grep 唯一命中為測試名稱誤報。§3 — R1–R7 全 Pass (Status: `ready → in-progress → done`).
