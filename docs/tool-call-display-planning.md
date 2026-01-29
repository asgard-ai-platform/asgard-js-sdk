# Tool Call 顯示功能規劃

本文件規劃 SDK 如何處理和顯示 Tool Call（工具呼叫）事件。

---

## Platform UI 參考 (asgard-ai-platform-web)

以下是 platform 專案中 Tracing 面板的 UI 呈現：

![Tracing Panel](./images/platform-tracing-panel.png)

### Platform 的 Tracing 架構

Platform 使用 **Chatbot 的 callback props** 來接收 SSE 事件，然後在外部的 Log 面板中呈現：

```tsx
<Chatbot
  config={{
    endpoint: workflowSetPreviewData.endpoints.sse.endpoint,
    apiKey: apiKey,
    // 透過 callback 接收 tool call 事件
    onToolCall: (arg: SseResponse<EventType.TOOL_CALL_START | EventType.TOOL_CALL_COMPLETE>) => {
      // 更新外部的 tracing state
      setTracing((prev) => ...);
    },
    // 透過 callback 接收 process 事件
    onProcess: (arg: SseResponse<EventType.PROCESS_START | EventType.PROCESS_COMPLETE>) => {
      // 更新外部的 tracing state
      setTracing((prev) => ...);
    },
  }}
/>
```

### Platform Tracing 資料結構

```typescript
interface TracingItem {
  processId: string;
  processorData: ProcessorDto | undefined;
  processStart?: SseResponse<EventType.PROCESS_START>;
  processComplete?: SseResponse<EventType.PROCESS_COMPLETE>;
  toolCall?: Array<{
    toolCallStart?: SseResponse<EventType.TOOL_CALL_START>;
    toolCallComplete?: SseResponse<EventType.TOOL_CALL_COMPLETE>;
  }>;
  error?: SseResponse<EventType.ERROR>;
  runDone?: SseResponse<EventType.DONE>;
}
```

### Platform UI 結構

