# Sandbox

## 範圍

- 涵蓋：core 的 sandbox relay 呼叫（檔案系統、瀏覽器 open-url）怎麼帶 channel scope，以及內建檔案總管與 sandbox 卡片怎麼把 scope 帶上。sandbox 卡片、Launch HUD、瀏覽器面板與下載卡還沒有收斂。
- PM 規格：[Sandbox 瀏覽器面板](../../references/asgard-sdk-pm/docs/spec/asgard-js-sdk/sandbox-browser.md)、[Sandbox 下載卡與共用喚醒](../../references/asgard-sdk-pm/docs/spec/asgard-js-sdk/sandbox-download.md)、[預覽模式下的動作卡](../../references/asgard-sdk-pm/docs/spec/asgard-js-sdk/preview-mode-cards.md)、[F-018 Sandbox 冷啟動指示浮層 Launch HUD](../../references/asgard-sdk-pm/tracking/asgard-js-sdk/features/F-018-sandbox-冷啟動指示浮層-launch-hud.md)、[F-019 consume launchedSandboxes 並以 Rx 通道對外暴露](../../references/asgard-sdk-pm/tracking/asgard-js-sdk/features/F-019-consume-launchedsandboxes-並以-rx-通道對外暴露.md)、[F-020 sandbox handoff 卡片(瀏覽器接手 / 開檔)](../../references/asgard-sdk-pm/tracking/asgard-js-sdk/features/F-020-sandbox-handoff-卡片-瀏覽器接手-開檔.md)、[F-021 sandbox working directory File Explorer 側欄](../../references/asgard-sdk-pm/tracking/asgard-js-sdk/features/F-021-sandbox-working-directory-file-explorer-側欄.md)、[F-034 sandbox open-folder 卡片與檔案總管目錄 reveal](../../references/asgard-sdk-pm/tracking/asgard-js-sdk/features/F-034-sandbox-open-folder-卡片與檔案總管目錄-reveal.md)、[F-035 sandbox 瀏覽器面板 — SDK 內渲染 WebRTC 與接管](../../references/asgard-sdk-pm/tracking/asgard-js-sdk/features/F-035-sandbox-瀏覽器面板-sdk-內渲染-webrtc-與接管.md)、[F-038 sandbox 下載卡（download-file）與 channel 層共用喚醒](../../references/asgard-sdk-pm/tracking/asgard-js-sdk/features/F-038-sandbox-下載卡-download-file-與-channel-層共用喚醒.md)、[F-040 預覽模式下動作卡照樣顯示、呈現 disabled + tooltip](../../references/asgard-sdk-pm/tracking/asgard-js-sdk/features/F-040-預覽模式下動作卡照樣顯示-呈現-disabled-tooltip.md)；channel scope 沒有 PM 規格，來源是本 repo 的 issue #470 與 `asgard-freyr-api` 的 TASK-149。
- 優先順序：產品規則以 PM 規格為準，實際行為以程式為準；本章只記兩者都讀不出來的決定、差異與限制。

## 設計決定

| 編號       | 決定                                                                | 類型                  | 為什麼                                                                                                                                                                                                                        | 出處         |
| ---------- | ------------------------------------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| SANDBOX-1  | channel scope 是選填，放在各呼叫既有的 options 物件，不新增位置參數 | PM 未定義、前端先決定 | 必填是簽名的破壞性變更，這裡沒有舊東西可以先標 `@deprecated`；十一支裡有五支已經有 options，在選填 options 後再接位置參數會出現「要傳 scope 得先傳 undefined」的形狀。漏傳不是安靜的失敗：relay 回的 400 逐字寫出缺了哪個參數 | 原 BUILD-079 |
| SANDBOX-3  | `customChannelId` 是空字串時不送參數，也不丟例外                    | 刻意的行為            | 照送只會得到同一句 `required` 的 400；在 client 裡丟例外，會把唯一真的會出現空字串的情況（host 傳 `customChannelId=""`）從「畫面上一個錯誤」變成 render／callback 路徑丟例外                                                  | 原 BUILD-079 |
| SANDBOX-15 | 沒有 scope 時不加執行期警告                                         | 理由                  | 對直連 edge server 的呼叫端，沒有 scope 是完全正常的                                                                                                                                                                          | 原 BUILD-079 |

## 跟 PM 不一致的地方

無

## 已知限制

| 編號       | 限制                                                  | 原因                                                                                                                                                                                  | 待誰處理                                                |
| ---------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| SANDBOX-17 | 參數層的 4xx 在畫面上沒有自己的呈現                   | 失敗計數只認 `412` 與 `5xx`，缺 scope 之類的 400 不會讓 sandbox 被踢出下拉選單；現場表現是「一直重試、一直失敗、看不到原因」                                                          | 需另立票（asgard-ai-platform/asgard-js-sdk#470 附帶項） |
| SANDBOX-18 | 自組面板的 host 漏傳 scope 沒有型別錯誤               | SDK 內沒有 hook 或 provider 幫忙補值；已知例子是 Sindri 自持 controller、不帶 scope 的檔案總管，它目前不在做 ownership 檢查的 relay 後面所以沒壞。是否提供「從 context 取值」是設計題 | `asgard-js-sdk#472`                                     |
| SANDBOX-19 | 對照表守門有盲區                                      | 守門是掃 prototype 上名稱含 `sandbox`（不分大小寫）的方法：名稱裡沒有 sandbox 字樣的 relay、或宣告成實例 arrow-function field 的方法都掃不到                                          | 不處理                                                  |
| SANDBOX-20 | 相對路徑的 `botProviderEndpoint` 會讓 open-url 丟例外 | open-url 改用 `new URL()`，與 client 其他方法一致；相對 base 本來就不支援                                                                                                             | —                                                       |
