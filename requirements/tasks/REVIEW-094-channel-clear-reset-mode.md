# REVIEW-094 Review: clearChannel and resetMode

## Meta

- Task ID: `REVIEW-094`
- Status: `done`
- BUILD Task: `BUILD-094`
- Reviewed commit: `ca6d4d47`
- Reviewed branch: `feat/121-channel-clear-reset-mode`

---

## §1 Static Code Review

Scope is `BUILD-094 ## Coverage`（core `types/client.ts`、`lib/client.ts`、`lib/channel.ts`；react `use-channel.ts`、`asgard-service-context.tsx`、`chatbot.tsx`、`chat-header-host.tsx`、`i18n.ts`；demo `clear-channel/`、`sse-mock.ts`、`vite.config.ts`）. `lint` / `format` / `typecheck` / `build` / `test` run project-wide.

### §1.1 Checklist

| Check item                                           | Rule                         | Result |
| ---------------------------------------------------- | ---------------------------- | ------ |
| `any` / `as any`                                     | FRONTEND_RULE_COMMON §1.1    | ✅     |
| `@ts-ignore` / `eslint-disable`                      | FRONTEND_RULE_COMMON §1.2    | ✅ ¹   |
| `console.log`                                        | FRONTEND_RULE_COMMON §1.3 §7 | ✅ ¹   |
| No hardcoded API key / endpoint / namespace          | FRONTEND_RULE_COMMON §1.4    | ✅     |
| Teardown for subscriptions / listeners / timers      | FRONTEND_RULE_COMMON §1.5    | ✅ n/a |
| core has no react / DOM import                       | FRONTEND_RULE_COMMON §1.6    | ✅     |
| react → core through the public entry only           | FRONTEND_RULE_COMMON §1.6    | ✅     |
| No breaking public-API change                        | FRONTEND_RULE_COMMON §1.7    | ✅ ²   |
| New public API exported from the entry               | FRONTEND_RULE_COMMON §2.2    | ✅ ³   |
| `botProviderEndpoint`, not `endpoint`                | FRONTEND_RULE_COMMON §2.4    | ✅     |
| Explicit return types on exported functions          | FRONTEND_RULE_COMMON §3.1    | ✅     |
| Shared types centralized, no duplicates              | FRONTEND_RULE_COMMON §3.2    | ✅ ³   |
| React props fully typed                              | FRONTEND_RULE_COMMON §4.1    | ✅     |
| No hardcoded colour values                           | FRONTEND_RULE_COMMON §4.2    | ✅ ⁴   |
| UI verified at both widths                           | FRONTEND_RULE_COMMON §4.3+   | ✅     |
| core and react share a version number                | FRONTEND_RULE_COMMON §5      | ✅ ⁵   |
| Repeated logic extracted (≥2×)                       | FRONTEND_RULE_COMMON §6      | ✅ ⁶   |
| `setTimeout` mock, dead code, untracked TODO / FIXME | FRONTEND_RULE_COMMON §7      | ✅     |

¹ grep 命中皆為既有（`client.ts` 的 upload / download debug log 與 `use-channel.ts:709`，blame 為 2025-09 / 2026-06），diff 新增行 0 筆 `console.log` / `eslint-disable` / `@ts-ignore`。
² 只增不改：`IAsgardServiceClient.clearChannel?` 是 optional；`Channel.reset` 加的是有預設值的第五個參數；`<Chatbot>` 兩個新 prop 皆 optional 且預設等於 0.3.94 行為；`UseChannelReturn` / context 多一個 optional `clearChannel`。`deleteChannel()`、`isResetting`、`onReset` 不變。
³ `ResetMode` 只定義在 core `types/client.ts`，經 `export type * from './types'` 匯出；react 三處都從 `@asgard-js/core` 引用。
⁴ demo 沿用 `delete-channel.module.scss`，沒有新增樣式。
⁵ 皆為 `0.3.94`，未 bump。
⁶ `deleteChannel` / `clearChannel` 只差 method 與 path，共用私有 `releaseChannel()`；demo 兩個 shell 共用 `chatbotProps`。

### §1.2 Mechanical grep

```text
any / as any            : client.spec.ts:176、client.ts:370 — 註解中的「any 2xx」，非型別
ts-ignore / eslint-dis. : client.ts:120/574/580/623/629、use-channel.ts:709 — 既有，不在 diff
console.log             : client.ts:575/624、use-channel.ts:710 — 既有，不在 diff
core → react            : (empty)
react → core/src        : (empty)
colour (diff, added)    : (empty)
setTimeout (diff, added): (empty)
TODO / FIXME (diff)     : (empty)
```

### §1.4 Build / Lint / Format

```text
lint:packages: PASS — 0 errors；5 warnings 皆為既有，Coverage 內檔案逐檔 lint 0 problems
format:check:  PASS
typecheck:     PASS — core + react + react-demo
build:         PASS — core, react
test:          PASS — core 458（+10）、react 719（+16）
```

---

## §3 Functional Validation

驗證手段：Vitest（TDD，新案皆先紅後綠）＋ react-demo `/clear-channel`（port 5100，寬窄兩個 shell 並排）以 Playwright 實際操作並記錄 request 順序 ＋ dev 後端實測（R1 契約、R10 檔案保留）。

