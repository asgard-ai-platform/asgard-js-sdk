# AsgardJs React

This package provides React components and hooks for integrating with the Asgard AI platform, allowing you to build interactive chat interfaces.

<a id="installation"></a>
<br/>

## Installation

To install the React package, use the following command:

```sh
npm install @asgard-js/core @asgard-js/react
```

<a id="usage"></a>
<br/>

## Usage

<a id="basic-usage"></a>
<br/>

### Basic Usage

Here's a basic example of how to use the React components:

```javascript
import React, { useRef } from 'react';
import { Chatbot } from '@asgard-js/react';

const chatbotRef = useRef(null);

const App = () => {
  return (
    <div style={{ width: '800px', position: 'relative' }}>
      <button
        style={{
          position: 'absolute',
          top: '80px',
          right: '50%',
          transform: 'translateX(50%)',
          zIndex: 10,
          border: '1px solid white',
          borderRadius: '5px',
          color: 'white',
          backgroundColor: 'transparent',
          cursor: 'pointer',
          padding: '0.5rem 1rem',
        }}
        onClick={() => chatbotRef.current?.serviceContext?.sendMessage?.({ text: 'Hello' })}
      >
        Send a message from outside of chatbot
      </button>
      <Chatbot
        ref={chatbotRef}
        title="Asgard AI Chatbot"
        config={{
          apiKey: 'your-api-key',
          botProviderEndpoint: 'https://api.asgard-ai.com/ns/{namespace}/bot-provider/{botProviderId}',
          debugMode: true, // Enable to see deprecation warnings
          transformSsePayload: payload => {
            return payload;
          },
        }}
        enableLoadConfigFromService={true}
        customChannelId="your-channel-id"
        initMessages={[]}
        debugMode={false}
        fullScreen={false}
        avatar="https://example.com/avatar.png"
        botTypingPlaceholder="Bot is typing..."
        inputPlaceholder="Type your message here..."
        defaultLinkTarget="_blank"
        onReset={() => {
          console.log('Chat reset');
        }}
        onClose={() => {
          console.log('Chat closed');
        }}
        onSseMessage={(response, ctx) => {
          if (response.eventType === 'asgard.run.done') {
            console.log('onSseMessage', response, ctx.conversation);

            setTimeout(() => {
              // delay some time to wait for the serviceContext to be available
              chatbotRef.current?.serviceContext?.sendMessage?.({
                text: 'Say hi after 5 seconds',
              });
            }, 5000);
          }
        }}
      />
    </div>
  );
};

export default App;
```

<a id="file-upload-support"></a>
<br/>

### File Upload Support

The Chatbot component includes built-in file upload capabilities for sending images. You can control this feature using the `enableUpload` prop.

#### Enabling File Upload

```javascript
<Chatbot
  config={{
    apiKey: 'your-api-key',
    botProviderEndpoint: 'https://api.asgard-ai.com/ns/{namespace}/bot-provider/{botProviderId}',
  }}
  customChannelId="your-channel-id"
  enableUpload={true} // Explicitly enable file upload
/>
```

#### Control via Remote Configuration

When `enableLoadConfigFromService` is enabled, you can also control the upload feature through the bot provider's `embedConfig`:

```javascript
<Chatbot
  config={{
    apiKey: 'your-api-key',
    botProviderEndpoint: 'https://api.asgard-ai.com/ns/{namespace}/bot-provider/{botProviderId}',
  }}
  customChannelId="your-channel-id"
  enableLoadConfigFromService={true}
  // Upload feature will be controlled by annotations.embedConfig.enableUpload from the API
/>
```

**Configuration Priority** (highest to lowest):

1. `enableUpload` prop value
2. `annotations.embedConfig.enableUpload` from bot provider metadata
3. Default: `false`

**Features**: Multiple file selection, image preview with modal view, and responsive design. Supports JPEG, PNG, GIF, WebP up to 20MB per file, maximum 10 files at once.

<a id="conversation-export"></a>
<br/>

### Conversation Export

The Chatbot component includes built-in conversation export functionality, allowing users to download chat history as Markdown files. You can control this feature using the `enableExport` prop.

#### Enabling Conversation Export

```javascript
<Chatbot
  config={{
    apiKey: 'your-api-key',
    botProviderEndpoint: 'https://api.asgard-ai.com/ns/{namespace}/bot-provider/{botProviderId}',
  }}
  customChannelId="your-channel-id"
  enableExport={true} // Explicitly enable conversation export
/>
```

#### Control via Remote Configuration

When `enableLoadConfigFromService` is enabled, you can also control the export feature through the bot provider's `embedConfig`:

```javascript
<Chatbot
  config={{
    apiKey: 'your-api-key',
    botProviderEndpoint: 'https://api.asgard-ai.com/ns/{namespace}/bot-provider/{botProviderId}',
  }}
  customChannelId="your-channel-id"
  enableLoadConfigFromService={true}
  // Export feature will be controlled by annotations.embedConfig.enableExport from the API
/>
```

**Configuration Priority** (highest to lowest):

1. `enableExport` prop value
2. `annotations.embedConfig.enableExport` from bot provider metadata
3. Default: `false`

**Features**: Download button in chatbot footer, exports conversation history with timestamps and trace IDs, human-readable filename format (`{BotName}_對話紀錄_{Date}_{Time}.md`).

<a id="api-key-authentication"></a>
<br/>

### API Key Authentication

