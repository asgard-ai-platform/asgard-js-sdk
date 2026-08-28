# AsgardJs Core

This package contains the core functionalities of the AsgardJs SDK, providing essential tools for interacting with the Asgard AI platform through Server-Sent Events (SSE) and conversation management.

<a id="installation"></a>
<br/>

## Installation

To install the core package, use the following command:

```sh
npm install @asgard-js/core
```

<a id="usage"></a>
<br/>

## Usage

Here's a basic example of how to use the core package:

```javascript
import { AsgardServiceClient, FetchSseAction, EventType } from '@asgard-js/core';

const client = new AsgardServiceClient({
  apiKey: 'your-api-key',
  botProviderEndpoint: 'https://api.asgard-ai.com/ns/{namespace}/bot-provider/{botProviderId}',
  debugMode: true, // Enable to see deprecation warnings
});

// Use the client to send messages via SSE
client.fetchSse({
  customChannelId: 'your-channel-id',
  text: 'Hello, Asgard!',
  action: FetchSseAction.NONE,
});

// Upload files (optional, requires uploadFile method)
if (client.uploadFile) {
  const fileInput = document.querySelector('input[type="file"]');
  const file = fileInput.files[0];

  try {
    const uploadResponse = await client.uploadFile(file, 'your-channel-id');

    if (uploadResponse.isSuccess && uploadResponse.data[0]) {
      const blobId = uploadResponse.data[0].blobId;

      // Send message with uploaded file
      client.fetchSse({
        customChannelId: 'your-channel-id',
        text: 'Here is my image:',
        action: FetchSseAction.NONE,
        blobIds: [blobId],
      });
    }
  } catch (error) {
    console.error('File upload failed:', error);
  }
}

// Listen to events
client.on(EventType.MESSAGE, response => {
  console.log('Received message:', response);
});

client.on(EventType.DONE, response => {
  console.log('Conversation completed:', response);
});

client.on(EventType.ERROR, error => {
  console.error('Error occurred:', error);
});
```

<a id="migration-from-endpoint-to-botproviderendpoint"></a>
<br/>

## Migration from endpoint to botProviderEndpoint

**Important**: The `endpoint` configuration option is deprecated. Use `botProviderEndpoint` instead for simplified configuration.

### Before (Deprecated)

```javascript
const client = new AsgardServiceClient({
  apiKey: 'your-api-key',
  endpoint: 'https://api.asgard-ai.com/ns/{namespace}/bot-provider/{botProviderId}/message/sse',
  botProviderEndpoint: 'https://api.asgard-ai.com/ns/{namespace}/bot-provider/{botProviderId}',
});
```

### After (Recommended)

```javascript
const client = new AsgardServiceClient({
  apiKey: 'your-api-key',
  botProviderEndpoint: 'https://api.asgard-ai.com/ns/{namespace}/bot-provider/{botProviderId}',
  // SSE endpoint is automatically derived as: botProviderEndpoint + '/message/sse'
});
```

**Benefits:**

- Simplified configuration with single endpoint
- Reduced chance of configuration errors
- Automatic endpoint derivation

**Backward Compatibility:** Existing code using `endpoint` will continue to work but may show deprecation warnings when `debugMode` is enabled.

<a id="api-reference"></a>
<br/>

## API Reference

