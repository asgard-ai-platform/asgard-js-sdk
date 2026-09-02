import { Observer } from 'rxjs';
import { EventType } from '../constants/enum';
import Conversation from '../lib/conversation';
import { IAsgardServiceClient } from './client';
import { MessageBlob } from './blob';
import { ErrorMessage, FeedbackVerdict, Message } from './sse-response';
import { Subagent, SubagentTerminalStatus } from './subagent';
import { Task } from './task';

export type ObserverOrNext<T> = Partial<Observer<T>> | ((value: T) => void);

/**
 * Sandbox cold-start phase derived from the last sandbox event (F-018): `launching` after
 * `sandbox.launch`, `ready` after `sandbox.ready`, `idle` with no sandbox event (also reset on run
 * init / error). Feeds the Launch HUD latch on the react side.
 */
export type SandboxPhase = 'idle' | 'launching' | 'ready';

/**
 * One live sandbox in a channel, from `GET /channel/metadata` `launchedSandboxes[]` (F-019). A channel
 * may hold several at once (e.g. one running analysis, one driving a browser), so this is always handled
 * as a set — never assume a singleton. metadata (heartbeat-backed) is the sole authority on "who is live";
 * the `asgard.sandbox.launch` SSE event is only a hint.
 */
export interface LaunchedSandbox {
  /** Authoritative identity key — every fs / browser API call locates the sandbox by this. */
  sandboxName: string;
  /** The blueprint that created it — the display label (usually more readable than `sandboxName`). */
  sandboxBlueprintName: string;
  /** This sandbox's working directory (the File Explorer tree root, F-021). */
  workingDirectory: string;
  /** Whether the editor server is enabled (gates the "open editor" affordance). */
  editorServerEnabled: boolean;
  /** Whether the browser is enabled (gates the browser-handoff card, F-020). */
  browserEnabled: boolean;
}

/**
 * Which kind of run is currently holding the connection (F-023 AC8). `isConnecting` alone conflates
 * four unrelated sources, and only the first is the user's own turn — stop-generation must never fire
 * against a welcome message, a transcript replay, or an invisible nudge.
 *
 * - `user` — a turn the user dispatched (`sendMessage`, or a `tool_call.consent` reply continuing it).
 * - `reset` — the opening / welcome run (`Channel.open`, and the one `Channel.reset` dispatches after
 *   its delete). Not a turn the user asked for, so it is never stoppable.
 * - `restore` — a GET rejoin that is tailing a run still `RUNNING` on the server (F-014 / F-015).
 * - `replay` — a GET rejoin of a channel whose run has already finished: history is being loaded, but
 *   nothing is being generated, so no run-in-progress indicator belongs on screen (UC-046).
 * - `nudge` — the invisible `action=NUDGE` turn that wakes a recycled sandbox (F-021 AC4).
 */
export type RunKind = 'user' | 'reset' | 'restore' | 'replay' | 'nudge';

/**
 * The stop-generation lifecycle for the current run (F-023, UC-044). Stopping is asynchronous: the
 * suspend endpoint only reports "accepted", and the stop is declared later by the terminal event on
 * the already-open SSE stream.
 *
 * - `idle` — no stop requested.
 * - `stopping` — suspend accepted; waiting for the stream's terminal event. Send entrances are gated.
 * - `force-stoppable` — the terminal event has not arrived within `FORCE_STOP_TIMEOUT_MS`;
 *   the control becomes actionable again and re-calls the endpoint with `force=true`.
 */
export type StopPhase = 'idle' | 'stopping' | 'force-stoppable';

/**
 * The current run's identity and stop lifecycle (F-023) — the finer-grained companion to
 * `isConnecting`, exposed per-slice as `Channel.runStatus$`.
 */
export interface RunStatus {
  /** `null` when nothing is in flight. */
  kind: RunKind | null;
  stopPhase: StopPhase;
  /** The backend's id for this run, captured from its first frame; sent as `request_id` on suspend. */
  requestId?: string;
}

/** Options for {@link IAsgardServiceClient.suspendChannel} / `Channel.stopGeneration` (F-023). */
export interface StopGenerationOptions {
  /**
   * Give up on the run instead of letting it wind down (F-023 AC7). Only meant for the timeout
   * escape hatch — a normal stop lets the backend roll the turn back cleanly.
   */
  force?: boolean;
}

