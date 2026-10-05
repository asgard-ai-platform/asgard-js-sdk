# REVIEW-089 Review: Download sandbox files from a stateful card that wakes the sandbox through the shared wake

## Meta

- Task ID: `REVIEW-089`
- Status: `done`
- BUILD Task: `BUILD-089`
- Reviewed commit: uncommitted working tree on top of `35e32adf`
- Reviewed branch: `feat/118-sandbox-download-card`

---

## §1 Static Code Review

Scope is `BUILD-089 ## Coverage`（core resolve / client / types；react `sandbox-download/`、attachment / button template、
dispatch、`trigger-blob-download`、chatbot、i18n、README）。`lint` / `format` / `typecheck` / `build` / `test` run project-wide.

### §1.1 Checklist

| Check item                                           | Rule                           | Result |
| ---------------------------------------------------- | ------------------------------ | ------ |
| `any` / `as any`                                     | FRONTEND_RULE_COMMON §1.1      | ✅     |
| `@ts-ignore` / `eslint-disable`                      | FRONTEND_RULE_COMMON §1.2      | ✅ ¹   |
| `console.log`                                        | FRONTEND_RULE_COMMON §1.3 §7   | ✅     |
| Hardcoded key / endpoint / namespace                 | FRONTEND_RULE_COMMON §1.4      | ✅ n/a |
| Teardown for subscriptions / listeners / timers      | FRONTEND_RULE_COMMON §1.5      | ✅ ²   |
| react → core through the public entry only           | FRONTEND_RULE_COMMON §1.6      | ✅     |
| core free of react / react-dom / DOM                 | FRONTEND_RULE_COMMON §1.6 §2.1 | ✅ ³   |
| **No breaking public-API change**                    | FRONTEND_RULE_COMMON §1.7      | ✅ ⁴   |
| New public type exported from the package entry      | FRONTEND_RULE_COMMON §2.2      | ✅ ⁵   |
| Explicit return types on exported functions          | FRONTEND_RULE_COMMON §3.1      | ✅     |
| Shared types centralized; no duplicates              | FRONTEND_RULE_COMMON §3.2      | ✅     |
| Component props fully typed                          | FRONTEND_RULE_COMMON §4.1      | ✅     |
| No hardcoded colour values                           | FRONTEND_RULE_COMMON §4.2      | ✅ ⁶   |
| UI verified at both widths, side by side             | FRONTEND_RULE_COMMON §4.3+     | ✅     |
| core and react share a version number                | FRONTEND_RULE_COMMON §5        | ✅ ⁷   |
| Repeated logic extracted (≥2×)                       | FRONTEND_RULE_COMMON §6        | ✅ ⁸   |
| `setTimeout` mock, dead code, untracked TODO / FIXME | FRONTEND_RULE_COMMON §7        | ✅ ⁹   |
| 卡片不開檔案總管、不接管整張卡                       | F-038 AC10 / AC12              | ✅ ¹⁰  |
| 卡片沒有自設喚醒逾時                                 | F-038 AC3                      | ✅     |

¹ 搬移後的 `channel-home-download.ts` 原有一行 `eslint-disable-next-line no-console`（既有，未新增）。
² 唯一計時器是 done → idle 的 2.5s，存在 `doneTimers` ref，provider unmount 時全清。
³ `readBodyWithProgress` 只用 `Response` / `ReadableStream` / `Blob`，與既有 `response.blob()` 同層；無 DOM 元素存取。
⁴ 全為新增或選填：`SandboxUriIntent` 加一個變體（窮舉 switch 的消費端會得到型別提示，`dispatchUriAction` 已處理）、
`SandboxFsReadOptions.onProgress?`、`ChatbotProps.saveDownloadedFile?`、`DispatchUriActionOptions.onSandboxDownloadFile?`。
`channel-home://` 卡不經過新卡片（`downloadFileIntent` 只認 `download-file`），既有 chip 測試全過。
⁵ `SandboxUriIntent` 經 core entry 既有的 `export type`；download controller / 卡片刻意不對外（宿主唯一掛點是
`saveDownloadedFile`，spec §8.4）。
⁶ 新增 SCSS 的色值全為 `var(--asg-color-*, fallback)` 的 fallback（同 repo 慣例）；demo 的 `#888` / `#444` 見 REVIEW-088。
⁷ 未 bump（仍為 `0.3.91`）。
⁸ `triggerBlobDownload` 兩份合為 `utils/trigger-blob-download.ts`；`AttachmentTemplate` 兩處相同的 `customStyle` 合為一份；
controller 內「重拉 metadata 後再判斷」兩處抽成 `refetchLiveList`（本次 review 改）。
⁹ `setTimeout` 4 處：done → idle 計時器（spec §5 的「數秒後回 idle」）與其型別、兩份 spec 的 `flush()`。
¹⁰ controller 只拿得到 channel / client / wake，碰不到 explorer controller；`dispatchUriAction` 的 download 分支不呼叫
`onSandboxOpenFile`（spec 釘住）；demo 走查中檔案總管全程未開。

