# 現況規格（current-state spec）

這個目錄是給之後接手的 agent 讀的：`@asgard-js/core` 與 `@asgard-js/react` 裡，**從程式讀不出來**的決定、跟 PM 規格的差異，以及已知限制。依功能分章。

- 章節清單：[`_index.md`](_index.md)
- 已收斂的任務與文件：[`converged-tasks.md`](converged-tasks.md)

## 這裡寫什麼、不寫什麼

- **寫**：agent 從程式讀不出來的東西——為什麼這樣做、哪些看起來奇怪的行為是刻意的、哪些地方 PM 沒定義而由前端先決定、跟 PM 規格不一致的地方、已知限制與交接對象。
- **不寫**：公開 API 的名稱、參數、預設值、事件順序、路由、文案、數值、檔案位置。這些讀型別、程式與測試就有，寫進來只會過期。
- 套件使用教學在 `packages/core/README.md`、`packages/react/README.md`。
- 還沒收斂的需求（PM 還沒驗收、或 BUILD／REVIEW 還沒結案）留在 `requirements/tasks/`，細節讀那份 BUILD。

## 優先順序

- **產品規則**看 PM 規格：`references/asgard-sdk-pm/docs/spec/asgard-js-sdk/`（living spec），沒有的看 `references/asgard-sdk-pm/tracking/asgard-js-sdk/` 的 F／UC／BUG。
- **實際行為**看程式與測試。
- 本目錄只記兩者之間的差異與理由。三者衝突時，先確認程式是不是 bug，再決定改程式還是回報 PM。

## 每章的格式

每章四段，標題固定：

1. **範圍**：這章管哪些 API 或元件、連到 PM 對應的規格，並寫明上面的優先順序。
2. **設計決定**：`編號｜決定｜類型｜為什麼｜出處`。類型三選一：「理由」「刻意的行為」「PM 未定義、前端先決定」。出處只留最後定案的那一張。
3. **跟 PM 不一致的地方**：`編號｜PM 寫的｜實際｜為什麼｜待誰處理`。
4. **已知限制**：`編號｜限制｜原因｜待誰處理`。

某段沒有內容時，標題下只寫「無」。

每一列有穩定編號 `<章代號>-<n>`，例如 `CLIENT-1`。編號只增不減、不重用：一列不再成立時改寫成「已移除（日期、原因）」，不刪列、不把號碼給別人。新 BUILD 引用設計決定時寫 `← spec/CLIENT-1`；沿用的是既有行為就指向 PM 規格或程式，不指向這裡。

## 反覆修改過的功能

- 只寫最終狀態，不寫「原本是…後來改成…」。
- 只有在舊做法看起來比較自然、agent 可能改回去時，才在「設計決定」寫一條「不要做 X，因為 Y」，類型標「刻意的行為」。
- PM 需求還在變的，記進「已知限制」，不寫成決定。

## 什麼時候收斂

一對 BUILD／REVIEW 在下列條件**都**成立時收斂，然後刪除原檔：

- 它引用的每一個 PM issue 在各自的 GitHub Projects 看板上都是 **Done**。SDK 的票常引用別的產品的 PM repo（sindri-pm、freyr-pm、heimdall-pm…），那些也要 Done。`In review`、`Pending fix` 都不算。
- **而且** BUILD 與 REVIEW 本身的 Status 都是 `done`。
- 沒有 PM 票的：衍生自另一張票的，跟著來源票走；沒有來源票的，要合進 `main` 並發版（有 `@asgard-js/core@X` tag 包含它）之後才收。

其他開發過程的文件（FOLLOWUP、測試報告、`docs/` 底下的過程紀錄）照同樣的方式收：內容放進對應章節，登記封存索引後刪除。

## 收斂步驟

1. **寫進章節**：以現在的程式為準，把 BUILD 的設計決定、REVIEW 裡沒處理的項目，寫進對應章節的「設計決定」「跟 PM 不一致的地方」「已知限制」。不要把 BUILD 的 `R#` 原樣抄過來。
2. **登記封存索引**：在 [`converged-tasks.md`](converged-tasks.md) 為每個要刪的檔登記一列，「收進」只寫章名，附刪除前最後一個 commit 的連結。
3. **更新引用**：`requirements/` 與 `docs/` 裡指向這些檔案的連結改成指向章節。程式碼註解寫了任務檔**完整路徑**的，改成指向規格；只寫編號的不改，透過封存索引仍查得到。
4. **從 Task Queue 移除並刪檔**：從 `requirements/tasks/_index.md` 移除這幾列，刪除原檔。
5. **檢查連結**：`requirements/` 與 `docs/` 底下沒有新增失效的相對連結。

任何內容找不到地方承接，就**不要刪**原檔，先把缺口講清楚。