export interface ChannelStates {
  isConnecting: boolean;
  /** Which run holds the connection and where it is in the stop lifecycle (F-023). */
  runStatus: RunStatus;
  conversation: Conversation;
  /** Current Task Check List derived from the conversation (F-010; exposed as a store in F-013). */
  tasks: Task[];
  /** Current Subagent list derived from the conversation (F-012; exposed as a store in F-013). */
  subagents: Subagent[];
  /** Current channel title — seeded from metadata + updated by `title.update` (F-016). `null` = unnamed. */
  channelTitle: string | null;
  /** Current next-turn suggestion (F-028). `null` = none on offer, which is the normal case. */
  promptSuggestion: string | null;
  /** Current sandbox cold-start phase (F-018) — drives the Launch HUD. `idle` when no sandbox in flight. */
  sandboxPhase: SandboxPhase;
  /** Live sandboxes in this channel from the latest `/channel/metadata` (F-019). Empty when none live. */
  launchedSandboxes: LaunchedSandbox[];
}

export interface ChannelConfig {
  client: IAsgardServiceClient;
  customChannelId: string;
  customMessageId?: string;
  conversation: Conversation;
  /** Seed for the channel title store (F-016) — from `GET /channel/metadata` at join (wired by F-015). `null` = unnamed. */
  channelTitle?: string | null;
  /** Seed for the launchedSandboxes store (F-019) — from `GET /channel/metadata` at join. Reconciled on set. */
  launchedSandboxes?: LaunchedSandbox[];
  /**
   * The channel's run state from `GET /channel/metadata` at join (F-023 AC9 / UC-046). Decides whether
   * a `restore()` is tailing a live run or merely replaying a finished transcript — the latter must not
   * present as generation in progress. Defaults to `IDLE`.
   */
  runState?: ChannelRunState;
  statesObserver?: ObserverOrNext<ChannelStates>;
}

/** A channel's run state from `GET /channel/metadata` (F-015): `RUNNING` = a run is in flight. */
export type ChannelRunState = 'RUNNING' | 'IDLE';

/**
 * Channel metadata from `GET /channel/metadata` (F-015) — the join-init existence + restore gate.
 * Returned by `client.channelMetadata()` on `200`. A `404` (channel does not exist) is surfaced as
 * `channelMetadata()` returning `null`, which is distinct from a `200` carrying `title: null` (an
 * existing but unnamed channel). `title` seeds the channel-title store (F-016); `runState` describes
 * whether a run is still streaming when history is replayed (F-014).
 */
export interface ChannelMetadata {
  title: string | null;
  runState: ChannelRunState;
  lastActivityAt?: string;
  /** Live sandboxes in this channel (F-019) — the sole authority on "who is live". `[]` when none / old backend. */
  launchedSandboxes: LaunchedSandbox[];
}

export type ConversationUserMessage = {
  type: 'user';
  messageId: string;
  text: string;
  blobIds?: string[];
  /**
   * Attachment metadata carried by a replayed `message.user` (#448). `filePreviewUrls` /
   * `documentNames` below are the live-send equivalents — a consumer hands those in at `sendMessage`
   * time and they do not survive a reload, so on a replayed turn this is the only source.
   */
  blobs?: MessageBlob[];
  filePreviewUrls?: string[];
  documentNames?: string[];
  /** The client-sent id echoed back on GET rejoin — the dedup key vs the optimistic bubble (F-014). */
  customMessageId?: string;
  /** Identity hint carried by a replayed `message.user` (F-014). */
  identityHint?: string;
  /**
   * @deprecated The moment this frame was processed, not when the message was sent. A GET rejoin
   * replays history in one burst, so every replayed message carries the time the page opened (#422).
   * Nothing in the SDK renders it. The backend carries no per-message timestamp to replace it with.
   */
  time: Date;
  traceId?: string;
};

/**
 * The **current** rating of one assistant reply (F-033). The server is append-only (re-rating appends a
 * newer entry, latest wins, no un-rate), so this is the fold of every `asgard.message.feedback` frame
 * that targeted the reply — plus the one this client just posted — not the event stream itself.
 */
export interface MessageFeedbackState {
  verdict: FeedbackVerdict;
  /** The comment the user typed, when they typed one. */
  comment?: string;
}

export type ConversationBotMessage = {
  type: 'bot';
  messageId: string;
  eventType: EventType;
  isTyping: boolean;
  typingText: string | null;
  message: Message;
  /**
   * The reply's current rating (F-033), or absent when unrated. Restored from the server on rejoin —
   * never from local storage — and updated in place when this client's own `sendMessageFeedback`
   * succeeds.
   */
  feedback?: MessageFeedbackState;
  /**
   * @deprecated The moment this frame was processed, not when the message was sent. A GET rejoin
   * replays history in one burst, so every replayed message carries the time the page opened (#422).
   * Nothing in the SDK renders it. The backend carries no per-message timestamp to replace it with.
   */
  time: Date;
  traceId?: string;
  raw: string;
};