```
┌─ Log Panel ─────────────────────────────────────┐
│  ┌─ Tabs ─────────────────────────────────────┐ │
│  │ [Details] [Tracing]                        │ │
│  └────────────────────────────────────────────┘ │
│                                                 │
│  ┌─ Process (Collapsible) ────────────────────┐ │
│  │ > Push Message      直接輸出訊息...    ✓   │ │
│  └────────────────────────────────────────────┘ │
│                                                 │
│  ┌─ Process (Collapsible) ────────────────────┐ │
│  │ > Stream LLM        呼叫大型語言...    ✓   │ │
│  │   Completion                               │ │
│  │   Message                                  │ │
│  │  ┌─ Expanded Content ────────────────────┐ │ │
│  │  │ [Initial]  { JSON viewer }            │ │ │
│  │  │ [Result]   { JSON viewer }            │ │ │
│  │  └───────────────────────────────────────┘ │ │
│  │                                            │ │
│  │  ┌─ Tool Call (Collapsible, indented) ──┐  │ │
│  │  │ > movie_search                    ✓  │  │ │
│  │  └──────────────────────────────────────┘  │ │
│  │  ┌─ Tool Call (Collapsible, indented) ──┐  │ │
│  │  │ > movie_search                    ✓  │  │ │
│  │  └──────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

### 關鍵設計決策

1. **Tracing 是獨立的 Log 面板**，不是 Chatbot 訊息流的一部分
2. **Process 是主層級**，Tool Call 是巢狀在 Process 下的子項目
3. **使用 Collapsible 組件**，可展開查看詳細的 JSON 資料
4. **狀態圖標**：
   - `CircleCheck` (綠色填充) - 完成
   - `CircleX` (紅色填充) - 錯誤
   - 無圖標 - 進行中

---

## API Endpoint

```
POST https://api.dev.asgard-ai.com/ns/{namespace}/bot-provider/{botProviderId}/message/sse
```

### Headers

| Header      | Value        |
| ----------- | ------------ |
| `x-api-key` | Your API key |

### Request Body

```json
{
  "action": "NONE",
  "customChannelId": "g1bw42c5XsoFVPnYVsFud5",
  "customMessageId": "98992469-1300-4ff6-8fc8-cb9658bb02ff",
  "text": "動物方城市2"
}
```

## SSE Event Types

### 1. `asgard.run.init`

Run 初始化事件，表示請求已開始處理。

```json
{
  "eventType": "asgard.run.init",
  "requestId": "1b9f28d1c1f5753ac29ba3d83335f16c",
  "eventId": "1998306572631019520",
  "namespace": "proj-dd7ad3e6-fb6a-4471-a273-de843ed343ad",
  "botProviderName": "bp-reviewbot-bbec5016-b69a-4339-b8e1-706ef5432b37",
  "customChannelId": "g1bw42c5XsoFVPnYVsFud5",
  "fact": {
    "runInit": {},
    "runDone": null,
    "runError": null,
    "processStart": null,
    "processComplete": null,
    "messageStart": null,
    "messageDelta": null,
    "messageComplete": null,
    "toolCallStart": null,
    "toolCallComplete": null
  }
}
```

### 2. `asgard.process.start`

Process 開始事件，表示某個 processor 開始執行。

```json
{
  "eventType": "asgard.process.start",
  "requestId": "1b9f28d1c1f5753ac29ba3d83335f16c",
  "eventId": "1998306572664573952",
  "namespace": "proj-dd7ad3e6-fb6a-4471-a273-de843ed343ad",
  "botProviderName": "bp-reviewbot-bbec5016-b69a-4339-b8e1-706ef5432b37",
  "customChannelId": "g1bw42c5XsoFVPnYVsFud5",
  "fact": {
    "processStart": {
      "processId": "5a99aafa14029f8a",
      "task": {
        "channelMaxIdleMs": 172800000,
        "context": {
          "customChannelId": "g1bw42c5XsoFVPnYVsFud5",
          "customMessageId": "98992469-1300-4ff6-8fc8-cb9658bb02ff",
          "prevBlobs": [],
          "prevMessage": "動物方城市2",
          "prevPayload": {}
        },
        "isDebug": true,
        "isStreaming": true,
        "meta": {
          "botProviderName": "bp-reviewbot-bbec5016-b69a-4339-b8e1-706ef5432b37",
          "customChannelId": "g1bw42c5XsoFVPnYVsFud5",
          "customMessageId": "98992469-1300-4ff6-8fc8-cb9658bb02ff",
          "namespace": "proj-dd7ad3e6-fb6a-4471-a273-de843ed343ad",
          "processorName": "processor-treamomple-057fc860-81f3-4717-8276-bbe9b133ec24",
          "requestId": "1b9f28d1c1f5753ac29ba3d83335f16c",
          "type": "stream-llm-completion-message",
          "workflowName": "wf-oolgent-1cb41704-4280-4d55-9b60-d6d09f19e8c3"
        }
      }
    }
  }
}
```

### 3. `asgard.tool_call.start`

Tool Call 開始事件，表示 LLM 決定呼叫某個工具。

**關鍵欄位：**

- `processId`: 關聯的 process ID
- `callSeq`: Tool call 序號（從 0 開始）
- `toolCall.toolsetName`: 工具集名稱
- `toolCall.toolName`: 工具名稱
- `toolCall.parameter`: 工具參數

```json
{
  "eventType": "asgard.tool_call.start",
  "requestId": "1b9f28d1c1f5753ac29ba3d83335f16c",
  "eventId": "1998306577202810880",
  "namespace": "proj-dd7ad3e6-fb6a-4471-a273-de843ed343ad",
  "botProviderName": "bp-reviewbot-bbec5016-b69a-4339-b8e1-706ef5432b37",
  "customChannelId": "g1bw42c5XsoFVPnYVsFud5",
  "fact": {
    "toolCallStart": {
      "processId": "5a99aafa14029f8a",
      "callSeq": 0,
      "toolCall": {
        "toolsetName": "ts-ovieoolset-dd7ad3e6-fb6a-4471-a273-de843ed343ad",
        "toolName": "movie_search",
        "parameter": {
          "keyword": "動物方城市續集"
        }
      }
    }
  }
}
```

### 4. `asgard.tool_call.complete`

Tool Call 完成事件，包含工具執行結果。

**關鍵欄位：**

- `processId`: 關聯的 process ID
- `callSeq`: Tool call 序號（用於配對 start 事件）
- `toolCall`: 工具資訊（同 start 事件）
- `toolCallResult`: 工具執行結果

```json
{
  "eventType": "asgard.tool_call.complete",
  "requestId": "1b9f28d1c1f5753ac29ba3d83335f16c",
  "eventId": "1998306578641457152",
  "namespace": "proj-dd7ad3e6-fb6a-4471-a273-de843ed343ad",
  "botProviderName": "bp-reviewbot-bbec5016-b69a-4339-b8e1-706ef5432b37",
  "customChannelId": "g1bw42c5XsoFVPnYVsFud5",
  "fact": {
    "toolCallComplete": {
      "processId": "5a99aafa14029f8a",
      "callSeq": 0,
      "toolCall": {
        "toolsetName": "ts-ovieoolset-dd7ad3e6-fb6a-4471-a273-de843ed343ad",
        "toolName": "movie_search",
        "parameter": {
          "keyword": "動物方城市續集"
        }
      },
      "toolCallResult": {
        "data": ["Predator", "Snatch"],
        "error": null,
        "errorCode": null,
        "isSuccess": true,
        "paging": null
      }
    }
  }
}
```

### 5. `asgard.message.start`

Message 開始事件，表示 bot 開始回覆訊息。

```json
{
  "eventType": "asgard.message.start",
  "requestId": "1b9f28d1c1f5753ac29ba3d83335f16c",
  "eventId": "1998306581929791488",
  "namespace": "proj-dd7ad3e6-fb6a-4471-a273-de843ed343ad",
  "botProviderName": "bp-reviewbot-bbec5016-b69a-4339-b8e1-706ef5432b37",
  "customChannelId": "g1bw42c5XsoFVPnYVsFud5",
  "fact": {
    "messageStart": {
      "message": {
        "messageId": "1998306572698128384",
        "replyToCustomMessageId": "98992469-1300-4ff6-8fc8-cb9658bb02ff",
        "text": "",
        "payload": null,
        "isDebug": false,
        "idx": null,
        "template": {
          "type": "TEXT",
          "text": ""
        }
      }
    }
  }
}
```

### 6. `asgard.message.delta`

Message Delta 事件，包含串流文字的增量內容。

**關鍵欄位：**

- `message.text`: 增量文字內容
- `message.idx`: Delta 序號

```json
{
  "eventType": "asgard.message.delta",
  "requestId": "1b9f28d1c1f5753ac29ba3d83335f16c",
  "eventId": "1998306581975928832",
  "namespace": "proj-dd7ad3e6-fb6a-4471-a273-de843ed343ad",
  "botProviderName": "bp-reviewbot-bbec5016-b69a-4339-b8e1-706ef5432b37",
  "customChannelId": "g1bw42c5XsoFVPnYVsFud5",
  "fact": {
    "messageDelta": {
      "message": {
        "messageId": "1998306572698128384",
        "replyToCustomMessageId": "98992469-1300-4ff6-8fc8-cb9658bb02ff",
        "text": "目前",
        "payload": null,
        "isDebug": false,
        "idx": 0,
        "template": null
      }
    }
  }
}
```

### 7. `asgard.message.complete`

Message 完成事件，包含完整的訊息內容。

```json
{
  "eventType": "asgard.message.complete",
  "requestId": "1b9f28d1c1f5753ac29ba3d83335f16c",
  "eventId": "1998306585939546113",
  "namespace": "proj-dd7ad3e6-fb6a-4471-a273-de843ed343ad",
  "botProviderName": "bp-reviewbot-bbec5016-b69a-4339-b8e1-706ef5432b37",
  "customChannelId": "g1bw42c5XsoFVPnYVsFud5",
  "fact": {
    "messageComplete": {
      "message": {
        "messageId": "1998306572698128384",
        "replyToCustomMessageId": "98992469-1300-4ff6-8fc8-cb9658bb02ff",
        "text": "目前仍然沒有找到符合「動物方城市2」或相關續集關鍵字的電影。可能這部電影尚未推出或者它被稱為其他名稱。如果你有其他的可能關鍵字或訊息，請再次告訴我！",
        "payload": null,
        "isDebug": false,
        "idx": null,
        "template": {
          "type": "TEXT",
          "text": "目前仍然沒有找到符合「動物方城市2」或相關續集關鍵字的電影。可能這部電影尚未推出或者它被稱為其他名稱。如果你有其他的可能關鍵字或訊息，請再次告訴我！"
        }
      }
    }
  }
}
```

### 8. `asgard.process.complete`

Process 完成事件，表示某個 processor 執行完畢。

```json
{
  "eventType": "asgard.process.complete",
  "requestId": "1b9f28d1c1f5753ac29ba3d83335f16c",
  "eventId": "1998306585981489152",
  "namespace": "proj-dd7ad3e6-fb6a-4471-a273-de843ed343ad",
  "botProviderName": "bp-reviewbot-bbec5016-b69a-4339-b8e1-706ef5432b37",
  "customChannelId": "g1bw42c5XsoFVPnYVsFud5",
  "fact": {
    "processComplete": {
      "processId": "5a99aafa14029f8a",
      "taskResult": {
        "channelMaxIdleMs": 172800000,
        "context": {
          "customChannelId": "g1bw42c5XsoFVPnYVsFud5",
          "customMessageId": "98992469-1300-4ff6-8fc8-cb9658bb02ff",
          "prevBlobs": [],
          "prevMessage": "動物方城市2",
          "prevPayload": {},
          "prevToolCalls": [
            {
              "output": {
                "data": ["Predator", "Snatch"],
                "error": null,
                "errorCode": null,
                "isSuccess": true,
                "paging": null
              },
              "parameter": { "keyword": "動物方城市續集" },
              "tool_name": "movie_search",
              "toolset_name": "ts-ovieoolset-dd7ad3e6-fb6a-4471-a273-de843ed343ad"
            },
            {
              "output": {
                "data": ["Predator", "Snatch"],
                "error": null,
                "errorCode": null,
                "isSuccess": true,
                "paging": null
              },
              "parameter": { "keyword": "Zootopia sequel" },
              "tool_name": "movie_search",
              "toolset_name": "ts-ovieoolset-dd7ad3e6-fb6a-4471-a273-de843ed343ad"
            }
          ]
        },
        "destRelationship": "success",
        "errorDetail": null,
        "isDebug": true,
        "isStreaming": true,
        "meta": {
          "botProviderName": "bp-reviewbot-bbec5016-b69a-4339-b8e1-706ef5432b37",
          "processorName": "processor-treamomple-057fc860-81f3-4717-8276-bbe9b133ec24",
          "type": "stream-llm-completion-message",
          "workflowName": "wf-oolgent-1cb41704-4280-4d55-9b60-d6d09f19e8c3"
        }
      }
    }
  }
}
```

### 9. `asgard.run.done`

Run 完成事件，表示整個請求處理完畢。

```json
{
  "eventType": "asgard.run.done",
  "requestId": "1b9f28d1c1f5753ac29ba3d83335f16c",
  "eventId": "1998306586140872704",
  "namespace": "proj-dd7ad3e6-fb6a-4471-a273-de843ed343ad",
  "botProviderName": "bp-reviewbot-bbec5016-b69a-4339-b8e1-706ef5432b37",
  "customChannelId": "g1bw42c5XsoFVPnYVsFud5",
  "fact": {
    "runDone": {}
  }
}
```

## Event Flow Diagram

```
┌─────────────────┐
│ asgard.run.init │
└────────┬────────┘
         │
         ▼
