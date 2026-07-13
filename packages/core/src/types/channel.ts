import { Observable, Observer } from 'rxjs';
import { EventType } from '../constants/enum';
import Conversation from '../lib/conversation';
import type { Subagent, Task } from '../lib/derived-state';
import { IAsgardServiceClient } from './client';
import { ErrorMessage, Message, SubagentStatus, ToolUseResultSidecar } from './sse-response';

export type ObserverOrNext<T> = Partial<Observer<T>> | ((value: T) => void);

export interface ChannelStates {
  isConnecting: boolean;
  conversation: Conversation;
  // Derived slices (F-013), folded from the same SSE stream. Existing consumers can ignore them;
  // each keeps a stable reference until its content changes.
  tasks: Task[];
  subagents: Subagent[];
  // Channel title (F-016): seeded from `GET /channel/metadata` on entry, then updated by the
  // ephemeral `channel.title.update` event. `null` = unnamed. Also exposed as a per-slice store.
  title: string | null;
}

/**
 * Framework-agnostic reactive store (F-013): a current immutable snapshot plus change notification.
 * Bridge it from any framework — React `useSyncExternalStore(subscribe, getSnapshot)`, Vue
 * `shallowRef` + subscribe, Svelte via the `observable`, Angular/RxJS via the `observable`, or a
 * vanilla `subscribe(() => render(getSnapshot()))`.
 */
export interface ReactiveStore<T> {
  /** The current, immutable value (a new reference whenever it changes). */
  getSnapshot(): T;
  /** Register a change listener (called on subsequent changes only); returns an unsubscribe fn. */
  subscribe(listener: () => void): () => void;
  /** The underlying RxJS stream, for consumers that prefer an `Observable` (Angular async pipe, Svelte). */
  observable: Observable<T>;
}

export interface ChannelConfig {
  client: IAsgardServiceClient;
  customChannelId: string;
  customMessageId?: string;
  conversation: Conversation;
  statesObserver?: ObserverOrNext<ChannelStates>;
  // Initial channel title (F-016), seeded from `GET /channel/metadata.title` on entry. `null` = unnamed.
  initialTitle?: string | null;
}

export type ConversationUserMessage = {
  type: 'user';
  messageId: string;
  text: string;
  blobIds?: string[];
  filePreviewUrls?: string[];
  documentNames?: string[];
  // Populated when the user turn comes from a transcript rejoin `asgard.message.user` (F-014).
  customMessageId?: string;
  identityHint?: string;
  time: Date;
  traceId?: string;
};

export type ConversationBotMessage = {
  type: 'bot';
  messageId: string;
  eventType: EventType;
  isTyping: boolean;
  typingText: string | null;
  message: Message;
  time: Date;
  traceId?: string;
  raw: string;
};

export type ConversationErrorMessage = {
  type: 'error';
  messageId: string;
  eventType: EventType;
  error: ErrorMessage;
  time: Date;
  traceId?: string;
};

export type ConversationThinkingMessage = {
  type: 'thinking';
  messageId: string;
  eventType: EventType;
  // Streaming while `thinking.delta`s arrive; false once `thinking.complete` materializes the terminal block.
  isStreaming: boolean;
  text: string;
  time: Date;
  traceId?: string;
};

export type ConversationToolCallMessage = {
  type: 'tool-call';
  messageId: string; // `${processId}-${callSeq}`
  eventType: EventType.TOOL_CALL_START | EventType.TOOL_CALL_COMPLETE;
  processId: string;
  callSeq: number;
  toolName: string;
  reason?: string;
  toolsetName: string;
  parameter: Record<string, unknown>;
  result?: Record<string, unknown>;
  isComplete: boolean;
  // Backend-authoritative failure flag (F-009); populated from `toolCallComplete.isError`.
  isError?: boolean;
  // Structured tool-result sidecar (F-010 / EXT-002); populated from `toolCallComplete.toolUseResultSidecar`.
  // Authoritative source for Task id + status; `reduceTasks` reads it before falling back to `parameter`.
  toolUseResultSidecar?: ToolUseResultSidecar;
  // Subagent association keys (F-012). `parentToolUseId` non-empty ⇒ a child of that subagent;
  // an `Agent` call carries its own `toolUseId` (= children's `parentToolUseId`).
  toolUseId?: string;
  parentToolUseId?: string;
  time: Date;
  traceId?: string;
};

// A spawned subagent's lifecycle, folded from `subagent.start` / `subagent.complete` and keyed by
// `parentToolUseId` (F-012). Surfaced into the conversation `messages` map (like tool-call messages)
// so consumers can derive the subagent list; routed OUT of the message thread. `status` is
// replay-safe: only `.complete` moves it terminal; a late/replayed `.start` never rolls it back.
export type ConversationSubagentMessage = {
  type: 'subagent';
  messageId: string; // = parentToolUseId
  eventType: EventType.SUBAGENT_START | EventType.SUBAGENT_COMPLETE;
  parentToolUseId: string;
  agentId?: string;
  subagentType?: string;
  description?: string;
  status: SubagentStatus;
  summary?: string;
  time: Date;
  traceId?: string;
};

export type ConversationMessage =
  | ConversationUserMessage
  | ConversationBotMessage
  | ConversationErrorMessage
  | ConversationThinkingMessage
  | ConversationToolCallMessage
  | ConversationSubagentMessage;
