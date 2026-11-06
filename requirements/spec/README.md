# 現況規格（current-state spec）

這個目錄描述 **`@asgard-js/core` 與 `@asgard-js/react` 現在對整合方承諾的行為**，依功能分章。要知道某個 API 現在怎麼運作，先讀這裡，不必翻舊的 BUILD／REVIEW。

- 章節清單：[`_index.md`](_index.md)
- 已收斂的任務編號：[`converged-tasks.md`](converged-tasks.md)

## 這裡放什麼、不放什麼

- **放**：已經發版並經 PM 驗收的行為——公開 API 的名稱、參數、預設值、事件順序、錯誤處理——以及背後的設計決定與理由、已知限制。
- **不放**：
  - 還在進行中的需求：留在 `requirements/tasks/` 的 BUILD／REVIEW。
  - 產品需求原文：在 PM repo `references/asgard-sdk-pm/tracking/asgard-js-sdk/`，各章只引用 F／UC／BUG 編號。
  - 開發過程（誰在哪天改了什麼）：在 git 歷史與封存索引。
  - 套件使用教學：在 `packages/core/README.md`、`packages/react/README.md`。規格寫「現在是什麼行為」，README 寫「怎麼用」；兩者衝突時以程式為準，並修正落後的那一份。
- 只寫「現在是這樣」。後來的票改掉了前面的行為，就直接改寫成新的樣子，不保留「原本是…後來改成…」。

## 每一章的格式

1. **範圍**：這章涵蓋哪些公開 API 與元件，對應 PM 的哪些 F／UC／BUG。
2. **現行行為**：一張「項目｜現行行為」的表，每一列有穩定編號 `<章代號>-<n>`，例如 `CLIENT-3`。
   - 編號只增不減、不重用。行為被移除時，把那列改成「已移除（日期、原因）」，不刪列。
   - 新 BUILD 要沿用既有行為時，在 Brief 或 `R#` 註明 `← spec/CLIENT-3`。
3. **設計決定**：規格沒寫、由實作決定的事，附理由與原始出處（例：`原 BUILD-079`）。
4. **已知限制與未交付**：做不到或刻意不做的，以及交接對象。
5. **程式位置**：主要的檔案路徑。

## 什麼時候收斂

一對 BUILD／REVIEW 在下列條件都成立時收斂進本目錄，然後刪除原檔：

- BUILD 與 REVIEW 本身的 Status 都是 `done`。
- 它引用的每一個 PM issue 在各自的 GitHub Projects 看板上都是 **Done**。SDK 的票常引用別的產品的 PM repo（sindri-pm、freyr-pm、heimdall-pm…），那些也要 Done。`In review`、`Pending fix` 都不算。
- 沒有 PM issue 的 BUILD（本 repo 的 issue、code review 衍生的修正）：
  - 衍生自另一張 BUILD 的（例如「REVIEW-024 稽核時發現」「BUILD-047 截圖看出」），跟著那張來源票一起收斂。
  - 沒有來源票的，合進 `main` 並發版（有 `@asgard-js/core@X` tag 包含它）之後收斂。

## 收斂步驟

1. **以現在的程式為準**寫進對應章節：讀程式碼與測試，必要時在 react-demo 實際操作確認。不要把 BUILD 的 `R#` 原樣抄過來，後面的票可能已經改掉它。
2. 把 BUILD 的設計決定與理由、REVIEW 裡記錄的未處理項目，寫進該章的「設計決定」「已知限制」。
3. 在 [`converged-tasks.md`](converged-tasks.md) 為 BUILD 與 REVIEW 各登記一列，附刪除前最後一個 commit 的連結。
4. 更新引用：
   - `requirements/` 與 `docs/` 裡指向這兩個檔案的連結，改成指向章節。
   - 程式碼註解裡寫著任務檔**完整路徑**的，改成指向章節（路徑會失效）；只寫編號的不用改，透過封存索引仍查得到。
5. 從 `requirements/tasks/_index.md` 的 Task Queue 移除這兩列，刪除這兩個檔案。
6. 檢查 `requirements/` 與 `docs/` 底下沒有新增失效的相對連結。

### 已經發版、但 PM 還沒驗收的行為

章節照現在的程式寫，所以也會寫到 PM 還沒驗收（看板 `In review`）、或 BUILD 還沒結案的功能。這種列在「現行行為」最後加上「（待驗收：BUILD-0NN）」，那張 BUILD／REVIEW 繼續留在 `requirements/tasks/`，細節以它為準。PM 驗收後照上面的步驟收斂、補齊細節，並拿掉這個標記。

任何內容找不到地方承接，就**不要刪**原檔，先把缺口講清楚。刪除只代表「內容已經搬到這裡」，不代表那張票的所有需求都已交付；未交付的部分記在各章的「已知限制與未交付」。
