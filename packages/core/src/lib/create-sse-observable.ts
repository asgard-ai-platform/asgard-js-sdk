import { Observable } from 'rxjs';
import { EventSourceMessage, fetchEventSource } from '@microsoft/fetch-event-source';
import { FetchSsePayload, SseResponse } from '../types';
import { HttpError } from '../types/http-error';
import { EventType } from '../constants/enum';

interface CreateSseObservableOptions {
  endpoint: string;
  apiKey?: string;
  debugMode?: boolean;
  payload?: FetchSsePayload;
  customHeaders?: Record<string, string>;
  // HTTP method (F-015). POST = dispatch a run (body = payload); GET = transcript rejoin/replay of an
  // existing channel (no body; `queryParams` carry the channel id). Defaults to POST.
  method?: 'GET' | 'POST';
  queryParams?: Record<string, string>;
}

export function createSseObservable(options: CreateSseObservableOptions): Observable<SseResponse<EventType>> {
  const { endpoint, apiKey, payload, debugMode, customHeaders, method = 'POST', queryParams } = options;

  return new Observable<SseResponse<EventType>>(subscriber => {
    const controller = new AbortController();
    let currentTraceId: string | undefined;
    // Whether the stream has produced a cursor yet (an event carrying `id:`). Once it has,
    // a mid-stream drop can be resumed natively via Last-Event-ID; before it, a failure must
    // not trigger a blind reconnect/re-POST (the backend would re-dispatch the run). See F-002.
    let hasCursor = false;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...customHeaders,
    };

    if (apiKey) {
      headers['X-API-KEY'] = apiKey;
    }

    const searchParams = new URLSearchParams();

    if (debugMode) {
      searchParams.set('is_debug', 'true');
    }

    if (queryParams) {
      for (const [key, value] of Object.entries(queryParams)) {
        searchParams.set(key, value);
      }
    }

    const url = new URL(endpoint);

    if (searchParams.toString()) {
      url.search = searchParams.toString();
    }

    fetchEventSource(url.toString(), {
      method,
      headers,
      // GET rejoin carries no body; the channel id travels in `queryParams`. Only POST dispatches
      // a run with a JSON payload.
      body: method === 'POST' && payload ? JSON.stringify(payload) : undefined,
      signal: controller.signal,
      /**
       * Allow SSE to work when the page is hidden.
       * https://github.com/Azure/fetch-event-source/issues/17#issuecomment-1525904929
       */
      openWhenHidden: true,
      onopen: async response => {
        if (!response.ok) {
          let body: unknown;
          try {
            body = await response.json();
          } catch {
            try {
              body = await response.text();
            } catch {
              body = null;
            }
          }

          subscriber.error(new HttpError(response.status, response.statusText, body));
          controller.abort();
        } else {
          currentTraceId = response.headers.get('X-Trace-Id') ?? undefined;
        }
      },
      onmessage: (esm: EventSourceMessage) => {
        // fetch-event-source tracks the last `id:` internally and replays it as the
        // `Last-Event-ID` header on native reconnect; we only track whether one exists.
        if (esm.id) {
          hasCursor = true;
        }

        const data = JSON.parse(esm.data) as SseResponse<EventType>;

        if (currentTraceId) {
          data.traceId = currentTraceId;
        } else if (data.requestId) {
          data.traceId = data.requestId;
          if (!currentTraceId) {
            currentTraceId = data.requestId;
          }
        }

        subscriber.next(data);
      },
      onclose: () => {
        subscriber.complete();
      },
      onerror: err => {
        // With a cursor already established, let fetch-event-source reconnect natively
        // (it replays `Last-Event-ID` and honors the server's `retry:`); returning here
        // means "retry", so the mid-stream drop is resumed transparently. (UC-003)
        if (hasCursor) return;

        // No cursor yet (pre-200, or no `id:` received): surface the error and stop.
        // Do NOT reconnect/re-POST — an empty-cursor POST makes the backend re-dispatch
        // the run (duplicate). The caller decides whether to retry. (UC-004)
        subscriber.error(err);
        controller.abort();
        throw err;
      },
    });

    return (): void => {
      controller.abort();
    };
  });
}
