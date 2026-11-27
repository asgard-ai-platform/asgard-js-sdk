# 附件

## 範圍

- 涵蓋：
  - composer 的文件類型判定。
  - 使用者訊息上的附件呈現，包括重播出的附件。
- 名稱：
  - 重播：重新進入 channel 時（GET rejoin），後端把已存的 transcript 再送一次，SDK 照 transcript 重建訊息（`packages/core/src/types/channel.ts` 的 `replay`）。
  - chip：附件的小標籤，顯示檔名或替代文字。
- PM 規格：PM 沒有對應規格。來源是 [sindri-pm#206](https://github.com/asgard-ai-platform/asgard-sindri-pm/issues/206)，以及本 repo 的 issue #496。
- 優先順序：產品規則以 PM 規格為準。實際行為以程式為準。本章只記兩者都讀不出來的決定、差異與限制。

## 設計決定

| 編號 | 決定 | 類型 | 為什麼 | 出處 |
|---|---|---|---|---|
| ATTACH-2 | 預設的錄音格式清單同時列 MIME 別名與副檔名。SDK 先看 MIME。MIME 空白或認不得時，再看副檔名。 | 理由 | 同一個格式，各瀏覽器回報的 MIME 不同，例如 macOS 上的 m4a 是 `audio/x-m4a`。MIME 空白時，還有副檔名可以判斷。 | 原 BUILD-098 |
| ATTACH-3 | `allowedDocumentMimeTypes` 是非空陣列時：SDK 只比對 MIME，不看副檔名；大小上限同樣是 `MAX_FILE_SIZE`；格式不符時，錯誤訊息不列出可接受的格式。傳空陣列時，跟沒傳一樣，SDK 使用預設清單。 | 理由 | 錯誤訊息本來就寫「音訊」。原 BUILD-098 只處理預設清單。 | 原 BUILD-098 |
| ATTACH-6 | 重播出的附件一律畫成 chip，圖片也一樣。SDK 不抓附件的位元組。`fileName` 是 null、空字串或只有空白時，chip 改用在地化的替代文字。 | PM 未定義、前端先決定 | 第一階段的 frame 沒有 URL 可以抓位元組。看得到的 chip 比遺失的訊息好。後端刻意區分 `''` 與 `null`，但標籤是 `''` 的 chip 看起來像壞掉。 | 原 BUILD-067 |
| ATTACH-7 | 舊的 transcript 列只有 `blobIds`、沒有 `blobs` 時，SDK 為每個 id 畫一個中性的「附件」chip。 | 刻意的行為 | 後端不會回填舊資料。如果不畫，只有附件的訊息會變成看起來像遺失的空泡泡。 | 原 BUILD-067 |
| ATTACH-12 | 每個附件的大小上限 `MAX_FILE_SIZE` 是 20 MiB（20,971,520 位元組），每個檔案各自計算。檔案大於這個值時，SDK 拒絕加入。 | 理由 | 這個值跟 core Direct 模式的附件合計上限一致。程式只寫 `// 20MB`，看不出這個數字綁著後端。要改這個值，先確認後端的上限。 | 原 BUILD-098 |

## 跟 PM 不一致的地方

無

## 已知限制

| 編號 | 限制 | 原因 | 待誰處理 |
|---|---|---|---|
| ATTACH-10 | 重播出的圖片沒有縮圖。 | 要等後端第二階段提供 URL。第二階段是把 `GetBlobLink` 包成 REST。原本追蹤的 asgard-ai-platform/asgard-sindri-pm#206 只做完第一階段，已在 2026-08-29 關閉。結案留言註明：第二階段目前沒有票在追。 | 需另立票 |
| ATTACH-11 | 後端依 MIME 決定 blob 的 `fileType`。 | `audio/wav`、`audio/x-m4a`、`audio/ogg` 得到 `AUDIO`。`audio/x-wav`、`audio/flac`、`audio/aac`、`audio/x-aiff`、`application/octet-stream` 得到 `BINARY`。這些檔案都能上傳成功。但 Direct 模式會不會把 `BINARY` 交給模型轉文字，取決於後端。 | 後端 |
