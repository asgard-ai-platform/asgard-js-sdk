import {
  ClientConfig,
  IAsgardServiceClient,
  FetchSsePayload,
  FetchSseOptions,
  SseResponse,
  SseEvents,
} from 'src/types';
import { createSseObservable } from './create-sse-observable';
import { concatMap, delay, of, retry, Subject, takeUntil } from 'rxjs';
import { EventType } from 'src/constants/enum';
import { EventEmitter } from './event-emitter';

export default class AsgardServiceClient implements IAsgardServiceClient {
  private apiKey?: string;
  private endpoint!: string;
  private debugMode?: boolean;
  private destroy$ = new Subject<void>();
  private sseEmitter = new EventEmitter<SseEvents>();
  private transformSsePayload?: (payload: FetchSsePayload) => FetchSsePayload;

  constructor(config: ClientConfig) {
    // Validate that either endpoint or botProviderEndpoint is provided
    if (!config.endpoint && !config.botProviderEndpoint) {
      throw new Error('Either endpoint or botProviderEndpoint must be provided');
    }

    this.apiKey = config.apiKey;
    this.debugMode = config.debugMode;
    this.transformSsePayload = config.transformSsePayload;

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
          `Please use "botProviderEndpoint" instead. The SSE endpoint will be automatically derived as "\${botProviderEndpoint}/message/sse".`
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
        this.sseEmitter.emit(
          EventType.INIT,
          response as SseResponse<EventType.INIT>
        );

        break;
      case EventType.PROCESS_START:
      case EventType.PROCESS_COMPLETE:
        this.sseEmitter.emit(
          EventType.PROCESS,
          response as Parameters<SseEvents[EventType.PROCESS]>[0]
        );

        break;
      case EventType.MESSAGE_START:
      case EventType.MESSAGE_DELTA:
      case EventType.MESSAGE_COMPLETE:
        this.sseEmitter.emit(
          EventType.MESSAGE,
          response as Parameters<SseEvents[EventType.MESSAGE]>[0]
        );

        break;
      case EventType.TOOL_CALL_START:
      case EventType.TOOL_CALL_COMPLETE:
        this.sseEmitter.emit(
          EventType.TOOL_CALL,
          response as Parameters<SseEvents[EventType.TOOL_CALL]>[0]
        );

        break;
      case EventType.DONE:
        this.sseEmitter.emit(
          EventType.DONE,
          response as SseResponse<EventType.DONE>
        );

        break;
      case EventType.ERROR:
        this.sseEmitter.emit(
          EventType.ERROR,
          response as SseResponse<EventType.ERROR>
        );

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
    })
      .pipe(
        concatMap((event) => of(event).pipe(delay(options?.delayTime ?? 50))),
        takeUntil(this.destroy$),
        retry(3)
      )
      .subscribe({
        next: (response) => {
          options?.onSseMessage?.(response);
          this.handleEvent(response);
        },
        error: (error) => {
          options?.onSseError?.(error);
        },
        complete: () => {
          options?.onSseCompleted?.();
        },
      });
  }

  async sendMessageWithFiles(payload: FetchSsePayload & { files: File[] }, options?: FetchSseOptions): Promise<void> {
    // Validate that files are provided
    if (!payload.files || payload.files.length === 0) {
      throw new Error('Files must be provided for file upload');
    }

    // Validate file types (basic image validation)
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    const invalidFiles = payload.files.filter(file => !allowedTypes.includes(file.type));
    
    if (invalidFiles.length > 0) {
      throw new Error(`Unsupported file types: ${invalidFiles.map(f => f.type).join(', ')}. Allowed types: ${allowedTypes.join(', ')}`);
    }

    try {
      // Step 1: Upload files to get blobIds
      const blobIds = await this.uploadFiles(payload.files, payload.customChannelId);
      
      // Step 2: Send message with blobIds
      const messagePayload: FetchSsePayload = {
        customChannelId: payload.customChannelId,
        customMessageId: payload.customMessageId,
        text: payload.text,
        payload: payload.payload,
        action: payload.action,
        blobIds: blobIds
      };
      
      this.fetchSse(messagePayload, options);
    } catch (error) {
      options?.onSseError?.(error);
      throw error;
    }
  }

  private async uploadFiles(files: File[], customChannelId: string): Promise<string[]> {
    // 從 SSE 端點構造正確的 blob 端點
    // SSE: https://api.asgard-ai.com/ns/proj-XXX/bot-provider/bp-XXX/message/sse
    // Blob: https://api.asgard-ai.com/generic/ns/proj-XXX/bot-provider/bp-XXX/blob
    const blobEndpoint = this.endpoint
      .replace('/message/sse', '/blob')
      .replace('/ns/', '/generic/ns/');
    const blobIds: string[] = [];
    
    // Upload files sequentially to avoid overwhelming the server
    for (const file of files) {
      try {
        const formData = new FormData();
        formData.append('customChannelId', customChannelId);
        formData.append('file', file);
        
        
        const response = await fetch(blobEndpoint, {
          method: 'POST',
          headers: this.apiKey ? { 'X-API-KEY': this.apiKey } : {},
          body: formData
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          // File upload failed
          throw new Error(`File upload failed: ${response.status} ${response.statusText}`);
        }
        
        const result = await response.json();
        
        if (!result.isSuccess || !result.data || result.data.length === 0) {
          throw new Error(`File upload failed: ${result.error || 'Unknown error'}`);
        }
        
        const blobData = result.data[0];
        blobIds.push(blobData.blobId);
        
        // Backend returns different channelId format (expected behavior)
        
      } catch (error) {
        // File upload error
        throw new Error(`Failed to upload file ${file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
    
    
    return blobIds;
  }

  close(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
