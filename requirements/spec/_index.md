# 現況規格索引

每章一列：章代號、範圍、對應的 PM 編號（`references/asgard-sdk-pm/tracking/asgard-js-sdk/`）。每章都已有部分列收斂；標「待驗收」的列，細節仍在 `requirements/tasks/` 裡對應的 BUILD／REVIEW。

| 章                                    | 代號      | 範圍                                                                            | PM                                                         | 狀態                   |
| ------------------------------------- | --------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------- | ---------------------- |
| [連線、SSE run 與錯誤出口](client.md) | `CLIENT`  | client 與 Channel 的 SSE run、批次視窗、錯誤回報、client 生命週期               | F-002、F-011、F-014、F-015、F-023、F-032、F-039、sdk-pm#87 | 已收斂（部分待驗收）   |
| [工具授權](consent.md)                | `CONSENT` | 授權佇列、內建卡片與替換、回覆通知                                              | freyr-pm#331、#885、#901                                   | 已收斂                 |
| [對話內容](conversation.md)           | `CONVO`   | 訊息模型、文字與錯誤泡泡、tool-call 與 subagent 資料、run 指示、spinner         | F-001、F-003 ～ F-014、F-016、F-017、F-028 ～ F-030、F-033 | 已收斂（部分待驗收）   |
| [版面、主題預設與文字排版](layout.md) | `LAYOUT`  | theme 合併與預設、chat column 內距與最大寬度、換行                              | sdk-pm#52、#54、F-022、sdk-pm#31                           | 已收斂（部分待驗收）   |
| [多語系](i18n.md)                     | `I18N`    | 語言目錄、`locale` 的傳遞、未驗證畫面                                           | F-005、sdk-pm#49                                           | 已收斂（部分待驗收）   |
| [附件](attachments.md)                | `ATTACH`  | 文件類型、重播的附件 chip                                                       | sindri-pm#206                                              | 已收斂（部分待驗收）   |
| [檔案總管](file-explorer.md)          | `FILES`   | 對話側 FileExplorer 的工具列、唯讀、剪貼簿、拖放、markdown 預覽；SourceSet 元件 | F-021、F-025、F-031、sdk-pm#68、#69、heimdall-pm#375       | 已收斂（部分待驗收）   |
| [Sandbox](sandbox.md)                 | `SANDBOX` | relay 的 channel scope；sandbox 卡片、HUD、瀏覽器面板、喚醒                     | F-018 ～ F-021、F-034、F-035、F-038、F-040                 | 已收斂（大部分待驗收） |

開發工具（型別檢查涵蓋範圍）不是 SDK 對整合方的行為，記在根目錄 `AGENTS.md` 的〈Type checking〉，不另立章。
