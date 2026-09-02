import { EventType, MessageTemplateType } from '../constants/enum';
import { MessageBlob } from './blob';
import { SubagentTerminalStatus } from './subagent';

export interface Reference {
  title: string;
  uri?: string;
}

export interface MessageTemplate {
  quickReplies: { text: string }[];
  references?: Reference[];
}

export interface TextMessageTemplate extends MessageTemplate {
  type: MessageTemplateType.TEXT;
  text: string;
}

export interface HintMessageTemplate extends MessageTemplate {
  type: MessageTemplateType.HINT;
  text: string;
}

export interface ImageMessageTemplate extends MessageTemplate {
  type: MessageTemplateType.IMAGE;
  originalContentUrl: string;
  previewImageUrl: string;
}

export interface VideoMessageTemplate extends MessageTemplate {
  type: MessageTemplateType.VIDEO;
  originalContentUrl: string;
  previewImageUrl: string;
  duration: number;
}

export interface AudioMessageTemplate extends MessageTemplate {
  type: MessageTemplateType.AUDIO;
  originalContentUrl: string;
  duration: number;
}

export interface LocationMessageTemplate extends MessageTemplate {
  type: MessageTemplateType.LOCATION;
  title: string;
  text: string;
  latitude: number;
  longitude: number;
}

export interface ChartMessageTemplate extends MessageTemplate {
  type: MessageTemplateType.CHART;
  title: string;
  text: string;
  chartOptions: {
    type: string;
    title: string;
    spec: Record<string, unknown>;
  }[];
  defaultChart: string;
  quickReplies: { text: string }[];
}

export type TableColumnFormat = 'DATE' | 'DATE_TIME' | 'CURRENCY';

export type TableRowType = 'OBJECT' | 'ARRAY';

export interface TableColumn {
  header: string;
  key?: string;
  format?: TableColumnFormat;
}

export interface TablePagination {
  size: number;
}

export interface TableData {
  rowType: TableRowType;
  columns: TableColumn[];
  pagination: TablePagination | null;
  data: Record<string, unknown>[] | unknown[][];
  sql?: string;
  sqlExplanation?: string;
}

export interface TableMessageTemplate extends MessageTemplate {
  type: MessageTemplateType.TABLE;
  title: string;
  table: TableData;
}

export type ButtonAction =
  | {
      type: 'message' | 'MESSAGE';
      text: string;
      uri?: null;
    }
  | {
      type: 'uri' | 'URI';
      text?: null;
      uri: string;
      target?: '_blank' | '_self' | '_parent' | '_top';
    }
  | {
      type: 'emit' | 'EMIT';
      eventName?: string;
      payload?: Record<string, unknown>;
    };

export interface ButtonMessageTemplate extends MessageTemplate {
  type: MessageTemplateType.BUTTON;
  title: string;
  text: string;
  thumbnailImageUrl: string;
  imageAspectRatio: 'rectangle' | 'square';
  imageSize: 'cover' | 'contain';
  imageBackgroundColor: string;
  defaultAction: ButtonAction;
  buttons: { label: string; action: ButtonAction }[];
}

export interface CarouselMessageTemplate extends MessageTemplate {
  type: MessageTemplateType.CAROUSEL;
  columns: Omit<ButtonMessageTemplate, 'type' | 'quickReplies'>[];
}

export interface AttachmentMessageTemplate extends MessageTemplate {
  type: MessageTemplateType.ATTACHMENT;
  attachments: {
    title: string;
    text: string;
    defaultAction: ButtonAction;
    downloadAction?: ButtonAction;
  }[];
}

/** One offered choice of a {@link Question}. `description` explains what picking it means; may be absent. */
export interface QuestionOption {
  label: string;
  description?: string;
}

/**
 * One multiple-choice question of a {@link QuestionMessageTemplate}. The backend sends 1–4 per card
 * with 2–4 options each, but a renderer must not rely on those bounds.
 */
