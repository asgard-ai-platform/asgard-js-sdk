import { BehaviorSubject, combineLatest, distinctUntilChanged, map, skip, Subscription } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import {
  ChannelConfig,
  ChannelStates,
  ConversationMessage,
  FetchSseOptions,
  FetchSsePayload,
  IAsgardServiceClient,
  ObserverOrNext,
  ReactiveStore,
  SseResponse,
  ToolCallConsentAnswer,
} from '../types';
import { FetchSseAction, EventType } from '../constants/enum';
import Conversation from './conversation';
import { deepEqual, reduceSubagents, reduceTasks, Subagent, Task } from './derived-state';

const messagesOf = (conversation: Conversation): ConversationMessage[] =>
  Array.from(conversation.messages?.values() ?? []);

// Wrap a BehaviorSubject as the framework-agnostic ReactiveStore (F-013). `getSnapshot` reads the
// current value; `subscribe` notifies on *changes only* (skip the synchronous replay of the current
// value — getSnapshot already provides it).
function toReactiveStore<T>(subject: BehaviorSubject<T>): ReactiveStore<T> {
  return {
    getSnapshot: () => subject.getValue(),
    subscribe: (listener: () => void): (() => void) => {
      const sub = subject.pipe(skip(1)).subscribe(() => listener());

      return () => sub.unsubscribe();
    },
    observable: subject.asObservable(),
  };
}

export default class Channel {
  private client: IAsgardServiceClient;

  public customChannelId: string;
  public customMessageId?: string;

  private isConnecting$: BehaviorSubject<boolean>;
  private conversation$: BehaviorSubject<Conversation>;
  private tasks$: BehaviorSubject<Task[]>;
  private subagents$: BehaviorSubject<Subagent[]>;
  // Channel title (F-016). Seeded from `metadata.title` on entry; updated by the ephemeral
  // `channel.title.update` event. Its own subject (independent of `conversation$`), so a consumer
  // that only wants the title is not redrawn by high-frequency `message.delta`.
  private channelTitle$: BehaviorSubject<string | null>;
  // Sandbox name for this channel (sandbox Files/Browser foundation). Derived from the ephemeral
  // `sandbox.launch` / `sandbox.ready` events; `null` until one arrives (no metadata seed exists, so
  // a cold rejoin lacks it until the next sandbox event). Keys the `/sandbox/{name}/…` REST APIs.
  private sandboxName$: BehaviorSubject<string | null>;

  /** Framework-agnostic derived-state stores (F-013): current-list snapshot + change notification. */
  public readonly tasks: ReactiveStore<Task[]>;
  public readonly subagents: ReactiveStore<Subagent[]>;
  /** Channel-title store (F-016): current title snapshot + change notification (title-only changes). */
  public readonly channelTitle: ReactiveStore<string | null>;
  /** Sandbox-name store: the current sandbox for this channel, folded from `sandbox.launch`/`ready`. */
  public readonly sandboxName: ReactiveStore<string | null>;

  private statesObserver?: ObserverOrNext<ChannelStates>;
  private statesSubscription?: Subscription;
  private derivedSubscription?: Subscription;
  private currentUserMessageId?: string;
  // The most-recently-sent user message id. Unlike currentUserMessageId (which
  // is cleared once a traceId is attached), this is kept across the SSE
  // lifecycle so RESPONSE_TOOL_CALL_CONSENT — fired after run.done — can echo
  // back the message id the bot is waiting on.
  private lastSentMessageId?: string;

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

    // Seed the derived slices from the initial conversation so a snapshot is valid before the first
    // SSE event; `subscribe()` keeps them folded from `conversation$` thereafter (F-013).
    const initialMessages = messagesOf(config.conversation);
    this.tasks$ = new BehaviorSubject<Task[]>(reduceTasks(initialMessages));
    this.subagents$ = new BehaviorSubject<Subagent[]>(reduceSubagents(initialMessages));
    this.tasks = toReactiveStore(this.tasks$);
    this.subagents = toReactiveStore(this.subagents$);

