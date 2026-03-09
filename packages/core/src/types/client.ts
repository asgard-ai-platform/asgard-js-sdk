import { EventType, FetchSseAction } from '../constants/enum';
import { SseResponse } from './sse-response';
import { EventHandler } from './event-emitter';
import { BlobUploadResponse } from './blob';

export interface IAsgardServiceClient {
  fetchSse(payload: FetchSsePayload, options?: FetchSseOptions): void;
  uploadFile?(file: File, customChannelId: string): Promise<BlobUploadResponse>;
}

export type InitEventHandler = EventHandler<SseResponse<EventType.INIT>>;
export type MessageEventHandler = EventHandler<
  SseResponse<EventType.MESSAGE_START | EventType.MESSAGE_DELTA | EventType.MESSAGE_COMPLETE>
>;
export type ProcessEventHandler = EventHandler<SseResponse<EventType.PROCESS_START | EventType.PROCESS_COMPLETE>>;
export type DoneEventHandler = EventHandler<SseResponse<EventType.DONE>>;
export type ErrorEventHandler = EventHandler<SseResponse<EventType.ERROR>>;
export type ToolCallEventHandler = EventHandler<SseResponse<EventType.TOOL_CALL_START | EventType.TOOL_CALL_COMPLETE>>;
export type ViewUpdateEventHandler = EventHandler<SseResponse<EventType.VIEW_UPDATE>>;

export interface SseHandlers {
  onRunInit?: InitEventHandler;
  onMessage?: MessageEventHandler;
  onToolCall?: ToolCallEventHandler;
  onProcess?: ProcessEventHandler;
  onRunDone?: DoneEventHandler;
  onRunError?: ErrorEventHandler;
  onViewUpdate?: ViewUpdateEventHandler;
}

export type ClientConfig = SseHandlers & {
  apiKey?: string;
  debugMode?: boolean;
  transformSsePayload?: (payload: FetchSsePayload) => FetchSsePayload;
  /**
   * Custom headers to include in SSE and API requests.
   * Can be used to add Authorization headers (e.g., Bearer token) or other custom headers.
   * @example
   * customHeaders: {
   *   'Authorization': 'Bearer your-token',
   *   'X-Custom-Header': 'custom-value'
   * }
   */
  customHeaders?: Record<string, string>;
} & (
    | {
        /**
         * @deprecated Use `botProviderEndpoint` instead. This will be removed in the next major version.
         * If provided, it will be used. Otherwise, it will be automatically derived as `${botProviderEndpoint}/message/sse`
         */
        endpoint: string;
        /**
         * Base URL for the bot provider service.
         * The SSE endpoint will be automatically derived as `${botProviderEndpoint}/message/sse`
         */
        botProviderEndpoint?: string;
      }
    | {
        /**
         * Base URL for the bot provider service.
         * The SSE endpoint will be automatically derived as `${botProviderEndpoint}/message/sse`
         */
        botProviderEndpoint: string;
        /**
         * @deprecated Use `botProviderEndpoint` instead. This will be removed in the next major version.
         * If provided, it will be used. Otherwise, it will be automatically derived as `${botProviderEndpoint}/message/sse`
         */
        endpoint?: string;
      }
  );

export interface FetchSsePayload {
  customChannelId: string;
  customMessageId?: string;
  text: string;
  payload?: Record<string, unknown> | (() => Record<string, unknown>);
  action: FetchSseAction;
  blobIds?: string[];
}

export interface FetchSseOptions {
  delayTime?: number;
  onSseStart?: () => void;
  onSseMessage?: (response: SseResponse<EventType>) => void;
  onSseError?: (error: unknown) => void;
  onSseCompleted?: () => void;
}

export type SseEvents = {
  [EventType.INIT]: InitEventHandler;
  [EventType.PROCESS]: ProcessEventHandler;
  [EventType.MESSAGE]: MessageEventHandler;
  [EventType.TOOL_CALL]: ToolCallEventHandler;
  [EventType.DONE]: DoneEventHandler;
  [EventType.ERROR]: ErrorEventHandler;
  [EventType.VIEW_UPDATE]: ViewUpdateEventHandler;
};