| R#    | Result | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `R1`  | ✅     | spec：`POST {base}/channel/clear?custom_channel_id=…`、`X-API-KEY`、id URL-encode、204 / 200+body 皆 resolve 且不讀 body、500 與網路錯誤 reject。dev 後端實測：不存在的 channel → 204、缺 `custom_channel_id` → 400                                                                                                                                                                                                                                                                                                                             |
| `R2`  | ✅     | spec：404 → `HttpError(404)`，不當成功                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `R3`  | ✅     | spec：`'clear'` 呼叫順序 `clear → open`、開場 `action=NONE`、`text=''`；`'delete'` 與未給 mode 都走 `delete → open`；缺 `clearChannel` 的 client 在 `'clear'` 下 throw 且不送任何東西（不退回 delete）                                                                                                                                                                                                                                                                                                                                          |
| `R4`  | ✅     | spec：未設 `resetMode` 時 reset 只 delete；header label 為 `header.reset`。demo ②：tooltip「重設對話」、出去的是 `DELETE /channel`。`/delete-channel` 回歸：label 與請求序列（`DELETE → message/sse`）不變                                                                                                                                                                                                                                                                                                                                      |
| `R5`  | ✅     | spec：`showResetButton={false}` 不渲染 reset（delete / clear 皆然），關閉鈕仍在。demo ⑤：寬窄 header 只剩「檔案總管、關閉」；外部呼叫 `resetChannel()` → `POST /channel/clear` → 開場                                                                                                                                                                                                                                                                                                                                                           |
| `R6`  | ✅     | spec：三語系 `aria-label` 與 `title` 皆為 `header.clear`，兩模式 icon 的 innerHTML 相同。demo 切 zh-TW / en-US / ja-JP 讀到「清除對話（保留檔案）」/「Clear conversation (keep files)」/「会話をクリア（ファイルは保持）」                                                                                                                                                                                                                                                                                                                      |
| `R7`  | ✅     | spec：clear 等待期間 `isResetting === true` 且未送出任何 turn，放行後才開場；header 點擊呼叫 `resetChannel`，無 dialog；busy 時再點不觸發。demo ①（寬窄皆）：`POST /channel/clear` 204 → `message/sse` 開場；④ 6 秒 clear 期間 reset 鈕 disabled、送出鈕 disabled，再點一次只有一發 clear                                                                                                                                                                                                                                                       |
| `R8`  | ✅     | spec：`clearChannel()` 只打 clear、不開場、conversation 物件與 `isResetting` 不變（`resetMode` 留預設 delete，證明不受其影響）；失敗會 reject。demo ⑥：只有一發 `POST /channel/clear`，畫面上的對話保留；之後送訊息，伺服器端輪數已歸零、檔案都在                                                                                                                                                                                                                                                                                               |
| `R9`  | ✅     | spec：clear 失敗 → channel 與 conversation 同一個物件、未送開場、`isResetting` / `isConnecting` 回 false、`onSseError` 一次。demo ③（寬窄皆）：只有那發失敗的 clear、訊息保留、事件紀錄各一筆 `HTTP 500`                                                                                                                                                                                                                                                                                                                                        |
| `R10` | ✅     | dev 後端（consent bot，經 build 出來的 core `clearChannel()`）：agent 寫入 `/work/f039.txt` → clear 2.7 秒完成 → metadata 仍 200、`title: null`、無運作中 sandbox（期間 fs list 412，即 AC11 的暫時連不到）→ NONE 開場把同一台 sandbox 拉回 → `/work` 仍列出 `f039.txt`。另以瀏覽器走真按鈕：本機暫時讓接 dev consent bot 的 demo 路由帶 `resetMode="clear"`（未 commit、已還原），agent 寫入 `/work/f039-ui.txt` → 按 ↻ → `POST /channel/clear` 204 → 開場（busy 約 22.7 秒），訊息清掉、內建檔案總管仍列出該檔。兩個探測 channel 事後皆已刪除 |
| `R11` | ✅     | `/clear-channel` 六個情境、寬（full-bleed）窄（375×640）並排，皆照上列走過                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `R12` | ✅     | 見 §1.4                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

---

## Findings

### Critical (must fix before done)

None.

### Important (should fix in this cycle)

- **已修**：套件 README 沒有記載新 API。core README 的 client 方法清單與 `Channel.reset` 簽章、react README 的 props 清單與 context Actions 表都寫著 `deleteChannel` / `resetChannel`，卻沒有 `clearChannel` / `resetMode` / `showResetButton`。本 repo 近期功能 commit 皆同步更新 README（如 `492519f2`）。以 `ca6d4d47` 補上。

### Minor (nice to have)

- `use-channel.ts` `startChannel` 內幾段既有註解仍以「DELETE」指稱 reset 的第一步（例如「A failed DELETE never builds one」）。在 `'clear'` 下語意相同、仍然成立，未改以免擴大 diff。
- clear 期間 composer 的 textarea 仍可輸入，只有送出鈕停用（`isConnecting`）——與 delete 模式完全相同的既有行為，spec 未要求改變。BUILD 時 demo 說明一度寫成「composer 停用」，已更正。

---

## Execution Log

- 2026-10-12: REVIEW task created, paired with BUILD-094 (Status: `draft`).
- 2026-10-12: BUILD-094 done (Status: `draft → ready`).
- 2026-10-12: §1 — 18 項 ✅、0 違規；§3 — R1–R12 全 Pass；1 Important（README 未記載新 API）已在本輪修正，2 Minor 不改 (Status: `ready → in-progress → done`).