    // Seed the title from metadata (F-016); `channel.title.update` events refine it thereafter.
    this.channelTitle$ = new BehaviorSubject<string | null>(config.initialTitle ?? null);
    this.channelTitle = toReactiveStore(this.channelTitle$);

    // Sandbox name: no seed (not on metadata); folded from `sandbox.launch`/`ready`.
    this.sandboxName$ = new BehaviorSubject<string | null>(null);
    this.sandboxName = toReactiveStore(this.sandboxName$);

    this.statesObserver = config.statesObserver;
  }

  public static create(config: ChannelConfig): Channel {
    const channel = new Channel(config);
    channel.subscribe();

    return channel;
  }

  public static async reset(
    config: ChannelConfig,
    payload?: Pick<FetchSsePayload, 'text' | 'payload'>,
    options?: FetchSseOptions,
    onChannelCreated?: (channel: Channel) => void,
  ): Promise<Channel> {
    const channel = new Channel(config);

    try {
      channel.subscribe();

      // Expose the channel before the RESET_CHANNEL run finishes. The backend
      // can emit a tool_call.consent *during* this run (before run.done), so a
      // reply submitted while the modal is up must reach a non-null channel —
      // otherwise the consent answer is silently dropped.
      onChannelCreated?.(channel);

      await channel.resetChannel(payload, options);

      return channel;
    } catch (error) {
      channel.close();

      throw error;
    }
  }

  /**
   * Restore an existing channel (F-015): subscribe, then GET-rejoin to replay
   * its collapsed history and tail any in-flight run to terminal — without
   * re-dispatching a run (an existing transcript is never wiped). The channel is
   * exposed early (like `reset`) so a consent emitted during the restore tail
   * can be replied to against a non-null channel.
   */
  public static async rejoin(
    config: ChannelConfig,
    options?: FetchSseOptions,
    onChannelCreated?: (channel: Channel) => void,
  ): Promise<Channel> {
    const channel = new Channel(config);

    try {
      channel.subscribe();
      onChannelCreated?.(channel);

      await channel.rejoinChannel(options);

      return channel;
    } catch (error) {
      channel.close();

      throw error;
    }
  }

  private subscribe(): void {
    // Fold the conversation into each derived slice; `distinctUntilChanged` (structural) makes a
    // slice re-emit only when its content actually changes, so a high-frequency `message.delta`
    // that leaves tasks/subagents untouched does not push a new list (F-013).
    this.derivedSubscription = new Subscription();
    this.derivedSubscription.add(
      this.conversation$
        .pipe(
          map(conversation => reduceTasks(messagesOf(conversation))),
          distinctUntilChanged<Task[]>(deepEqual),
        )
        .subscribe(this.tasks$),
    );
    this.derivedSubscription.add(
      this.conversation$
        .pipe(
          map(conversation => reduceSubagents(messagesOf(conversation))),
          distinctUntilChanged<Subagent[]>(deepEqual),
        )
        .subscribe(this.subagents$),
    );

    this.statesSubscription = combineLatest([
      this.isConnecting$,
      this.conversation$,
      this.tasks$,
      this.subagents$,
      this.channelTitle$,
      this.sandboxName$,
    ])
      .pipe(
        map(([isConnecting, conversation, tasks, subagents, title, sandboxName]) => ({
          isConnecting,
          conversation,
          tasks,
          subagents,
          title,
          sandboxName,
        })),
      )
      .subscribe(this.statesObserver);
  }

  /**
   * Resolves payload by executing it if it's a function, otherwise returns as-is.
   */
  private resolvePayload(
    payload: Record<string, unknown> | (() => Record<string, unknown>) | undefined,
  ): Record<string, unknown> | undefined {
    if (typeof payload === 'function') {
      try {
        return payload();
      } catch (error) {
        throw new Error(
          `Failed to resolve payload function: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return payload;
  }

  private fetchSse(payload: FetchSsePayload, options?: FetchSseOptions): Promise<void> {
    return this.streamSse(handlers => this.client.fetchSse(payload, handlers), options);
  }

  /**
   * Shared SSE-stream plumbing for both the POST send-and-stream turns and the
   * GET rejoin (F-015): flip `isConnecting`, fold every frame into the
   * conversation (attaching the trace id to the just-sent user message when
   * present), and settle the promise on complete/error. `start` opens the
   * concrete stream (POST `fetchSse` or GET `rejoinSse`).
   */
  private streamSse(start: (handlers: FetchSseOptions) => void, options?: FetchSseOptions): Promise<void> {
    return new Promise((resolve, reject) => {
      this.isConnecting$.next(true);

      start({
        onSseStart: options?.onSseStart,
        onSseMessage: (response: SseResponse<EventType>) => {
          options?.onSseMessage?.(response);

          // Channel title (F-016): the ephemeral `channel.title.update` event carries the new title
          // on the channel (not a conversation message), so update the title store directly. Guard on
          // change so a repeated title does not re-notify title-only subscribers.
          if (response.eventType === EventType.CHANNEL_TITLE_UPDATE) {
            const nextTitle = (response as SseResponse<EventType.CHANNEL_TITLE_UPDATE>).fact.channelTitleUpdate.title;
            if (nextTitle !== this.channelTitle$.value) {
              this.channelTitle$.next(nextTitle);
            }
          }

          // Sandbox name (Files/Browser foundation): `sandbox.launch`/`ready` both carry it; take the
          // latest and guard on change so consumers of only the sandbox name aren't re-notified.
          if (response.eventType === EventType.SANDBOX_LAUNCH || response.eventType === EventType.SANDBOX_READY) {
            const fact = (response as SseResponse<EventType.SANDBOX_LAUNCH | EventType.SANDBOX_READY>).fact;
            const nextName = (fact.sandboxLaunch ?? fact.sandboxReady)?.sandboxName ?? null;
            if (nextName && nextName !== this.sandboxName$.value) {
              this.sandboxName$.next(nextName);
            }
          }

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

  /**
   * GET rejoin (F-015): restore an existing channel by replaying its collapsed
   * history over the wire (never re-dispatching a run), then tailing an
   * in-flight run to its terminal. `isConnecting` stays true until that terminal
   * arrives — for an idle channel the backend synthesizes one immediately, so
   * input is released right away.
   */
  private rejoinChannel(options?: FetchSseOptions): Promise<void> {
    if (!this.client.rejoinSse) {
      return Promise.reject(new Error('client does not support rejoinSse (GET rejoin)'));
    }

    return this.streamSse(handlers => this.client.rejoinSse?.(this.customChannelId, handlers), options);
  }

  private resetChannel(payload?: Pick<FetchSsePayload, 'text' | 'payload'>, options?: FetchSseOptions): Promise<void> {
    return this.fetchSse(
      {
        action: FetchSseAction.RESET_CHANNEL,
        customChannelId: this.customChannelId,
        customMessageId: this.customMessageId,
        text: payload?.text || '',
        payload: this.resolvePayload(payload?.payload),
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
    this.lastSentMessageId = messageId;

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

    return this.fetchSse(
      {
        action: FetchSseAction.NONE,
        customChannelId: this.customChannelId,
        customMessageId: messageId,
        payload: this.resolvePayload(payload?.payload),
        text,
        blobIds: payload?.blobIds,
      },
      options,
    );
  }

  public replyToolCallConsents(
    toolCallConsents: ToolCallConsentAnswer[],
    options?: FetchSseOptions,
    payload?: FetchSsePayload['payload'],
  ): Promise<void> {
    this.conversation$.next(this.conversation$.value.clearPendingConsent());

    return this.fetchSse(
      {
        action: FetchSseAction.RESPONSE_TOOL_CALL_CONSENT,
        customChannelId: this.customChannelId,
        customMessageId: this.lastSentMessageId ?? this.customMessageId,
        payload: this.resolvePayload(payload),
        text: '',
        toolCallConsents,
      },
      options,
    );
  }

  public close(): void {
    this.isConnecting$.complete();
    this.conversation$.complete();
    this.tasks$.complete();
    this.subagents$.complete();
    this.channelTitle$.complete();
    this.sandboxName$.complete();
    this.derivedSubscription?.unsubscribe();
    this.statesSubscription?.unsubscribe();
  }
}
