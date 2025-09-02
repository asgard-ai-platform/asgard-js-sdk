import { Observable } from 'rxjs';
import {
  EventSourceMessage,
  fetchEventSource,
} from '@microsoft/fetch-event-source';
import { FetchSsePayload, SseResponse } from '../types';
import { EventType } from '../constants/enum';

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
      /**
       * Allow SSE to work when the page is hidden.
       * https://github.com/Azure/fetch-event-source/issues/17#issuecomment-1525904929
       */
      openWhenHidden: true,
      onopen: async (response) => {
        if (!response.ok) {
          // Enhanced error handling for authentication and bot provider issues
          let errorDetail;
          try {
            const errorText = await response.text();
            errorDetail = JSON.parse(errorText);
          } catch {
            errorDetail = { message: `HTTP ${response.status}: ${response.statusText}` };
          }

          const enhancedError = {
            response,
            status: response.status,
            statusText: response.statusText,
            errorDetail,
            isAuthError: response.status === 401,
            isBotProviderError: response.status === 400 && 
              (errorDetail?.code === 'BOT_PROVIDER_DISABLED' || errorDetail?.code === 'BOT_PROVIDER_NOT_FOUND'),
          };

          subscriber.error(enhancedError);
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