export type ConversationErrorMessage = {
  type: 'error';
  messageId: string;
  eventType: EventType;
  error: ErrorMessage;
  /**
   * @deprecated The moment this frame was processed, not when the message was sent. A GET rejoin
   * replays history in one burst, so every replayed message carries the time the page opened (#422).
   * Nothing in the SDK renders it. The backend carries no per-message timestamp to replace it with.
   */
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
  /** Backend-reported failure flag carried from `tool_call.complete` (F-009); absent until complete. */
  isError?: boolean;
  /**
   * Set when a still-running tool-call is force-settled by a user-initiated stop-generation (F-020 AC10):
   * the run was aborted before this call's `tool_call.complete` arrived, so it converges to `cancelled`
   * instead of lingering as `running`. Never set by a real terminal frame.
   */
  isCancelled?: boolean;
  /**
   * Structured result sidecar carried from `tool_call.complete` (F-010); the replay-safe source for
   * `TaskCreate` / `TaskUpdate` accumulation (id / status), read by `reduceTaskEvents`.
   */
  sidecar?: Record<string, unknown>;
  /** This tool-call's own correlation id; an `Agent` spawn's `toolUseId` becomes a subagent key (F-012). */
  toolUseId?: string;
  /** Non-empty when this tool-call belongs to a subagent (points at the `Agent`'s `toolUseId`) (F-012). */
  parentToolUseId?: string;
  isComplete: boolean;
  /**
   * @deprecated The moment this frame was processed, not when the message was sent. A GET rejoin
   * replays history in one burst, so every replayed message carries the time the page opened (#422).
   * Nothing in the SDK renders it. The backend carries no per-message timestamp to replace it with.
   */
  time: Date;
  traceId?: string;
};

/**
 * A subagent lifecycle event (F-012), stored so the react layer can fold `subagent.{start,complete}`
 * together with the ordered `Agent` / child tool-call messages into the current subagent list.
 * Keyed in the conversation Map by `subagent:${parentToolUseId}:${kind}` (start upserts, complete wins).
 */
export type ConversationSubagentMessage = {
  type: 'subagent';
  messageId: string;
  kind: 'start' | 'complete';
  parentToolUseId: string;
  agentId?: string;
  subagentType?: string;
  description?: string;
  /** Present on `complete`. */
  status?: SubagentTerminalStatus;
  summary?: string;
  /**
   * @deprecated The moment this frame was processed, not when the message was sent. A GET rejoin
   * replays history in one burst, so every replayed message carries the time the page opened (#422).
   * Nothing in the SDK renders it. The backend carries no per-message timestamp to replace it with.
   */
  time: Date;
  traceId?: string;
};

/**
 * Extended-thinking (reasoning) block (F-001), assembled from `message.thinking.{start,delta,complete}`.
 * Rendered as its own collapsible block, separate from the bot answer and tool-calls. `isThinking`
 * distinguishes the streaming state (auto-expanded "Thinking…") from the completed state (collapsed
 * "Thought for a moment"). No elapsed-time field — the completed summary is fixed and replay-safe.
 */
export type ConversationThinkingMessage = {
  type: 'thinking';
  messageId: string;
  text: string;
  isThinking: boolean;
  /**
   * @deprecated The moment this frame was processed, not when the message was sent. A GET rejoin
   * replays history in one burst, so every replayed message carries the time the page opened (#422).
   * Nothing in the SDK renders it. The backend carries no per-message timestamp to replace it with.
   */
  time: Date;
  traceId?: string;
};

/**
 * A visual the agent drew, folded from the `asgard.message.canvas.*` stream (F-030).
 *
 * `html` is an **untrusted** fragment: it is model-generated and may contain `<style>` and `<script>`,
 * so a renderer must isolate it (see `CanvasMessageTemplate`). While `isDrawing` is true the fragment
 * is a prefix that is still arriving; once `complete` lands it is the backend's authoritative markup.
 */
export type ConversationCanvasMessage = {
  type: 'canvas';
  messageId: string;
  html: string;
  title?: string;
  /** true = still arriving; false = the authoritative fragment has landed. */
  isDrawing: boolean;
  /**
   * @deprecated The moment this frame was processed, not when the message was sent. A GET rejoin
   * replays history in one burst, so every replayed message carries the time the page opened (#422).
   * Nothing in the SDK renders it. The backend carries no per-message timestamp to replace it with.
   */
  time: Date;
  traceId?: string;
};

export type ConversationMessage =
  | ConversationUserMessage
  | ConversationBotMessage
  | ConversationErrorMessage
  | ConversationToolCallMessage
  | ConversationThinkingMessage
  | ConversationSubagentMessage
  | ConversationCanvasMessage;
