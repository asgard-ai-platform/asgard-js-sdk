import { Observable } from 'rxjs';
import {
  EventSourceMessage,
  fetchEventSource,
} from '@microsoft/fetch-event-source';
import { FetchSsePayload, SseResponse } from 'src/types';
import { EventType } from 'src/constants/enum';

interface CreateSseObservableOptions {
  endpoint: string;
  apiKey?: string;
  debugMode?: boolean;
  payload: FetchSsePayload;
}

export function createSseObservable(
  options: CreateSseObservableOptions
): Observable<SseResponse<EventType>> {
  const { endpoint, apiKey, payload, debugMode } = options;

  return new Observable<SseResponse<EventType>>((subscriber) => {
    const controller = new AbortController();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
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
      onopen: async (response) => {
        if (!response.ok) {
          subscriber.error(response);
          controller.abort();
        }
      },
      onmessage: (esm: EventSourceMessage) => {
        subscriber.next(JSON.parse(esm.data));
      },
      onclose: () => {
        subscriber.complete();
      },
      onerror: (err) => {
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