For applications that need dynamic API key input (such as embedded chatbots), you can use the authentication state management:

```javascript
import React, { useState } from 'react';
import { Chatbot } from '@asgard-js/react';
import { AuthState } from '@asgard-js/core';

const EmbedApp = () => {
  const [authState, setAuthState] = useState < AuthState > 'needApiKey';

  const handleApiKeySubmit = async (apiKey: string) => {
    setAuthState('loading');

    try {
      // Validate the API key (implement your validation logic)
      const isValid = await validateApiKey(apiKey);
      setAuthState(isValid ? 'authenticated' : 'invalidApiKey');
    } catch (error) {
      setAuthState('error');
    }
  };

  return (
    <Chatbot
      title="Asgard AI Assistant"
      authState={authState}
      onApiKeySubmit={handleApiKeySubmit}
      config={{
        botProviderEndpoint: 'https://api.asgard-ai.com/ns/{namespace}/bot-provider/{botProviderId}',
        // Note: Don't set apiKey here when using dynamic authentication
      }}
      customChannelId="embed-channel"
      fullScreen={false}
    />
  );
};
```

## Migration from endpoint to botProviderEndpoint

**Important**: The `endpoint` configuration option is deprecated. Use `botProviderEndpoint` instead for simplified configuration.

### Before (Deprecated)

```javascript
config: {
  apiKey: 'your-api-key',
  endpoint: 'https://api.asgard-ai.com/ns/{namespace}/bot-provider/{botProviderId}/message/sse',
  botProviderEndpoint: 'https://api.asgard-ai.com/ns/{namespace}/bot-provider/{botProviderId}',
}
```

### After (Recommended)

```javascript
config: {
  apiKey: 'your-api-key',
  botProviderEndpoint: 'https://api.asgard-ai.com/ns/{namespace}/bot-provider/{botProviderId}',
  // SSE endpoint is automatically derived as: botProviderEndpoint + '/message/sse'
}
```

**Benefits:**

- Simplified configuration with single endpoint
- Reduced chance of configuration errors
- Automatic endpoint derivation

**Backward Compatibility:** Existing code using `endpoint` will continue to work but may show deprecation warnings when `debugMode` is enabled.

<a id="migration-from-endpoint-to-botproviderendpoint"></a>
<br/>

## Migration from endpoint to botProviderEndpoint

<a id="api-reference"></a>
<br/>

## API Reference

<a id="chatbot-component-props"></a>
<br/>

### Chatbot Component Props