┌─────────────────────┐
│ asgard.process.start│
└────────┬────────────┘
         │
         ▼
┌──────────────────────┐     ┌────────────────────────┐
│asgard.tool_call.start│────▶│asgard.tool_call.complete│
└──────────────────────┘     └────────────────────────┘
         │                              │
         │◀─────────────────────────────┘
         │  (可能有多個 tool call)
         ▼
┌─────────────────────┐
│ asgard.message.start│
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│ asgard.message.delta│ ←── (多個 delta 事件)
└────────┬────────────┘
         │
         ▼
┌────────────────────────┐
│ asgard.message.complete│
└────────┬───────────────┘
         │
         ▼
┌───────────────────────┐
│asgard.process.complete│
└────────┬──────────────┘
         │
         ▼
┌─────────────────┐
│ asgard.run.done │
└─────────────────┘
```

## Tool Call Message ID Convention

在 SDK 中，tool call 訊息的 `messageId` 使用以下格式：

```
{processId}-{callSeq}
```

例如：`5a99aafa14029f8a-0`、`5a99aafa14029f8a-1`

這樣可以：

1. 唯一識別每個 tool call
2. 將 start 和 complete 事件配對
3. 排序同一 process 中的多個 tool calls

---

## SDK 架構分析

### 關鍵檔案位置

| 檔案                        | 路徑                                                                                   | 說明                    |
| --------------------------- | -------------------------------------------------------------------------------------- | ----------------------- |
| EventType enum              | `packages/core/src/constants/enum.ts:6-20`                                             | SSE 事件類型定義        |
| SseResponse type            | `packages/core/src/types/sse-response.ts:157-165`                                      | SSE 回應型別            |
| ToolCallBaseEventData       | `packages/core/src/types/sse-response.ts:132-140`                                      | Tool Call 基本資料結構  |
| Conversation class          | `packages/core/src/lib/conversation.ts`                                                | 訊息處理核心邏輯        |
| Channel class               | `packages/core/src/lib/channel.ts`                                                     | SSE 連線管理            |
| useChannel hook             | `packages/react/src/hooks/use-channel.ts`                                              | React 層的 channel 管理 |
| AsgardServiceContext        | `packages/react/src/context/asgard-service-context.tsx`                                | 服務層 Context          |
| ConversationMessageRenderer | `packages/react/src/components/chatbot/chatbot-body/conversation-message-renderer.tsx` | 訊息渲染元件            |
| CollapsibleList             | `packages/react/src/components/templates/collapsible-list/collapsible-list.tsx`        | 可摺疊列表 UI 元件      |

### 現有架構流程圖

```
SSE Event
    │
    ▼
