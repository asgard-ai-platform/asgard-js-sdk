import {
  ClientConfig,
  IAsgardServiceClient,
  FetchSsePayload,
  FetchSseOptions,
  SseResponse,
  SseEvents,
  BlobUploadResponse,
} from '../types';
import { createSseObservable } from './create-sse-observable';
import { concatMap, delay, of, retry, Subject, takeUntil } from 'rxjs';
import { EventType } from '../constants/enum';
import { EventEmitter } from './event-emitter';

export default class AsgardServiceClient implements IAsgardServiceClient {
  private apiKey?: string;
  private endpoint!: string;
  private botProviderEndpoint?: string;
  private debugMode?: boolean;
  private destroy$ = new Subject<void>();
  private sseEmitter = new EventEmitter<SseEvents>();
  private transformSsePayload?: (payload: FetchSsePayload) => FetchSsePayload;
  private customHeaders?: Record<string, string>;

  constructor(config: ClientConfig) {
    // Validate that either endpoint or botProviderEndpoint is provided
    if (!config.endpoint && !config.botProviderEndpoint) {
      throw new Error('Either endpoint or botProviderEndpoint must be provided');
    }

    this.apiKey = config.apiKey;
    this.debugMode = config.debugMode;
    this.transformSsePayload = config.transformSsePayload;
    this.botProviderEndpoint = config.botProviderEndpoint;
    this.customHeaders = config.customHeaders;

    // Handle endpoint derivation and deprecation
    if (!config.endpoint && config.botProviderEndpoint) {
      // Derive endpoint from botProviderEndpoint (new recommended way)
      // Handle trailing slashes to prevent double slashes
      const baseEndpoint = config.botProviderEndpoint.replace(/\/+$/, '');
      this.endpoint = `${baseEndpoint}/message/sse`;
    } else if (config.endpoint) {
      // Use provided endpoint but warn about deprecation
      this.endpoint = config.endpoint;
      if (this.debugMode) {
        // eslint-disable-next-line no-console
        console.warn(
          '[AsgardServiceClient] The "endpoint" option is deprecated and will be removed in the next major version. ' +
            `Please use "botProviderEndpoint" instead. The SSE endpoint will be automatically derived as "\${botProviderEndpoint}/message/sse".`,
        );
      }
    }
  }

  on<K extends keyof SseEvents>(event: K, listener: SseEvents[K]): void {
    this.sseEmitter.remove(event);
    this.sseEmitter.on(event, listener);
  }

  handleEvent(response: SseResponse<EventType>): void {
    switch (response.eventType) {
      case EventType.INIT:
        this.sseEmitter.emit(EventType.INIT, response as SseResponse<EventType.INIT>);

        break;
      case EventType.PROCESS_START:
      case EventType.PROCESS_COMPLETE:
        this.sseEmitter.emit(EventType.PROCESS, response as Parameters<SseEvents[EventType.PROCESS]>[0]);

        break;
      case EventType.MESSAGE_START:
      case EventType.MESSAGE_DELTA:
      case EventType.MESSAGE_COMPLETE:
        this.sseEmitter.emit(EventType.MESSAGE, response as Parameters<SseEvents[EventType.MESSAGE]>[0]);

        break;
      case EventType.TOOL_CALL_START:
      case EventType.TOOL_CALL_COMPLETE:
        this.sseEmitter.emit(EventType.TOOL_CALL, response as Parameters<SseEvents[EventType.TOOL_CALL]>[0]);

        break;
      case EventType.DONE:
        this.sseEmitter.emit(EventType.DONE, response as SseResponse<EventType.DONE>);

        break;
      case EventType.ERROR:
        this.sseEmitter.emit(EventType.ERROR, response as SseResponse<EventType.ERROR>);

        break;
      case EventType.VIEW_UPDATE:
        this.sseEmitter.emit(EventType.VIEW_UPDATE, response as SseResponse<EventType.VIEW_UPDATE>);

        break;
      default:
        break;
    }
  }

  fetchSse(payload: FetchSsePayload, options?: FetchSseOptions): void {
    options?.onSseStart?.();

    createSseObservable({
      apiKey: this.apiKey,
      endpoint: this.endpoint,
      debugMode: this.debugMode,
      payload: this.transformSsePayload?.(payload) ?? payload,
      customHeaders: this.customHeaders,
    })
      .pipe(
        concatMap(event => of(event).pipe(delay(options?.delayTime ?? 50))),
        takeUntil(this.destroy$),
        retry(3),
      )
      .subscribe({
        next: response => {
          options?.onSseMessage?.(response);
          this.handleEvent(response);
        },
        error: error => {
          options?.onSseError?.(error);
        },
        complete: () => {
          options?.onSseCompleted?.();
        },
      });
  }

  close(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * 上傳檔案到 Blob API
   * 根據 API 文件：/ns/{namespace}/bot-provider/{bot_provider_name}/blob
   */
  async uploadFile(file: File, customChannelId: string): Promise<BlobUploadResponse> {
    const blobEndpoint = this.deriveBlobEndpoint();

    if (!blobEndpoint) {
      throw new Error('Unable to derive blob endpoint. Please provide botProviderEndpoint in config.');
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('customChannelId', customChannelId);

    const headers: HeadersInit = {
      ...this.customHeaders,
    };
    if (this.apiKey) {
      headers['X-API-KEY'] = this.apiKey;
    }

    try {
      const response = await fetch(blobEndpoint, {
        method: 'POST',
        headers,
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();

      if (this.debugMode) {
        // eslint-disable-next-line no-console
        console.log('[AsgardServiceClient] File upload response:', result);
      }

      return result as BlobUploadResponse;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[AsgardServiceClient] File upload error:', error);
      throw error;
    }
  }

  /**
   * 從 botProviderEndpoint 衍生 Blob API endpoint
   */
  private deriveBlobEndpoint(): string | null {
    if (!this.botProviderEndpoint && !this.endpoint) {
      return null;
    }

    let baseEndpoint = this.botProviderEndpoint;

    // 如果沒有 botProviderEndpoint，嘗試從 endpoint 反推
    if (!baseEndpoint && this.endpoint) {
      baseEndpoint = this.endpoint.replace('/message/sse', '');
    }

    if (!baseEndpoint) {
      return null;
    }

    // 移除尾部斜線
    baseEndpoint = baseEndpoint.replace(/\/+$/, '');

    return `${baseEndpoint}/blob`;
  }
}
