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
        fullScreen={false}
        avatar="https://example.com/avatar.png"
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

#### Restricting Allowed MIME Types

By default, image upload accepts `image/jpeg`, `image/jpg`, `image/png`, `image/gif`, and `image/webp`, while document upload accepts a built-in list of document types (with an extension-based fallback). To narrow — or extend — what users may attach, pass `allowedImageMimeTypes` / `allowedDocumentMimeTypes`:

```javascript
<Chatbot
  config={{
    apiKey: 'your-api-key',
    botProviderEndpoint: 'https://api.asgard-ai.com/ns/{namespace}/bot-provider/{botProviderId}',
  }}
  customChannelId="your-channel-id"
  enableUpload
  enableDocumentUpload
  allowedImageMimeTypes={['image/png', 'image/webp']}
  allowedDocumentMimeTypes={['application/pdf']}
/>
```

Both props **override** their respective default list entirely (they do not merge) and only take effect when the matching `enableUpload` / `enableDocumentUpload` flag is on. The provided values drive both the file picker `accept` attribute and validation. For documents, supplying the prop also switches validation to MIME-only matching (the extension fallback no longer applies). Passing an empty array is treated the same as omitting the prop.

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
  - `userIdentityHint?`: `string` - Optional user identity hint. When provided, all requests will include the `X-ASGARD-USER-IDENTITY-HINT` header with this value
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
- **enableDocumentUpload?**: `boolean` - Enable document file upload functionality. When enabled, users can attach document files to messages. The container-level drag-and-drop overlay is also activated. Defaults to `false`.
- **allowedImageMimeTypes?**: `string[]` - Restrict which image MIME types can be uploaded when `enableUpload` is on. When provided, it **overrides** the default image list entirely (values are used as-is for both the file picker `accept` and validation, and may include types outside the SDK defaults). When omitted or empty, all default image types are accepted (`image/jpeg`, `image/jpg`, `image/png`, `image/gif`, `image/webp`).
- **allowedDocumentMimeTypes?**: `string[]` - Restrict which document MIME types can be uploaded when `enableDocumentUpload` is on. When provided, it **overrides** the default document list entirely and validation switches to MIME-only matching (the extension-based fallback is dropped). When omitted or empty, the default document list with extension fallback is used.
- **maintainConnectionWhenClosed?**: `boolean` - Maintain connection when chat is closed, defaults to `false`
- **keepConnectionOnUnmount?**: `boolean` - Keep the in-flight SSE run alive when the chatbot unmounts (e.g. the user navigates to another in-app page) instead of aborting it, so that round can finish on the backend. The detached connection cleans itself up once the run completes, or after a safety timeout if it never finishes. Only covers in-app unmounts — a full page reload / tab close / network loss still tears the connection down. Defaults to `false`
- **loadingComponent?**: `ReactNode` - Custom loading component
- **asyncInitializers?**: `Record<string, () => Promise<unknown>>` - Asynchronous initializers for app initialization before rendering any component. Good for loading data or other async operations as the initial state. It only works when `enableLoadConfigFromService` is set to `true`.
- **customChannelId**: `string` - Custom channel identifier for the chat session
- **initMessages**: `ConversationMessage[]` - Initial messages to display in the chat
- **fullScreen**: `boolean` - Display chatbot in full screen mode, defaults to `false`
- **avatar**: `string` - URL for the chatbot's avatar image
- **botTypingPlaceholder**: `string` - **Deprecated (since 0.3.x)**. No longer renders anything and will be removed in a future major. The run-in-progress cue is now a connection-bound running indicator shown automatically at the thread↔input seam — there is no prop to configure it.
- **locale?**: `Locale` - UI language for built-in synthesized text — tool-call labels (`Read {file}`, `Wrote {file}`, …), the tool-call group summary, expanded Initial/Result titles, and the Task / Subagent panels. One of `'en-US' | 'ja-JP' | 'zh-TW'`; defaults to `'en-US'`. `Locale` and the `t()` helper are exported from `@asgard-js/react`.
- **channelTitle?**: `string | null` - Seed for the reactive channel-title row rendered at the thread top (F-016). Typically the `title` returned by `client.channelMetadata()`. `null` = unnamed.
- **renderTitle?**: `(props: ChannelTitleRendererProps) => ReactNode` - Custom renderer for the thread-top channel-title row (F-017). `props` is `{ title: string | null; renderDefault: () => ReactNode }` — return your own node, call `renderDefault()` for the built-in row, or return `null` to hide it. Distinct from `renderHeader` (the bot-name header).
- **untitledLabel?**: `string` - Placeholder shown in the channel-title row when the title is unnamed (`null`). Defaults to `'新對話'`.
- **channelTitleHidden?**: `boolean` - Hide the channel-title row entirely (shortcut for `renderTitle` returning `null`).
- **inputPlaceholder**: `string` - Custom placeholder text for the message input field
- **defaultLinkTarget?**: `'_blank' | '_self' | '_parent' | '_top'` - Default target for opening URIs when not specified by the API. Defaults to `'_blank'` (opens in new tab).
- **className?**: `string` - Custom CSS class name applied to the chatbot container element.
- **style?**: `CSSProperties` - Custom inline styles applied to the chatbot container element.
- **theme**: `Partial<AsgardThemeContextValue>` - Custom theme configuration
- **autoResetChannel?**: `boolean` - Whether to open the conversation automatically when the channel does not exist yet. Defaults to `true`. When set to `false`, the channel is created without any SSE request, preserving history messages loaded via `initMessages`. An **existing** channel is always restored regardless of this flag. See [Auto Reset Channel](#auto-reset-channel) section for details.
- **userIdentityHint?**: `string` - Optional user identity hint. When provided, all requests (SSE and file upload) will include the `X-ASGARD-USER-IDENTITY-HINT` header with this value.
- **onMessageSent?**: `() => void` - Callback fired after a message is successfully sent. Useful for tracking message count or triggering side effects.
- **onChannelReady?**: `() => void` - Callback fired once the chat channel is ready to accept messages. Use this instead of polling for `sendMessage` availability when you need to send an initial message right after the chatbot mounts. Re-fires after channel reset. See [On Channel Ready](#on-channel-ready) section for details.
- **onReset**: `() => void` - Callback function when chat is reset
- **onClose**: `() => void` - Callback function when chat is closed
- **authState?**: `AuthState` - Authentication state for dynamic API key management. Available states: `'loading'`, `'needApiKey'`, `'authenticated'`, `'error'`, `'invalidApiKey'`, `'subscriptionExpired'`, `'botNotFound'`
- **onApiKeySubmit?**: `(apiKey: string) => Promise<void>` - Callback function when user submits API key for authentication
- **onAuthError?**: `(error: { isAuthError: boolean; isBotProviderError: boolean; errorDetail?: unknown }) => void` - Callback fired when authentication or bot provider initialization fails. Useful for logging or showing a custom error UI.
- **onSseError?**: `(error: unknown) => void` - Callback fired when the SSE connection encounters an error.
- **onErrorClick?**: `(message: ConversationErrorMessage) => void` - Callback fired when the user clicks on an error message bubble. Useful for retry or diagnostic flows.
- **errorMessageRenderer?**: `(message: ConversationErrorMessage) => ReactNode` - Custom renderer for error message bubbles. When provided, completely replaces the default error UI.
- **onTemplateBtnClick?**: `(payload: Record<string, unknown>, eventName: string, raw: string) => void` - Callback for EMIT button actions. See [EMIT Action](#emit-action) section for details.
- **messageActions?**: `(message: ConversationBotMessage) => MessageActionConfig[]` - Function to define which action buttons to display for each bot message. Returns an array of `{ id: string, label: string }` objects. See [Message Actions](#message-actions) section for details.
- **onMessageAction?**: `(actionId: string, message: ConversationBotMessage) => void` - Callback when a message action button is clicked. Receives the action ID and the associated bot message.
- **renderHeader?**: `() => ReactNode` - Custom header renderer. When provided, completely replaces the default header. Use `useAsgardContext()` inside the render function to access `resetChannel`, `isResetting`, and other internal state.
- **renderMenu?**: `() => ReactNode` - Custom menu renderer. When provided, renders content between the chat body and footer. Useful for quick menus, suggested questions, or navigation panels. See [Custom Menu](#custom-menu) section for details.
- **footerEndActions?**: `ReactNode[]` - Extra action nodes rendered at the end of the footer input row, after the send/mic button. Pure additive slot — built-in textarea / attachment buttons / send / mic remain unchanged. See [Footer End Actions](#footer-end-actions) section for details.
- **renderFooter?**: `() => ReactNode` - Custom footer renderer. When provided, completely replaces the default footer — built-in textarea, send/mic, upload, export, IME guard, and `footerEndActions` are not rendered. Use `useAsgardContext()` to access `sendMessage`, `isConnecting`, `pendingInputValue` / `setPendingInputValue`, etc. See [Custom Footer](#custom-footer) section for details.
- **renderMessageContent?**: `(props: MessageContentRendererProps) => ReactNode` - Custom renderer for message content. Allows customizing how messages are rendered based on message properties. See [Custom Message Renderer](#custom-message-renderer) section for details.
- **renderToolCallGroup?**: `(props: ToolCallGroupRendererProps) => ReactNode` - Custom renderer for tool call group. Return `null` to hide, return JSX to fully customize, or call `renderDefaultContent()` to use the default UI with optional overrides (e.g., `renderDefaultContent({ title: 'AI is thinking...' })`). See [Tool Call Group Renderer](#tool-call-group-renderer) section for details.
- **onBeforeSendMessage?**: `(params: SendMessageParams) => SendMessageParams` - Callback to modify message params before sending. Allows injecting contextual data (payload, metadata) from parent components. See [Before Send Message Hook](#before-send-message-hook) section for details.
- **onSseMessage**: `(response: SseResponse, ctx: { conversation: Conversation | null }) => void` - Callback fired on every SSE message. `ctx.conversation` is the conversation state at the time the event fires. Combine with `ref.current.serviceContext.sendMessage` to trigger follow-up messages programmatically.
- **ref**: `ForwardedRef<ChatbotRef>` - Forwarded ref to access the chatbot instance. It can be used to access the chatbot instance and do some actions like sending messages to the bot. `ChatbotRef` provides `serviceContext` for interacting with the chatbot, and `setInputValue(value: string)` for programmatically setting the textarea text from outside the component.

<a id="theme-configuration"></a>
<br/>

### Theme Configuration

The theme configuration can be obtained from the bot provider metadata of `annotations` field and `theme` props.

The priority of themes is as follows (high to low):

1. Theme from props
2. Theme from annotations from bot provider metadata
3. Default theme

#### Theme colors propagate to design tokens (since 0.3.x)

A few `chatbot`-level colors are wired to the SDK's `--asg-color-*` design tokens, so setting them recolors the **whole** chat surface — not just the message bubbles and buttons. This is what makes the newer surfaces (the connection-bound running indicator, the composer input, the channel-title bar, tool-call groups, the thinking block, and the Task / Subagent panels) follow your theme:

| Theme setting                        | Design tokens it drives                                                                                           |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `chatbot.primaryComponent.mainColor` | `--asg-color-primary` (+ a derived darker hover/active shade)                                                     |
| `chatbot.backgroundColor`            | `--asg-color-bg` and `--asg-color-surface` (surface = one step lighter; tool-call / thinking / panel backgrounds) |
| `chatbot.borderColor`                | `--asg-color-border` / `--asg-color-divider` (and the tool-call / thinking-block borders)                         |

Tokens are injected only when the theme supplies a concrete color — a `#rrggbb` hex, or a non-`var()` border — so the derived surface/border/hover shades can be computed; otherwise the built-in defaults are kept.

### Theme Interface

> The authoritative, always-current definition is the exported `AsgardThemeContextValue` type (`packages/react/src/context/asgard-theme-context.tsx`). The block below is an illustrative outline of its shape.

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
    AttachmentMessageTemplate: Partial<{ style: CSSProperties }>;

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
    contentMaxWidth: '800px', // exported as `DEFAULT_CONTENT_MAX_WIDTH`
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
    AttachmentMessageTemplate: {
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

<a id="hooks"></a>
<br/>

## Hooks

<a id="use-asgard-context"></a>
<br/>

### useAsgardContext()

Returns the internal service context. Use this inside `renderHeader`, `renderFooter`, `renderMenu`, or any component rendered within the Chatbot tree to access runtime state and actions.

```typescript
import { useAsgardContext } from '@asgard-js/react';

function MyCustomFooter() {
  const { sendMessage, isConnecting, pendingInputValue, setPendingInputValue } = useAsgardContext();
  // ...
}
```

#### Return Value

**State**

| Property                   | Type                                       | Description                                                                                                                                                                   |
| -------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `avatar`                   | `string \| undefined`                      | Avatar URL passed to the Chatbot, or loaded from the bot provider metadata.                                                                                                   |
| `title`                    | `string \| undefined`                      | Chatbot title passed to the Chatbot, or loaded from the bot provider metadata.                                                                                                |
| `client`                   | `AsgardServiceClient \| null`              | The underlying core client instance, or `null` before the channel is initialized.                                                                                             |
| `customChannelId`          | `string \| undefined`                      | The active channel identifier.                                                                                                                                                |
| `isOpen`                   | `boolean`                                  | Whether the chatbot is currently open/visible.                                                                                                                                |
| `isResetting`              | `boolean`                                  | Whether a channel reset is in progress. Use to disable reset buttons during reset.                                                                                            |
| `isConnecting`             | `boolean`                                  | Whether the SSE channel is currently processing a message. Use to disable the send button. Note this is true for four unrelated things — see `runStatus`.                     |
| `runStatus`                | `RunStatus`                                | Which run holds the connection and where it is in the stop lifecycle. See [Stopping generation](#stopping-generation).                                                        |
| `isRunning`                | `boolean`                                  | Whether something is actually being generated. Narrower than `isConnecting`, which is also true while a finished conversation is merely replayed on rejoin.                   |
| `canStop`                  | `boolean`                                  | Whether a stop control belongs on screen — true only for the user's own turn, never the welcome run, a rejoin, or a nudge.                                                    |
| `isStopping`               | `boolean`                                  | Whether a stop was requested and the terminal event has not arrived yet. **Gate every send entrance on this** as well as `isConnecting`.                                      |
| `canForceStop`             | `boolean`                                  | Whether the stop has waited past the timeout and the control should escalate to force-stop. Implies `isStopping`.                                                             |
| `messages`                 | `Map<string, ConversationMessage> \| null` | All messages in the current conversation. `null` before the channel is initialized.                                                                                           |
| `conversation`             | `Conversation \| null`                     | The current `Conversation` instance (the derivation source for the Task / Subagent panels). `null` before the channel is initialized.                                         |
| `channelTitle`             | `string \| null`                           | The current channel title, seeded from metadata and updated live by `title.update`. `null` = unnamed.                                                                         |
| `botTypingPlaceholder`     | `string \| undefined`                      | **Deprecated (since 0.3.x)** — no longer renders anything (see the `botTypingPlaceholder` prop). Kept only for backward compatibility.                                        |
| `inputPlaceholder`         | `string \| undefined`                      | Textarea placeholder text (from props or bot provider metadata).                                                                                                              |
| `enableUpload`             | `boolean \| undefined`                     | Whether image upload is enabled (resolved from props / bot provider metadata).                                                                                                |
| `enableExport`             | `boolean \| undefined`                     | Whether conversation export is enabled.                                                                                                                                       |
| `enableDocumentUpload`     | `boolean \| undefined`                     | Whether document upload is enabled.                                                                                                                                           |
| `allowedImageMimeTypes`    | `string[] \| undefined`                    | Resolved image MIME allow-list (from the `allowedImageMimeTypes` prop). `undefined` means all defaults are accepted.                                                          |
| `allowedDocumentMimeTypes` | `string[] \| undefined`                    | Resolved document MIME allow-list (from the `allowedDocumentMimeTypes` prop). `undefined` means the default list with extension fallback is used.                             |
| `pendingConsent`           | `ToolCallConsentEventData \| null`         | The pending tool-call consent prompt awaiting a user decision, or `null`. Read this to build a custom consent UI.                                                             |
| `messageBoxBottomRef`      | `RefObject<HTMLDivElement \| null>`        | Ref to the sentinel element at the bottom of the message list.                                                                                                                |
| `scrollContainerRef`       | `RefObject<HTMLDivElement \| null>`        | Ref to the scrollable message container.                                                                                                                                      |
| `isFollowingLatest`        | `boolean`                                  | Whether auto-scroll to the latest message is active. Becomes `false` when the user scrolls up.                                                                                |
| `pendingInputValue`        | `string \| null`                           | Text waiting to be filled into the textarea. Set by `ChatbotRef.setInputValue()` or by `renderMenu`. Read and clear this in `renderFooter` to receive externally pushed text. |

**Actions**

| Property                     | Type                                                              | Description                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sendMessage`                | `((params: SendMessageParams) => Promise<void>) \| undefined`     | Send a message through the channel. `undefined` while the channel is not yet ready or in preview mode — always guard with `?.()`.                                                                                                                                                                                                                                                                                           |
| `resetChannel`               | `(() => void) \| undefined`                                       | Clear the conversation and start over on the same id: `DELETE /channel`, then an opening turn that triggers a new welcome message. If the delete fails nothing is sent and the current conversation stays on screen (the error reaches `onSseError`).                                                                                                                                                                       |
| `deleteChannel`              | `(() => Promise<void>) \| undefined`                              | Delete the channel and nothing else — no opening turn, and the on-screen conversation is left as it is. This is what makes "clear, then send with an attachment" possible: `deleteChannel()` → `client.uploadFile()` → `sendMessage({ blobIds })`. Resolves once the backend confirms the teardown (up to about a minute if a Sandbox has to terminate); rejects if it fails.                                               |
| `closeChannel`               | `(() => void) \| undefined`                                       | Close the SSE connection without resetting.                                                                                                                                                                                                                                                                                                                                                                                 |
| `stopGeneration`             | `((options?: { force?: boolean }) => Promise<void>) \| undefined` | Ask the backend to stop the in-flight run. Resolving means _accepted_, not _stopped_; rejects if the request failed. Gate on `canStop`.                                                                                                                                                                                                                                                                                     |
| `replyToolCallConsents`      | `((answers, payload?) => Promise<void>) \| undefined`             | Reply to the pending tool-call consent prompt (see `pendingConsent`). Used to build a custom consent UI. `undefined` before the channel is ready.                                                                                                                                                                                                                                                                           |
| `nudge`                      | `((payload?) => Promise<void>) \| undefined`                      | Wake an idle / recycled sandbox with an invisible `action=NUDGE` turn — nothing is rendered in the thread; watch `sandboxPhase` and `useLaunchedSandboxes()` for the result. Runs through `onBeforeSendMessage`, so a session-level payload attaches on its own; the argument is an extra the callback receives as `params.payload`. Takes a parameter, so bind it as `onClick={() => nudge?.()}`, never `onClick={nudge}`. |
| `scrollToBottom`             | `(behavior?: ScrollBehavior) => void`                             | Scroll the message list to the bottom. Also resumes auto-scroll (`isFollowingLatest → true`).                                                                                                                                                                                                                                                                                                                               |
| `programmaticScrollToBottom` | `(behavior?: ScrollBehavior) => void`                             | Scroll to bottom without affecting `isFollowingLatest`.                                                                                                                                                                                                                                                                                                                                                                     |
| `setFollowingLatest`         | `(value: boolean) => void`                                        | Manually set auto-scroll state.                                                                                                                                                                                                                                                                                                                                                                                             |
| `setPendingInputValue`       | `(value: string \| null) => void`                                 | Push text into the textarea from outside. Clear it (`null`) after reading in `renderFooter`.                                                                                                                                                                                                                                                                                                                                |

<a id="event-handlers"></a>
<br/>

## Event Handlers

<a id="on-channel-ready"></a>
<br/>

### On Channel Ready

The `onChannelReady` callback fires once the chat channel is fully initialized and ready to accept messages. This is useful when you need to send an initial message right after the chatbot mounts — for example, when seeding a chat with a SQL statement carried over from another page.

#### Why not call `sendMessage` from a `useEffect`?

Channel initialization happens asynchronously after mount. The `serviceContext.sendMessage` exposed via `ref` becomes a function before the underlying channel is actually ready, so calling it too early results in a silent no-op. `onChannelReady` solves this by guaranteeing the callback fires only after the channel can receive messages.

#### Behavior

- Fires once after the channel is created and the imperative ref has been updated
- Re-fires after a manual `resetChannel` (channel transitions from non-null → null → non-null)
- Inside the callback, `ref.current.serviceContext.sendMessage` is guaranteed to be a working function bound to the new channel

#### Usage Example

```tsx
import { Chatbot, ChatbotRef } from '@asgard-js/react';
import { useCallback, useRef } from 'react';

function MyChatbot({ initialText }: { initialText?: string }) {
  const chatbotRef = useRef<ChatbotRef>(null);

  const handleChannelReady = useCallback(() => {
    if (initialText) {
      chatbotRef.current?.serviceContext?.sendMessage?.({
        text: initialText,
        blobIds: [],
      });
    }
  }, [initialText]);

  return (
    <Chatbot
      ref={chatbotRef}
      config={{ botProviderEndpoint: '...' }}
      customChannelId="my-channel"
      onChannelReady={handleChannelReady}
    />
  );
}
```

#### Single-fire vs. Re-fire

If you want the work to happen only on the first ready (not after subsequent resets), use a ref guard in your callback:

```tsx
const firedRef = useRef(false);
const handleChannelReady = useCallback(() => {
  if (firedRef.current) return;
  firedRef.current = true;
  // do one-time work here
}, []);
```

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

The `onBeforeSendMessage` prop allows you to modify outbound parameters before they are sent. This is useful for injecting contextual data from parent components into every outbound turn.

#### When it fires

It is not only user sends. The callback runs on **four** paths:

| Path                                       | `params.text`   | Notes                                                                           |
| ------------------------------------------ | --------------- | ------------------------------------------------------------------------------- |
| `sendMessage`                              | the user's text | The only path carrying real user input.                                         |
| `resetChannel`                             | `''`            | Also the automatic opening turn on mount — `autoResetChannel` defaults to true. |
| Tool-call consent reply (Allow / Deny)     | `''`            |                                                                                 |
| `nudge` — wake an idle sandbox (invisible) | `''`            |                                                                                 |

On the three textless paths `params.blobIds` is `undefined` and **only the returned `payload` is used** — `text` / `blobIds` from your return value are dropped there. They are not distinguishable from one another inside the callback.

Two consequences worth designing for:

- **Side effects fire on all four.** Analytics calls, one-shot flags consumed on invocation, or state resets inside the callback will run on a sandbox nudge and on the mount-time reset, not just when the user presses send. Branch on intent (e.g. `if (!params.text && !params.blobIds?.length) return params;`) if that is not what you want.
- **Your return value replaces the payload wholesale.** Spread `params.payload` if a caller may have supplied one (`serviceContext.nudge(payload)` does); otherwise it is silently discarded.

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

<a id="footer-end-actions"></a>
<br/>

### Footer End Actions

The `footerEndActions` prop appends extra nodes at the **end of the footer input row**, after the send/mic button. Pure additive slot — the built-in textarea, attachment buttons, send button, mic button, drag-and-drop, IME composition guard, image preview, and document upload all stay untouched.

Use this for actions that complement the send flow but aren't replacements for it — for example a button that opens a fullscreen SQL editor modal, a "switch to voice mode" toggle, or a settings popover.

#### Usage Example

```typescript
import { useRef, useState } from 'react';
import { Chatbot, ChatbotRef } from '@asgard-js/react';

const App = () => {
  const chatbotRef = useRef<ChatbotRef>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  return (
    <>
      <Chatbot
        ref={chatbotRef}
        config={{
          apiKey: 'your-api-key',
          botProviderEndpoint: 'https://api.asgard-ai.com/ns/{namespace}/bot-provider/{botProviderId}',
        }}
        customChannelId="your-channel-id"
        footerEndActions={[
          <button key="sql" onClick={() => setEditorOpen(true)} title="Open SQL editor">
            SQL
          </button>,
        ]}
      />
      {editorOpen && (
        <SqlEditorModal
          onSubmit={text => {
            chatbotRef.current?.serviceContext?.sendMessage?.({ text });
            setEditorOpen(false);
          }}
          onCancel={() => setEditorOpen(false)}
        />
      )}
    </>
  );
};
```

#### Notes

- Items render at the trailing end of the footer input row (after send/mic). They do **not** participate in the attachment-buttons collapse-into-`+`-menu logic on the leading side.
- Each item is a plain `ReactNode`; the consumer fully controls styling. Match the height of the built-in send/mic button (~36px) so the row stays visually consistent.
- Avoid passing many items — the row width is finite and overflow will squeeze the textarea.
- Use `chatbotRef.current?.serviceContext?.sendMessage` (or `useAsgardContext()` inside a wrapper component) to send messages from the consumer-owned UI that the action triggers (e.g. modal Submit button).
- Distinct from `customActions` (header trailing): `customActions` appends to the **header** title bar, `footerEndActions` appends to the **footer** input row.

<a id="custom-footer"></a>
<br/>

### Custom Footer

The `renderFooter` prop completely replaces the default `<ChatbotFooter />`. Reach for it when you need to redesign the entire input area — for example a single-line input, a custom voice-only flow, or a different layout. If you only need to add a button next to send, use [`footerEndActions`](#footer-end-actions) instead, which keeps every built-in feature intact.

What `renderFooter` removes from the default footer:

- Built-in textarea (with auto-resize)
- Send button, microphone button
- Image upload, document upload, conversation export
- IME composition guard (skip submit while composing)
- The `footerEndActions` slot

The container-level drag-and-drop overlay still appears when `enableUpload` or `enableDocumentUpload` is set, but textarea-side file handling is gone. If your custom footer needs to react to dropped files, read them from `useFileDropContext()`.

Use `useAsgardContext()` to access runtime state:

- `sendMessage(params)` — submit a message (`undefined` in preview mode, e.g. while config is loading)
- `isConnecting` — disable send while the channel is busy
- `isStopping` — **also** disable send while a stop is pending; see [Stopping generation](#stopping-generation). Replacing the default footer means you own the stop button too
- `canStop` / `canForceStop` / `stopGeneration` — render your own stop control
- `pendingInputValue` / `setPendingInputValue` — receive values pushed in via `ChatbotRef.setInputValue` or `renderMenu` selection, then clear them
- `inputPlaceholder`, `title`, `avatar`, `messages`, etc.

Use `useAsgardThemeContext()` for theme tokens to stay visually consistent with the rest of the chatbot.

#### Usage Example

```typescript
import { useEffect, useRef, useState } from 'react';
import { Chatbot, ChatbotRef, useAsgardContext } from '@asgard-js/react';

function CustomFooter() {
  const { sendMessage, isConnecting, pendingInputValue, setPendingInputValue, inputPlaceholder } = useAsgardContext();

  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Receive text pushed in via ChatbotRef.setInputValue or renderMenu
  useEffect(() => {
    if (pendingInputValue == null) return;
    setValue(pendingInputValue);
    setPendingInputValue(null);
    textareaRef.current?.focus();
  }, [pendingInputValue, setPendingInputValue]);

  const submit = () => {
    const text = value.trim();
    if (!text || isConnecting) return;
    sendMessage?.({ text });
    setValue('');
  };

  return (
    <div style={{ display: 'flex', gap: 8, padding: '8px 12px' }}>
      <textarea
        ref={textareaRef}
        placeholder={inputPlaceholder ?? 'Type a message...'}
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => {
          // Skip submit while IME is composing
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          }
        }}
        rows={1}
        style={{ flex: 1 }}
      />
      <button onClick={submit} disabled={!value.trim() || isConnecting}>
        Send
      </button>
    </div>
  );
}

const App = () => {
  const chatbotRef = useRef<ChatbotRef>(null);

  return (
    <Chatbot
      ref={chatbotRef}
      config={{
        apiKey: 'your-api-key',
        botProviderEndpoint: 'https://api.asgard-ai.com/ns/{namespace}/bot-provider/{botProviderId}',
      }}
      customChannelId="your-channel-id"
      renderFooter={() => <CustomFooter />}
    />
  );
};
```

#### Notes

- `renderFooter` is a full replacement, not an additive slot. If you only want to add buttons after send, use [`footerEndActions`](#footer-end-actions).
- When `renderFooter` is provided, `footerEndActions` is silently ignored.
- `sendMessage` is `undefined` while the chatbot is in preview / not yet connected — guard with `?.()` and disable your submit UI until it's defined.
- The `<ToolCallConsentGate />` is rendered outside `renderFooter`, so tool-call consent modals still appear normally.

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

On mount the Chatbot first asks `GET /channel/metadata` whether the channel exists. An **existing** channel is always restored — its history is never wiped, whatever this flag says. Only when the channel does **not** exist does `autoResetChannel` apply: `true` (the default) opens the conversation with an `action=NONE` turn so the server can send a welcome message, and `false` skips that, letting you load history via `initMessages` and continue.

> The opening turn used to be a `RESET_CHANNEL` action. It no longer is: `RESET_CHANNEL` is deprecated and the SDK never sends it. Opening a channel that does not exist needs no delete, and the header's reset button now issues an explicit `DELETE /channel` before it opens. Nothing in this prop's name or meaning changed — only the wire.

#### Behavior Comparison

|                      | `autoResetChannel={true}` (default)           | `autoResetChannel={false}`          |
| -------------------- | --------------------------------------------- | ----------------------------------- |
| On mount, exists     | Restores (title seed + transcript replay)     | Restores — identical                |
| On mount, not exists | Opens with `action=NONE` via SSE (no delete)  | Creates channel without SSE request |
| Server state         | New channel, server sends a welcome message   | Channel state is preserved          |
| Display              | `initMessages` + server welcome message       | Only `initMessages` (history)       |
| First SSE connection | Immediately on mount                          | When user sends the first message   |
| Header reset button  | Works (`DELETE /channel`, then `action=NONE`) | Still works (manual reset)          |

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

<a id="stopping-generation"></a>
<br/>

### Stopping generation

The built-in footer already handles this — **if you use the default footer you get it for free**, and
this section is only background. It matters if you replace the footer with `renderFooter`, or build
send entrances of your own.

Runs execute in the background on the server, so stopping is a request to the backend rather than a
local disconnect, and it completes asynchronously. `stopGeneration()` resolving means the request was
**accepted**; the run is only actually stopped when the SSE stream reaches its terminal event. Between
those two moments the channel is in `isStopping`.

**Two rules for a custom footer:**

1. **Gate every send entrance on `isStopping`, not just `isConnecting`.** The old run has not finished
   yet, and sending would leave two concurrent runs writing to the same transcript. Keep the user's
   draft — do not clear it.
2. **Only show a stop control when `canStop`.** `isConnecting` is true for four unrelated things: the
   user's own turn, the opening welcome run, a transcript rejoin, and an invisible nudge. Only the
   first is stoppable. `canStop` encodes exactly that.

```typescript
function CustomFooter() {
  const { sendMessage, isConnecting, isStopping, canStop, canForceStop, stopGeneration } = useAsgardContext();

  const [value, setValue] = useState('');
  const canSend = !isConnecting && !isStopping && value.trim().length > 0;

  const onStop = (): void => {
    // A DOM handler cannot reject. On failure the SDK rolls the phase back to idle, so the control
    // simply becomes pressable again — await it instead if you want to surface the error yourself.
    void stopGeneration?.({ force: canForceStop }).catch(() => undefined);
  };

  if (canStop || isStopping) {
    return (
      <button onClick={onStop} disabled={isStopping && !canForceStop}>
        {canForceStop ? 'Force stop' : isStopping ? 'Stopping…' : 'Stop'}
      </button>
    );
  }

  return (
    <button onClick={() => sendMessage?.({ text: value })} disabled={!canSend}>
      Send
    </button>
  );
}
```

`canForceStop` turns on ~10s after an accepted stop whose terminal event never arrived; pressing again
then passes `force: true`, telling the backend to abandon the run. Normal stops never reach this.

As a backstop, `sendMessage()` rejects with `ChannelBusyError` if a run is in flight, and refuses before
the optimistic user bubble is pushed — a rejected send leaves no trace in the thread.

The conversation survives a stop: the transcript is kept, the suspended turn is rolled back, and the
next message continues the same conversation. See the
[core README](../core/README.md#stopping-generation) for the underlying lifecycle.

<a id="sourceset-file-explorer"></a>
<br/>

## SourceSet File Explorer

`SourceSetFileExplorer` browses and edits a **SourceSet volume** directly. There is no chat, no channel
and no sandbox involved: it replaces the "spin up a throwaway vscode sandbox just to edit one file" flow
on screens that only need a file manager. Mount it anywhere — it reads no Chatbot context.

```tsx
import { SourceSetFileExplorer } from '@asgard-js/react';
import '@asgard-js/react/style';

<SourceSetFileExplorer
  sourceSetEndpoint="https://api.asgard-ai.com/ns/my-ns/source-set/my-set/volume"
  apiKey={volumeApiKey}
  rootPath=""
  initialPath="notes"
  readOnly={false}
  locale="zh-TW"
  onError={error => console.error(error)}
/>;
```

### Four ways to mount it

The same component serves every consumer; only the props differ.

| Consumer                  | `sourceSetEndpoint`                                   | Auth prop                                                |
| ------------------------- | ----------------------------------------------------- | -------------------------------------------------------- |
| Direct to the edge server | `{EDGE}/ns/{namespace}/source-set/{name}/volume`      | `apiKey` — the SourceSet volume API key                  |
| Platform / SourceSet      | `{PLATFORM_API}/v1/source-set/{source_set_id}/volume` | `customHeaders` with an `Authorization: Bearer …` header |
| Platform / SkillSet       | `{PLATFORM_API}/v1/skill-set/{skill_set_id}/volume`   | `customHeaders` with an `Authorization: Bearer …` header |
| Agent Hub / Directory     | `{HUB_API}/v1/directory/{directory_id}/volume`        | `customHeaders` with an `Authorization: Bearer …` header |

Three things are worth reading before you wire one up.

**Do not pass `apiKey` to a BFF relay.** The volume API key is a backend credential and the relay holds
its own copy; putting it in `apiKey` ships it to the browser, where anyone can read it out of the network
tab. Against a relay, authenticate the user with `customHeaders` and let the relay authenticate itself.

**Agent Hub's Directory paths are already prefixed by the BFF.** The relay mounts the volume under
`directory/{id}/`, so a path you send is relative to _that directory_, not to the SourceSet volume root.
The component does not add a prefix, and neither should you.

**There is no watch.** A volume is served by several replicas and exposes no change stream, so the
component never subscribes to one. Freshness comes from the refresh button in the toolbar, which reloads
the visible tree and any file open in the viewer. If a consumer needs changes pushed, that is a backend
capability the volume API does not have today.

### Props

| Prop                | Type                                            | Default            | Description                                                                                                                                                                                                                                                                                                                                      |
| ------------------- | ----------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `sourceSetEndpoint` | `string`                                        | —                  | **Required.** The `…/volume` endpoint. A trailing slash is tolerated.                                                                                                                                                                                                                                                                            |
| `apiKey`            | `string`                                        | —                  | Sent as `X-API-KEY`. Direct-to-edge only.                                                                                                                                                                                                                                                                                                        |
| `customHeaders`     | `Record<string, string>`                        | —                  | Merged into every request, e.g. `Authorization`.                                                                                                                                                                                                                                                                                                 |
| `rootPath`          | `string`                                        | `''` (volume root) | Locks the tree to a subtree; the user cannot browse above it.                                                                                                                                                                                                                                                                                    |
| `initialPath`       | `string`                                        | —                  | Expanded and selected on mount.                                                                                                                                                                                                                                                                                                                  |
| `readOnly`          | `boolean`                                       | `false`            | Removes every mutating action, including the viewer's edit entry point.                                                                                                                                                                                                                                                                          |
| `locale`            | `'en-US' \| 'ja-JP' \| 'zh-TW'`                 | `'en-US'`          | UI language.                                                                                                                                                                                                                                                                                                                                     |
| `theme`             | `SourceSetExplorerTheme`                        | —                  | Overrides for the `--asg-*` tokens the component paints with.                                                                                                                                                                                                                                                                                    |
| `maxEntries`        | `number`                                        | `10000`            | Ceiling on one directory's auto-paging walk.                                                                                                                                                                                                                                                                                                     |
| `onError`           | `(error: unknown) => void`                      | —                  | Called on every failed operation, alongside the in-component message.                                                                                                                                                                                                                                                                            |
| `uploadConcurrency` | `number`                                        | `3`                | Ceiling on writes in flight during a batch upload. The pool backs off on its own when the volume answers `429`, then eases back up; this is the ceiling it eases back up _to_. There is no batch endpoint — two hundred files is two hundred requests — so a BFF relay in front of the volume may want a lower number than the edge server does. |
| `extraEntryActions` | `(entry: FsEntry \| null) => ContextMenuItem[]` | —                  | Host rows appended to the right-click menu, above `Refresh`. Called with the selected entry, or `null` when nothing is selected. Not called at all while `readOnly`.                                                                                                                                                                             |
| `entryBadge`        | `(entry: FsEntry) => ReactNode`                 | —                  | Host decoration for the right of a row's name; return `null` to leave the row untouched. Purely visual — it adds no click target, so a click still reaches the row — and unlike `extraEntryActions` it keeps rendering while `readOnly`.                                                                                                         |

Paths are **volume-relative and the root is the empty string** — `notes/todo.md`, never `/notes/todo.md`.
A leading slash, a trailing slash, a doubled slash or a `.` / `..` segment is rejected by the volume.

### Uploading

The toolbar's upload button opens a two-row menu — **files** or **folder** — because the two pickers
genuinely see different things: the folder picker walks a whole tree but can never return an empty
directory, while a drag from the desktop preserves empty folders. Both land in the same queue, and the
panel as a whole is the drop target, not just the tree.

A batch runs through a worker pool (see `uploadConcurrency`) that backs off when the volume answers
`429` and eases back up afterwards. Progress is a docked panel below the tree rather than an overlay —
browsing while a batch runs is the normal case — showing `n / N`, per-file state, and a cancel that
interrupts requests already in flight rather than just refusing to start new ones.

A name collision does **not** abort the rest of the batch. The queue asks once, offers
overwrite / skip / rename, and can apply that answer to every remaining conflict in the same batch.

Where a batch lands follows the selection: the selected directory, else the tree root. Click the tree's
empty space or press `Esc` to drop the selection and send the next batch to the root — the same gesture
also returns the selection-only toolbar actions (download / copy / cut / rename / delete) to disabled.

### Large directories

A volume lists with real pagination, so the component walks the pages for you rather than showing a
silent first thousand. A directory node spins while its walk runs, and when the walk stops short — the
`maxEntries` cap, or a backend that stops producing before its own reported total — the node says how
many entries are missing instead of presenting a partial listing as the whole thing.

### Theming

The component paints with the same `--asg-color-*` / `--asg-font-family-*` tokens as the in-sandbox File
Explorer, so the two match wherever a host shows both. Every token has a built-in fallback, so it renders
fully without any theme at all; pass `theme` to override individual tokens.

```tsx
<SourceSetFileExplorer
  sourceSetEndpoint={endpoint}
  apiKey={key}
  theme={{ surface: '#0f1117', textPrimary: '#e6e8ee', border: '#2a2f3a', primary: '#5b8cff' }}
/>
```

Try it in the demo app at `/source-set-explorer`, which runs against an in-memory volume when no
endpoint is configured — see `apps/react-demo/.env.example`.

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
