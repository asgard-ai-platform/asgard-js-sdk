import { EventType, FetchSseAction } from '../constants/enum';
import { SseResponse, ToolCallConsentAnswer } from './sse-response';
import { EventHandler } from './event-emitter';
import { BlobUploadResponse } from './blob';

export interface CwdDownloadResult {
  blob: Blob;
  filename: string;
}

/** One entry in a sandbox directory listing (`GET /sandbox/{name}/fs/list`). Matches asgard-core `SandboxFsDirEntry`. */
export interface SandboxFsEntry {
  name: string;
  isDir: boolean;
  sizeBytes?: number;
  mtimeUnix?: number;
  mode?: number;
}

/** Result of `listSandboxFiles` — one directory's entries; `truncated` when the listing was capped. */
export interface SandboxFsListResult {
  entries: SandboxFsEntry[];
  truncated: boolean;
}

/**
 * Server-reported run state of a channel (F-015). Mirrors the backend
 * `ChannelRunState` enum returned by `GET /channel/metadata`.
 * - `IDLE`: no run in flight — a rejoin catches up to the collapsed history and closes immediately.
 * - `RUNNING`: a background run is streaming — a rejoin tails it to its terminal.
 * - `ERROR`: the last run ended in error.
 */
export type ChannelRunState = 'IDLE' | 'RUNNING' | 'ERROR';

/**
 * Result of `getChannelMetadata` (F-015). `exists` is the decision axis for the
 * mount lifecycle: an existing channel is restored (GET rejoin, never reset); a
 * missing one is either seeded (RESET_CHANNEL) or started empty.
 */
export interface ChannelMetadata {
  exists: boolean;
  customChannelId?: string;
  title?: string;
  runState?: ChannelRunState;
  lastActivityAt?: string;
}

export interface IAsgardServiceClient {
  fetchSse(payload: FetchSsePayload, options?: FetchSseOptions): void;
  /** GET rejoin (F-015): replay an existing channel's collapsed history, then tail to terminal. No body. */
  rejoinSse?(customChannelId: string, options?: FetchSseOptions): void;
  /** GET channel metadata (F-015): probe whether a channel exists and its run state, without mutating it. */
  getChannelMetadata?(customChannelId: string): Promise<ChannelMetadata>;
  /** Sandbox Browser: generate a one-time embed URL (Neko) for the sandbox — POST `/sandbox/{name}/browser/open-url`. */
  getSandboxBrowserUrl?(sandboxName: string): Promise<string>;
  /** Sandbox Files: list one directory — GET `/sandbox/{name}/fs/list?path=`. */
  listSandboxFiles?(sandboxName: string, path: string): Promise<SandboxFsListResult>;
  /** Sandbox Files: read a file's content as text — GET `/sandbox/{name}/fs/file?path=`. */
  readSandboxFile?(sandboxName: string, path: string): Promise<string>;
  uploadFile?(file: File, customChannelId: string): Promise<BlobUploadResponse>;
  downloadCwdFile?(relativePath: string, customChannelId: string): Promise<CwdDownloadResult>;
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