┌─────────────────────────────────────────────────────────────────┐
│ Channel.fetchSse()                                              │
│ 路徑: packages/core/src/lib/channel.ts:76-116                   │
│                                                                 │
│ - 呼叫 client.fetchSse() 建立 SSE 連線                          │
│ - onSseMessage callback 接收每個事件                             │
│ - 呼叫 conversation.onMessage() 更新訊息狀態                     │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ Conversation.onMessage()                                        │
│ 路徑: packages/core/src/lib/conversation.ts:23-40               │
│                                                                 │
│ switch (eventType) {                                            │
│   case MESSAGE_START: → onMessageStart()                        │
│   case MESSAGE_DELTA: → onMessageDelta()                        │
│   case MESSAGE_COMPLETE: → onMessageComplete()                  │
│   case TOOL_CALL_START: → onToolCallStart()   ← Tool Call 處理  │
│   case TOOL_CALL_COMPLETE: → onToolCallComplete()               │
│   case ERROR: → onMessageError()                                │
│ }                                                               │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ Conversation.onToolCallStart()                                  │
│ 路徑: packages/core/src/lib/conversation.ts:124-146             │
│                                                                 │
│ - 建立 ConversationToolCallMessage                              │
│ - messageId = `${processId}-${callSeq}`                         │
│ - 存入 messages Map                                             │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ useChannel hook                                                 │
│ 路徑: packages/react/src/hooks/use-channel.ts:42-164            │
│                                                                 │
│ - 接收 conversation 狀態更新                                     │
│ - 透過 onSseMessage prop 暴露原始 SSE 事件                       │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ AsgardServiceContextProvider                                    │
│ 路徑: packages/react/src/context/asgard-service-context.tsx     │
│                                                                 │
│ - 提供 messages 給子元件                                         │
│ - 透過 onSseMessage prop 轉發事件                                │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ ConversationMessageRenderer                                     │
│ 路徑: packages/react/src/components/chatbot/chatbot-body/       │
│       conversation-message-renderer.tsx                         │
│                                                                 │
│ - 根據 message.type 渲染不同元件                                 │
│ - type === 'tool-call' → 渲染 CollapsibleList                   │
└─────────────────────────────────────────────────────────────────┘
```

### SDK 現有 Callback 支援分析

#### ✅ 已支援：`onSseMessage`

位置：`packages/react/src/hooks/use-channel.ts:20-25`

```typescript
onSseMessage?: (
  response: SseResponse<EventType>,
  context: {
    conversation: Conversation | null;
  },
) => void;
```

**用法**：可以接收所有 SSE 事件，包含 Tool Call 事件

```tsx
<Chatbot
  onSseMessage={(response, context) => {
    if (response.eventType === EventType.TOOL_CALL_START) {
      // 處理 tool call start
    }
    if (response.eventType === EventType.TOOL_CALL_COMPLETE) {
      // 處理 tool call complete
    }
  }}
