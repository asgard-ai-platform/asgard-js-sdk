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
    | TableMessageTemplate;
}

export type IsEqual<A, B, DataType> = A extends B ? (B extends A ? DataType : null) : null;

export interface MessageEventData {
  message: Message;
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
  toolCall: {
    toolsetName: string;
    toolName: string;
    parameter: Record<string, unknown>;
  };
}

export interface ToolCallCompleteEventData extends ToolCallBaseEventData {
  toolCallResult: Record<string, unknown>;
}

export interface ToolCallConsentPendingCall {
  toolCallId: string;
  toolsetName: string;
  toolName: string;
  parameter: Record<string, unknown>;
  alreadyAllowed: boolean;
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
  toolCallStart: IsEqual<Type, EventType.TOOL_CALL_START, ToolCallBaseEventData>;
  toolCallComplete: IsEqual<Type, EventType.TOOL_CALL_COMPLETE, ToolCallCompleteEventData>;
  toolCallConsent: IsEqual<Type, EventType.TOOL_CALL_CONSENT, ToolCallConsentEventData>;
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
