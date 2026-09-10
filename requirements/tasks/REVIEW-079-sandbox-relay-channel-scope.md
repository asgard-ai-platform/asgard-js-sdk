# REVIEW-079 Review: scope every sandbox relay call to its channel

## Meta

- Task ID: `REVIEW-079`
- Status: `done`
- BUILD Task: `BUILD-079`
- Reviewed commit: `f775a65`
- Reviewed branch: `fix/sandbox-relay-custom-channel-id`

---

## §1 Static Code Review

Scope is `BUILD-079 ## Coverage`. `typecheck` / `lint` / `build` run project-wide.

### §1.1 Checklist

| Check item                                                   | Rule                           | Result |
| ------------------------------------------------------------ | ------------------------------ | ------ |
| `any` / `as any`                                             | FRONTEND_RULE_COMMON §1.1      | ✅     |
| `@ts-ignore` / `eslint-disable`                              | FRONTEND_RULE_COMMON §1.2      | ✅     |
| `console.log`                                                | FRONTEND_RULE_COMMON §1.3 §7   | ✅     |
| Hardcoded key / endpoint / namespace                         | FRONTEND_RULE_COMMON §1.4      | ✅     |
| Teardown for subscriptions / listeners / timers              | FRONTEND_RULE_COMMON §1.5      | ✅ ¹   |
| react → core through the public entry only                   | FRONTEND_RULE_COMMON §1.6      | ✅     |
| core free of react / react-dom / DOM                         | FRONTEND_RULE_COMMON §1.6 §2.1 | ✅ ²   |
| **No breaking public-API change**                            | FRONTEND_RULE_COMMON §1.7      | ✅ ³   |
| New public type exported from the package entry              | FRONTEND_RULE_COMMON §2.2      | ✅ ⁴   |
| Explicit return types on exported functions                  | FRONTEND_RULE_COMMON §3.1      | ✅     |
| Shared types centralized in `core/src/types/`; no duplicates | FRONTEND_RULE_COMMON §3.2      | ✅ ⁵   |
| Component props fully typed                                  | FRONTEND_RULE_COMMON §4.1      | ✅     |
| No hardcoded colour values                                   | FRONTEND_RULE_COMMON §4.2      | ✅ n/a |
| core and react share a version number                        | FRONTEND_RULE_COMMON §5        | ✅ ⁶   |
| Repeated logic extracted (≥2×)                               | FRONTEND_RULE_COMMON §6        | ✅ ⁷   |
| `setTimeout` mock, dead code, untracked TODO / FIXME         | FRONTEND_RULE_COMMON §7        | ✅     |
| 端點路徑 / method / 既有 query 名稱未被「整理」              | #470                           | ✅     |
| 缺 scope 時不丟例外、不自行合成 channel id                   | #470                           | ✅     |

¹ `sandboxFsWatch` 的 teardown 未變動（仍是 `AbortController` + `unsubscribe`）；新增的 spec 每一案都
`unsubscribe()`。
² core 側唯一提到 react 的地方是 `types/sandbox-fs.ts` 的**註解**（說明 react 會自動填），不是 import。
³ 十一支新增的參數全部選填，`typecheck` 涵蓋 `apps/react-demo`（repo 內唯一的公開 API 消費端）**零錯誤**，
即為相容性的證據，而不是宣稱。
⁴ `SandboxChannelScope` 未動任何 `index.ts`：`types/index.ts` 既有的 `export type * from './sandbox-fs'`
帶它出去。已確認落在 `packages/core/dist/types/sandbox-fs.d.ts:34`。
⁵ 三個既有 options 型別改為 `extends SandboxChannelScope`，沒有出現第二份同形介面。
⁶ 版本號未動（發版流程另計）。
⁷ URL 組裝原本在十一處各自 `new URL(...)`；現在 `withChannelScope` + `sandboxFsUrl` 各一處。

### §1.2 Mechanical Grep

Restricted to the lines this task adds（新檔以全檔內容納入）。

```
### forbidden patterns in added lines
{ git diff HEAD~1 -- '*.ts' '*.tsx' | grep '^+'; } | grep -E 'setTimeout|console\.log|: any|as any|@ts-ignore|eslint-disable|TODO|FIXME'
  → no output ✅

### core 是否 import react / 摸 DOM
git diff HEAD~1 -- packages/core/src | grep '^+' | grep -E "^\+import .*react|document\.|window\."
  → no output ✅

### 公開 export surface
git diff --stat HEAD~1 -- packages/core/src/index.ts packages/react/src/index.ts packages/core/src/types/index.ts
  → empty ✅（新型別走既有的 `export type *`）

### 還有沒有沒走 helper 的 sandbox URL 組裝
grep -n "deriveSandboxFsEndpoint(" packages/core/src/lib/client.ts
  → 2 hits：定義本身 ＋ `sandboxFsUrl()` 內部一處 ✅

### 產物真的帶了參數
grep -c "custom_channel_id" packages/core/dist/index.mjs        → 13
grep -n "sandboxFsList" packages/core/dist/lib/client.d.ts      → `options?: SandboxChannelScope` ✅
```