export interface Question {
  /** Full question text. Also the key when folding answers — the model matches on it verbatim. */
  question: string;
  /** Short chip label (~12 chars). May repeat across questions, so it is never an identity key. */
  header: string;
  multiSelect: boolean;
  options: QuestionOption[];
}

/**
 * A multiple-choice card the agent sends when it needs a decision rather than a guess.
 *
 * Answering is deliberately **not** a protocol handshake: the run that produced the card has already
 * finished, so a client folds the picks into plain text and posts them as an ordinary next user
 * message. Ignoring the card and typing something else is the same path, not an error path.
 *
 * `text` carries a plain-text rendering of the same questions so clients that do not know this
 * template fall back to it instead of showing an empty bubble.
 */
export interface QuestionMessageTemplate extends MessageTemplate {
  type: MessageTemplateType.QUESTION;
  text?: string;
  questions: Question[];
}

/**
 * A visual the agent drew: one self-contained HTML/SVG fragment.
 *
 * **The markup is untrusted.** It is generated per conversation and may contain `<style>` and
 * `<script>`, so injecting it into the host page would hand that page's origin — its cookies, its
 * storage, its DOM — to content the host did not author. It must be rendered in an isolated browsing
 * context with scripting allowed but same-origin access denied (in a browser: an iframe sandboxed
 * *without* `allow-same-origin`, fed by `srcdoc`). That isolation also keeps the fragment off the
 * network, which is expected — a canvas is authored to be self-contained.
 *
 * `html` is the complete fragment and is authoritative: the same markup also arrives beforehand as
 * incremental canvas deltas purely so the card can be shown taking shape, and a client that ignored
 * every delta renders the same document from this field alone.
 */
export interface CanvasMessageTemplate extends MessageTemplate {
  type: MessageTemplateType.CANVAS;
  /** Card title. The renderer shows only this — it must not extract a title from the markup. */
  title?: string;
  canvas: { html: string };
}

export interface Message<Payload = unknown> {
  messageId: string;
  // Non-empty when this frame belongs to a subagent (= the toolUseId of the Agent call that spawned it);
  // empty / absent for main-agent turns. The wire payload carries it; used to route subagent frames (BUG-001).
  parentToolUseId?: string;
  replyToCustomMessageId: string;
  text: string;
  payload: Payload | null;
  isDebug: boolean;
  idx: number | null;
  template:
    | TextMessageTemplate
    | HintMessageTemplate
    | ButtonMessageTemplate
    | ImageMessageTemplate
    | VideoMessageTemplate
    | AudioMessageTemplate
    | LocationMessageTemplate
    | CarouselMessageTemplate
    | ChartMessageTemplate
    | TableMessageTemplate
    | AttachmentMessageTemplate
    | QuestionMessageTemplate
    | CanvasMessageTemplate;
}

export type IsEqual<A, B, DataType> = A extends B ? (B extends A ? DataType : null) : null;

export interface MessageEventData {
  message: Message;
}

/**
 * Persist-only user turn, replayed on GET rejoin (F-014). Not echoed on a live POST, so the optimistic
 * user bubble and this replayed event must be de-duplicated by `messageId` / `customMessageId`.
 */
export interface MessageUserEventData {
  messageId: string;
  text: string;
  blobIds?: string[];
  /**
   * Renderable metadata for the same attachments `blobIds` points at — added alongside it, never
   * replacing it (#448). Absent on an old backend **and** on transcript rows written before the backend
   * started snapshotting it, which are not backfilled: an id with no entry here is all a renderer gets.
   */
  blobs?: MessageBlob[];
  customMessageId?: string;
  identityHint?: string;
}

export interface ErrorMessage {
  message: string;
  code: string;
  inner: string;
  location: {
    namespace: string;
    workflowName: string;
    processorName: string;
    processorType: string;
  };
}

export interface ErrorEventData {
  error: ErrorMessage;
}

