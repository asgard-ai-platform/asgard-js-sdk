# Sandbox

代號 `SANDBOX`。

## 範圍

- `@asgard-js/core`：`AsgardServiceClient` 的 sandbox 方法——檔案系統（`sandboxFsList`、`sandboxFsRead`、`sandboxFsWrite`、`sandboxFsStat`、`sandboxFsMkdir`、`sandboxFsRemove`、`sandboxFsRemoveAll`、`sandboxFsCopy`、`sandboxFsMove`、`sandboxFsWatch`）、`generateSandboxBrowserOpenUrl`、`createSandboxBrowserSession`——以及型別 `SandboxChannelScope`。
- `@asgard-js/react`：sandbox 相關的卡片、Launch HUD、瀏覽器面板，以及內建檔案總管呼叫 sandbox 的方式。
- PM：F-018 ～ F-021、F-034、F-035、F-038、F-040、BUG-006、TASK-003（皆待驗收）。channel scope 沒有 PM 票，來源是本 repo #470 與 `asgard-freyr-api` 的 TASK-149。
- 檔案總管的 UI 行為在 [file-explorer.md](file-explorer.md)。

## 現行行為

### relay 的 channel scope

| 編號      | 項目              | 現行行為                                                                                                                                                                                                                                                                          |
| --------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SANDBOX-1 | 帶 scope          | 十一支 sandbox 呼叫（十支 `sandboxFs*` 與 `generateSandboxBrowserOpenUrl`）都收一個選填的 `SandboxChannelScope`（`{ customChannelId }`），放在各自的 options 物件裡。有給時以 `custom_channel_id` query 參數送出，`fs/watch` 與 `browser/open-url` 也一樣。                       |
| SANDBOX-2 | 沒給 scope        | 產生的網址與沒有這個參數時完全相同，既有呼叫端照常編譯、照常對不需要這個參數的 edge server 運作。                                                                                                                                                                                 |
| SANDBOX-3 | 空字串            | `customChannelId` 是空字串時不送這個參數（以真值判斷）。                                                                                                                                                                                                                          |
| SANDBOX-4 | 內建側欄自動帶    | 內建檔案總管側欄的每一次 fs 呼叫，都帶上它正在看的那個 channel，值取自 channel context，host 不必另外傳。`createSandboxFsProviders` 在**每次呼叫時**取 scope，不是建立時快照；host 保留同一個 providers 實例而中途換 channel，也會送新的 channel。沒有 channel 時傳 `undefined`。 |
| SANDBOX-5 | open-browser 卡片 | 點 `sandbox://<name>/open-browser` 卡片時，open-url 呼叫以卡片 dispatcher options 上的 `customChannelId` 帶 scope。                                                                                                                                                               |
| SANDBOX-6 | 新增 relay 的守門 | client prototype 上名稱以 sandbox 方法前綴開頭的方法都必須列在測試的對照表裡；新增一支卻沒決定 scope，測試會失敗。                                                                                                                                                                |

### 尚待 PM 驗收的 sandbox 行為

| 編號       | 項目                     | 現行行為                                                                                                                                                                                             |
| ---------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SANDBOX-7  | Channel Home 命名        | 每個 channel 的檔案下載平面使用 `channel-home://` 與 Channel Home 的 API 名稱，舊的 `cwd://` 沒有相容別名。（待驗收：BUILD-018）                                                                     |
| SANDBOX-8  | Launch HUD               | `asgard.sandbox.launch`／`ready` 顯示「Sandbox 啟動中」浮層；初始化、還原、重設三條進房路徑都會接上 sandbox phase。（待驗收：BUILD-019、BUILD-035）                                                  |
| SANDBOX-9  | live sandbox 清單        | channel metadata 的 `launchedSandboxes` 以 Rx 通道 `launchedSandboxes$` 對外提供。（待驗收：BUILD-021）                                                                                              |
| SANDBOX-10 | 接手與開檔／開資料夾卡片 | `sandbox://<name>/open-browser`、`open-file`、`open-folder` 卡片：接手瀏覽器、在檔案總管開檔、展開並顯示資料夾。（待驗收：BUILD-022、BUILD-080）                                                     |
| SANDBOX-11 | 瀏覽器面板               | core 提供憑證呼叫與 Neko 協定層（`createSandboxBrowserTransport`、keysym 轉換），react 提供面板與輸入轉送（`useSandboxBrowserController`）。（待驗收：BUILD-081、BUILD-082）                         |
| SANDBOX-12 | 喚醒與下載卡             | 喚醒 sandbox 是 Channel 上唯一一份 store，檔案總管與下載卡共用；`sandbox://<name>/download-file` 卡片有狀態，必要時先喚醒再下載，整張閒置卡都是點擊目標。（待驗收：BUILD-088、BUILD-089、BUILD-093） |
| SANDBOX-13 | 預覽模式的卡片           | 預覽模式（沒有連線）下，需要連線的卡片照樣顯示但呈現停用，附提示。（待驗收：BUILD-095）                                                                                                              |

