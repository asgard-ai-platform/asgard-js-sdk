import { Observable } from 'rxjs';
import { EventSourceMessage, fetchEventSource } from '@microsoft/fetch-event-source';
import { FetchSsePayload, SseResponse } from '../types';
import { EventType } from '../constants/enum';

interface CreateSseObservableOptions {
  endpoint: string;
  apiKey?: string;
  debugMode?: boolean;
  payload: FetchSsePayload;
  customHeaders?: Record<string, string>;
}

export function createSseObservable(options: CreateSseObservableOptions): Observable<SseResponse<EventType>> {
  const { endpoint, apiKey, payload, debugMode, customHeaders } = options;

  return new Observable<SseResponse<EventType>>(subscriber => {
    const controller = new AbortController();
    let currentTraceId: string | undefined;

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

    const url = new URL(endpoint);

    if (searchParams.toString()) {
      url.search = searchParams.toString();
    }

    fetchEventSource(url.toString(), {
      method: 'POST',
      headers,
      body: payload ? JSON.stringify(payload) : undefined,
      signal: controller.signal,
      /**
       * Allow SSE to work when the page is hidden.
       * https://github.com/Azure/fetch-event-source/issues/17#issuecomment-1525904929
       */
      openWhenHidden: true,
      onopen: async response => {
        if (!response.ok) {
          subscriber.error(response);
          controller.abort();
        } else {
          currentTraceId = response.headers.get('X-Trace-Id') ?? undefined;
        }
      },
      onmessage: (esm: EventSourceMessage) => {
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
