# FOLLOWUP — F-002 背景分頁續接 + detach→cursor rejoin（待 real-backend 回歸）

## Meta

- Type: `follow-up`
- Status: `open`
- Source: `F-002 last-event-id 斷線續傳` — 2 of 6 acceptance criteria deferred
- Blocked on: **real-backend regression**（`*.dev.asgard-ai.com` + 真實 SSE 回歸；mock 測不到背景分頁 bug #2）
- Related: F-015（已補 `GET /message/sse` rejoin transport，是 detach-rejoin 的前置）· REVIEW-002（原 defer 記錄）

## 已達標（不在本 follow-up）

- ✅ 已建 cursor 後中途斷線 → `Last-Event-ID` 原生續傳、不漏不重（UC-003）。
- ✅ 無 cursor（200 前）不自動重連 POST、錯誤 surface（UC-004）。
- ✅ replay / reconnection 與 live 一致。

（以上在 2026-07-13 的 F-001~F-013 驗測中，於 `/subagent` 用 `drop` 輸入實測通過 — 見 `.github/verification/f001-f013/`。）

## 未做（本 follow-up 的兩條）

- [ ] **背景分頁回前景續接 + `openWhenHidden` 收回預設**
      現況 `packages/core/src/lib/create-sse-observable.ts` 寫死 `openWhenHidden: true`（繞開分頁隱藏時 SSE 斷掉的舊 bug #2）。目標：確認「在 Last-Event-ID 續傳下，背景分頁回前景不再回歸 bug #2（顯示壞掉）」後，把 `openWhenHidden` 收回 fetch-event-source 的 library 預設。
      **驗收前提**：真實瀏覽器 + 真後端把分頁切到背景數十秒再回前景，串流正確續接、無重複 / 無漏。

- [ ] **`detach` / `keepConnectionOnUnmount` 依續傳重新評估**
      現況 unmount 後 `client.detach({ timeoutMs })` 長掛連線（最長 ~90s）等 run 收尾。目標：改為「斷線後靠 cursor 從 `GET /message/sse` rejoin 續接」，取代長掛連線 —— F-015 已提供 `client.rejoinSse` / `Channel.rejoin` transport。
      **驗收前提**：真後端驗 unmount→ 背景 run 續跑 → 重進房 rejoin 接回同一條 run 到 terminal，無重複派送。

## 為什麼 defer（不硬做）

這兩條的核心風險（背景分頁 bug #2 回歸、detach 期間 run 遺失 / 重複）**只有真實瀏覽器 + 真後端才重現與驗證得出來**；用 react-demo 的 mock 只能驗「不 crash / 續傳正常」，無法證明背景分頁 bug 不回歸。硬改而無法驗 = 違背「不假裝已驗證」。等有可連的 dev 後端環境再一起做 + 回歸驗證。

## Execution Log

- 2026-07-14: 由 F-001~F-013 驗測收尾建立。F-002 core 續傳已達標；背景分頁 + detach-rejoin 兩條標為 real-backend follow-up（使用者裁示維持 follow-up）。