### §1.3 Build / Lint / Format

```
lint:packages:  PASS — 0 errors, 5 warnings（全部既有，無一在本次改動的檔案裡）
format:check:   PASS
typecheck:      PASS — core + react + react-demo
build:          PASS — build:core + build:react 乾淨
test:packages:  PASS — 319 core（16 檔）+ 482 react（63 檔）= 801，新增 42
emitted types:  `SandboxChannelScope` 在 dist/types/sandbox-fs.d.ts；十一支的 `options?` 在 dist/lib/client.d.ts
```

### §1.4 Static Review Acceptance

- [x] All §1.1 items checked and marked
- [x] No ❌ violations
- [x] All §1.2 greps run and output pasted
- [x] `npm run typecheck` and both builds — no TypeScript errors
- [x] `npm run lint:packages` — no ESLint errors

---

## §3 Functional Validation

No browser pass. 這個缺陷的觀察點是**送出去的 URL**，而 demo 的 mock server 不檢查
`custom_channel_id`（它接受任何請求）⇒ 在 demo 上走一遍不會分辨修好與沒修好，只有真 relay 會。所以驗收證據是
斷言 ＋ **逐組反向驗證**：把實作 stash 掉之後該轉紅、還原後該轉綠。

### R# Result Matrix

| R#  | Description                         | Result | Note                                                                                                                                                                                                  |
| --- | ----------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | 十一支都送 `custom_channel_id`      | Pass   | `sandbox-channel-scope.spec.ts` 表驅動 11 案；反向驗證：stash `client.ts` → **24 案中 11 紅**（正是這 11 支），還原後全綠                                                                             |
| R2  | 沒有 scope 時 URL 與改動前逐字相同  | Pass   | 同表另 11 案斷言「不含該參數」；這 11 案在 stash 期間仍綠 —— 它們證明的是「沒變」，本來就不該因為缺實作而紅                                                                                           |
| R3  | 內建 aside 從 channel context 取用  | Pass   | `channel-scope-forwarding.spec.ts` 12 個 provider 全綠（反向：stash providers → **14/14 紅**）；`builtin-aside-channel-scope.spec.tsx` 走 context → providers → client 整條（反向：stash aside → 紅） |
| R4  | open-browser 卡片帶上同一個 channel | Pass   | `dispatch-uri-action-channel-scope.spec.ts` 3 案；反向：stash dispatcher → 該檔 2 紅（第 3 案是 host override 路徑，本來就與本改動無關）                                                              |
| R5  | 空字串視為沒有，不送空參數          | Pass   | core 表外一案 ＋ react 一案（`{ customChannelId: null }` → 傳下去的是 `{}`）                                                                                                                          |
| R6  | 第十二支不能無聲上車                | Pass   | 「prototype 上的 sandbox 方法都要在表裡」那條守門；以反證確認有效：把 `sandboxFsStat` 從表裡拿掉 → 轉紅並逐字列出漏掉的方法名，放回 → 綠                                                              |
| R7  | Smoke check                         | Pass   | 見 §1.3                                                                                                                                                                                               |

### §3.1 Acceptance

- [x] Every R# executed
- [x] Each R# marked Pass
- [x] Vitest run and passing — 42 new cases（core 24 / react 18）
- [x] 每一組新斷言都做過反向驗證，紅的位置與預期一致（不是「有紅就算」）

---

## Findings

### Critical (must fix before done)

None.

### Important (should fix in this cycle)

None.

### Minor (nice to have)

1. **真 relay 一次都沒打過。** 本 cycle 的驗證全部是 Vitest；`asgard-freyr-api` 的 400 是在
   `asgard-freyr-web` 的 dev 上觀察到的，但**帶著這份修法**的請求還沒對它送過——SDK 是 npm 相依，消費端要等發版
   才吃得到。⇒ 這件事的收尾條件是「發版後由消費端回報檔案總管可用」，不是本 PR 合併。已寫進 #470。
2. **選填留下了一個漏傳的空間。** 直接呼叫 client 的宿主（不是走 react 內建那條）漏傳不會有型別錯誤，只會拿到
   relay 的 400。這是 §1.7 換來的：必填就是破壞性簽名變更，而這裡沒有舊 API 可以先標 `@deprecated`。緩解是
   README 新增的那一節與型別上的 JSDoc（都逐字寫出 400 的訊息，讓下一個人 grep 得到）。
3. **這條 400 不會把 sandbox 踢出下拉選單，所以缺陷現場是「無限重試、無可讀原因」。**
   `isSandboxLevelFailure` 只認 `412`／`5xx`，那個分類是對的（參數層的錯不代表 sandbox 死了），但使用者看到的
   只有一直失敗。要讓「參數／授權層的 4xx」有自己的呈現是另一個題目，記在 #470 附帶項，本 cycle 不擴大範圍。
