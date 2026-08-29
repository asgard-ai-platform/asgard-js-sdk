import { Subscription } from 'rxjs';
import { EventType, FetchSseAction } from '../constants/enum';
import { SseResponse, ToolCallConsentAnswer } from './sse-response';
import { ChannelMetadata, StopGenerationOptions } from './channel';
import { EventHandler } from './event-emitter';
import { BlobUploadResponse } from './blob';

export interface ChannelHomeDownloadResult {
  blob: Blob;
  filename: string;
}

export interface IAsgardServiceClient {
  /**
   * Start an SSE run. Returns the run's `Subscription`; unsubscribing it aborts the in-flight
   * connection (used by user-initiated stop-generation). Callers that don't need to abort may ignore it.
   */
  fetchSse(payload: FetchSsePayload, options?: FetchSseOptions): Subscription;
  /** Cold-start transcript rejoin via GET /message/sse (F-014). Optional for backward compatibility. */
  rejoinSse?(customChannelId: string, options?: FetchSseOptions): Subscription;
  /**
   * Join-init existence + restore gate via `GET /channel/metadata` (F-015). Resolves to the metadata on
   * `200`, `null` on `404` (channel does not exist), and rejects on any other error. Optional for
   * backward compatibility — a client without it skips the metadata gate.
   */
  channelMetadata?(customChannelId: string): Promise<ChannelMetadata | null>;
  /**
   * Ask the backend to suspend the channel's background run (F-023 AC1) via
   * `POST {base}/message/suspend`. Resolving means **accepted**, not stopped — the stop is declared
   * later by the terminal event on the already-open SSE stream, so the caller must keep that stream.
   * Optional for backward compatibility — a client without it falls back to the legacy local abort.
   */
  suspendChannel?(customChannelId: string, options?: StopGenerationOptions & { requestId?: string }): Promise<void>;
  /**
   * End the conversation and release everything the channel holds (F-032) via
   * `DELETE {base}/channel?custom_channel_id=…`: the in-flight run, the transcript, uploaded blobs, the
   * tool-call allow-list, the Sandbox and the Channel Home. Resolving means the teardown is **done**,
   * not scheduled, so the same `customChannelId` is free to start over; deleting a channel that does not
   * exist is a success, not an error.
   *
   * May take up to about a minute when a live Sandbox has to terminate first — the wait is deliberate,
   * so the next turn does not race a dying pod. Callers must not impose a shorter timeout.
   *
   * Optional for backward compatibility — a hand-rolled client without it cannot be reset
   * ({@link Channel.reset} rejects rather than clearing the screen while the server keeps the old
   * conversation).
   */
  deleteChannel?(customChannelId: string): Promise<void>;
  uploadFile?(file: File, customChannelId: string): Promise<BlobUploadResponse>;
  downloadChannelHomeFile?(relativePath: string, customChannelId: string): Promise<ChannelHomeDownloadResult>;
}

export type InitEventHandler = EventHandler<SseResponse<EventType.INIT>>;
export type MessageEventHandler = EventHandler<
  SseResponse<EventType.MESSAGE_START | EventType.MESSAGE_DELTA | EventType.MESSAGE_COMPLETE>
>;
export type ProcessEventHandler = EventHandler<SseResponse<EventType.PROCESS_START | EventType.PROCESS_COMPLETE>>;
export type DoneEventHandler = EventHandler<SseResponse<EventType.DONE>>;
export type ErrorEventHandler = EventHandler<SseResponse<EventType.ERROR>>;
export type ToolCallEventHandler = EventHandler<SseResponse<EventType.TOOL_CALL_START | EventType.TOOL_CALL_COMPLETE>>;
export type ToolCallConsentEventHandler = EventHandler<SseResponse<EventType.TOOL_CALL_CONSENT>>;

export interface SseHandlers {
  onRunInit?: InitEventHandler;
  onMessage?: MessageEventHandler;
  onToolCall?: ToolCallEventHandler;
  onToolCallConsent?: ToolCallConsentEventHandler;
  onProcess?: ProcessEventHandler;
  onRunDone?: DoneEventHandler;
  onRunError?: ErrorEventHandler;
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
  /**
   * Optional user identity hint. When provided, all requests will include the
   * `X-ASGARD-USER-IDENTITY-HINT` header with this value.
   */
  userIdentityHint?: string;
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
  toolCallConsents?: ToolCallConsentAnswer[];
}

export interface FetchSseOptions {
  /**
   * How long (ms) SSE frames are gathered before being handed to the reducer and to `onSseMessage`.
   * Defaults to 50. This is the total latency the SDK adds, regardless of how many frames arrive in
   * the window — adjacent deltas of one message are coalesced rather than paced one by one. `0`
   * removes the wait entirely (frames are forwarded on the next tick).
   */
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
  [EventType.TOOL_CALL_CONSENT]: ToolCallConsentEventHandler;
  [EventType.DONE]: DoneEventHandler;
  [EventType.ERROR]: ErrorEventHandler;
};