## 設計決定

| 決定                                                                       | 理由                                                                                                                                                                                                   | 出處                               |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| scope 是選填，不是必填                                                     | 必填是簽名的破壞性變更（要先經過 `@deprecated` 過渡），而這裡沒有舊的東西可以標；既有慣例也是把 channel id 放最後、由呼叫端傳。漏傳的失敗並不安靜：relay 回的 400 逐字寫出缺了哪個參數                 | 原 BUILD-079                       |
| scope 放在 options 物件，不是新增位置參數                                  | 十一支裡有五支已經有 options；在選填 options 後再接一個位置參數，會出現「要傳 scope 得先傳 undefined」的形狀                                                                                           | 原 BUILD-079                       |
| 內部組網址的函式 scope 參數型別是必填的 `SandboxChannelScope \| undefined` | 選填會讓第十二支沿用「什麼都不寫」而編譯得過，而那正是這十一支的來歷；要不要 scope 必須寫出來                                                                                                          | 原 BUILD-079                       |
| scope 每次呼叫時算，不在建立 providers 時快照                              | `createSandboxFsProviders` 是公開 export，自組面板的 host 不一定在 channel 變動時重建它；快照會讓它一直送舊的 channel。成本相同                                                                        | 原 BUILD-079（PR #471 審查時修正） |
| 空字串不送參數，也不丟例外                                                 | 照送只會得到同一句 `required` 的 400，對呼叫端沒有差別；在 client 裡對空字串丟例外，會把唯一真的會出現空字串的情況（host 傳 `customChannelId=""`）從「畫面上一個錯誤」變成 render／callback 路徑丟例外 | 原 BUILD-079                       |
| 不加執行期警告                                                             | 對直連 edge server 的呼叫端，沒有 scope 是完全正常的                                                                                                                                                   | 原 BUILD-079                       |
| 不改 sandbox 失敗計數規則                                                  | `isSandboxLevelFailure` 只認 `412` 與 `5xx`；參數層的 400 不代表 sandbox 死了，不該把它踢出下拉選單                                                                                                    | 原 BUILD-079                       |

## 已知限制與未交付

| 項目                                                  | 說明                                                                                                                                                                                                                               | 交接                    |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| 參數層的 4xx 在畫面上沒有自己的呈現                   | 缺 scope 之類的 400 不會讓 sandbox 被踢出下拉選單，現場表現是「一直重試、一直失敗、看不到原因」                                                                                                                                    | 需另立票（#470 附帶項） |
| 自組面板的 host 漏傳 scope 沒有型別錯誤               | SDK 內沒有 hook 或 provider 幫忙補值；已知例子是 Sindri 的 `file-explorer-context.tsx`（`fileExplorer="off"`、自持 controller、不帶 scope），它目前不在做 ownership 檢查的 relay 後面所以沒壞。是否提供「從 context 取值」是設計題 | `asgard-js-sdk#472`     |
| 第十二支的守門有盲區                                  | 對照表靠名稱前綴掃 prototype：不合前綴的名稱、或宣告成實例 arrow-function field 的方法都掃不到                                                                                                                                     | —                       |
| 相對路徑的 `botProviderEndpoint` 會讓 open-url 丟例外 | `generateSandboxBrowserOpenUrl` 改用 `new URL()`，與 client 其他方法一致；相對 base 本來就不支援                                                                                                                                   | —                       |
| `AsgardSourceSetClient` 不受影響                      | volume API 沒有 channel 概念，也不共用這條網址組裝路徑                                                                                                                                                                             | —                       |

## 程式位置

- core：`packages/core/src/lib/client.ts`（`withChannelScope`、各 `sandboxFs*`、`generateSandboxBrowserOpenUrl`）、`packages/core/src/types/sandbox-fs.ts`（`SandboxChannelScope`）
- react：`packages/react/src/components/file-explorer/create-sandbox-fs-providers.ts`、`packages/react/src/components/chatbot/chatbot-file-explorer.tsx`、`packages/react/src/utils/dispatch-uri-action.ts`
- 測試：`packages/core/src/lib/sandbox-channel-scope.spec.ts`、`packages/react/src/components/file-explorer/channel-scope-forwarding.spec.ts`、`packages/react/src/components/chatbot/builtin-aside-channel-scope.spec.tsx`、`packages/react/src/utils/dispatch-uri-action-channel-scope.spec.ts`
