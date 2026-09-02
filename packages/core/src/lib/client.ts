import {
  ChannelMetadata,
  ClientConfig,
  IAsgardServiceClient,
  FetchSsePayload,
  FetchSseOptions,
  SseResponse,
  SseEvents,
  BlobUploadResponse,
  ChannelHomeDownloadResult,
  MessageFeedbackReply,
  MessageFeedbackRequest,
  SandboxFsCopyMoveOptions,
  SandboxFsCopyResult,
  SandboxFsListResult,
  SandboxFsReadOptions,
  SandboxFsReadResult,
  SandboxFsStatResult,
  SandboxFsWatchEvent,
  SandboxFsWriteOptions,
  SandboxFsWriteResult,
  StopGenerationOptions,
} from '../types';
import { HttpError } from '../types/http-error';
import { fetchEventSource } from '@microsoft/fetch-event-source';
import { createSseObservable } from './create-sse-observable';
import { bufferTime, filter, finalize, Observable, Subject, Subscription, takeUntil } from 'rxjs';
import { EventType } from '../constants/enum';
import { EventEmitter } from './event-emitter';

/**
 * How long `runSse` gathers SSE frames before handing them on. One window is the whole latency the SDK
 * adds, no matter how many frames land in it — see the rationale on the `bufferTime` call below.
 */