export interface ToolCallBaseEventData {
  processId: string;
  callSeq: number;
  /** Correlation id of this tool-call. For an `Agent` spawn it becomes the subagent's `parentToolUseId` (F-012). */
  toolUseId?: string;
  /** Non-empty when this tool-call belongs to a subagent — points at the spawning `Agent`'s `toolUseId` (F-012). */
  parentToolUseId?: string;
  toolCall: {
    toolsetName: string;
    toolName: string;
    parameter: Record<string, unknown>;
    reason?: string;
  };
}

export interface ToolCallCompleteEventData extends ToolCallBaseEventData {
  toolCallResult: Record<string, unknown>;
  /**
   * Whether the tool call failed, as reported by the backend (`omitempty` → absent means `false`).
   * The authoritative failure signal across native / platform / general tools — native tools return a
   * plain-text `toolCallResult` with no `.error`, so the `result.error` heuristic can't detect their
   * failures (F-009).
   */
  isError?: boolean;
  /**
   * Structured, replay-safe companion to the human-readable `toolCallResult` string (F-010). The
   * authoritative source for `TaskCreate` / `TaskUpdate` accumulation: `TaskCreate` carries
   * `{ task: { id, subject } }` (the backend-assigned id), `TaskUpdate` carries
   * `{ statusChange: { from, to }, taskId }`. Never parse id / status out of `toolCallResult`.
   */
  toolUseResultSidecar?: Record<string, unknown>;
}

export interface ToolCallConsentPendingCall {
  toolCallId: string;
  toolsetName: string;
  toolName: string;
  parameter: Record<string, unknown>;
  alreadyAllowed: boolean;
  reason?: string;
}

export interface ToolCallConsentEventData {
  processId: string;
  pendingCalls: ToolCallConsentPendingCall[];
}

/**
 * `asgard.subagent.start` — a subagent has begun (F-012). Correlated to the spawning `Agent`
 * tool-call by `parentToolUseId`; `agentId` is the subagent's own id.
 */
export interface SubagentStartEventData {
  agentId: string;
  parentToolUseId: string;
  subagentType?: string;
  description?: string;
}

/**
 * `asgard.subagent.complete` — the authoritative terminal signal for a subagent (F-012). The `Agent`
 * tool-call's own completion is not it (async subagents complete with `status: "async_launched"`).
 */
export interface SubagentCompleteEventData {
  agentId: string;
  parentToolUseId: string;
  subagentType?: string;
  status: SubagentTerminalStatus;
  summary?: string;
}

export interface ToolCallConsentAnswer {
  toolCallId: string;
  result: 'ALLOW_ONCE' | 'ALLOW_ALWAYS' | 'DENY_ONCE';
  denyReason: string;
}

/**
 * `asgard.channel.title.update` — the backend pushes the current channel title on the live plane when
 * the topic becomes clear / drifts (F-016). Ephemeral: never persisted, so a rejoin replay does not
 * include it — the initial value comes from the `GET /channel/metadata` seed. `title: null` = unnamed.
 */
export interface ChannelTitleUpdateEventData {
  title: string | null;
}

/**
 * `asgard.prompt_suggestion` — the backend's prediction of what the user is likely to say next
 * (F-028). At most one per run, pushed after the reply and before the run's terminal event.
 * Ephemeral and live-only: never persisted, so a rejoin replay does not carry it — an absent
 * suggestion is the normal case, not a dropped frame. `suggestion` is always non-empty (the backend
 * drops empty predictions rather than emitting them) and is written in the conversation's language,
 * so the frontend never translates it.
 */
export interface PromptSuggestionEventData {
  suggestion: string;
}

/**
 * `asgard.sandbox.launch` / `asgard.sandbox.ready` — the backend cold-start signals for a compute
 * sandbox (F-018). Shape aligns with asgard-sdk-go `GenericBotSseEventFactSandbox{Launch,Ready}`.
 * Consumed by the sandbox-phase store that feeds the Launch HUD; carried on the run stream (replayed
 * on rejoin, so the derived phase is replay-safe).
 */