The core package exports three main classes for different levels of abstraction (`AsgardServiceClient`, `Channel`, `Conversation`), an `HttpError` class with an `isHttpError` type guard for HTTP failure handling, authentication types for dynamic API key management, and a set of framework-agnostic **derived-state** helpers (Task Check List / Subagent List) for headless / non-React consumers — see [Derived State](#derived-state):

<a id="asgardserviceclient"></a>
<br/>

### AsgardServiceClient

The main client class for interacting with the Asgard AI platform.

#### Constructor Options (ClientConfig)

- **apiKey**: `string` (optional) - API key for authentication. Can be provided later via dynamic authentication
- **botProviderEndpoint**: `string` (required) - Bot provider endpoint URL (SSE endpoint will be auto-derived)
- **endpoint?**: `string` (deprecated) - Legacy API endpoint URL. Use `botProviderEndpoint` instead.
- **debugMode?**: `boolean` - Enable debug mode for deprecation warnings, defaults to `false`
- **transformSsePayload?**: `(payload: FetchSsePayload) => FetchSsePayload` - SSE payload transformer
- **customHeaders?**: `Record<string, string>` - Custom headers to include in SSE and API requests (e.g., Bearer token via `Authorization` header)
- **userIdentityHint?**: `string` - Optional user identity hint. When provided, all requests will include the `X-ASGARD-USER-IDENTITY-HINT` header with this value
- **onRunInit?**: `InitEventHandler` - Handler for run initialization events
- **onMessage?**: `MessageEventHandler` - Handler for message events
- **onToolCall?**: `ToolCallEventHandler` - Handler for tool call events
- **onProcess?**: `ProcessEventHandler` - Handler for process events
- **onRunDone?**: `DoneEventHandler` - Handler for run completion events
- **onRunError?**: `ErrorEventHandler` - Error handler for execution errors

#### Methods

- **fetchSse(payload, options?)**: Send a message via Server-Sent Events. `payload.action` is a `FetchSseAction` value — `NONE` for a normal message (and for the opening turn of a new conversation), `RESPONSE_TOOL_CALL_CONSENT` to answer a consent prompt, `NUDGE` for an invisible sandbox wake. `RESET_CHANNEL` is **deprecated** and no longer sent by the SDK — see `deleteChannel` below
- **uploadFile(file, customChannelId)**: Upload file to Blob API and return BlobUploadResponse
- **downloadChannelHomeFile(relativePath, customChannelId)**: `Promise<ChannelHomeDownloadResult>` - Download a file from the channel's Channel Home file-exchange plane (backs `channel-home://` URI actions); resolves to `{ blob, filename }`
- **rejoinSse(customChannelId, options?)**: Cold-start transcript rejoin — a `GET /message/sse` with an empty `Last-Event-ID` that replays the channel's collapsed history through the same reducer, so a returning user sees their prior conversation without re-POSTing. Optional on `IAsgardServiceClient` for backward compatibility
- **deleteChannel(customChannelId)**: `Promise<void>` - End the conversation and release everything the channel holds — the in-flight run, transcript, uploaded blobs, tool-call allow-list, Sandbox and Channel Home — via `DELETE /channel`. Resolves once the teardown is **done** (up to about a minute when a live Sandbox has to terminate first, so do not impose a shorter timeout), after which the same `customChannelId` is a blank slate. Deleting a channel that does not exist is a success. Optional on `IAsgardServiceClient` for backward compatibility
- **channelMetadata(customChannelId)**: `Promise<ChannelMetadata | null>` - Join-init existence + restore gate — `GET /channel/metadata`; resolves to the metadata on `200`, `null` on `404` (channel does not exist), and rejects on any other error. `ChannelMetadata` is `{ title: string | null; runState: 'RUNNING' | 'IDLE'; lastActivityAt?: string }`. Optional on `IAsgardServiceClient` for backward compatibility
- **suspendChannel(customChannelId, options?)**: `Promise<void>` - Ask the backend to stop the channel's background run — `POST /message/suspend?custom_channel_id=…`, with optional `requestId` (stop only that run) and `force` (abandon it rather than let it wind down). Resolves on any 2xx **and** on `404` (channel never created = nothing to stop); rejects with `HttpError` otherwise. Resolving means _accepted_, not _stopped_ — see [Stopping generation](#stopping-generation). Optional on `IAsgardServiceClient` for backward compatibility
- **on(event, handler)**: Listen to a specific SSE event. `event` must be an `EventType` value (e.g. `EventType.MESSAGE`), not a plain string; registering a listener for an event replaces any previous one
- **detach({ timeoutMs })**: Detach from the owning component without aborting in-flight runs — the connection stays open so the backend can finish the current run, then auto-closes once all runs settle (or after `timeoutMs` as a safety net). Backs the React `keepConnectionOnUnmount` prop
- **close()**: Close the SSE connection and clean up resources (idempotent)

#### Event Types

Pass these `EventType` members (imported from `@asgard-js/core`) as the first argument to `on()`:

- **`EventType.INIT`** (`asgard.run.init`): Run initialization events
- **`EventType.MESSAGE`** (`asgard.message`): Message events (start, delta, complete)
- **`EventType.TOOL_CALL`** (`asgard.tool_call`): Tool call events (start, complete)
- **`EventType.TOOL_CALL_CONSENT`** (`asgard.tool_call.consent`): Tool call consent prompts awaiting a user decision
- **`EventType.PROCESS`** (`asgard.process`): Process events (start, complete)
- **`EventType.DONE`** (`asgard.run.done`): Run completion events
- **`EventType.ERROR`** (`asgard.run.error`): Error events

<a id="channel"></a>
<br/>

### Channel

Higher-level abstraction for managing a conversation channel with reactive state management using RxJS.

#### Static Methods

- **Channel.reset(config, payload?, options?)**: `Promise<Channel>` - Clear an **existing** conversation and start over on the same id: `client.deleteChannel()` first, and only once that resolves, a fresh channel opened with an `action=NONE` turn (the server replies with a welcome message). Nothing local is built until the delete succeeds, so a failed teardown leaves your current channel and conversation untouched. Rejects if the client cannot delete
- **Channel.open(config, payload?, options?)**: `Promise<Channel>` - Open a channel that does not exist yet with the same `action=NONE` turn, **without** deleting anything — the mount-time path for a `404` from `channelMetadata`
- **Channel.restore(config, options?)**: `Promise<Channel>` - Join an **existing** channel without resetting it — seeds the title from `config.channelTitle` and replays the server transcript via `rejoinSse`, preserving history / session / title. This is the join-without-wiping path behind the metadata-gated mount (F-015)
- **Channel.create(config)**: `Channel` - Create a channel and subscribe to its state without any SSE request (no reset, no rejoin); the first connection happens when you call `sendMessage`

#### Instance Methods

- **sendMessage(payload, options?)**: `Promise<void>` - Send a message through the channel
- **replyToolCallConsents(answers, options?, payload?)**: `Promise<void>` - Reply to a pending tool-call consent prompt. `answers` is an array of `ToolCallConsentAnswer` (each `{ toolCallId, result, denyReason }`, where `result` is a `ToolCallConsentResult` value)
- **stopGeneration(options?)**: `Promise<void>` - Ask the backend to stop the in-flight run. See [Stopping generation](#stopping-generation) — resolving means _accepted_, not _stopped_
- **getTasks() / getSubagents() / getChannelTitle() / getRunStatus()**: `Task[]` / `Subagent[]` / `string | null` / `RunStatus` - Current immutable snapshots of the derived state (for `getSnapshot()`-style bridging; see [Derived State](#derived-state))
- **setChannelTitle(title)**: `void` - Seed or override the reactive channel title (F-016)
- **close()**: `void` - Close the channel and cleanup subscriptions

#### Configuration (ChannelConfig)

- **client**: `IAsgardServiceClient` - Instance of AsgardServiceClient
- **customChannelId**: `string` - Unique channel identifier
- **customMessageId?**: `string` - Optional message ID
- **conversation**: `Conversation` - Initial conversation state
- **channelTitle?**: `string | null` - Seed for the reactive channel-title store (F-016), typically the `title` from `channelMetadata()`. `null` = unnamed
- **statesObserver?**: `ObserverOrNext<ChannelStates>` - Observer for channel state changes. `ChannelStates` carries `isConnecting`, `conversation`, and (since 0.3.x) the derived `tasks: Task[]`, `subagents: Subagent[]`, and `channelTitle: string | null`

#### Properties

- **customChannelId**: `string` - The channel identifier
- **customMessageId?**: `string` - Optional message identifier
- **tasks$**: `Observable<Task[]>` - Reactive Task Check List store; replays the current snapshot and emits only when the list changes (F-010 / F-013)
- **subagents$**: `Observable<Subagent[]>` - Reactive Subagent List store; replays the current snapshot and emits only when the list changes (F-012 / F-013)
- **channelTitle$**: `Observable<string | null>` - Reactive channel-title store; seeded from metadata, updated by `title.update` (F-016)
- **runStatus$**: `Observable<RunStatus>` - Which run holds the connection and where it is in the stop lifecycle; see [Stopping generation](#stopping-generation) (F-023)

#### Example Usage

```javascript
import { AsgardServiceClient, Channel, Conversation } from '@asgard-js/core';

const client = new AsgardServiceClient({
  botProviderEndpoint: 'https://api.example.com/bot-provider/123',
  apiKey: 'your-api-key',
});

const conversation = new Conversation({ messages: new Map() });

const channel = await Channel.reset({
  client,
  customChannelId: 'channel-123',
  conversation,
  statesObserver: states => {
    console.log('Connection status:', states.isConnecting);
    console.log('Messages:', Array.from(states.conversation.messages.values()));
  },
});

// Send a message
await channel.sendMessage({ text: 'Hello, bot!' });
```

<a id="stopping-generation"></a>
<br/>

### Stopping generation

Runs execute **in the background on the server**. Closing the SSE connection only stops _watching_ — the
agent keeps going, keeps spending tokens and keeps writing the transcript. So stopping is a request to
the backend, not a local disconnect, and it happens in two steps:

1. `stopGeneration()` asks the backend to suspend the run. **Resolving means the request was accepted,
   not that the run has stopped.** The SSE stream stays connected, because the stop is announced there.
2. The run winds down and the stream emits its terminal event — the _same_ event a normal run ends
   with. Only then does `isConnecting` go false and the input reopen. There is no new event type.

`runStatus$` (and the `getRunStatus()` snapshot) exposes the lifecycle:

```typescript
interface RunStatus {
  kind: 'user' | 'reset' | 'restore' | 'replay' | 'nudge' | null; // null = nothing in flight
  stopPhase: 'idle' | 'stopping' | 'force-stoppable';
  requestId?: string; // the backend's id for this run, captured from its first frame
}
```

**Only a `user` run is stoppable.** `isConnecting` is true for four unrelated things — the user's own
turn, the opening welcome run, a transcript rejoin, and an invisible nudge — and `kind` is what
tells them apart. `stopGeneration()` is a no-op for every kind but `user`. A `replay` (rejoining a
channel whose run already finished) is loading history, not generating, so it should not show a
run-in-progress indicator either.

```typescript
channel.runStatus$.subscribe(({ kind, stopPhase }) => {
  const canStop = kind === 'user' && stopPhase === 'idle';
  const isStopping = stopPhase !== 'idle';
  // Gate every send entrance on `isStopping`: the old run has not finished, and starting a second
  // one would leave two concurrent runs writing to the same transcript.
});

try {
  await channel.stopGeneration();
} catch (error) {
  // The request failed (network error, or a non-2xx that is not 404). `stopPhase` has already been
  // rolled back to `idle`, so the stop control is actionable again and the user can retry.
}
```

**Timeout escape hatch.** If the terminal event has not arrived ~10s after an accepted stop,
`stopPhase` becomes `force-stoppable`. Calling `stopGeneration({ force: true })` then tells the backend
to abandon the run instead of letting it wind down. Normal stops should never reach this.

**Sending while busy.** `sendMessage()` rejects with `ChannelBusyError` whenever a run is in flight,
including while stopping, and refuses _before_ the optimistic user bubble is pushed — so a rejected
send leaves no trace in the thread. Use `isChannelBusyError(error)` to detect it.

The conversation itself is unharmed: the transcript is kept, the suspended turn is rolled back, and the
next message continues the same conversation.

> Requires a client implementing `suspendChannel()` (`AsgardServiceClient` does; it POSTs to
> `${botProviderEndpoint}/message/suspend`). A custom `IAsgardServiceClient` without it falls back to
> the old local-abort behavior.

<a id="conversation"></a>
<br/>

### Conversation

Immutable conversation state manager that handles message updates and SSE event processing.

#### Constructor

- **constructor(options)**: Initialize conversation with `{ messages: Map<string, ConversationMessage> | null, pendingConsent?: ToolCallConsentEventData | null }`

#### Methods

- **pushMessage(message)**: `Conversation` - Add a new message (returns new instance)
- **onMessage(response)**: `Conversation` - Process an SSE response and update the conversation (returns new instance)
- **clearPendingConsent()**: `Conversation` - Clear the pending tool-call consent (returns new instance)

#### Properties

- **messages**: `Map<string, ConversationMessage> | null` - Map of all messages in the conversation
- **pendingConsent**: `ToolCallConsentEventData | null` - The tool-call consent prompt currently awaiting a user decision, or `null`

#### Message Types

- **ConversationUserMessage**: User-sent messages with `text` and `time`
- **ConversationBotMessage**: Bot responses with `message`, `isTyping`, `typingText`, `eventType`
- **ConversationToolCallMessage**: Tool-call entries with `toolName`, `reason`, `parameter`, `result`, `isComplete`, and (since 0.3.x) `isError` (backend failure flag, F-009), `toolUseId` / `parentToolUseId` (subagent correlation, F-012)
- **ConversationThinkingMessage**: Extended-thinking (reasoning) block with `text` and `isThinking`, rendered as a collapsible block separate from the answer (F-001)
- **ConversationSubagentMessage**: Subagent lifecycle entry with `kind` (`start` / `complete`), `parentToolUseId`, `status`, `summary` (F-012)
- **ConversationErrorMessage**: Error messages with `error` details

#### Example Usage

```javascript
import { Conversation } from '@asgard-js/core';

// Create new conversation
const conversation = new Conversation({ messages: new Map() });

// Add a user message
const userMessage = {
  messageId: 'msg-1',
  type: 'user',
  text: 'Hello',
  time: new Date(),
};

const updatedConversation = conversation.pushMessage(userMessage);
console.log('Messages:', Array.from(updatedConversation.messages.values()));
```

<a id="file-upload-api"></a>
<br/>

### File Upload API

The core package includes file upload capabilities for sending images through the chatbot.

```typescript
// Upload file and send message with attachment
const uploadResponse = await client.uploadFile(file, customChannelId);

if (uploadResponse.isSuccess && uploadResponse.data[0]) {
  const blobId = uploadResponse.data[0].blobId;

  client.fetchSse({
    customChannelId: 'your-channel-id',
    text: 'Here is my image',
    action: FetchSseAction.NONE,
    blobIds: [blobId],
  });
}
```

**Note**: `uploadFile` is optional - check `client.uploadFile` exists before use. Supports JPEG, PNG, GIF, WebP up to 20MB.

<a id="authentication-types"></a>
<br/>

### Authentication Types

The core package includes authentication-related types for dynamic API key management:

#### AuthState

Authentication state management for applications requiring dynamic API key input:

```typescript
type AuthState =
  | 'loading'
  | 'needApiKey'
  | 'authenticated'
  | 'error'
  | 'invalidApiKey'
  | 'subscriptionExpired'
  | 'botNotFound';
```

**States:**

- **`loading`**: Authentication in progress
- **`needApiKey`**: User needs to provide API key
- **`authenticated`**: Successfully authenticated
- **`error`**: General authentication error
- **`invalidApiKey`**: API key is invalid
- **`subscriptionExpired`**: The workspace subscription has expired
- **`botNotFound`**: The configured bot provider could not be found

**Usage:**

```typescript
import { AuthState } from '@asgard-js/core';

function handleAuthState(state: AuthState) {
  switch (state) {
    case 'needApiKey':
      // Show API key input interface
      break;
    case 'authenticated':
      // Initialize chatbot normally
      break;
    // Handle other states...
  }
}
```

<a id="error-handling"></a>
<br/>

### Error Handling (HttpError)

HTTP failures (for example a non-2xx response while authenticating) are surfaced as an `HttpError` instance. Both `HttpError` and the `isHttpError` type guard are re-exported from the package root:

```typescript
import { isHttpError } from '@asgard-js/core';

try {
  // ... a call that may reject with an HttpError
} catch (error) {
  if (isHttpError(error)) {
    console.error(error.status, error.statusText, error.body);
  }
}
```

`HttpError` extends `Error` with readonly `status: number`, `statusText: string`, and `body: unknown` (its `name` is `'HttpError'`).

<a id="tool-call-consent"></a>
<br/>

### Tool Call Consent

When a bot is configured to ask before running a tool, the backend emits an `EventType.TOOL_CALL_CONSENT` event. The pending request is exposed on `Conversation.pendingConsent`; reply to it with `Channel.replyToolCallConsents()`:

```typescript
import { ToolCallConsentResult } from '@asgard-js/core';

await channel.replyToolCallConsents([
  { toolCallId: 'call-1', result: ToolCallConsentResult.ALLOW_ONCE, denyReason: '' },
]);
```

**Related types:**

- **`ToolCallConsentResult`** (enum): `ALLOW_ONCE` | `ALLOW_ALWAYS` | `DENY_ONCE`
- **`ToolCallConsentPendingCall`**: `{ toolCallId, toolsetName, toolName, parameter, alreadyAllowed, reason? }`
- **`ToolCallConsentEventData`**: `{ processId, pendingCalls: ToolCallConsentPendingCall[] }`
- **`ToolCallConsentAnswer`**: `{ toolCallId, result, denyReason }`

<a id="channel-home-download-result"></a>
<br/>

### ChannelHomeDownloadResult

Returned by `client.downloadChannelHomeFile()`:

```typescript
interface ChannelHomeDownloadResult {
  blob: Blob;
  filename: string;
}
```

<a id="derived-state"></a>
<br/>

### AsgardSourceSetClient (SourceSet volume)

A **separate** client for the SourceSet volume HTTP API. It has nothing to do with
`AsgardServiceClient` — no inheritance, no shared instance, no channel. A volume is a plain remote
filesystem that is always there, so there is no lifecycle to coordinate with.

One instance serves every base, because the backend guarantees identical path segments after it:

| Endpoint                                       | Auth                                           |
| ---------------------------------------------- | ---------------------------------------------- |
| `{EDGE}/ns/{ns}/source-set/{name}/volume`      | `apiKey` → sent as `X-API-KEY`                 |
| `{PLATFORM_API}/v1/source-set/{id}/volume`     | `customHeaders: { Authorization: 'Bearer …' }` |
| `{PLATFORM_API}/v1/skill-set/{id}/volume`      | same                                           |
| `{HUB_API}/v1/directory/{directory_id}/volume` | same                                           |

**Do not pass `apiKey` to a relay.** The volume key belongs to the relay, which holds it server-side;
putting it in a browser bundle hands it to everyone who loads the page.

```ts
import { AsgardSourceSetClient } from '@asgard-js/core';

const fs = new AsgardSourceSetClient({
  sourceSetEndpoint: 'https://api.example.com/v1/source-set/ss-1/volume',
  customHeaders: { Authorization: `Bearer ${token}` },
});

const { entries, total, complete } = await fs.listAll(''); // '' is the volume root
await fs.write('notes/todo.md', '# Todo', { createOnly: true }); // 409 if it already exists
```

#### Four contract differences from the sandbox fs API

Code copied from `sandboxFs*` compiles and then misbehaves. These are the reasons:

1. **Paths are relative and the root is `''`**, not `/`. A leading or trailing slash, a doubled slash,
   or a `.` / `..` segment is rejected before the request rather than becoming a 400.
2. **Listing is paginated**, not truncation-flagged. `list()` returns one page; `listAll()` walks them.
3. **`stat()` on a missing path resolves** with `exists: false` — the backend answers 200, so branching
   on a thrown 404 never fires.
4. **409 means conflict** — `createOnly` on a taken path, or `copy` / `move` onto an occupied
   destination without `overwrite`. Detect it with `isHttpError(e) && e.status === 409`.

#### `listAll` tells you when it cannot vouch for a listing

```ts
const { entries, total, complete } = await fs.listAll('docs');
```

`complete` is `false` in three cases, and the caller is not meant to tell them apart — to a user they
all mean the same thing:

- the walk hit `maxEntries` (default `SOURCE_SET_DEFAULT_MAX_ENTRIES`, 10 000);
- the response carried no `paging` **and** a full page, so "is there more?" is unanswerable;
- a page came back indexed differently from the one requested, which makes every later page suspect.

`total` is the backend's own count, or `0` when it never gave one. So `!complete && total === 0` means
"short by an unknown amount" — surface that differently from a known shortfall rather than staying
quiet, which is the whole point.

**There is no watch.** A volume is served by several replicas, so a filesystem watch registered on one
cannot see another's writes, and the backend deliberately offers none. Re-list to pick up changes.

### Derived State (Task Check List / Subagent List)

The Task Check List (F-010) and Subagent List (F-012) are pure folds over the conversation, exposed as **framework-agnostic** reactive slices so you can render them outside React — in Vue, Svelte, or vanilla JS. Each slice replays its current immutable snapshot and only emits when that slice actually changes (unrelated high-frequency message deltas are suppressed).

The simplest path is the reactive stores already on `Channel` (`channel.tasks$`, `channel.subagents$`, `channel.channelTitle$`) plus the snapshot getters (`getTasks()`, `getSubagents()`, `getChannelTitle()`). To build the slices from a bare `conversation$` yourself, use `createDerivedStores(conversation$)`:

```typescript
import { createDerivedStores } from '@asgard-js/core';

const stores = createDerivedStores(conversation$);
// stores: { tasks$, subagents$, getTasks(), getSubagents(), teardown() }
const sub = stores.tasks$.subscribe(tasks => renderTaskList(tasks));
// ... later
sub.unsubscribe();
stores.teardown();
```

For one-shot derivation without subscriptions, `deriveTasks(conversation)` and `deriveSubagents(conversation)` return the current lists directly. Lower-level building blocks are also exported: the reducers `reduceTaskEvents` / `reduceSubagents`, the type guards `isTaskTool` / `isAgentTool` / `isSubagentChildTool`, the adapter `conversationToSubagentEvents`, the structural-equality helpers `tasksEqual` / `subagentsEqual`, and the types `Task`, `Subagent`, `DerivedStores`, `TaskToolEvent`, `SubagentEvent`.

> In React, prefer the `useTaskList(channel)`, `useSubagents(channel)`, and `useChannelTitle(channel)` hooks from `@asgard-js/react`, which bridge these stores into `useSyncExternalStore` for you.

<a id="development"></a>
<br/>

## Development

To develop the core package locally, follow these steps:

1. Clone the repository and navigate to the project root directory.

2. Install dependencies:

```sh
npm install
```

3. Start development:

You can use the following commands to work with the core package:

```sh
# Lint the core package
npm run lint:core

# Build the package
npm run build:core

# Watch mode for development
npm run watch:core
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

All builds will be available in the `dist` directory.

## Contributing

We welcome contributions! Please read our [contributing guide](../../CONTRIBUTING.md) to get started.

## License

This project is licensed under the MIT License - see the [LICENSE](../../LICENSE) file for details.
