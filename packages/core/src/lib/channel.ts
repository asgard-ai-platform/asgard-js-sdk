import { BehaviorSubject, combineLatest, map, Subscription } from 'rxjs';
import {
  ChannelConfig,
  ChannelStates,
  FetchSseOptions,
  FetchSsePayload,
  IAsgardServiceClient,
  ObserverOrNext,
} from 'src/types';
import { FetchSseAction } from 'src/constants/enum';
import Conversation from './conversation';

export default class Channel {
  private client: IAsgardServiceClient;

  public customChannelId: string;
  public customMessageId?: string;

  private isConnecting$: BehaviorSubject<boolean>;
  private conversation$: BehaviorSubject<Conversation>;
  private statesObserver?: ObserverOrNext<ChannelStates>;
  private statesSubscription?: Subscription;

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
    options?: FetchSseOptions
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
    this.statesSubscription = combineLatest([
      this.isConnecting$,
      this.conversation$,
    ])
      .pipe(
        map(([isConnecting, conversation]) => ({
          isConnecting,
          conversation,
        }))
      )
      .subscribe(this.statesObserver);
  }

  private fetchSse(
    payload: FetchSsePayload,
    options?: FetchSseOptions
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      this.isConnecting$.next(true);

      this.client.fetchSse(payload, {
        onSseStart: options?.onSseStart,
        onSseMessage: (response) => {
          options?.onSseMessage?.(response);
          this.conversation$.next(this.conversation$.value.onMessage(response));
        },
        onSseError: (err) => {
          options?.onSseError?.(err);
          this.isConnecting$.next(false);
          reject(err);
        },
        onSseCompleted: () => {
          options?.onSseCompleted?.();
          this.isConnecting$.next(false);
          resolve();
        },
      });
    });
  }

  private resetChannel(
    payload?: Pick<FetchSsePayload, 'text' | 'payload'>,
    options?: FetchSseOptions
  ): Promise<void> {
    return this.fetchSse(
      {
        action: FetchSseAction.RESET_CHANNEL,
        customChannelId: this.customChannelId,
        customMessageId: this.customMessageId,
        text: payload?.text || '',
        payload: payload?.payload,
      },
      options
    );
  }

  public sendMessage(
    payload: Pick<FetchSsePayload, 'customMessageId' | 'text' | 'payload'>,
    options?: FetchSseOptions
  ): Promise<void> {
    const text = payload.text.trim();
    const messageId = payload.customMessageId ?? crypto.randomUUID();

    this.conversation$.next(
      this.conversation$.value.pushMessage({
        type: 'user',
        messageId,
        text,
        time: new Date(),
      })
    );

    return this.fetchSse(
      {
        action: FetchSseAction.NONE,
        customChannelId: this.customChannelId,
        customMessageId: messageId,
        payload: payload?.payload,
        text,
      },
      options
    );
  }

  public async sendMessageWithFiles(
    payload: Pick<FetchSsePayload, 'customMessageId' | 'text' | 'payload'> & { files: File[] },
    options?: FetchSseOptions
  ): Promise<void> {
    const text = payload.text?.trim() || '';
    const messageId = payload.customMessageId ?? crypto.randomUUID();

    // Create file attachments from files
    const fileAttachments = payload.files.map(file => ({
      name: file.name,
      size: file.size,
      type: file.type,
      url: URL.createObjectURL(file), // 建立預覽 URL
    }));

    // Add user message to conversation first
    this.conversation$.next(
      this.conversation$.value.pushMessage({
        type: 'user',
        messageId,
        text,
        time: new Date(),
        files: fileAttachments,
      })
    );

    // Set connecting state
    this.isConnecting$.next(true);

    try {
      // Use client's sendMessageWithFiles method which handles the two-step process
      await this.client.sendMessageWithFiles({
        action: FetchSseAction.NONE,
        customChannelId: this.customChannelId,
        customMessageId: messageId,
        payload: payload?.payload,
        text,
        files: payload.files
      }, {
        onSseStart: options?.onSseStart,
        onSseMessage: (response) => {
          options?.onSseMessage?.(response);
          this.conversation$.next(this.conversation$.value.onMessage(response));
        },
        onSseError: (err) => {
          options?.onSseError?.(err);
          this.isConnecting$.next(false);
          throw err;
        },
        onSseCompleted: () => {
          options?.onSseCompleted?.();
          this.isConnecting$.next(false);
        },
      });
    } catch (error) {
      this.isConnecting$.next(false);
      throw error;
    }
  }

  public close(): void {
    this.isConnecting$.complete();
    this.conversation$.complete();
    this.statesSubscription?.unsubscribe();
  }
}