export interface SandboxEventData {
  sandboxName: string;
  blueprintName: string;
}

/** The two verdicts of a message feedback (F-033) — the exact wire literals, there is no third. */
export type FeedbackVerdict = 'GOOD' | 'BAD';

/**
 * `asgard.message.feedback` — a user's verdict on one assistant reply (F-033). `messageId` identifies
 * this feedback entry itself; `targetMessageId` is the rated reply (the `messageId` of its
 * `message.complete`). `text` is the optional comment. Delivered live **and** replayed on a GET rejoin;
 * append-only on the server, so when several frames target the same reply the latest one is the state
 * to render. Shape aligns with asgard-sdk-go `GenericBotSseEventFactMessageFeedback`.
 */
export interface MessageFeedbackEventData {
  messageId: string;
  targetMessageId: string;
  verdict: FeedbackVerdict;
  text?: string;
  identityHint?: string;
}

export interface Fact<Type extends EventType> {
  runInit: null;
  runDone: null;
  runError: IsEqual<Type, EventType.ERROR, ErrorEventData>;
  messageStart: IsEqual<Type, EventType.MESSAGE_START, MessageEventData>;
  messageDelta: IsEqual<Type, EventType.MESSAGE_DELTA, MessageEventData>;
  messageComplete: IsEqual<Type, EventType.MESSAGE_COMPLETE, MessageEventData>;
  messageUser: IsEqual<Type, EventType.MESSAGE_USER, MessageUserEventData>;
  messageFeedback: IsEqual<Type, EventType.MESSAGE_FEEDBACK, MessageFeedbackEventData>;
  // Extended-thinking stream reuses the message shape (reasoning text in `message.text`) — F-001.
  messageThinkingStart: IsEqual<Type, EventType.MESSAGE_THINKING_START, MessageEventData>;
  messageThinkingDelta: IsEqual<Type, EventType.MESSAGE_THINKING_DELTA, MessageEventData>;
  messageThinkingComplete: IsEqual<Type, EventType.MESSAGE_THINKING_COMPLETE, MessageEventData>;
  // Canvas stream reuses the message shape (F-030): deltas carry markup in `message.text`, and the
  // complete carries the whole fragment in `message.template`.
  messageCanvasStart: IsEqual<Type, EventType.MESSAGE_CANVAS_START, MessageEventData>;
  messageCanvasDelta: IsEqual<Type, EventType.MESSAGE_CANVAS_DELTA, MessageEventData>;
  messageCanvasComplete: IsEqual<Type, EventType.MESSAGE_CANVAS_COMPLETE, MessageEventData>;
  toolCallStart: IsEqual<Type, EventType.TOOL_CALL_START, ToolCallBaseEventData>;
  toolCallComplete: IsEqual<Type, EventType.TOOL_CALL_COMPLETE, ToolCallCompleteEventData>;
  toolCallConsent: IsEqual<Type, EventType.TOOL_CALL_CONSENT, ToolCallConsentEventData>;
  subagentStart: IsEqual<Type, EventType.SUBAGENT_START, SubagentStartEventData>;
  subagentComplete: IsEqual<Type, EventType.SUBAGENT_COMPLETE, SubagentCompleteEventData>;
  channelTitleUpdate: IsEqual<Type, EventType.CHANNEL_TITLE_UPDATE, ChannelTitleUpdateEventData>;
  promptSuggestion: IsEqual<Type, EventType.PROMPT_SUGGESTION, PromptSuggestionEventData>;
  sandboxLaunch: IsEqual<Type, EventType.SANDBOX_LAUNCH, SandboxEventData>;
  sandboxReady: IsEqual<Type, EventType.SANDBOX_READY, SandboxEventData>;
}

export interface SseResponse<Type extends EventType> {
  eventType: Type;
  requestId: string;
  traceId?: string;
  namespace: string;
  botProviderName: string;
  customChannelId: string;
  fact: Fact<Type>;
}
