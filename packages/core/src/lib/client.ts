import {
  ClientConfig,
  IAsgardServiceClient,
  FetchSsePayload,
  FetchSseOptions,
  SseResponse,
  SseEvents,
  BlobUploadResponse,
  CwdDownloadResult,
  ChannelMetadata,
  ChannelRunState,
} from '../types';
import { createSseObservable } from './create-sse-observable';
import { concatMap, delay, of, Subject, takeUntil } from 'rxjs';
import { EventType } from '../constants/enum';
import { EventEmitter } from './event-emitter';
import { HttpError } from '../types/http-error';

export default class AsgardServiceClient implements IAsgardServiceClient {
  private apiKey?: string;
  private endpoint!: string;
  private botProviderEndpoint?: string;
  readonly debugMode?: boolean;
  private destroy$ = new Subject<void>();
  private closed = false;
  private detached = false;
  private detachTimer?: ReturnType<typeof setTimeout>;
  private inFlight = 0;
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
    this.customHeaders = {
      ...config.customHeaders,
      ...(config.userIdentityHint ? { 'X-ASGARD-USER-IDENTITY-HINT': config.userIdentityHint } : {}),
    };

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
      case EventType.TOOL_CALL_CONSENT:
        this.sseEmitter.emit(
          EventType.TOOL_CALL_CONSENT,
          response as Parameters<SseEvents[EventType.TOOL_CALL_CONSENT]>[0],
        );

        break;
      case EventType.DONE:
        this.sseEmitter.emit(EventType.DONE, response as SseResponse<EventType.DONE>);

        break;
      case EventType.ERROR:
        this.sseEmitter.emit(EventType.ERROR, response as SseResponse<EventType.ERROR>);

