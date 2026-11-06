# 附件

代號 `ATTACH`。

## 範圍

- composer 的附件挑選與驗證（圖片、文件）、送出後使用者訊息上的附件呈現，包括重新進房（GET rejoin）重播出的附件。
- `@asgard-js/core`：`ConversationUserMessage.blobs`（`MessageBlob`）。
- `@asgard-js/react`：`validateDocumentFile`、`SUPPORTED_DOCUMENT_TYPES`、`SUPPORTED_DOCUMENT_EXTENSIONS`、`MAX_FILE_SIZE`、`<Chatbot allowedDocumentMimeTypes>`、`UserImageTemplate`。
- 來源：sindri-pm#206（Done）；本 repo #496。

## 現行行為

### 文件類型

| 編號     | 項目               | 現行行為                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ATTACH-1 | 預設接受的錄音格式 | 沒有傳 `allowedDocumentMimeTypes` 時，文件上傳接受下列錄音格式（MIME 連同瀏覽器實際回報的別名）：WAV（`audio/wav`、`audio/x-wav`、`audio/wave`，`.wav`）、MP3（`audio/mpeg`、`audio/mp3`，`.mp3`）、M4A（`audio/mp4`、`audio/x-m4a`、`audio/m4a`，`.m4a`）、AAC（`audio/aac`，`.aac`）、Ogg（`audio/ogg`，`.ogg`、`.oga`）、FLAC（`audio/flac`、`audio/x-flac`，`.flac`）、AIFF（`audio/aiff`、`audio/x-aiff`，`.aif`、`.aiff`）、WebM 音訊（`audio/webm`，`.weba`）。 |
| ATTACH-2 | 判定方式           | 沒有傳 `allowedDocumentMimeTypes` 時，`validateDocumentFile` 先看 MIME：在預設清單裡就接受，不論副檔名；MIME 是空的或認不得時，再看副檔名。檔案選擇器的 `accept` 包含清單裡每一個 MIME 與副檔名。兩者都不符（例如 `.exe`、`audio/midi` + `.mid`）就以既有訊息拒絕。                                                                                                                                                                                                    |
| ATTACH-3 | 自訂清單           | 傳了 `allowedDocumentMimeTypes` 時只比對 MIME，以那份清單為準。                                                                                                                                                                                                                                                                                                                                                                                                        |
| ATTACH-4 | 大小上限           | 單檔 20 MB（`MAX_FILE_SIZE`），與 core Direct 模式的附件合計上限一致。                                                                                                                                                                                                                                                                                                                                                                                                 |

### 使用者訊息上的附件

| 編號     | 項目                    | 現行行為                                                                                                                                                                                                                                                                                                         |
| -------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ATTACH-5 | blob metadata           | 重播的 `asgard.message.user` frame 帶 `blobs`（`blobId`、`fileType`、`fileName`（可為 null）、`size`、`mime`，沒有 URL）時，原樣放在 `ConversationUserMessage.blobs`；frame 沒有這個 key 時為 `undefined`。這是純新增欄位，既有欄位不變。                                                                        |
| ATTACH-6 | 重播出的附件 chip       | 訊息有 `blobs`、但沒有 `filePreviewUrls` 與 `documentNames`（重新進房的情況）時，每個 blob 畫一個 chip，標籤是 `fileName`；`fileName` 是 null、空字串或只有空白時，改用該 `fileType` 的在地化替代文字。`fileType` 是 `IMAGE` 時用圖片圖示、不抓任何位元組；其他值（包括 SDK 不認得的）一律用文件圖示，不丟例外。 |
| ATTACH-7 | 只有 `blobIds` 的舊資料 | 只有 `blobIds`、沒有 `blobs` 的舊 transcript 列（後端不會回填），每個 id 畫一個中性的「附件」chip，讓訊息泡泡存在。                                                                                                                                                                                              |
| ATTACH-8 | 即時送出的附件          | 送出當下帶 `filePreviewUrls`／`documentNames` 時，照原本的方式畫圖片預覽與文件卡，不另外重複畫重播 chip。                                                                                                                                                                                                        |
| ATTACH-9 | 只有附件的訊息          | 重播的 turn 文字是空的時，仍畫出帶附件 chip 的泡泡，不會變成看起來像遺失的空訊息。替代文字與「附件」標籤都在三語目錄裡。                                                                                                                                                                                         |

## 設計決定

| 決定                                                       | 理由                                                                                                      | 出處                       |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------- |
| 重播的圖片也畫成 chip，不畫縮圖                            | Phase 1 的 frame 沒有 URL 可以抓位元組；看得到的 chip 比遺失的訊息好                                      | 原 BUILD-067               |
| 空白的 `fileName` 也用替代文字                             | 後端刻意區分 `''` 與 `null`，但標籤是 `''` 的 chip 看起來像壞掉，而不是沒有名字的檔案                     | 原 BUILD-067（審查時修正） |
| 預設清單同時列 MIME 別名與副檔名                           | 同一個格式各瀏覽器回報的 MIME 不同（例如 macOS 上的 m4a 是 `audio/x-m4a`）；MIME 空白時還有副檔名可以判斷 | 原 BUILD-098               |
| 不改 `allowedDocumentMimeTypes` 的語意、大小上限與錯誤訊息 | 錯誤訊息已經寫「音訊」；改範圍只在預設清單                                                                | 原 BUILD-098               |

## 已知限制與未交付

| 項目                                  | 說明                                                                                                                                                                                                                             | 交接                  |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| 重播的圖片沒有縮圖                    | 要等後端 Phase 2（把 `GetBlobLink` 包成 REST）提供 URL                                                                                                                                                                           | 後端（sindri-pm#206） |
| 後端依 MIME 決定 blob 的 `fileType`   | `audio/wav`、`audio/x-m4a`、`audio/ogg` 得到 `AUDIO`；`audio/x-wav`、`audio/flac`、`audio/aac`、`audio/x-aiff`、`application/octet-stream` 得到 `BINARY`。上傳都成功，但 Direct 模式會不會把 `BINARY` 交給模型轉文字，取決於後端 | 後端（asgard-core）   |
| sandbox open-browser 附件 chip 的圖示 | chip 目前一律用文件圖示，open-browser 卡片改用地球圖示的修正還在進行（待驗收：BUILD-029-attachment-chip-browser-icon）                                                                                                           | —                     |

## 程式位置

- `packages/react/src/utils/file-validation.ts`、`packages/react/src/components/chatbot/chatbot-footer/use-attachment-upload.ts`
- `packages/react/src/components/templates/user-image-template/`（`user-image-template.tsx`、`user-attachment-chip.tsx`）
- `packages/core/src/types/channel.ts`（`ConversationUserMessage.blobs`）、`packages/core/src/types/sse-response.ts`（`MessageUserEventData`）、`packages/core/src/lib/conversation.ts`（`onMessageUser`）
- 測試：`packages/react/src/components/templates/user-image-template/replay-attachments.spec.tsx`、`packages/react/src/utils/file-validation.spec.ts`