- **title?**: `string` - The title of the chatbot (optional). If not provided, will use the value from the API if available.
- **config**: `ClientConfig` - Configuration object for the Asgard service client, including:
  - `apiKey?`: `string` (optional) - API key for authentication. Can be omitted when using dynamic authentication
  - `botProviderEndpoint`: `string` (required) - Bot provider endpoint URL (SSE endpoint will be auto-derived)
  - `endpoint?`: `string` (deprecated) - Legacy API endpoint URL. Use `botProviderEndpoint` instead.
  - `transformSsePayload?`: `(payload: FetchSsePayload) => FetchSsePayload` - SSE payload transformer
  - `customHeaders?`: `Record<string, string>` - Custom headers to include in SSE and API requests (e.g., Bearer token via `Authorization` header)
  - `debugMode?`: `boolean` - Enable debug mode, defaults to `false`
  - `onRunInit?`: `InitEventHandler` - Handler for run initialization events
  - `onMessage?`: `MessageEventHandler` - Handler for message events
  - `onToolCall?`: `ToolCallEventHandler` - Handler for tool call events. See [Tool Call Handler](#tool-call-handler) section for details.
  - `onProcess?`: `ProcessEventHandler` - Handler for process events
  - `onRunDone?`: `DoneEventHandler` - Handler for run completion events
  - `onRunError?`: `ErrorEventHandler` - Error handler for execution errors
- **customActions?**: `ReactNode[]` - Custom actions to display on the chatbot header
- **enableLoadConfigFromService?**: `boolean` - Enable loading configuration from service
- **enableUpload?**: `boolean` - Enable file upload functionality. When set, it takes priority over the `embedConfig.enableUpload` setting from the bot provider metadata. Defaults to `false` if not specified in either location. Supports image files (JPEG, PNG, GIF, WebP) up to 20MB per file, maximum 10 files at once.
- **enableExport?**: `boolean` - Enable conversation export functionality. When set, it takes priority over the `embedConfig.enableExport` setting from the bot provider metadata. Defaults to `false` if not specified in either location. Adds a download button to the chatbot footer that exports the conversation history as a Markdown file with timestamps and trace IDs.
- **maintainConnectionWhenClosed?**: `boolean` - Maintain connection when chat is closed, defaults to `false`
- **loadingComponent?**: `ReactNode` - Custom loading component
- **asyncInitializers?**: `Record<string, () => Promise<unknown>>` - Asynchronous initializers for app initialization before rendering any component. Good for loading data or other async operations as the initial state. It only works when `enableLoadConfigFromService` is set to `true`.
- **customChannelId**: `string` - Custom channel identifier for the chat session
- **initMessages**: `ConversationMessage[]` - Initial messages to display in the chat
- **fullScreen**: `boolean` - Display chatbot in full screen mode, defaults to `false`
- **avatar**: `string` - URL for the chatbot's avatar image
- **botTypingPlaceholder**: `string` - Text to display while the bot is typing
- **inputPlaceholder**: `string` - Custom placeholder text for the message input field
- **defaultLinkTarget?**: `'_blank' | '_self' | '_parent' | '_top'` - Default target for opening URIs when not specified by the API. Defaults to `'_blank'` (opens in new tab).
- **theme**: `Partial<AsgardThemeContextValue>` - Custom theme configuration
- **autoResetChannel?**: `boolean` - Whether to automatically reset channel on mount. Defaults to `true`. When set to `false`, the channel is created without sending `RESET_CHANNEL`, preserving history messages loaded via `initMessages`. See [Auto Reset Channel](#auto-reset-channel) section for details.
- **onMessageSent?**: `() => void` - Callback fired after a message is successfully sent. Useful for tracking message count or triggering side effects.
- **onReset**: `() => void` - Callback function when chat is reset
- **onClose**: `() => void` - Callback function when chat is closed
- **authState?**: `AuthState` - Authentication state for dynamic API key management. Available states: `'loading'`, `'needApiKey'`, `'authenticated'`, `'error'`, `'invalidApiKey'`
- **onApiKeySubmit?**: `(apiKey: string) => Promise<void>` - Callback function when user submits API key for authentication
- **onTemplateBtnClick?**: `(payload: Record<string, unknown>, eventName: string, raw: string) => void` - Callback for EMIT button actions. See [EMIT Action](#emit-action) section for details.
- **messageActions?**: `(message: ConversationBotMessage) => MessageActionConfig[]` - Function to define which action buttons to display for each bot message. Returns an array of `{ id: string, label: string }` objects. See [Message Actions](#message-actions) section for details.
- **onMessageAction?**: `(actionId: string, message: ConversationBotMessage) => void` - Callback when a message action button is clicked. Receives the action ID and the associated bot message.
- **renderHeader?**: `() => ReactNode` - Custom header renderer. When provided, completely replaces the default header. Use `useAsgardContext()` inside the render function to access `resetChannel`, `isResetting`, and other internal state.
- **renderMenu?**: `() => ReactNode` - Custom menu renderer. When provided, renders content between the chat body and footer. Useful for quick menus, suggested questions, or navigation panels. See [Custom Menu](#custom-menu) section for details.
- **renderMessageContent?**: `(props: MessageContentRendererProps) => ReactNode` - Custom renderer for message content. Allows customizing how messages are rendered based on message properties. See [Custom Message Renderer](#custom-message-renderer) section for details.
- **renderToolCallGroup?**: `(props: ToolCallGroupRendererProps) => ReactNode` - Custom renderer for tool call group. Return `null` to hide, return JSX to fully customize, or call `renderDefaultContent()` to use the default UI with optional overrides (e.g., `renderDefaultContent({ title: 'AI is thinking...' })`). See [Tool Call Group Renderer](#tool-call-group-renderer) section for details.
- **onBeforeSendMessage?**: `(params: SendMessageParams) => SendMessageParams` - Callback to modify message params before sending. Allows injecting contextual data (payload, metadata) from parent components. See [Before Send Message Hook](#before-send-message-hook) section for details.
- **onSseMessage**: `(response: SseResponse, ctx: AsgardServiceContextValue) => void` - Callback function when SSE message is received. It would be helpful if using with the ref to provide some context and conversation data and do some proactively actions like sending messages to the bot.
- **ref**: `ForwardedRef<ChatbotRef>` - Forwarded ref to access the chatbot instance. It can be used to access the chatbot instance and do some actions like sending messages to the bot. `ChatbotRef` provides `serviceContext` for interacting with the chatbot, and `setInputValue(value: string)` for programmatically setting the textarea text from outside the component.

<a id="theme-configuration"></a>
<br/>

### Theme Configuration

The theme configuration can be obtained from the bot provider metadata of `annotations` field and `theme` props.

The priority of themes is as follows (high to low):

1. Theme from props
2. Theme from annotations from bot provider metadata
3. Default theme

### Theme Interface

```typescript
export interface AsgardThemeContextValue {
  chatbot: Pick<
    CSSProperties,
    | 'width'
    | 'height'
    | 'maxWidth'
    | 'minWidth'
    | 'maxHeight'
    | 'minHeight'
    | 'backgroundColor'
    | 'borderColor'
    | 'borderRadius'
  > & {
    contentMaxWidth?: CSSProperties['maxWidth'];
    backgroundColor?: CSSProperties['backgroundColor'];
    borderColor?: CSSProperties['borderColor'];
    inactiveColor?: CSSProperties['color'];
    primaryComponent?: {
      mainColor?: CSSProperties['color'];
      secondaryColor?: CSSProperties['color'];
    };
    style?: CSSProperties;
    header?: Partial<{
      style: CSSProperties;
      title: {
        style: CSSProperties;
      };
      actionButton?: {
        style: CSSProperties;
      };
    }>;
    body?: Partial<{
      style: CSSProperties;
    }>;
    footer?: Partial<{
      style: CSSProperties;
      textArea: {
        style: CSSProperties;
        '::placeholder': CSSProperties;
      };
      submitButton: {
        style: CSSProperties;
      };
      speechInputButton: {
        style: CSSProperties;
      };
    }>;
  };
  botMessage: Pick<CSSProperties, 'color' | 'backgroundColor'>;
  userMessage: Pick<CSSProperties, 'color' | 'backgroundColor'>;
  template?: Partial<{
    /**
     * first level for common/shared properties.
     * Check MessageTemplate type for more details (packages/core/src/types/sse-response.ts).
     */
    quickReplies?: Partial<{
      style: CSSProperties;
      button: {
        style: CSSProperties;
      };
    }>;
    references?: Partial<{
      style: CSSProperties;
      title?: {
        style: CSSProperties;
      };
      item?: {
        style: CSSProperties;
      };
    }>;
    time?: Partial<{
      style: CSSProperties;
    }>;
    TextMessageTemplate: Partial<{ style: CSSProperties }>;
    HintMessageTemplate: Partial<{ style: CSSProperties }>;
    ImageMessageTemplate: Partial<{ style: CSSProperties }>;
    ChartMessageTemplate: Partial<{ style: CSSProperties }>;
    ButtonMessageTemplate: Partial<{
      style: CSSProperties;
      button?: {
        style: CSSProperties;
      };
    }>;
    CarouselMessageTemplate: Partial<{
      style: CSSProperties;
      card: {
        style: CSSProperties;
        button?: {
          style: CSSProperties;
        };
      };
    }>;

    // Didn't implement yet
    VideoMessageTemplate: Partial<{ style: CSSProperties }>;
    AudioMessageTemplate: Partial<{ style: CSSProperties }>;
    LocationMessageTemplate: Partial<{ style: CSSProperties }>;
  }>;
}
```

### Default Theme

The default theme uses CSS variables for consistent styling:

```javascript
const defaultTheme = {
  chatbot: {
    width: '375px',
    height: '640px',
    backgroundColor: 'var(--asg-color-bg)',
    borderColor: 'var(--asg-color-border)',
    borderRadius: 'var(--asg-radius-md)',
    contentMaxWidth: '1200px',
    style: {},
    header: {
      style: {},
      title: {
        style: {},
      },
      actionButton: {
        style: {},
      },
    },
    body: {
      style: {},
    },
    footer: {
      style: {},
      textArea: {
        style: {},
        '::placeholder': {
          color: 'var(--asg-color-text-placeholder)',
        },
      },
      submitButton: {
        style: {},
      },
      speechInputButton: {
        style: {},
      },
    },
  },
  botMessage: {
    color: 'var(--asg-color-text)',
    backgroundColor: 'var(--asg-color-secondary)',
  },
  userMessage: {
    color: 'var(--asg-color-text)',
    backgroundColor: 'var(--asg-color-primary)',
  },
  template: {
    quickReplies: {
      style: {},
      button: {
        style: {},
      },
    },
    references: {
      style: {},
      title: {
        style: {},
      },
      item: {
        style: {},
      },
    },
    time: {
      style: {},
    },
    TextMessageTemplate: {
      style: {},
    },
    HintMessageTemplate: {
      style: {},
    },
    ImageMessageTemplate: {
      style: {},
    },
    VideoMessageTemplate: {
      style: {},
    },
    AudioMessageTemplate: {
      style: {},
    },
    LocationMessageTemplate: {
      style: {},
    },
    ChartMessageTemplate: {
      style: {},
    },
    ButtonMessageTemplate: {
      style: {},
      button: {
        style: {
          border: '1px solid var(--asg-color-border)',
        },
      },
    },
    CarouselMessageTemplate: {
      style: {},
      card: {
        style: {},
        button: {
          style: {
            border: '1px solid var(--asg-color-border)',
          },
        },
      },
    },
  },
};
```

#### Usage Example

```javascript
const App = () => {
  const customTheme = {
    chatbot: {
      width: '400px',
      height: '600px',
      backgroundColor: '#ffffff',
      borderRadius: '12px',
    },
    botMessage: {
      backgroundColor: '#f0f0f0',
    },
    userMessage: {
      backgroundColor: '#007bff',
      color: '#ffffff',
    },
  };

  return (
    <Chatbot
      // ... other props
      theme={customTheme}
    />
  );
};
```

Note: When `fullScreen` prop is set to `true`, the chatbot's width and height will be set to `100vw` and `100vh` respectively, and `borderRadius` will be set to zero, regardless of theme settings.

<a id="event-handlers"></a>
<br/>

## Event Handlers

<a id="tool-call-handler"></a>
<br/>

### Tool Call Handler

The `onToolCall` callback allows you to handle tool call events from the bot. This handler is triggered when the bot starts or completes executing a tool call. See the [Tool Call Start documentation](https://docs.asgard-ai.com/docs/developer-reference/api-doc/send-message/sse-response/asgard-tool-call-start) and [Tool Call Complete documentation](https://docs.asgard-ai.com/docs/developer-reference/api-doc/send-message/sse-response/asgard-tool-call-complete) for details.

The callback receives a `SseResponse` object with one of the following event types:

- `EventType.TOOL_CALL_START`: Fired when a tool call begins execution
- `EventType.TOOL_CALL_COMPLETE`: Fired when a tool call completes execution

The response object contains the following data:

For `TOOL_CALL_START`:

- `processId`: `string` - Process identifier
- `callSeq`: `number` - Call sequence number
- `toolCall`: Object containing:
  - `toolsetName`: `string` - Name of the toolset
  - `toolName`: `string` - Name of the tool
  - `parameter`: `Record<string, unknown>` - Tool call parameters

For `TOOL_CALL_COMPLETE`:

- All fields from `TOOL_CALL_START` plus:
- `toolCallResult`: Object containing:
  - `data`: `unknown` - Result data returned from the tool execution
  - `error`: `unknown` - Error information if the tool call failed
  - `errorCode`: `string | null` - Error code if the tool call failed
  - `isSuccess`: `boolean` - Whether the tool call succeeded
  - `paging`: `unknown` - Paging information if applicable

Example SSE response for `TOOL_CALL_COMPLETE`:

```json
{
  "eventType": "asgard.tool_call.complete",
  "requestId": "295fcef49f270b06e6d53f6fb3656b0c",
  "eventId": "1947548755242782720",
  "namespace": "proj-4b2b31bb-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "botProviderName": "bp-reviewbot-f96def0f-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "customChannelId": "syDHHkS6cQMdAWTu3T2N2X",
  "fact": {
    "runInit": null,
    "runDone": null,
    "runError": null,
    "processStart": null,
    "processComplete": null,
    "messageStart": null,
    "messageDelta": null,
    "messageComplete": null,
    "toolCallStart": null,
    "toolCallComplete": {
      "processId": "f627cac52c576dc4",
      "callSeq": 0,
      "toolCall": {
        "toolsetName": "ts-callool-4b2b31bb-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
        "toolName": "movie_search",
        "parameter": {}
      },
      "toolCallResult": {
        "data": null,
        "error": null,
        "errorCode": null,
        "isSuccess": true,
        "paging": null
      }
    }
  }
}
```

#### Usage Example

```typescript
import { EventType, SseResponse } from '@asgard-js/core';

const handleToolCall = (response: SseResponse<EventType.TOOL_CALL_START | EventType.TOOL_CALL_COMPLETE>): void => {
  if (response.eventType === EventType.TOOL_CALL_COMPLETE) {
    const { processId, callSeq, toolCall, toolCallResult } = response.fact.toolCallComplete;
    console.log(`Tool call completed: ${toolCall.toolsetName}.${toolCall.toolName}`);

    if (toolCallResult.isSuccess) {
      console.log('Tool call succeeded. Data:', toolCallResult.data);
      // Process successful results
    } else {
      console.error('Tool call failed:', toolCallResult.error);
      console.error('Error code:', toolCallResult.errorCode);
      // Handle errors
    }

    // You can process results, update UI, or trigger follow-up actions
  }
};

// Pass the handler to Chatbot config
<Chatbot
  config={{
    apiKey: 'your-api-key',
    botProviderEndpoint: 'https://api.asgard-ai.com/ns/{namespace}/bot-provider/{botProviderId}',
    onToolCall: handleToolCall,
  }}
  customChannelId="your-channel-id"
/>;
```

<a id="tool-call-consent"></a>
<br/>

### Tool Call Consent

When a bot provider is configured with consent-required toolsets, the SDK automatically surfaces an approval modal before each tool call executes. No additional wiring is needed — `ToolCallConsentGate` is mounted inside `<Chatbot>` automatically.

#### How it works

When the backend emits an `asgard.tool_call.consent` event, a modal appears for each pending tool call in sequence. The user chooses one of three actions:

| Action                  | Behaviour                                                                                          |
| ----------------------- | -------------------------------------------------------------------------------------------------- |
| **Allow for This Chat** | Approves this call and auto-approves all future calls to the same tool in the current chat session |
| **Allow Once**          | Approves this call only                                                                            |
| **Deny**                | Rejects this call; the user may optionally provide a reason                                        |

Two auto-skip rules reduce interruptions:

- **`alreadyAllowed`**: If the backend marks a call as already allowed (e.g. from a prior "Allow for This Chat" in a previous turn), the SDK silently approves it without showing a modal.
- **Same-session Allow for This Chat**: If the user approved a tool via "Allow for This Chat" earlier in the same consent batch, subsequent calls to that tool in the same batch are auto-approved.

#### Zero-config usage

```tsx
// No consent-specific props needed — just point to a consent-enabled bot provider
<Chatbot
  config={{
    apiKey: 'your-api-key',
    botProviderEndpoint: 'https://api.asgard-ai.com/ns/{namespace}/bot-provider/{botProviderId}',
  }}
  customChannelId="your-channel-id"
/>
```

#### Theming

The consent modal inherits the chatbot's design tokens (`--asg-color-*`) automatically, so it follows the active theme without extra configuration. You can also override individual modal colours via CSS variables on any ancestor element:

```css
.my-chatbot-wrapper {
  --asgard-consent-modal-bg: #0f172a;
  --asgard-consent-modal-accent: #6366f1;
  --asgard-consent-modal-danger: #ef4444;
}
```

<a id="emit-action"></a>
<br/>

### EMIT Action

EMIT buttons allow you to handle custom actions in your application. Implement the `onTemplateBtnClick` callback to process these events. See the [EMIT Action documentation](https://docs.asgard-ai.com/docs/developer-reference/asgard-builtin/message-template-action-object-emit) for details.

The callback receives the following parameters:

1. `payload` (optional): Custom data from the button action
2. `eventName` (required): Event name specified in the button action
3. `raw` (required): Complete SSE response data as JSON string. Use this when you need information beyond `payload` and `eventName`. Parse it to access additional fields from the original SSE response. See [SSE Response documentation](https://docs.asgard-ai.com/docs/developer-reference/api-doc/send-message/sse-response/message-complete) for the complete response structure.

Configure EMIT buttons in your backend SSE response:

```json
{
  "template": {
    "type": "BUTTON",
    "title": "Action Menu",
    "text": "Please select an action:",
    "buttons": [
      {
        "label": "Support Request",
        "action": {
          "type": "EMIT",
          "eventName": "support_request",
          "payload": {
            "category": "technical",
            "priority": "high"
          }
        }
      }
    ]
  }
}
```

#### Usage Example

```typescript
const handleTemplateBtnClick = (payload: Record<string, unknown>, eventName: string, raw: string): void => {
  if (eventName === 'support_request') {
    // Access payload data
    const category = payload.category as string;
    const priority = payload.priority as string;

    // Optionally parse raw SSE data to access additional fields
    let customChannelId: string | undefined;
    try {
      const sseData = JSON.parse(raw);
      customChannelId = sseData.customChannelId;
    } catch {
      // Handle parse error if needed
    }

    const channelInfo = customChannelId ? `\nChannel ID: ${customChannelId}` : '';
    window.alert(`Support request created\n\nCategory: ${category}\nPriority: ${priority}${channelInfo}`);
  }
};

// Pass the handler to Chatbot
<Chatbot config={config} customChannelId={nanoid()} onTemplateBtnClick={handleTemplateBtnClick} />;
```

<a id="message-actions"></a>
<br/>

### Message Actions

Message Actions allow you to add custom action buttons to bot messages. This is useful for implementing features like "Save as Topic", "Copy", "Share", or any other custom actions on individual messages.

The `messageActions` prop is a function that receives a bot message and returns an array of action configurations. The `onMessageAction` callback is triggered when a user clicks on an action button.

#### MessageActionConfig Interface

```typescript
interface MessageActionConfig {
  /** Unique identifier for the action */
  id: string;
  /** Display label for the action button */
  label: string;
}
```

#### Usage Example

```typescript
import { useCallback } from 'react';
import { ConversationBotMessage } from '@asgard-js/core';

const App = () => {
  const handleMessageAction = useCallback((actionId: string, message: ConversationBotMessage) => {
    if (actionId === 'save-topic') {
      const content = message.message.text;
      console.log('Save as topic:', content);
      // Implement your save logic here
    } else if (actionId === 'copy') {
      navigator.clipboard.writeText(message.message.text);
      alert('Copied to clipboard!');
    }
  }, []);

  return (
    <Chatbot
      config={config}
      customChannelId="your-channel-id"
      messageActions={message => {
        // Return different actions based on message content or type
        return [
          { id: 'save-topic', label: 'Save as Topic' },
          { id: 'copy', label: 'Copy' },
        ];
      }}
      onMessageAction={handleMessageAction}
    />
  );
};
```

#### Conditional Actions

You can return different actions based on the message content:

```typescript
messageActions={(message) => {
  const actions = [{ id: 'copy', label: 'Copy' }];

  // Only show "Save as Topic" for longer messages
  if (message.message.text.length > 100) {
    actions.push({ id: 'save-topic', label: 'Save as Topic' });
  }

  return actions;
}}
```

<a id="custom-message-renderer"></a>
<br/>

<a id="tool-call-group-renderer"></a>
<br/>

### Tool Call Group Renderer

The `renderToolCallGroup` prop allows you to customize or hide the "Answer preparation steps" UI that appears when the bot calls tools before responding.

#### ToolCallGroupRendererProps Interface

```typescript
interface ToolCallGroupRendererProps {
  /** Tool call items in the group */
  items: ToolCallItemData[];
  /** Timestamp of the first tool call */
  time?: Date;
  /** Function to render the default tool call group UI. Accepts optional overrides. */
  renderDefaultContent: (overrides?: { title?: string }) => ReactNode;
}

interface ToolCallItemData {
  id: string;
  label: string;
  status: 'pending' | 'completed' | 'error';
  initial?: Record<string, unknown>;
  result?: Record<string, unknown>;
}
```

#### Hide completely

```typescript
<Chatbot
  renderToolCallGroup={() => null}
  ...
/>
```

#### Custom title

```typescript
<Chatbot
  renderToolCallGroup={({ renderDefaultContent }) =>
    renderDefaultContent({ title: 'AI is thinking...' })
  }
  ...
/>
```

#### Custom UI

```typescript
<Chatbot
  renderToolCallGroup={({ items }) => {
    const done = items.filter(i => i.status === 'completed').length;
    return (
      <div>
        {done === items.length
          ? `✅ ${done} steps completed`
          : `⏳ Processing...`}
      </div>
    );
  }}
  ...
/>
```

<a id="custom-message-renderer"></a>
<br/>

### Custom Message Renderer

The `renderMessageContent` prop allows you to customize how messages are rendered based on message type, payload, or other conditions. This is useful for implementing custom message cards, special UI treatments, or integrating with your application's design system.

#### MessageContentRendererProps Interface

```typescript
interface MessageContentRendererProps {
  /** The original message object */
  message: ConversationMessage;
  /** Function to render the default message content */
  renderDefaultContent: () => ReactNode;
  /** Container component that wraps custom content with Avatar for bot messages */
  MessageContainer: React.FC<{ children: ReactNode }>;
}
```

#### Why MessageContainer?

When you use `renderMessageContent` to customize rendering, it completely replaces the default Template. This means **Avatar will not display automatically**, because Avatar is part of the default Template.

Use `MessageContainer` to wrap your custom content and automatically get:

- **Bot messages**: Avatar + timestamp
- **User messages**: Proper right-aligned styling

#### Understanding payload

The `payload` is custom data set by the backend Bot Provider when responding to messages. The SDK passes it directly to `renderMessageContent` without modification.

**Backend response example (Bot Provider):**

```json
{
  "template": { "type": "text", "text": "Here is your order" },
  "payload": {
    "customType": "order_card",
    "orderId": "#ORD-2024-001234",
    "items": [{ "name": "iPhone 15 Pro", "price": 42900 }]
  }
}
```

**Frontend renders based on payload:**

```typescript
const payload = message.message.payload as { customType?: string };

if (payload?.customType === 'order_card') {
  return <OrderCard order={payload} />;
}
```

> **Note:** `customType` is a convention, not a requirement. You can define your own payload structure - just ensure the frontend and backend use the same format.

#### Basic Usage

```typescript
import { Chatbot, MessageContentRendererProps } from '@asgard-js/react';

<Chatbot
  config={config}
  customChannelId="your-channel-id"
  renderMessageContent={props => {
    const { message, renderDefaultContent, MessageContainer } = props;

    // Customize bot messages with specific payload types
    if (message.type === 'bot') {
      const payload = message.message.payload as { customType?: string };

      if (payload?.customType === 'order_card') {
        // Use MessageContainer to wrap custom content with Avatar
        return (
          <MessageContainer>
            <OrderCard order={payload} />
          </MessageContainer>
        );
      }
    }

    // Use default rendering for all other messages
    return renderDefaultContent();
  }}
/>;
```

#### Using MessageContainer

The `MessageContainer` component is essential for maintaining consistent styling with the default messages:

- **For bot messages**: Wraps your content with the bot's Avatar and proper message styling (including timestamp and quick replies)
- **For user messages**: Applies proper right-aligned styling
- **For other message types**: Returns children directly

**With MessageContainer** (recommended for custom bot messages):

```typescript
renderMessageContent={(props) => {
  const { message, MessageContainer } = props;

  if (message.type === 'bot' && isCustomMessage(message)) {
    return (
      <MessageContainer>
        <MyCustomComponent data={message.message.payload} />
      </MessageContainer>
    );
  }

  return props.renderDefaultContent();
}}
```

**Without MessageContainer** (when you need full control):

```typescript
renderMessageContent={(props) => {
  const { message } = props;

  if (message.type === 'bot' && isSpecialMessage(message)) {
    // Render completely custom layout without Avatar
    return <FullWidthBanner data={message.message.payload} />;
  }

  return props.renderDefaultContent();
}}
```

#### Wrapper Pattern

You can also wrap the default content to add additional elements:

```typescript
renderMessageContent={(props) => {
  const { message, renderDefaultContent } = props;

  return (
    <div className="message-wrapper" data-type={message.type}>
      <div className="timestamp">{new Date().toLocaleTimeString()}</div>
      {renderDefaultContent()}
      <div className="message-footer">
        <span>Type: {message.type}</span>
      </div>
    </div>
  );
}}
```

#### Custom User Messages

You can also customize user messages:

```typescript
renderMessageContent={(props) => {
  const { message, renderDefaultContent, MessageContainer } = props;

  if (message.type === 'user') {
    return (
      <MessageContainer>
        <div className="custom-user-message">
          <span className="user-badge">YOU</span>
          <div className="user-content">{message.text}</div>
        </div>
      </MessageContainer>
    );
  }

  return renderDefaultContent();
}}
```

<a id="before-send-message-hook"></a>
<br/>

### Before Send Message Hook

The `onBeforeSendMessage` prop allows you to modify message parameters before they are sent. This is useful for injecting contextual data from parent components into every message.

#### SendMessageParams Interface

```typescript
interface SendMessageParams {
  text: string;
  blobIds?: string[];
  filePreviewUrls?: string[];
  documentNames?: string[];
  payload?: Record<string, unknown> | (() => Record<string, unknown>);
}
```

#### Use Case

When the Chatbot component is embedded in a page that has contextual information (e.g., selected category, current step, user preferences), you can inject this context into every message so the backend can provide more relevant responses.

#### Usage Example

```typescript
import { useState, useCallback } from 'react';
import { Chatbot, SendMessageParams } from '@asgard-js/react';

const TopicCreatePage = () => {
  const [selectedCategory, setSelectedCategory] = useState<{ id: string; name: string } | null>(null);

  const handleBeforeSendMessage = useCallback(
    (params: SendMessageParams): SendMessageParams => {
      if (selectedCategory) {
        return {
          ...params,
          payload: {
            categoryId: selectedCategory.id,
            categoryName: selectedCategory.name,
            currentPage: 'topics/create',
          },
        };
      }
      return params;
    },
    [selectedCategory],
  );

  return (
    <div>
      {/* Category selector */}
      <select
        onChange={e => setSelectedCategory({ id: e.target.value, name: e.target.options[e.target.selectedIndex].text })}
      >
        <option value="tech">Technology</option>
        <option value="lifestyle">Lifestyle</option>
      </select>

      {/* Chatbot with context injection */}
      <Chatbot config={config} customChannelId="topic-create-chat" onBeforeSendMessage={handleBeforeSendMessage} />
    </div>
  );
};
```

#### Backend Integration

The injected payload will be included in the SSE request body, allowing your backend to access contextual information:

```json
{
  "text": "Help me write about AI",
  "payload": {
    "categoryId": "tech",
    "categoryName": "Technology",
    "currentPage": "topics/create"
  }
}
```

<a id="custom-header"></a>
<br/>

### Custom Header

The `renderHeader` prop allows you to completely replace the default chatbot header with your own implementation. Combined with `onMessageSent` and `onReset`, you can build features like a session message counter.

Use `useAsgardContext()` inside your custom header to access internal state such as `resetChannel` and `isResetting`.

#### Usage Example

```typescript
import { useState } from 'react';
import { Chatbot, useAsgardContext } from '@asgard-js/react';

function CustomHeader({ count, onClose }: { count: number; onClose: () => void }) {
  const { resetChannel, isResetting } = useAsgardContext();

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontWeight: 600 }}>My Chatbot</span>
        <span style={{ fontSize: '12px' }}>Messages: {count}</span>
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={() => {
            if (!isResetting) resetChannel?.();
          }}
        >
          Reset
        </button>
        <button onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

const App = () => {
  const [count, setCount] = useState(0);

  return (
    <Chatbot
      config={{
        apiKey: 'your-api-key',
        botProviderEndpoint: 'https://api.asgard-ai.com/ns/{namespace}/bot-provider/{botProviderId}',
      }}
      customChannelId="your-channel-id"
      onMessageSent={() => setCount(c => c + 1)}
      onReset={() => setCount(0)}
      renderHeader={() => <CustomHeader count={count} onClose={() => console.log('closed')} />}
    />
  );
};
```

<a id="custom-menu"></a>
<br/>

### Custom Menu

The `renderMenu` prop renders custom content between the chat body and footer. Combined with `ref.setInputValue`, you can build interactive menus that fill the input on click.

#### Usage Example

```typescript
import { useRef } from 'react';
import { Chatbot, ChatbotRef } from '@asgard-js/react';

const App = () => {
  const chatbotRef = useRef<ChatbotRef>(null);

  const questions = ['What services do you offer?', 'How do I get started?'];

  return (
    <Chatbot
      ref={chatbotRef}
      config={{
        apiKey: 'your-api-key',
        botProviderEndpoint: 'https://api.asgard-ai.com/ns/{namespace}/bot-provider/{botProviderId}',
      }}
      customChannelId="your-channel-id"
      renderMenu={() => (
        <div style={{ padding: '8px 12px', borderTop: '1px solid #eee' }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: '#888' }}>Suggested questions</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {questions.map(q => (
              <button
                key={q}
                onClick={() => chatbotRef.current?.setInputValue?.(q)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 16,
                  border: '1px solid #ddd',
                  background: '#fff',
                  cursor: 'pointer',
                }}
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}
    />
  );
};
```

<a id="auto-reset-channel"></a>
<br/>

### Auto Reset Channel

By default, the Chatbot sends a `RESET_CHANNEL` action on mount, which resets the server-side channel state and clears previous conversation history. Set `autoResetChannel={false}` to skip this reset, allowing you to load history messages via `initMessages` and continue the conversation.

#### Behavior Comparison

|                      | `autoResetChannel={true}` (default)            | `autoResetChannel={false}`          |
| -------------------- | ---------------------------------------------- | ----------------------------------- |
| On mount             | Sends `RESET_CHANNEL` via SSE                  | Creates channel without SSE request |
| Server state         | Channel is reset, server sends welcome message | Channel state is preserved          |
| Display              | `initMessages` + server welcome message        | Only `initMessages` (history)       |
| First SSE connection | Immediately on mount                           | When user sends the first message   |
| Header reset button  | Works (calls `resetChannel()`)                 | Still works (manual reset)          |

#### Usage Example

```typescript
import { Chatbot } from '@asgard-js/react';
import { ConversationMessage } from '@asgard-js/core';

const AgentHub = () => {
  // Load history messages from your backend
  const [historyMessages, setHistoryMessages] = useState<ConversationMessage[]>([]);

  useEffect(() => {
    fetchChatHistory().then(setHistoryMessages);
  }, []);

  return (
    <Chatbot
      config={{
        apiKey: 'your-api-key',
        botProviderEndpoint: 'https://api.asgard-ai.com/ns/{namespace}/bot-provider/{botProviderId}',
      }}
      customChannelId="agent-hub-channel"
      autoResetChannel={false}
      initMessages={historyMessages}
    />
  );
};
```

<a id="development"></a>
<br/>

## Development

To develop the React package locally, follow these steps:

1. Clone the repository and navigate to the project root directory.

2. Install dependencies:

```sh
npm install
```

3. Start development:

You can use the following commands to work with the React package:

```sh
# Lint the React package
npm run lint:react

# Build the package
npm run build:react

# Watch mode for development
npm run watch:react
```

Setup your npm registry token for npm publishing:

```sh
cd ~/
touch .npmrc
echo "//registry.npmjs.org/:_authToken={{YOUR_TOKEN}}" >> .npmrc
```

For working with both core and React packages:

```sh
# Lint both packages
npm run lint:packages

# Build core package (required for React package)
npm run build:core
npm run build:react

# Release packages
npm run release:core  # Release core package
npm run release:react # Release React package
```

All builds will be available in the `dist` directory of their respective packages.

## Contributing

We welcome contributions! Please read our [contributing guide](../../CONTRIBUTING.md) to get started.

## License

This project is licensed under the MIT License - see the [LICENSE](../../LICENSE) file for details.