        break;
      default:
        break;
    }
  }

  fetchSse(payload: FetchSsePayload, options?: FetchSseOptions): void {
    this.runSse(
      {
        endpoint: this.endpoint,
        method: 'POST',
        payload: this.transformSsePayload?.(payload) ?? payload,
      },
      options,
    );
  }

  /**
   * GET rejoin (F-015): re-enter an existing channel and replay its collapsed
   * history, then tail the in-flight run (or a synthesized terminal for an idle
   * channel) to its terminal. No body — the channel id travels as a query
   * param. Shares the exact stream plumbing (inFlight/detach/handleEvent/
   * Last-Event-ID resume) as `fetchSse`.
   */
  rejoinSse(customChannelId: string, options?: FetchSseOptions): void {
    this.runSse(
      {
        endpoint: this.endpoint,
        method: 'GET',
        queryParams: { custom_channel_id: customChannelId },
      },
      options,
    );
  }

  /**
   * GET channel metadata (F-015): probe whether a channel exists and its run
   * state without mutating it. 404 → `{ exists: false }`; any other non-OK
   * status throws so the caller can fall back without silently deleting history.
   */
  async getChannelMetadata(customChannelId: string): Promise<ChannelMetadata> {
    const baseEndpoint = this.getBaseEndpoint();

    if (!baseEndpoint) {
      throw new Error('Unable to derive channel metadata endpoint. Please provide botProviderEndpoint in config.');
    }

    const url = `${baseEndpoint}/channel/metadata?custom_channel_id=${encodeURIComponent(customChannelId)}`;

    const headers: HeadersInit = {
      ...this.customHeaders,
    };
    if (this.apiKey) {
      headers['X-API-KEY'] = this.apiKey;
    }

    const response = await fetch(url, { method: 'GET', headers });

    if (response.status === 404) {
      return { exists: false };
    }

    if (!response.ok) {
      throw new HttpError(response.status, response.statusText, await response.text().catch(() => null));
    }

    // Success envelope: { isSuccess: true, data: ChannelMetadata }.
    const body = (await response.json()) as {
      data?: { customChannelId?: string; title?: string; runState?: ChannelRunState; lastActivityAt?: string };
    };
    const data = body?.data;

    return {
      exists: true,
      customChannelId: data?.customChannelId,
      title: data?.title,
      runState: data?.runState,
      lastActivityAt: data?.lastActivityAt,
    };
  }

  /**
   * Sandbox Browser (part 2): generate a one-time embed URL for the channel's sandbox browser (Neko).
   * POST `{base}/sandbox/{sandboxName}/browser/open-url` → `SuccessResp({ openURL })`. The caller
   * (`<SandboxBrowser>`) puts the returned URL in an iframe. `sandboxName` comes from the
   * `sandbox.launch`/`ready`-derived store (see `useSandboxName`).
   */
  async getSandboxBrowserUrl(sandboxName: string): Promise<string> {
    const baseEndpoint = this.getBaseEndpoint();

    if (!baseEndpoint) {
      throw new Error('Unable to derive sandbox endpoint. Please provide botProviderEndpoint in config.');
    }

    const url = `${baseEndpoint}/sandbox/${encodeURIComponent(sandboxName)}/browser/open-url`;

    const headers: HeadersInit = { 'Content-Type': 'application/json', ...this.customHeaders };
    if (this.apiKey) {
      headers['X-API-KEY'] = this.apiKey;
    }

    const response = await fetch(url, { method: 'POST', headers });

    if (!response.ok) {
      throw new HttpError(response.status, response.statusText, await response.text().catch(() => null));
    }

    const body = (await response.json()) as { data?: { openURL?: string } };
    const openURL = body?.data?.openURL;

    if (!openURL) {
      throw new Error('sandbox browser open-url returned no openURL');
    }

    return openURL;
  }

  private runSse(
    request: {
      endpoint: string;
      method: 'GET' | 'POST';
      payload?: FetchSsePayload;
      queryParams?: Record<string, string>;
    },
    options?: FetchSseOptions,
  ): void {
    options?.onSseStart?.();
    this.inFlight += 1;

    createSseObservable({
      apiKey: this.apiKey,
      endpoint: request.endpoint,
      debugMode: this.debugMode,
      payload: request.payload,
      customHeaders: this.customHeaders,
      method: request.method,
      queryParams: request.queryParams,
    })
      .pipe(
        concatMap(event => of(event).pipe(delay(options?.delayTime ?? 50))),
        takeUntil(this.destroy$),
        // No RxJS retry: a transport drop is resumed natively via Last-Event-ID inside
        // createSseObservable. Re-subscribing here would re-POST and re-dispatch the run. (F-002)
      )
      .subscribe({
        next: response => {
          // Once detached the connection is kept open only so the backend can
          // finish the run; the owning component is gone, so stop notifying it.
          if (this.detached) return;

          options?.onSseMessage?.(response);
          this.handleEvent(response);
        },
        error: error => {
          if (!this.detached) options?.onSseError?.(error);

          this.onRunSettled();
        },
        complete: () => {
          if (!this.detached) options?.onSseCompleted?.();

          this.onRunSettled();
        },
      });
  }

  /**
   * Detach the client from its owning component without aborting in-flight SSE
   * runs. Used when a chatbot unmounts (e.g. the user navigates to another
   * in-app page) but the current run should be allowed to finish on the
   * backend instead of being cut off. After detaching, the stream is still
   * drained to keep the connection open but consumer callbacks no longer fire.
   *
   * The connection cleans itself up in all cases:
   * - No run in flight → close immediately (nothing to keep alive).
   * - Runs in flight → close once they all settle (`onRunSettled`), so the
   *   client never lingers past the work it is keeping alive.
   * - A run gets stuck (stream stays open, no `run.done`/error) → the safety
   *   timeout force-closes it so the orphaned connection cannot leak.
   */
  detach(options: { timeoutMs: number }): void {
    if (this.detached || this.closed) return;

    this.detached = true;

    if (this.inFlight === 0) {
      this.close();

      return;
    }

    this.detachTimer = setTimeout(() => this.close(), options.timeoutMs);
  }

  private onRunSettled(): void {
    this.inFlight = Math.max(0, this.inFlight - 1);

    // Close only once every kept run has finished, so one run settling never
    // tears down another that is still streaming on the same client.
    if (this.detached && this.inFlight === 0) {
      this.close();
    }
  }

  close(): void {
    if (this.closed) return;

    this.closed = true;

    if (this.detachTimer) {
      clearTimeout(this.detachTimer);
      this.detachTimer = undefined;
    }

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
   * 下載 channel sandbox 工作目錄裡的檔案（cwd:// URI action）。
   * 呼叫 Edge Server GET <base>/cwd/download?custom_channel_id=xxx&relative_path=xxx 取回 binary。
   */
  async downloadCwdFile(relativePath: string, customChannelId: string): Promise<CwdDownloadResult> {
    const baseEndpoint = this.getBaseEndpoint();

    if (!baseEndpoint) {
      throw new Error('Unable to derive cwd download endpoint. Please provide botProviderEndpoint in config.');
    }

    const query =
      `custom_channel_id=${encodeURIComponent(customChannelId)}` + `&relative_path=${encodeURIComponent(relativePath)}`;
    const url = `${baseEndpoint}/cwd/download?${query}`;

    const headers: HeadersInit = {
      ...this.customHeaders,
    };
    if (this.apiKey) {
      headers['X-API-KEY'] = this.apiKey;
    }

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        throw new Error(`CWD download failed: ${response.status} ${response.statusText}`);
      }

      const blob = await response.blob();
      // 後端送的 relative_path 是未編碼的原字串，basename 即下載檔名（不做 decode）。
      const filename = relativePath.split('/').pop() || 'download';

      if (this.debugMode) {
        // eslint-disable-next-line no-console
        console.log('[AsgardServiceClient] CWD download response:', { filename, size: blob.size });
      }

      return { blob, filename };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[AsgardServiceClient] CWD download error:', error);
      throw error;
    }
  }

  /**
   * 從 botProviderEndpoint 衍生 Blob API endpoint
   */
  private deriveBlobEndpoint(): string | null {
    const baseEndpoint = this.getBaseEndpoint();

    return baseEndpoint ? `${baseEndpoint}/blob` : null;
  }

  /**
   * 衍生 bot provider 的 base endpoint（不含子路徑）。
   * 優先用 botProviderEndpoint；若只有 deprecated 的 endpoint 則反推（移除 /message/sse）。已去除尾部斜線。
   */
  private getBaseEndpoint(): string | null {
    let baseEndpoint = this.botProviderEndpoint;

    // 如果沒有 botProviderEndpoint，嘗試從 endpoint 反推
    if (!baseEndpoint && this.endpoint) {
      baseEndpoint = this.endpoint.replace('/message/sse', '');
    }

    if (!baseEndpoint) {
      return null;
    }

    // 移除尾部斜線
    return baseEndpoint.replace(/\/+$/, '');
  }
}
