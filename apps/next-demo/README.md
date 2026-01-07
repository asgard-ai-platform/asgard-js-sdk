# Next.js Demo App

This is a Next.js demo application for the Asgard JS SDK.

## Features

- Next.js 15 with App Router
- React 19
- TypeScript
- Tailwind CSS v4
- Path aliases with `~/*`
- ESLint configuration
- EMIT event handling support

## Getting Started

First, run the development server:

```bash
# From the root of the monorepo
npm run serve:next-demo

# Or directly in this directory
npm run dev
```

Open [http://localhost:4300](http://localhost:4300) with your browser to see the result.

## Project Structure

```
apps/next-demo/
├── src/
│   ├── app/          # App Router pages
│   └── components/   # Reusable components
├── public/           # Static assets
└── ...config files
```

## Path Aliases

This project uses `~/*` as a path alias for the `src/` directory:

```typescript
import Component from '~/components/Component';
import { utils } from '~/lib/utils';
```

## Button Actions

Button templates support the following action types:

- **MESSAGE**: Automatically sends a message to the bot when clicked. [Documentation](https://www.asgard-ai.com/docs/developer-reference/asgard-builtin/message-template-action-object-message)
- **URI**: Automatically opens a URL when clicked. [Documentation](https://www.asgard-ai.com/docs/developer-reference/asgard-builtin/message-template-action-object-uri)
- **EMIT**: Requires custom handling logic in your application. [Documentation](https://www.asgard-ai.com/docs/developer-reference/asgard-builtin/message-template-action-object-emit)

### EMIT Action

EMIT is a special action type that dispatches events to your application for custom handling. Unlike MESSAGE and URI actions which are handled automatically by the SDK, EMIT requires you to implement the `onTemplateBtnClick` callback.

When a user clicks an EMIT button, the SDK calls your `onTemplateBtnClick` callback function with the following parameters:

1. **`payload`** (optional): `Record<string, unknown>` - Custom data defined in the button action, or `{}` if not provided
2. **`options`**: An object containing:
   - **`eventName`** (required): `string` - The event name specified in the button action. If missing from backend, SDK passes empty string `''` as a safety mechanism
   - `sse.sendMessage`: Function to send messages back to the bot (optional, for advanced use cases)

**Important**: The SDK only dispatches the event. How you handle `eventName` and `payload` is completely your responsibility.

### EMIT Example

```typescript
import { useCallback } from 'react';

const handleTemplateBtnClick = useCallback(
  (
    payload: Record<string, unknown>,
    {
      eventName,
      sse,
    }: {
      eventName: string;
      sse: {
        sendMessage: (payload: { text: string; payload?: Record<string, unknown> }) => void;
      };
    },
  ): void => {
    switch (eventName) {
      case 'support_request':
        // Example: Show support request alert
        const category = payload.category as string;
        const priority = payload.priority as string;
        const payloadStr = JSON.stringify(payload, null, 2);
        window.alert(
          `Support request created\n\nCategory: ${category}\nPriority: ${priority}\n\nFull Payload:\n${payloadStr}`,
        );
        break;

      default:
        // Handle other eventNames or unknown events
        console.log('Received event:', eventName, 'with payload:', payload);
    }
  },
  [],
);

// Pass the handler to Chatbot
<Chatbot config={config} customChannelId={nanoid()} onTemplateBtnClick={handleTemplateBtnClick} />;
```

### Backend Configuration

In your backend SSE response, configure EMIT buttons according to the specification:

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
      },
      {
        "label": "Custom Action",
        "action": {
          "type": "EMIT",
          "eventName": "custom_action",
          "payload": {
            "actionType": "custom",
            "data": "example"
          }
        }
      }
    ]
  }
}
```

**Note**: The `payload` can contain any structured data you need. For a complete example with more fields, see the demo implementation in `apps/next-demo/src/app/api/mock-sse/message/sse/demo.txt`.

- `eventName` is required (use underscore-separated naming like `support_request`)
- `payload` is optional and can contain any structured data you need for your use case
- The SDK will pass these values to your `onTemplateBtnClick` callback
- If `eventName` is missing, the SDK passes an empty string (`''`) as a safety mechanism
- For a complete working example with detailed payload fields, check the demo implementation
