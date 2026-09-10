# BUILD-079 Scope every sandbox relay call to its channel

## Meta

- Task ID: `BUILD-079`
- Status: `done`
- Issue: [asgard-js-sdk#470](https://github.com/asgard-ai-platform/asgard-js-sdk/issues/470)（`BUG`／issue 開在本 repo，無 PM tracking spec）
- Source spec: 無 PM spec。契約來源是 `asgard-freyr-api` 的 `TASK-149`（`internal/components/gin.go:457` 的
  `RequireSandboxAuthorization`，已上該 repo 的 `dev-0.0.72`）
- Complexity: `S`

---

## Brief

sandbox 屬於「把它啟動起來的那個 channel」。asgard-core 的 edge server 從路徑就能認出 sandbox，但**擺在它前面的
relay 不行**——relay 必須先證明呼叫者擁有這個 sandbox 才能轉送。`asgard-freyr-api` 的 `TASK-149` 就是這麼做的：
十一支 sandbox route 整組掛上守門，缺 `custom_channel_id` 一律

```json
{ "code": "invalid_argument", "message": "custom_channel_id is required" }
```

而 `AsgardServiceClient` 的十一支 sandbox 呼叫**一個都沒有送這個參數**。後果是內建檔案總管整個不能用（列出、
開檔、存檔、新資料夾、刪除、複製、搬移、watch、下載全部 400），`sandbox://<name>/open-browser` 卡片一起壞
（`POST browser/open-url` 同組守門）。消費端（`asgard-freyr-web`）沒有任何 code 參與組這串網址，所以它修不了。

本 task 讓十一支都收一個選填的 `SandboxChannelScope` 並把它寫進 query。**選填是為了 §1.7 的相容性**，不是因為
它可有可無：react 這邊一律會填——內建 aside 從 channel context 拿，open-browser 卡片從它 options 上**早就有**的
`customChannelId`（channel-home 下載在用）拿。

**Already exists:** `packages/core/src/lib/client.ts`（十一支 sandbox 方法、`deriveSandboxFsEndpoint`）、
`packages/core/src/types/sandbox-fs.ts`（三個 options 型別）、
`packages/react/src/components/file-explorer/create-sandbox-fs-providers.ts`（十二個 provider 轉呼叫）、
`packages/react/src/components/chatbot/chatbot-file-explorer.tsx`（內建 aside，已從 context 取 `client`／`channel`）、
`packages/react/src/utils/dispatch-uri-action.ts`（`DispatchUriActionOptions.customChannelId` **已存在**）。

---

## Relevant Rules

| §    | Rule (summary)                                                                      |
| ---- | ----------------------------------------------------------------------------------- |
| §1.1 | No `any` / `as any`                                                                 |
| §1.2 | No `@ts-ignore` / `eslint-disable`                                                  |
| §1.3 | No `console.log` left in library code                                               |
| §1.4 | No hardcoded API key / endpoint / namespace                                         |
| §1.5 | Every RxJS subscription / EventSource / timer has teardown                          |
| §1.6 | core never imports react / react-dom / DOM; react imports core via its public entry |
| §1.7 | **No breaking public-API change without `@deprecated` transition**                  |
| §2.2 | New public types exported from the package entry with explicit `export type`        |
| §3.1 | Exported functions / methods declare explicit return types                          |
| §3.2 | Shared types centralized in `core/src/types/`; no duplicate interfaces              |
| §6   | After implementation: extract repeated logic (≥2×)                                  |
| §7   | No `setTimeout` mock delays, no dead commented code, no untracked TODO / FIXME      |

Extra rows for this task:

| §    | Rule (summary)                                                                                                         |
| ---- | ---------------------------------------------------------------------------------------------------------------------- |
| #470 | 不改動端點路徑、method、既有 query 名稱——那些是上游 asgard-core 的拼法（`client.ts` 檔頭已註明）                       |
| #470 | 缺參數時**不得**丟例外或自行合成 channel id：沒有 channel 的呼叫端（自組 providers）要維持原本的行為，由後端回它的 400 |

---

## Acceptance Criteria

- `R1` When a sandbox call is given a scope carrying `customChannelId`, the system shall send it as the
  `custom_channel_id` query parameter — on all eleven relays, `fs/watch` and `browser/open-url` included. → T1, T2, T4
- `R2` When a sandbox call is given no scope, the system shall produce exactly the URL it produced before this
  task, so an existing caller keeps compiling and keeps working against an edge server that never wanted the
  parameter. → T1, T4
- `R3` When the built-in File Explorer aside makes any fs call, the system shall scope it to the channel the
  aside is looking at, taken from the channel context rather than from a prop the host has to remember. → T3, T5
- `R4` When a `sandbox://<name>/open-browser` card is clicked, the system shall scope the open-url call to the
  same channel, using the `customChannelId` its dispatcher options already carry. → T3, T6
- `R5` When a scope is present but its `customChannelId` is an empty string, the system shall omit the
  parameter rather than send an empty one — an empty channel id is a `400` the caller cannot read. → T1, T4
- `R6` When a new sandbox relay is added to the client later, the system shall fail a test rather than ship it
  without deciding about the scope. → T1, T4
- `R7` (Smoke check) When the developer runs the gates, the system shall pass `lint:packages`,
  `format:check`, `typecheck`, `build:core`, `build:react` and `test:packages`, and the emitted
  `client.d.ts` / `sandbox-fs.d.ts` shall carry the new parameter and type. → T7

---

## Implementation Tasks

- [x] T1 (R1, R2, R5, R6): core — `SandboxChannelScope` in `types/sandbox-fs.ts`（三個既有 options 型別 `extends`
      它）；`withChannelScope()` 模組級 helper ＋ `sandboxFsUrl()` 私有方法，十一支全部改走它。
- [x] T2 (R1): core — `generateSandboxBrowserOpenUrl(sandboxName, options?)`；順手修掉檔內那句已經過期的註解
      （原本逐字寫「不需 custom_channel_id」）。
- [x] T3 (R3, R4): react — `SandboxFsProvidersOptions.customChannelId`，十二個 provider 轉呼叫帶上；內建 aside
      從 context 取 `customChannelId` 並列入 `useMemo` deps；`dispatchUriAction` 把 options 上既有的
      `customChannelId` 往下傳給 `openSandboxBrowser`。
- [x] T4 (R1, R2, R5, R6): core Vitest — `sandbox-channel-scope.spec.ts`，一張表驅動十一支（24 案）。
- [x] T5 (R3): react Vitest — `channel-scope-forwarding.spec.ts`（十二個 provider，14 案）＋
      `builtin-aside-channel-scope.spec.tsx`（context → providers → client 整條，1 案）。
- [x] T6 (R4): react Vitest — `dispatch-uri-action-channel-scope.spec.ts`（3 案）。
- [x] T7 (R7): README（`packages/core/README.md` 新增「Sandbox calls are channel-scoped」一節）＋ 全套閘門。

---

## Coverage

Use Cases: `R1`–`R7` — 全部驗過，證據見 `REVIEW-079`。R1／R2／R5／R6 由 core 那張表（24 案），R3 由 react 兩支
（15 案），R4 由 dispatcher 那支（3 案），R7 由閘門與 `dist` 的 grep。

Files:

| File (package)                                                                 | Change                                                                       |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `packages/core/src/types/sandbox-fs.ts`                                        | 新 `SandboxChannelScope`；三個 options 型別 `extends` 它（T1）               |
| `packages/core/src/lib/client.ts`                                              | `withChannelScope` ＋ `sandboxFsUrl`；十一支帶 scope；過期註解更正（T1, T2） |
| `packages/core/src/lib/sandbox-channel-scope.spec.ts`                          | 新檔 — 一張表驅動十一支 ＋ 覆蓋率守門（T4）                                  |
| `packages/react/src/components/file-explorer/create-sandbox-fs-providers.ts`   | options 加 `customChannelId`；十二個轉呼叫帶上（T3）                         |
| `packages/react/src/components/file-explorer/channel-scope-forwarding.spec.ts` | 新檔 — 十二個 provider 的轉送（T5）                                          |
| `packages/react/src/components/chatbot/chatbot-file-explorer.tsx`              | 內建 aside 從 context 取 `customChannelId`（T3）                             |
| `packages/react/src/components/chatbot/builtin-aside-channel-scope.spec.tsx`   | 新檔 — context → providers → client 整條（T5）                               |
| `packages/react/src/utils/dispatch-uri-action.ts`                              | open-browser 帶上既有的 `customChannelId`（T3）                              |
| `packages/react/src/utils/dispatch-uri-action-channel-scope.spec.ts`           | 新檔 — 卡片路徑（T6）                                                        |
| `packages/core/README.md`                                                      | 新增 channel scope 一節（T7）                                                |

`packages/react/src/index.ts` 與 `packages/core/src/index.ts` 未動：`SandboxChannelScope` 由既有的
`export type * from './sandbox-fs'` 自動出去（已確認進 `dist/types/sandbox-fs.d.ts`）。

---

## Decisions

- **選填而不是必填。** 必填會是簽名的破壞性變更（§1.7 要求先 `@deprecated` 過渡），而這裡沒有「舊的那個」可以
  標記——參數是新增的。他們既有的慣例也是把 channel id 擺在最後、由呼叫端傳（`uploadFile(file, customChannelId)`、
  `downloadChannelHomeFile(relativePath, customChannelId)`）。代價是漏傳的人拿不到型別錯誤，但**漏傳的失敗並不
  安靜**：relay 回的 400 逐字說出缺了哪個參數。
- **放在 options 物件裡，而不是新增一個位置參數。** 十一支裡有五支已經有 options（`read`／`write`／`copy`／`move`
  和 batch upload 用的 `signal`），在選填 options 後面再接一個位置參數會出現「要傳 scope 就得先傳 undefined」的
  形狀。用 options 之後十一支的形狀一致，而且既有型別 `extends` 一個共同介面就完成一半（§3.2）。
- **`sandboxFsUrl()` 的 scope 參數是必填的 `SandboxChannelScope | undefined`。** 這是刻意的：選填會讓第十二支
  沿用「什麼都不寫」而編譯得過，而那正是這十一支的來歷。要不要 scope 必須寫出來。
- **空字串當成沒有。** `withChannelScope` 用真值判斷。送一個空的 `custom_channel_id` 只會換一個 relay 讀不懂的
  400，而 react 那邊 `customChannelId` 在 preview／未建立 channel 時本來就可能是空。
- **一張表驅動十一支，而不是十一段各自的斷言。** 這個缺陷不是「某一支寫錯」而是「全部都沒有」。寫在每支方法旁邊的
  斷言，會跟那支方法一起被漏掉；表加上「prototype 上的 sandbox 方法都要在表裡」那條守門之後，第十二支不在表裡就
  是紅的。
- **不動 `create-sandbox-fs-providers` 的失敗計數規則。** `isSandboxLevelFailure` 只認 `412` 與 `5xx`，所以這條
  400 不會把 sandbox 踢出下拉選單——那是對的（路徑層／參數層的錯不代表 sandbox 死了）。但它也意味著這個缺陷的
  現場表現是「無限重試、每次都失敗、使用者看不到原因」。改動它是另一個題目（#470 附帶項），本 task 不碰。
- **不新增執行期警告。** 「沒有 scope」對直連 edge server 的呼叫端是完全正常的，在那裡印 console 是 §1.3 的反面。

---

## Execution Log / Change Log

- 2026-09-10: 由 `asgard-freyr-web` 側的線上故障回推（dev 上 `fs/list` 回 400），確認 `0.3.77`／npm 最新的
  `0.3.81`／本 repo `main` 三者皆無此參數 ⇒ 開 #470、建立本 task（Status: `draft → in-progress`）。
- 2026-09-10: T1–T7 完成（Status: `in-progress → done`）。閘門全綠——`lint:packages` 0 errors／5 個既有 warning、
  `format:check` 乾淨、`typecheck` 三專案綠、`build:core`／`build:react` 乾淨、`test:packages` 801 通過
  （319 core + 482 react，新增 42）。四組新斷言逐一反向驗證過（把實作 stash 掉之後轉紅、還原後轉綠），
  數字見 `REVIEW-079` §3。
