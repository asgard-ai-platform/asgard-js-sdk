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

    const headers: Record<string, string> = {};

    if (apiKey) {
      headers['X-API-KEY'] = apiKey;
    }

    // Always use JSON format for SSE messages
    headers['Content-Type'] = 'application/json';
    
    // Create payload object, excluding files since they should be uploaded separately
    const requestPayload = {
      customChannelId: payload.customChannelId,
      customMessageId: payload.customMessageId,
      text: payload.text,
      action: payload.action,
      payload: payload.payload,
      ...(payload.blobIds && payload.blobIds.length > 0 && { blobIds: payload.blobIds })
    };
    
    
    const body = JSON.stringify(requestPayload);

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
      body,
      signal: controller.signal,
      /**
       * Allow SSE to work when the page is hidden.
       * https://github.com/Azure/fetch-event-source/issues/17#issuecomment-1525904929
       */
      openWhenHidden: true,
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