4. 🔄 **（已修）scope 原本在建立 providers 時快照一次。** 我當時的理由是「aside 在 channel 變動時重建」——
   那句話只涵蓋內建那條路。`createSandboxFsProviders` 是**公開 export**，自組面板的 host 不一定重建它
   ⇒ 快照會讓它一直送舊 channel。已改成每次呼叫時算（成本相同），並新增一案「host 保留同一個 providers
   實例、中途換 channel」，**反向驗證過**（改回快照 → 該案轉紅，改回來 → 綠）。
   由 jasonluo07 於 PR #471 提出。
5. **第十二支的守門是「名稱前綴掃 prototype」，有兩個盲區**：叫 `sandboxExec` 這種不合前綴的掃不到；
   宣告成實例 arrow-function field 的也不在 prototype 上。限制可接受（它擋的是「照著現有命名新增一支
   卻忘記帶 scope」這個實際發生過的形狀），已在 spec 裡以一行註明。
6. 🔴 **自組面板那條公開路徑沒有被覆蓋，而且 TL;DR 原本說得太滿。**
   `customChannelId` 選填 ⇒ 漏傳沒有型別錯誤，SDK 內也沒有 hook／provider 幫忙補值。
   已知現場：`asgard-ai-agent-hub-web` 的 `file-explorer-context.tsx`（`fileExplorer="off"` ＋ 自持
   controller ＋ 不帶 scope）；它今天不會壞（不在會做 ownership 檢查的 relay 後面）。
   **刻意不併進本 PR**——要不要提供「從 context 取值」的東西是設計題（三條路代價不同），
   已另開 `asgard-ai-platform/asgard-js-sdk#472`。本 cycle 只做能做的那一半：兩份 README 都寫明，
   而 react README 那一節正是給這群人看的。
7. **空字串 `customChannelId` 仍然被靜默丟掉（未接受修改，理由如下）。**
   jasonluo07 指出「傳了值卻收到『參數缺少』的 400 會把人指向錯的地方」——現象成立，但兩個替代做法都更糟：
   ① 照送 `custom_channel_id=` ⇒ 守門讀到的仍是空字串、回的仍是同一句 `required`，**對呼叫端沒有任何差別**，
   只是網址多一個證明不了什麼的參數；② 在 client 內對空字串丟例外 ⇒ 那是唯一真的會發生空字串的地方
   （host 把 `customChannelId=""` 傳給 `<Chatbot>`）從「畫面上一個錯誤」變成「render／callback 路徑丟例外」。
   ⇒ 維持真值判斷，並在該案上方寫明理由（一行），讓下一個人看得到這是決定而不是漏想。
8. **`AsgardSourceSetClient` 不受影響（已確認）。** 它只在註解裡提到 `sandboxFs*`，沒有共用這條 URL 組裝路徑；
   volume API 沒有 channel 概念。
9. 📌 **`generateSandboxBrowserOpenUrl` 從字串改成 `new URL()` 之後，相對路徑的 `botProviderEndpoint` 會 throw。**
   jasonluo07 查核後認定不需處理：client 其他地方（`157`／`191`／`262`／`312` 與全部 fs 方法）本來就用
   `new URL()`，相對 base 早就不被支援 ⇒ 這只是把最後一個例外對齊。列此備查。

---

## Execution Log

- 2026-09-10: REVIEW task created, paired with BUILD-079（Status: `draft → in-progress`）。
- 2026-09-10: §1 — 18 項全 ✅／0 ❌；greps 確認零禁用樣式、core 未碰 react／DOM、export surface 未動、
  URL 組裝已收斂成單一出口、產物確實帶參數。
- 2026-09-10: §3 — R1–R7 全 Pass。四組新斷言逐一反向驗證（11/24、14/14、2/3、守門那條以拿掉一支方法反證），
  紅的位置與預期一致。0 BLOCKER；5 個 Minor 全部是刻意的取捨或範圍外，逐條記在上面（Status: `done`）。
- 2026-09-10: 收到 jasonluo07 的 review（PR #471）。**三處請修全接**（版號註解會隨 `.d.ts` 發出去、
  scope 改每次算、PR body 改 `Refs`），**七項建議接六項**（open-url 改用 `apiHeaders()`、兩支 spec 補 global
  teardown、`lastRequestUrl` 取最後一筆、守門盲區寫一行、react README 補一節、TL;DR 修正說法）。
  未接受的那一項（空字串）理由記在 §Findings 6；範圍外的那一項另開
  `asgard-ai-platform/asgard-js-sdk#472`。閘門重跑全綠、`test:packages` **802**
  （319 core + 483 react）；新增那一案（換 channel）反向驗證過：改回快照 → 紅、改回來 → 綠。
