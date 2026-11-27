# Sandbox

## 範圍

- 涵蓋：
  - core 的 sandbox relay 呼叫（檔案系統、瀏覽器 open-url）怎麼帶 channel scope。
  - 內建檔案總管與 sandbox 卡片怎麼把 channel scope 帶上。
  - sandbox 卡片、Launch HUD、瀏覽器面板與下載卡還沒有收斂。
- 名稱：
  - channel scope：型別是 `SandboxChannelScope`。client 把其中的 `customChannelId` 送成 relay 呼叫的 `custom_channel_id` 參數，表示這次呼叫屬於哪個 channel（`packages/core/src/lib/client.ts`）。
  - 消費端：使用 SDK 的應用。原文的 host、呼叫端指的也是消費端。
  - 對照表守門：`sandbox-channel-scope.spec.ts` 的一項測試。它確認 `AsgardServiceClient.prototype` 上每一個名稱含 sandbox 的方法，都列在測試的對照表或私有 helper 清單裡。SANDBOX-19 的 prototype 指的是這個 JavaScript 類別的 prototype，不是設計原型。
- PM 規格：[Sandbox 瀏覽器面板](../../references/asgard-sdk-pm/docs/spec/asgard-js-sdk/sandbox-browser.md)、[Sandbox 下載卡與共用喚醒](../../references/asgard-sdk-pm/docs/spec/asgard-js-sdk/sandbox-download.md)、[預覽模式下的動作卡](../../references/asgard-sdk-pm/docs/spec/asgard-js-sdk/preview-mode-cards.md)、[F-018 Sandbox 冷啟動指示浮層 Launch HUD](../../references/asgard-sdk-pm/tracking/asgard-js-sdk/features/F-018-sandbox-冷啟動指示浮層-launch-hud.md)、[F-019 consume launchedSandboxes 並以 Rx 通道對外暴露](../../references/asgard-sdk-pm/tracking/asgard-js-sdk/features/F-019-consume-launchedsandboxes-並以-rx-通道對外暴露.md)、[F-020 sandbox handoff 卡片(瀏覽器接手 / 開檔)](../../references/asgard-sdk-pm/tracking/asgard-js-sdk/features/F-020-sandbox-handoff-卡片-瀏覽器接手-開檔.md)、[F-021 sandbox working directory File Explorer 側欄](../../references/asgard-sdk-pm/tracking/asgard-js-sdk/features/F-021-sandbox-working-directory-file-explorer-側欄.md)、[F-034 sandbox open-folder 卡片與檔案總管目錄 reveal](../../references/asgard-sdk-pm/tracking/asgard-js-sdk/features/F-034-sandbox-open-folder-卡片與檔案總管目錄-reveal.md)、[F-035 sandbox 瀏覽器面板 — SDK 內渲染 WebRTC 與接管](../../references/asgard-sdk-pm/tracking/asgard-js-sdk/features/F-035-sandbox-瀏覽器面板-sdk-內渲染-webrtc-與接管.md)、[F-038 sandbox 下載卡（download-file）與 channel 層共用喚醒](../../references/asgard-sdk-pm/tracking/asgard-js-sdk/features/F-038-sandbox-下載卡-download-file-與-channel-層共用喚醒.md)、[F-040 預覽模式下動作卡照樣顯示、呈現 disabled + tooltip](../../references/asgard-sdk-pm/tracking/asgard-js-sdk/features/F-040-預覽模式下動作卡照樣顯示-呈現-disabled-tooltip.md)。channel scope 沒有 PM 規格，來源是本 repo 的 issue #470 與 `asgard-freyr-api` 的 TASK-149。
- 優先順序：產品規則以 PM 規格為準。實際行為以程式為準。本章只記兩者都讀不出來的決定、差異與限制。

## 設計決定

| 編號 | 決定 | 類型 | 為什麼 | 出處 |
|---|---|---|---|---|
| SANDBOX-1 | channel scope 是選填，放在各呼叫既有的 options 物件。SDK 不新增位置參數。 | PM 未定義、前端先決定 | 改成必填，是簽名的破壞性變更，而這裡沒有舊東西可以先標 `@deprecated`。十一支呼叫裡有五支已經有 options。如果在選填的 options 後面再接位置參數，會出現「要傳 scope 得先傳 undefined」的形狀。漏傳不是安靜的失敗：relay 回的 400 會逐字寫出缺了哪個參數。 | 原 BUILD-079 |
| SANDBOX-3 | `customChannelId` 是 `undefined` 或空字串時，client 不送 `custom_channel_id` 參數，也不丟例外。只有空白字元的字串，client 照原樣送出。 | 刻意的行為 | 如果照送，只會得到同一句 `required` 的 400。如果在 client 裡丟例外，會改變唯一真的會出現空字串的情況：消費端傳 `customChannelId=""` 時，結果會從「畫面上一個錯誤」變成 render 或 callback 路徑丟例外。 | 原 BUILD-079 |
| SANDBOX-15 | 沒有 channel scope 時，SDK 不加執行期警告。 | 理由 | 消費端直連 edge server 時，沒有 channel scope 是完全正常的。 | 原 BUILD-079 |

## 跟 PM 不一致的地方

無

## 已知限制

| 編號 | 限制 | 原因 | 待誰處理 |
|---|---|---|---|
| SANDBOX-17 | 參數層的 4xx 在畫面上沒有自己的呈現。 | 失敗計數只認 `412` 與 `5xx`。缺 channel scope 之類的 400，不會讓 sandbox 被踢出下拉選單。所以這種 400 發生時，使用者看到的是「一直重試、一直失敗、看不到原因」。 | 需另立票（asgard-ai-platform/asgard-js-sdk#470） |
| SANDBOX-18 | 自組面板的消費端漏傳 channel scope 時，沒有型別錯誤。 | SDK 內沒有 hook 或 provider 幫忙補值。已知的例子是 Sindri 自己持有 controller、不帶 channel scope 的檔案總管。它目前不在做 ownership 檢查的 relay 後面，所以沒壞。要不要提供「從 context 取值」是設計題。 | SDK（asgard-ai-platform/asgard-js-sdk#472） |
| SANDBOX-19 | 對照表守門有盲區。 | 守門的做法是掃 prototype 上名稱含 `sandbox`（不分大小寫）的方法。有兩種掃不到：名稱裡沒有 sandbox 字樣的 relay；宣告成實例 arrow-function field 的方法。 | 不處理 |
| SANDBOX-20 | 相對路徑的 `botProviderEndpoint` 會讓 open-url 丟例外。 | open-url 改用 `new URL()`，與 client 的其他方法一致。相對路徑的 base 本來就不支援。 | 不處理 |