const DEFAULT_SSE_BATCH_WINDOW_MS = 50;

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

  fetchSse(payload: FetchSsePayload, options?: FetchSseOptions): Subscription {
    options?.onSseStart?.();
    this.inFlight += 1;

    return this.runSse(
      createSseObservable({
        apiKey: this.apiKey,
        endpoint: this.endpoint,
        debugMode: this.debugMode,
        payload: this.transformSsePayload?.(payload) ?? payload,
        customHeaders: this.customHeaders,
      }),
      options,
    );
  }

  /**
   * Cold-start transcript rejoin (F-014): a `GET /message/sse?custom_channel_id=…` with an empty
   * `Last-Event-ID` replays the collapsed history (`message.user` + self-sufficient `*.complete`),
   * assembled through the same reducer. Reuses the F-002 native Last-Event-ID transport (no re-POST).
   */
  rejoinSse(customChannelId: string, options?: FetchSseOptions): Subscription {
    options?.onSseStart?.();
    this.inFlight += 1;

    const url = new URL(this.endpoint);
    url.searchParams.set('custom_channel_id', customChannelId);

    return this.runSse(
      createSseObservable({
        apiKey: this.apiKey,
        endpoint: url.toString(),
        debugMode: this.debugMode,
        method: 'GET',
        customHeaders: this.customHeaders,
      }),
      options,
    );
  }

  private deriveChannelMetadataEndpoint(): string | null {
    const baseEndpoint = this.getBaseEndpoint();

    return baseEndpoint ? `${baseEndpoint}/channel/metadata` : null;
  }

  /**
   * Join-init existence + restore gate (F-015): `GET {base}/channel/metadata?custom_channel_id=…`.
   * `200` → parsed {@link ChannelMetadata}; `404` → `null` (channel does not exist); any other non-OK
   * status or network error throws. The caller must never treat an indeterminate result (throw) as
   * "not exists" — that would let a mount-time reset wipe an existing channel's history.
   */
  async channelMetadata(customChannelId: string): Promise<ChannelMetadata | null> {
    const endpoint = this.deriveChannelMetadataEndpoint();

    if (!endpoint) {
      throw new Error('Unable to derive channel metadata endpoint. Please provide botProviderEndpoint in config.');
    }

    const url = new URL(endpoint);
    url.searchParams.set('custom_channel_id', customChannelId);

    const headers: Record<string, string> = { ...this.customHeaders };
    if (this.apiKey) {
      headers['X-API-KEY'] = this.apiKey;
    }

    const response = await fetch(url.toString(), { method: 'GET', headers });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new HttpError(response.status, response.statusText, await response.text().catch(() => undefined));
    }

    // Accept both a `{ data: … }` envelope (the convention used by the bot-provider metadata fetch) and
    // a bare body, so the shape can be confirmed against the real backend without a code change here.
    const json: { data?: ChannelMetadata } & Partial<ChannelMetadata> = await response.json();
    const data = json.data ?? (json as ChannelMetadata);

    return {
      title: data.title ?? null,
      runState: data.runState ?? 'IDLE',
      lastActivityAt: data.lastActivityAt,
      // F-019 — whitelist-pass the live-sandbox list (map the five backend fields); `[]` for an old
      // backend / a channel with none live. metadata is the sole authority on "who is live".
      launchedSandboxes: (data.launchedSandboxes ?? []).map(sandbox => ({
        sandboxName: sandbox.sandboxName,
        sandboxBlueprintName: sandbox.sandboxBlueprintName,
        workingDirectory: sandbox.workingDirectory,
        editorServerEnabled: sandbox.editorServerEnabled,
        browserEnabled: sandbox.browserEnabled,
      })),
    };
  }

  private deriveSuspendEndpoint(): string | null {
    const baseEndpoint = this.getBaseEndpoint();

    return baseEndpoint ? `${baseEndpoint}/message/suspend` : null;
  }

  /**
   * Ask the backend to suspend this channel's background run (F-023 AC1):
   * `POST {base}/message/suspend?custom_channel_id=…`. The six downstream relays expose this at the
   * exact same shape as `GET {base}/message/sse`, so it is derived identically with no per-backend case.
   *
   * `custom_channel_id` is always sent — some backends take the channel from the path and ignore it,
   * others require it, and sending it is correct for both (same rule as the GET rejoin).
   *
   * **Resolving means "accepted", not "stopped".** The run winds down on the server and declares itself
   * finished through the terminal event on the already-open SSE stream (the same event a normal run
   * ends with), so callers must keep that stream connected and wait for it.
   *
   * Success is **any 2xx** — relays variously answer `204 No Content` or `200` with an envelope, so no
   * single status is hardcoded. `404` means the channel was never created, i.e. there is nothing to
   * stop, which is a success rather than an error. Every other non-2xx throws {@link HttpError}.
   */
  async suspendChannel(
    customChannelId: string,
    options?: StopGenerationOptions & { requestId?: string },
  ): Promise<void> {
    const endpoint = this.deriveSuspendEndpoint();

    if (!endpoint) {
      throw new Error('Unable to derive channel suspend endpoint. Please provide botProviderEndpoint in config.');
    }

    const url = new URL(endpoint);
    url.searchParams.set('custom_channel_id', customChannelId);

    if (options?.requestId) {
      url.searchParams.set('request_id', options.requestId);
    }

    if (options?.force) {
      url.searchParams.set('force', 'true');
    }

    const response = await fetch(url.toString(), { method: 'POST', headers: this.apiHeaders() });

    // 404 = the channel does not exist = nothing to stop. Not a failure the user should ever see.
    if (response.ok || response.status === 404) {
      return;
    }

    throw new HttpError(response.status, response.statusText, await response.text().catch(() => undefined));
  }

  private deriveChannelEndpoint(): string | null {
    const baseEndpoint = this.getBaseEndpoint();

    return baseEndpoint ? `${baseEndpoint}/channel` : null;
  }

  /**
   * End the conversation and release the whole channel (F-032):
   * `DELETE {base}/channel?custom_channel_id=…`. The backend tears down the in-flight run, the
   * transcript, uploaded blobs, the tool-call allow-list, the Sandbox and the Channel Home, and only
   * then answers — so once this resolves the same `customChannelId` is genuinely a blank slate
   * (`GET /channel/metadata` goes back to `404`).
   *
   * Success is **any 2xx**: the endpoint answers `204 No Content`, and does so for a channel that never
   * existed too (deleting nothing is not a failure). Unlike {@link suspendChannel} there is no `404`
   * special case, because the backend never answers one here. Everything else throws {@link HttpError},
   * and a throw must never be read as "deleted" — a `500` means the teardown failed and the old
   * conversation is still there.
   *
   * **No timeout is imposed.** A channel with a live Sandbox blocks until the pod is really gone (up to
   * about a minute), on purpose: the next turn must not race a dying pod.
   */
  async deleteChannel(customChannelId: string): Promise<void> {
    const endpoint = this.deriveChannelEndpoint();

    if (!endpoint) {
      throw new Error('Unable to derive channel endpoint. Please provide botProviderEndpoint in config.');
    }

    const url = new URL(endpoint);
    url.searchParams.set('custom_channel_id', customChannelId);

    const response = await fetch(url.toString(), { method: 'DELETE', headers: this.apiHeaders() });

    if (response.ok) {
      return;
    }

    throw new HttpError(response.status, response.statusText, await response.text().catch(() => undefined));
  }

  private deriveFeedbackEndpoint(): string | null {
    const baseEndpoint = this.getBaseEndpoint();

    return baseEndpoint ? `${baseEndpoint}/message/feedback` : null;
  }

  /**
   * Rate one assistant reply Good or Bad (F-033): `POST {base}/message/feedback` with
   * `{ customChannelId, messageId, verdict, comment? }`. Derived from `botProviderEndpoint` exactly like
   * `/message/sse`, because every product relay exposes it at that same shape.
   *
   * Resolves to `{ messageId, seq }` — the persisted entry's own id and transcript cursor — on any 2xx
   * (the relays wrap it in a `{ data }` envelope; a bare body is accepted too). `404` means the target is
   * not a ratable reply (a thinking block, the user's own message, an unknown id), `400` a bad verdict
   * or a comment over 8 KiB; both, like any other failure, reject with {@link HttpError}. Nothing is
   * retried: the caller decides whether to offer another attempt, with the user's comment intact.
   */
  async sendMessageFeedback(request: MessageFeedbackRequest): Promise<MessageFeedbackReply> {
    const endpoint = this.deriveFeedbackEndpoint();

    if (!endpoint) {
      throw new Error('Unable to derive message feedback endpoint. Please provide botProviderEndpoint in config.');
    }

    // `comment` is optional on the wire; an empty string is "no comment", not a comment.
    const comment = request.comment?.trim();
    const body: MessageFeedbackRequest = {
      customChannelId: request.customChannelId,
      messageId: request.messageId,
      verdict: request.verdict,
      ...(comment ? { comment } : {}),
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { ...this.apiHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new HttpError(response.status, response.statusText, await response.text().catch(() => undefined));
    }

    const json: { data?: MessageFeedbackReply } & Partial<MessageFeedbackReply> = await response.json();
    const data = json.data ?? (json as MessageFeedbackReply);

    return { messageId: data.messageId, seq: data.seq };
  }

  private runSse(observable: Observable<SseResponse<EventType>>, options?: FetchSseOptions): Subscription {
    return observable
      .pipe(
        // No RxJS-level retry: re-subscribing would re-POST and the backend would re-dispatch a duplicate
        // run. Mid-stream resume is the library's job (native Last-Event-ID reconnect in
        // create-sse-observable); a no-cursor failure surfaces via `error` below.
        //
        // **Gate on a window, not on every frame.** This used to be
        // `concatMap(event => of(event).pipe(delay(delayTime ?? 50)))`. `concatMap` is strictly serial,
        // so the cost grew with the *number* of frames rather than the amount of data or the backend's
        // speed — and stream deltas are token-sized. A canvas fragment arrives as hundreds of frames
        // (measured: a 2.6KB drawing = 372 frames of ~7 characters), which made the SDK alone add
        // ~19s at 51.7ms per frame before the conversation held the whole fragment. That is precisely
        // the "stare at a blank card, then it pops in" F-030 exists to avoid.
        //
        // `bufferTime` keeps the reason the delay was here — never push hundreds of separate updates
        // at a consumer, one microtask apart — but the latency it adds is one window total, no matter
        // how many frames land in it. Frames are still delivered individually and in order below, so
        // nothing downstream can tell the difference apart from the timing.
        bufferTime(options?.delayTime ?? DEFAULT_SSE_BATCH_WINDOW_MS),
        // An idle stream still ticks an empty buffer every window; do not wake the consumer for nothing.
        filter(batch => batch.length > 0),
        takeUntil(this.destroy$),
        // Settle the run accounting on every termination path — complete, error, AND a user-initiated
        // unsubscribe (stop-generation aborts the connection without a terminal event).
        finalize(() => this.onRunSettled()),
      )
      .subscribe({
        next: batch => {
          // Once detached the connection is kept open only so the backend can
          // finish the run; the owning component is gone, so stop notifying it.
          if (this.detached) return;

          for (const response of batch) {
            options?.onSseMessage?.(response);
            this.handleEvent(response);
          }
        },
        error: error => {
          if (!this.detached) options?.onSseError?.(error);
        },
        complete: () => {
          if (!this.detached) options?.onSseCompleted?.();
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
   * 下載 Channel Home（每個 channel 的檔案交換平面）裡的檔案（channel-home:// URI action）。
   * 呼叫 Edge Server GET <base>/channel-home/download?custom_channel_id=xxx&relative_path=xxx 取回 binary。
   */
  async downloadChannelHomeFile(relativePath: string, customChannelId: string): Promise<ChannelHomeDownloadResult> {
    const baseEndpoint = this.getBaseEndpoint();

    if (!baseEndpoint) {
      throw new Error('Unable to derive channel-home download endpoint. Please provide botProviderEndpoint in config.');
    }

    const query =
      `custom_channel_id=${encodeURIComponent(customChannelId)}` + `&relative_path=${encodeURIComponent(relativePath)}`;
    const url = `${baseEndpoint}/channel-home/download?${query}`;

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
        throw new Error(`Channel Home download failed: ${response.status} ${response.statusText}`);
      }

      const blob = await response.blob();
      // 後端送的 relative_path 是未編碼的原字串，basename 即下載檔名（不做 decode）。
      const filename = relativePath.split('/').pop() || 'download';

      if (this.debugMode) {
        // eslint-disable-next-line no-console
        console.log('[AsgardServiceClient] Channel Home download response:', { filename, size: blob.size });
      }

      return { blob, filename };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[AsgardServiceClient] Channel Home download error:', error);
      throw error;
    }
  }

  /**
   * F-020 — 取得 sandbox 瀏覽器一次性接手 URL（`sandbox://<name>/open-browser` 卡的副作用）。
   * 呼叫 `POST {base}/sandbox/{sandboxName}/browser/open-url`（對標 asgard-core edgeserver
   * `GenerateSandboxBrowserOpenUrl`：path 參數 namespace / bot-provider 已在 base、sandbox_name 在路徑，
   * 不需 custom_channel_id）。回應 `{ data: { openURL } }`（envelope 容錯，比照 `channelMetadata`）。
   */
  async generateSandboxBrowserOpenUrl(sandboxName: string): Promise<string> {
    const baseEndpoint = this.getBaseEndpoint();

    if (!baseEndpoint) {
      throw new Error(
        'Unable to derive sandbox browser open-url endpoint. Please provide botProviderEndpoint in config.',
      );
    }

    const url = `${baseEndpoint}/sandbox/${encodeURIComponent(sandboxName)}/browser/open-url`;

    const headers: Record<string, string> = { ...this.customHeaders };
    if (this.apiKey) {
      headers['X-API-KEY'] = this.apiKey;
    }

    const response = await fetch(url, { method: 'POST', headers });

    if (!response.ok) {
      throw new HttpError(response.status, response.statusText, await response.text().catch(() => undefined));
    }

    const json: { data?: { openURL?: string } } & { openURL?: string } = await response.json();
    const openURL = json.data?.openURL ?? json.openURL;

    if (!openURL) {
      throw new Error('Sandbox browser open-url response did not contain an openURL.');
    }

    return openURL;
  }

  /**
   * F-021 — 衍生 sandbox fs 端點 base：`{base}/sandbox/{sandboxName}/fs`（namespace / bot-provider 已在 base）。
   */
  private deriveSandboxFsEndpoint(sandboxName: string): string {
    const baseEndpoint = this.getBaseEndpoint();

    if (!baseEndpoint) {
      throw new Error('Unable to derive sandbox fs endpoint. Please provide botProviderEndpoint in config.');
    }

    return `${baseEndpoint}/sandbox/${encodeURIComponent(sandboxName)}/fs`;
  }

  /** The shared auth / custom headers for the client's plain-JSON REST calls (no SSE). */
  private apiHeaders(): Record<string, string> {
    const headers: Record<string, string> = { ...this.customHeaders };
    if (this.apiKey) {
      headers['X-API-KEY'] = this.apiKey;
    }

    return headers;
  }

  /**
   * F-021 — 列出 sandbox 目錄內容（`GET fs/list?path=`）。回應 `{ data: { entries, truncated } }`（envelope
   * 容錯，比照 `channelMetadata`）。
   */
  async sandboxFsList(sandboxName: string, path: string): Promise<SandboxFsListResult> {
    const url = new URL(`${this.deriveSandboxFsEndpoint(sandboxName)}/list`);
    url.searchParams.set('path', path);

    const response = await fetch(url.toString(), { method: 'GET', headers: this.apiHeaders() });

    if (!response.ok) {
      throw new HttpError(response.status, response.statusText, await response.text().catch(() => undefined));
    }

    const json: { data?: SandboxFsListResult } & Partial<SandboxFsListResult> = await response.json();
    const data = json.data ?? (json as SandboxFsListResult);

    return { entries: data.entries ?? [], truncated: data.truncated ?? false };
  }

  /**
   * F-021 — 讀取 sandbox 檔案（`GET fs/file?path=[&offset_bytes&limit_bytes]`）。回應是 raw octet-stream，
   * 檔案總長度 / 是否截斷走 `X-Total-Bytes` / `X-Truncated` header。
   */
  async sandboxFsRead(sandboxName: string, path: string, options?: SandboxFsReadOptions): Promise<SandboxFsReadResult> {
    const url = new URL(`${this.deriveSandboxFsEndpoint(sandboxName)}/file`);
    url.searchParams.set('path', path);
    if (options?.offsetBytes != null) url.searchParams.set('offset_bytes', String(options.offsetBytes));

    if (options?.limitBytes != null) url.searchParams.set('limit_bytes', String(options.limitBytes));

    const response = await fetch(url.toString(), { method: 'GET', headers: this.apiHeaders() });

    if (!response.ok) {
      throw new HttpError(response.status, response.statusText, await response.text().catch(() => undefined));
    }

    const content = await response.blob();
    const totalBytesHeader = response.headers.get('X-Total-Bytes');

    return {
      content,
      totalBytes: totalBytesHeader != null ? Number(totalBytesHeader) : content.size,
      truncated: response.headers.get('X-Truncated') === 'true',
    };
  }

  /**
   * F-021 — 寫入 sandbox 檔案（`PUT fs/file?path=[&mode&create_only]`，`multipart/form-data` 帶 `file`）。
   * 回應 `{ data: { bytesWritten } }`。
   */
  async sandboxFsWrite(
    sandboxName: string,
    path: string,
    content: Blob | string,
    options?: SandboxFsWriteOptions,
  ): Promise<SandboxFsWriteResult> {
    const url = new URL(`${this.deriveSandboxFsEndpoint(sandboxName)}/file`);
    url.searchParams.set('path', path);
    if (options?.mode != null) url.searchParams.set('mode', String(options.mode));

    if (options?.createOnly) url.searchParams.set('create_only', 'true');

    const form = new FormData();
    form.append('file', content instanceof Blob ? content : new Blob([content]));

    const response = await fetch(url.toString(), {
      method: 'PUT',
      headers: this.apiHeaders(),
      body: form,
      signal: options?.signal,
    });

    if (!response.ok) {
      throw new HttpError(response.status, response.statusText, await response.text().catch(() => undefined));
    }

    const json: { data?: SandboxFsWriteResult } & Partial<SandboxFsWriteResult> = await response.json();
    const data = json.data ?? (json as SandboxFsWriteResult);

    return { bytesWritten: data.bytesWritten ?? 0 };
  }

  /** F-021 Cycle 2 — `sandbox://` fs mutation shared request helper (throws `HttpError` on non-OK). */
  private async sandboxFsRequest(
    sandboxName: string,
    op: string,
    method: 'POST' | 'DELETE',
    query: Record<string, string>,
  ): Promise<unknown> {
    const url = new URL(`${this.deriveSandboxFsEndpoint(sandboxName)}/${op}`);
    Object.entries(query).forEach(([k, v]) => url.searchParams.set(k, v));

    const response = await fetch(url.toString(), { method, headers: this.apiHeaders() });

    if (!response.ok) {
      throw new HttpError(response.status, response.statusText, await response.text().catch(() => undefined));
    }

    return response.json().catch(() => null);
  }

  /** F-021 — stat a sandbox path (`GET fs/stat?path=`). */
  async sandboxFsStat(sandboxName: string, path: string): Promise<SandboxFsStatResult> {
    const url = new URL(`${this.deriveSandboxFsEndpoint(sandboxName)}/stat`);
    url.searchParams.set('path', path);

    const response = await fetch(url.toString(), { method: 'GET', headers: this.apiHeaders() });

    if (!response.ok) {
      throw new HttpError(response.status, response.statusText, await response.text().catch(() => undefined));
    }

    const json: { data?: SandboxFsStatResult } & Partial<SandboxFsStatResult> = await response.json();
    const data = json.data ?? (json as SandboxFsStatResult);

    return {
      exists: data.exists ?? false,
      isDir: data.isDir ?? false,
      sizeBytes: data.sizeBytes ?? 0,
      mtimeUnix: data.mtimeUnix ?? 0,
      mode: data.mode ?? 0,
      etag: data.etag,
    };
  }

  /** F-021 — create a directory (`POST fs/mkdir?path=`). */
  async sandboxFsMkdir(sandboxName: string, path: string): Promise<void> {
    await this.sandboxFsRequest(sandboxName, 'mkdir', 'POST', { path });
  }

  /** F-021 — delete a file (`DELETE fs/item?path=`). */
  async sandboxFsRemove(sandboxName: string, path: string): Promise<void> {
    await this.sandboxFsRequest(sandboxName, 'item', 'DELETE', { path });
  }

  /** F-021 — recursively delete a directory (`DELETE fs/all?path=`). */
  async sandboxFsRemoveAll(sandboxName: string, path: string): Promise<void> {
    await this.sandboxFsRequest(sandboxName, 'all', 'DELETE', { path });
  }

  /** F-021 — copy a path (`POST fs/copy?src=&dst=[&overwrite]`) → bytes copied. */
  async sandboxFsCopy(
    sandboxName: string,
    src: string,
    dst: string,
    options?: SandboxFsCopyMoveOptions,
  ): Promise<SandboxFsCopyResult> {
    const query: Record<string, string> = { src, dst };
    if (options?.overwrite) query.overwrite = 'true';

    const json = (await this.sandboxFsRequest(sandboxName, 'copy', 'POST', query)) as
      | ({ data?: SandboxFsCopyResult } & Partial<SandboxFsCopyResult>)
      | null;
    const data = json?.data ?? (json as SandboxFsCopyResult | null);

    return { bytesCopied: data?.bytesCopied ?? 0 };
  }

  /** F-021 — move / rename a path (`POST fs/move?src=&dst=[&overwrite]`). */
  async sandboxFsMove(
    sandboxName: string,
    src: string,
    dst: string,
    options?: SandboxFsCopyMoveOptions,
  ): Promise<void> {
    const query: Record<string, string> = { src, dst };
    if (options?.overwrite) query.overwrite = 'true';

    await this.sandboxFsRequest(sandboxName, 'move', 'POST', query);
  }

  /**
   * F-021 — watch a sandbox path for changes (`GET fs/watch?path=`, SSE). Each `event: change` frame is one
   * `SandboxFsWatchEvent`. The backend probes the path first, so a missing path errors as HTTP rather than
   * as a dead stream. Unsubscribing aborts the request, which ends the sandbox-side watcher.
   */
  sandboxFsWatch(sandboxName: string, path: string): Observable<SandboxFsWatchEvent> {
    const url = new URL(`${this.deriveSandboxFsEndpoint(sandboxName)}/watch`);
    url.searchParams.set('path', path);

    return new Observable<SandboxFsWatchEvent>(subscriber => {
      const controller = new AbortController();

      void fetchEventSource(url.toString(), {
        headers: this.apiHeaders(),
        signal: controller.signal,
        openWhenHidden: true,
        onopen: async response => {
          if (!response.ok) {
            const body = await response.text().catch(() => undefined);
            subscriber.error(new HttpError(response.status, response.statusText, body));
            controller.abort();
          }
        },
        onmessage: esm => {
          if (esm.event === 'change') subscriber.next(JSON.parse(esm.data) as SandboxFsWatchEvent);
        },
        onclose: () => subscriber.complete(),
        onerror: err => {
          // Unlike the run stream this one carries no `id:` cursor, so there is nothing to resume from —
          // surface the failure instead of letting the library silently reconnect forever.
          subscriber.error(err);
          controller.abort();
          throw err;
        },
      });

      return (): void => controller.abort();
    });
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
