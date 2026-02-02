import { BehaviorSubject, combineLatest, map, Subscription } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import {
  ChannelConfig,
  ChannelStates,
  FetchSseOptions,
  FetchSsePayload,
  IAsgardServiceClient,
  ObserverOrNext,
  SseResponse,
} from '../types';
import { FetchSseAction, EventType } from '../constants/enum';
import Conversation from './conversation';

export default class Channel {
  private client: IAsgardServiceClient;

  public customChannelId: string;
  public customMessageId?: string;

  private isConnecting$: BehaviorSubject<boolean>;
  private conversation$: BehaviorSubject<Conversation>;
  private statesObserver?: ObserverOrNext<ChannelStates>;
  private statesSubscription?: Subscription;
  private currentUserMessageId?: string;

  private constructor(config: ChannelConfig) {
    if (!config.client) {
      throw new Error('client must be required');
    }

    if (!config.customChannelId) {
      throw new Error('customChannelId must be required');
    }

    this.client = config.client;
    this.customChannelId = config.customChannelId;
    this.customMessageId = config.customMessageId;

    this.isConnecting$ = new BehaviorSubject(false);
    this.conversation$ = new BehaviorSubject(config.conversation);
    this.statesObserver = config.statesObserver;
  }

  public static async reset(
    config: ChannelConfig,
    payload?: Pick<FetchSsePayload, 'text' | 'payload'>,
    options?: FetchSseOptions,
  ): Promise<Channel> {
    const channel = new Channel(config);

    try {
      channel.subscribe();

      await channel.resetChannel(payload, options);

      return channel;
    } catch (error) {
      channel.close();

      throw error;
    }
  }

  private subscribe(): void {
    this.statesSubscription = combineLatest([this.isConnecting$, this.conversation$])
      .pipe(
        map(([isConnecting, conversation]) => ({
          isConnecting,
          conversation,
        })),
      )
      .subscribe(this.statesObserver);
  }

  private fetchSse(payload: FetchSsePayload, options?: FetchSseOptions): Promise<void> {
    return new Promise((resolve, reject) => {
      this.isConnecting$.next(true);

      this.client.fetchSse(payload, {
        onSseStart: options?.onSseStart,
        onSseMessage: (response: SseResponse<EventType>) => {
          options?.onSseMessage?.(response);

          if (this.currentUserMessageId && response.traceId) {
            const messages = new Map(this.conversation$.value.messages);
            const userMessage = messages.get(this.currentUserMessageId);

            if (userMessage && userMessage.type === 'user') {
              messages.set(this.currentUserMessageId, {
                ...userMessage,
                traceId: response.traceId,
              });
              this.conversation$.next(new Conversation({ messages }));
            }

            this.currentUserMessageId = undefined;
          }

          this.conversation$.next(this.conversation$.value.onMessage(response));
        },
        onSseError: (err: unknown) => {
          options?.onSseError?.(err);
          this.isConnecting$.next(false);
          this.currentUserMessageId = undefined;
          reject(err);
        },
        onSseCompleted: () => {
          options?.onSseCompleted?.();
          this.isConnecting$.next(false);
          this.currentUserMessageId = undefined;
          resolve();
        },
      });
    });
  }

  private resetChannel(payload?: Pick<FetchSsePayload, 'text' | 'payload'>, options?: FetchSseOptions): Promise<void> {
    return this.fetchSse(
      {
        action: FetchSseAction.RESET_CHANNEL,
        customChannelId: this.customChannelId,
        customMessageId: this.customMessageId,
        text: payload?.text || '',
        payload: payload?.payload,
      },
      options,
    );
  }

  public sendMessage(
    payload: Pick<FetchSsePayload, 'customMessageId' | 'text' | 'payload' | 'blobIds'> & {
      filePreviewUrls?: string[];
      documentNames?: string[];
    },
    options?: FetchSseOptions,
  ): Promise<void> {
    const text = payload.text.trim();
    const messageId = payload.customMessageId ?? uuidv4();

    this.currentUserMessageId = messageId;

    this.conversation$.next(
      this.conversation$.value.pushMessage({
        type: 'user',
        messageId,
        text,
        blobIds: payload.blobIds,
        filePreviewUrls: payload.filePreviewUrls,
        documentNames: payload.documentNames,
        time: new Date(),
      }),
    );

    // 如果 payload 是函式，則執行它獲取實際的 payload 物件
    const resolvedPayload = typeof payload?.payload === 'function' ? payload.payload() : payload?.payload;

    return this.fetchSse(
      {
        action: FetchSseAction.NONE,
        customChannelId: this.customChannelId,
        customMessageId: messageId,
        payload: resolvedPayload,
        text,
        blobIds: payload?.blobIds,
      },
      options,
    );
  }

  public close(): void {
    this.isConnecting$.complete();
    this.conversation$.complete();
    this.statesSubscription?.unsubscribe();
  }
}