### §1.2 Mechanical grep（本次 diff 新增的行，含 BUILD-088）

```text
[any]              0
[ignore]           0
[console]          0
[setTimeout]       4 — 見 ⁹
[TODO/FIXME]       0
[color]            13 — 全為 var() fallback、demo SCSS 或票號 #459
[core → react/DOM] 0
[react → core/src] 0
```

### §1.4 Build / Lint / Format

```text
lint:packages: PASS — 0 errors；5 warnings 皆為既有、不在本 task 的檔案
format:check:  PASS
typecheck:     PASS — core + react + react-demo
build:         PASS — core, react
test:          PASS — core 448（本 task 新增 3）、react 658（本 task 新增 19）
```

---

## §3 Functional Validation

| R#    | Result | Evidence                                                                                                                                                 |
| ----- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `R1`  | ✅     | spec：中文路徑 percent-encode 解碼、SourceSet 掛載路徑；缺 / 空 `absolute_path` → `null`                                                                 |
| `R2`  | ✅     | spec：download handler 收到解碼路徑、兩個 open handler 都沒被叫；沒有 handler 時不 `window.open`；`isDownloadAction` 認得；arrival bridge 不觸發         |
| `R3`  | ✅     | client spec：真 `ReadableStream`，progress `[0,8] [2,8] [5,8] [6,8]`、URL 無 `limit_bytes`；既有兩案（不帶 `onProgress`）不變                            |
| `R4`  | ✅     | spec：不帶 limit、帶 `customChannelId`、進度文字、存成 basename、done → 2.5s → idle。demo：1.7 MB 檔進度一路累加後 Downloaded                            |
| `R5`  | ✅     | spec：冷啟動提示、別處喚醒中提示。demo 截圖：寬版一張 waiting 時其他卡顯示「Sandbox waking · downloads once it is up」                                   |
| `R6`  | ✅     | spec：waiting + Cancel → 醒來自動下載；Cancel 只停那張、共用喚醒仍 `waking`。demo：四張 waiting → 自動下載                                               |
| `R7`  | ✅     | spec：同檔兩張共用狀態且第二張 disabled；controller 連呼兩次只讀一次；三張不同檔 → 1 次 NUDGE。demo：mock 計數 1                                         |
| `R8`  | ✅     | spec：run 中 waiting 不送、run 結束沒起來 → 送 1 次、run 已帶起來 → 0 次直接下載；consent → 停在 idle。demo：對話進行中點卡 → 0 次 NUDGE、run 後下載完成 |
| `R9`  | ✅     | spec 6 案（404、412→ 喚醒 → 成功、stale 重新列出時不搶跑、5xx×2 失敗＋手動重試重新給機會、不完整不存、喚醒失敗）。demo：五種故障注入皆符合               |
| `R10` | ✅     | 見 ¹⁰                                                                                                                                                    |
| `R11` | ✅     | spec 全程以 `saveDownloadedFile` 取代存檔並斷言呼叫參數；預設 `<a download>` 路徑即合併後的既有 helper                                                   |
| `R12` | ✅     | 既有 channel-home chip 測試全過；`downloadFileIntent` 不認 `channel-home://`                                                                             |
| `R13` | ✅     | 沿用 chip 的 class（同族）、下載圖示、錯誤用 `--asg-color-error`；13 key × 3 語系；`triggerBlobDownload` 合併                                            |
| `R14` | ✅     | 閘門全綠（§1.4）；demo 走查見 BUILD-089 Execution Log                                                                                                    |

---

## Findings

### Critical (must fix before done)

None.

### Important (should fix in this cycle)

None. （demo 走查抓到的兩個 bug——stale metadata 在喚醒途中被列回而搶跑、run 結束時用過期清單決定喚醒——已在 BUILD 階段
先寫會紅的測試再修，見 BUILD-089 Execution Log。）

### Minor (nice to have)

- BUTTON / CAROUSEL 模板的 uri 按鈕若帶 `download-file`，下載與喚醒照常進行，但按鈕本身沒有狀態可顯示（只有同檔的卡片會顯示）。
  後端 `show_sandbox_file_download_link` 只推 ATTACHMENT，目前碰不到；有需要再談。
- 冷啟動提示在 320px 卡片寬度下英文會折成兩行（中文一行）。不影響閱讀，未改。
- 本次 review 順手做的兩個小整理：抽出 `refetchLiveList`、`formatBytes` 改為檔內函式。

---

## Execution Log

- 2026-10-05: REVIEW task created, paired with BUILD-089 (Status: `draft`).
- 2026-10-05: BUILD-089 done (Status: `draft → ready`).
- 2026-10-05: §1 — 19 項 ✅、0 違規（review 中順手抽出 1 處重複）；§3 — R1–R14 全 Pass；2 Minor (Status: `ready → in-progress → done`).
