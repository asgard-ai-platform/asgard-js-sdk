import { EventType, MessageTemplateType } from '../constants/enum';

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

export interface Message<Payload = unknown> {
  messageId: string;
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
    | AttachmentMessageTemplate;
}

export type IsEqual<A, B, DataType> = A extends B ? (B extends A ? DataType : null) : null;

export interface MessageEventData {
  message: Message;
}

// The user's own turn, replayed on a transcript rejoin (F-014). Fields mirror asgard-core@dev-1.16.19
// `GenericBotSseEventFactUserMessage`.
export interface UserMessageEventData {
  messageId: string;
  text: string;
  identityHint?: string;
  customMessageId?: string;
  blobIds?: string[];
}

// The agent-updated channel title (F-016 consumes; type added with F-014 for enum/fact parity).
export interface ChannelTitleUpdateEventData {
  title: string;
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
  // Subagent association keys (F-012). `omitempty`: absent ⇒ a main-line tool call.
  // `toolUseId` identifies this call; a child call sets `parentToolUseId` to the spawning
  // `Agent` call's `toolUseId`. Confirmed against asgard-core@dev-1.16.19
  // (`internal/models/edgeserver.go`; EXT-003 closed).
  toolUseId?: string;
  parentToolUseId?: string;
  toolCall: {
    toolsetName: string;
    toolName: string;
    parameter: Record<string, unknown>;
    reason?: string;
  };
}

// The CLI's structured tool-result sidecar (asgard-core `toolUseResultSidecar`, the `tool_use_result`
// sibling on a user frame). Generic across tools; F-010 reads the Task shape so a UI can track a task
// list by a clean backend id instead of parsing the flattened result string:
//   TaskCreate → { task: { id, subject } }   TaskUpdate → { taskId, statusChange: { to } }
// Confirmed against asgard-core@dev-1.16.19 (`internal/models/edgeserver.go`; EXT-002).
export interface ToolUseResultSidecar {
  task?: { id?: string; subject?: string };
  taskId?: string;
  statusChange?: { from?: string; to?: string };
  [key: string]: unknown;
}

export interface ToolCallCompleteEventData extends ToolCallBaseEventData {
  toolCallResult: Record<string, unknown>;
  // Backend-authoritative failure flag (F-009). `omitempty` ⇒ absent means success.
  // Valid for native tools whose result is plain text (where `result.error` is not meaningful).
  isError?: boolean;
  // Structured tool-result sidecar (F-010 / EXT-002). Authoritative for Task ids + status changes.
  toolUseResultSidecar?: ToolUseResultSidecar;
}

// Terminal status of a subagent, from `subagent.complete.status` (F-012). A subagent stays
// running until `subagent.complete` lands. Confirmed against asgard-core@dev-1.16.19
// (`GenericBotSseEventFactSubagentComplete.status`; EXT-003 closed).
export type SubagentCompleteStatus = 'completed' | 'failed' | 'cancelled';

// Full subagent status incl. the in-flight `running` state (F-012/F-013).
export type SubagentStatus = 'running' | SubagentCompleteStatus;

// Shapes mirror asgard-core@dev-1.16.19 `internal/models/edgeserver.go`
// (`GenericBotSseEventFactSubagent{Start,Complete}`; EXT-003 closed).
export interface SubagentStartEventData {
  agentId: string;
  // Association key = the spawning `Agent` tool call's `toolUseId`; shared by every child event.
  parentToolUseId: string;
  subagentType?: string;
  description?: string;
}

// The backend's `SubagentComplete` carries no `description` (only `SubagentStart` does), so drop it.
export interface SubagentCompleteEventData extends Omit<SubagentStartEventData, 'description'> {
  status: SubagentCompleteStatus;
  summary?: string;
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

export interface ToolCallConsentAnswer {
  toolCallId: string;
  result: 'ALLOW_ONCE' | 'ALLOW_ALWAYS' | 'DENY_ONCE';
  denyReason: string;
}

export interface Fact<Type extends EventType> {
  runInit: null;
  runDone: null;
  runError: IsEqual<Type, EventType.ERROR, ErrorEventData>;
  messageStart: IsEqual<Type, EventType.MESSAGE_START, MessageEventData>;
  messageDelta: IsEqual<Type, EventType.MESSAGE_DELTA, MessageEventData>;
  messageComplete: IsEqual<Type, EventType.MESSAGE_COMPLETE, MessageEventData>;
  messageThinkingStart: IsEqual<Type, EventType.MESSAGE_THINKING_START, MessageEventData>;
  messageThinkingDelta: IsEqual<Type, EventType.MESSAGE_THINKING_DELTA, MessageEventData>;
  messageThinkingComplete: IsEqual<Type, EventType.MESSAGE_THINKING_COMPLETE, MessageEventData>;
  toolCallStart: IsEqual<Type, EventType.TOOL_CALL_START, ToolCallBaseEventData>;
  toolCallComplete: IsEqual<Type, EventType.TOOL_CALL_COMPLETE, ToolCallCompleteEventData>;
  toolCallConsent: IsEqual<Type, EventType.TOOL_CALL_CONSENT, ToolCallConsentEventData>;
  subagentStart: IsEqual<Type, EventType.SUBAGENT_START, SubagentStartEventData>;
  subagentComplete: IsEqual<Type, EventType.SUBAGENT_COMPLETE, SubagentCompleteEventData>;
  messageUser: IsEqual<Type, EventType.MESSAGE_USER, UserMessageEventData>;
  channelTitleUpdate: IsEqual<Type, EventType.CHANNEL_TITLE_UPDATE, ChannelTitleUpdateEventData>;
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
