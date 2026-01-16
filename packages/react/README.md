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
- **onReset**: `() => void` - Callback function when chat is reset
- **onClose**: `() => void` - Callback function when chat is closed
- **authState?**: `AuthState` - Authentication state for dynamic API key management. Available states: `'loading'`, `'needApiKey'`, `'authenticated'`, `'error'`, `'invalidApiKey'`
- **onApiKeySubmit?**: `(apiKey: string) => Promise<void>` - Callback function when user submits API key for authentication
- **onTemplateBtnClick?**: `(payload: Record<string, unknown>, eventName: string, raw: string) => void` - Callback for EMIT button actions. See [EMIT Action](#emit-action) section for details.
- **messageActions?**: `(message: ConversationBotMessage) => MessageActionConfig[]` - Function to define which action buttons to display for each bot message. Returns an array of `{ id: string, label: string }` objects. See [Message Actions](#message-actions) section for details.
- **onMessageAction?**: `(actionId: string, message: ConversationBotMessage) => void` - Callback when a message action button is clicked. Receives the action ID and the associated bot message.
- **onSseMessage**: `(response: SseResponse, ctx: AsgardServiceContextValue) => void` - Callback function when SSE message is received. It would be helpful if using with the ref to provide some context and conversation data and do some proactively actions like sending messages to the bot.
- **ref**: `ForwardedRef<ChatbotRef>` - Forwarded ref to access the chatbot instance. It can be used to access the chatbot instance and do some actions like sending messages to the bot. ChatbotRef extends the ref of the chatbot instance and provides some additional methods like `serviceContext.sendMessage` to interact with the chatbot instance.

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

The `onToolCall` callback allows you to handle tool call events from the bot. This handler is triggered when the bot starts or completes executing a tool call. See the [Tool Call Start documentation](https://www.asgard-ai.com/docs/developer-reference/api-doc/send-message/sse-response/asgard-tool-call-start) and [Tool Call Complete documentation](https://www.asgard-ai.com/docs/developer-reference/api-doc/send-message/sse-response/asgard-tool-call-complete) for details.

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

<a id="emit-action"></a>
<br/>

### EMIT Action

EMIT buttons allow you to handle custom actions in your application. Implement the `onTemplateBtnClick` callback to process these events. See the [EMIT Action documentation](https://www.asgard-ai.com/docs/developer-reference/asgard-builtin/message-template-action-object-emit) for details.

The callback receives the following parameters:

1. `payload` (optional): Custom data from the button action
2. `eventName` (required): Event name specified in the button action
3. `raw` (required): Complete SSE response data as JSON string. Use this when you need information beyond `payload` and `eventName`. Parse it to access additional fields from the original SSE response. See [SSE Response documentation](https://www.asgard-ai.com/docs/developer-reference/api-doc/send-message/sse-response/message-complete) for the complete response structure.

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

<a id="testing"></a>
<br/>

## Testing

The React package includes comprehensive tests using Vitest and React Testing Library.

### Running Tests

```sh
# Run tests once
npm run test:react

# Run tests in watch mode
npm run test:react:watch

# Run tests with UI
npm run test:react:ui

# Run tests with coverage
npm run test:react:coverage
```

### Test Structure

Tests are located alongside source files with `.spec.tsx` extensions:

- `src/components/chatbot/chatbot.spec.tsx` - React component tests
- Test environment: jsdom with React Testing Library
- Setup file: `src/test-setup.ts` (includes jest-dom)
- Coverage reports available in `test-output/vitest/coverage/`

### Writing Tests

The package uses Vitest for testing with the following setup:

- TypeScript support
- jsdom environment for DOM APIs
- React Testing Library for component testing
- jest-dom matchers for enhanced assertions
- ESLint integration
- Coverage reporting with v8 provider

Example test structure:

```javascript
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Chatbot } from './chatbot';

describe('Chatbot Component', () => {
  it('should render without crashing', () => {
    const config = {
      botProviderEndpoint: 'https://api.example.com/bot-provider/bp-123',
      apiKey: 'test-key',
    };

    const { container } = render(<Chatbot title="Test Chatbot" config={config} customChannelId="test-channel" />);

    expect(container).toBeInTheDocument();
  });
});
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

# Run tests
npm run test:react

# Build the package
npm run build:react

# Watch mode for development
npm run watch:react

# Run the demo application
npm run serve:react-demo
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