/>
```

#### ❌ 尚未支援：`onToolCall`、`onProcess`

Platform 使用專門的 callback，但 SDK 目前只有通用的 `onSseMessage`。

### SDK vs Platform 架構差異

| 面向               | SDK (asgard-js-sdk)   | Platform (asgard-ai-platform-web) |
| ------------------ | --------------------- | --------------------------------- |
| Tool Call 顯示位置 | 訊息流中              | 獨立的 Log 面板                   |
| 資料來源           | Conversation messages | 外部 tracing state                |
| Callback           | `onSseMessage` (通用) | `onToolCall`, `onProcess` (專用)  |
| Process 支援       | ❌ 不處理             | ✅ 完整支援                       |
| 層級結構           | 扁平 (只有 Tool Call) | 巢狀 (Process → Tool Call)        |

---

## SDK 實現方案規劃

### 現況分析

目前 SDK 的 Tool Call 實現有以下特點：

1. **Tool Call 直接顯示在訊息流中**

   - 位置：`packages/react/src/components/chatbot/chatbot-body/conversation-message-renderer.tsx`
   - Tool Call 作為 `ConversationMessage` 的一種類型處理

2. **已有基礎的 callback 機制**

   - `onSseMessage` 可接收所有 SSE 事件
   - 但沒有專門的 `onToolCall`、`onProcess`

3. **不處理 Process 事件**
   - `packages/core/src/lib/conversation.ts` 的 `onMessage` 方法沒有處理 `PROCESS_START`/`PROCESS_COMPLETE`

### 方案選擇

#### 方案 A：維持現有架構（Tool Call 在訊息流中）

**適用場景**：SDK 作為獨立的 Chatbot 元件使用，不需要外部 Log 面板

**優點**：

- 簡單直接
- 使用者可以在對話流中看到 AI 的思考過程
- 不需要額外的 UI 元件

**實現重點**：

- 保持 `CollapsibleList` 作為 UI 元件
- Tool Call 訊息直接渲染在 Chatbot 訊息流中
- 透過 `getToolDisplayName` 和 `toolCallExpandedContentRenderer` 提供自訂能力

```
┌─ Chatbot ──────────────────────────────────────┐
│                                                │
│  [User] 動物方城市2                            │
│                                                │
│  ┌─ Tool Call ─────────────────────────────┐   │
│  │ movie_search                         ✓  │   │
│  └─────────────────────────────────────────┘   │
│  ┌─ Tool Call ─────────────────────────────┐   │
│  │ movie_search                         ✓  │   │
│  └─────────────────────────────────────────┘   │
│                                                │
│  [Bot] 目前沒有找到符合的電影...               │
│                                                │
└────────────────────────────────────────────────┘
```

#### 方案 B：提供專用 Callback（Platform 模式）

**適用場景**：SDK 整合到更大的應用中，需要自訂 Log 面板

**優點**：

- 靈活性高
- 與 Platform 架構一致
- 支援 Process 層級的追蹤

**需要修改的檔案**：

- `packages/react/src/hooks/use-channel.ts` - 新增 `onToolCall`, `onProcess` props
- `packages/react/src/context/asgard-service-context.tsx` - 傳遞新 props
- `packages/react/src/components/chatbot/chatbot.tsx` - 暴露新 props

```tsx
<Chatbot
  onToolCall={event => {
    /* 更新外部 tracing state */
  }}
  onProcess={event => {
    /* 更新外部 tracing state */
  }}
/>
```

### 建議：採用混合方案

1. **SDK 預設行為**：Tool Call 顯示在訊息流中（方案 A）
2. **提供專用 Callback**：讓進階使用者可以用 `onToolCall`, `onProcess` 處理（方案 B）
3. **可選功能**：透過 props 控制是否在訊息流中顯示 Tool Call

```tsx
<Chatbot
  // 預設在訊息流中顯示 Tool Call
  showToolCallInMessages={true}

  // 同時可以監聽事件做額外處理
  onToolCall={(event) => { ... }}
  onProcess={(event) => { ... }}
/>
```

### 下一步行動

1. [x] 確認 SDK 目前是否已支援 `onToolCall`、`onProcess` callback

   - **結果**：尚未支援，目前只有通用的 `onSseMessage`

2. [ ] 決定 Tool Call 在訊息流中的 UI 設計

   - 目前使用 `CollapsibleList` 元件
   - 需要確認：是否要顯示參數？結果？錯誤狀態？

3. [ ] 確認是否需要 Process 層級的顯示

   - Platform 有 Process → Tool Call 的巢狀結構
   - SDK 目前沒有處理 Process 事件

4. [ ] 測試真實 API 的 Tool Call 事件流

### 實作優先順序

1. **Phase 1**：完善現有 Tool Call UI（方案 A）

   - 確保 `CollapsibleList` 正確顯示 Tool Call 狀態
   - 支援展開內容顯示參數和結果

2. **Phase 2**：新增專用 Callback（方案 B）

   - 新增 `onToolCall`, `onProcess` props
   - 讓外部可以建立自己的 Log 面板

3. **Phase 3**（可選）：內建 Log 面板
   - 提供類似 Platform 的可選 Log 面板元件
