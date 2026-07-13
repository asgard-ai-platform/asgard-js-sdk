import {
  AsgardServiceClient,
  Channel,
  ChannelMetadata,
  ChannelStates,
  Conversation,
  ConversationMessage,
  EventType,
  FetchSsePayload,
  ReactiveStore,
  SseResponse,
  Subagent,
  Task,
  ToolCallConsentAnswer,
} from '@asgard-js/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export interface UseChannelProps {
  defaultIsOpen?: boolean;
  resetPayload?: Pick<FetchSsePayload, 'text'> & Partial<Pick<FetchSsePayload, 'payload'>>;
  client: AsgardServiceClient | null;
  customChannelId: string;
  customMessageId?: string;
  initMessages?: ConversationMessage[];
  autoResetChannel?: boolean;
  onSseMessage?: (
    response: SseResponse<EventType>,
    context: {
      conversation: Conversation | null;
    },
  ) => void;
  onAuthError?: (error: { isAuthError: boolean; isBotProviderError: boolean; errorDetail?: unknown }) => void;
  onSseError?: (error: unknown) => void;
  onBeforeSendMessage?: (params: {
    text: string;
    payload?: Record<string, unknown> | (() => Record<string, unknown>);
  }) => { text: string; payload?: Record<string, unknown> | (() => Record<string, unknown>) };
  /**
   * Fired once the chat channel is ready to accept messages. Triggered after
   * the underlying Channel instance is created and the imperative ref has
   * been updated, which guarantees calling
   * `ref.current.serviceContext.sendMessage` from inside the callback works.
   *
   * Re-fires when the channel is replaced (e.g. after `resetChannel`). Use a
   * guard ref in the consumer if the work should only happen once.
   */
  onChannelReady?: () => void;
}

export interface UseChannelReturn {
  isOpen: boolean;
  isResetting: boolean;
  isConnecting: boolean;
  conversation: Conversation | null;
  sendMessage?: (
    payload: Pick<FetchSsePayload, 'text' | 'blobIds'> &
      Partial<Pick<FetchSsePayload, 'payload'>> & { filePreviewUrls?: string[]; documentNames?: string[] },
  ) => Promise<void>;
  resetChannel?: (payload?: Pick<FetchSsePayload, 'text'> & Partial<Pick<FetchSsePayload, 'payload'>>) => void;
  closeChannel?: () => void;
  replyToolCallConsents?: (answers: ToolCallConsentAnswer[], payload?: FetchSsePayload['payload']) => Promise<void>;
  /** Framework-agnostic derived-state stores from the active channel (F-013); absent in preview mode. */
  taskStore?: ReactiveStore<Task[]>;
  subagentStore?: ReactiveStore<Subagent[]>;
  /** Channel-title store (F-016); seeded from `GET /channel/metadata` then updated live. Absent in preview mode. */
  channelTitleStore?: ReactiveStore<string | null>;
}

export function useChannel(props: UseChannelProps): UseChannelReturn {
  const {
    client,
    defaultIsOpen,
    resetPayload,
    customChannelId,
    customMessageId,
    initMessages,
    autoResetChannel,
    onSseMessage,
    onAuthError,
    onSseError,
    onBeforeSendMessage,
    onChannelReady,
  } = props;

  // Preview mode: client is null (when botProviderEndpoint is 'skip')
  const isPreviewMode = !client;

  const [channel, setChannel] = useState<Channel | null>(null);
  const [isOpen, setIsOpen] = useState(defaultIsOpen ?? true);
  const [isResetting, setIsResetting] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [conversation, setConversation] = useState<Conversation | null>(null);

  // Title seed (F-016): the metadata probe learns the channel title; each channel factory reads it
  // via this ref for `initialTitle` (avoids threading it through every callback signature). `null`
  // = unnamed / not-yet-probed.
  const titleSeedRef = useRef<string | null>(null);

  // Preview mode: static conversation from initMessages
  const previewConversation = useMemo(
    () => (isPreviewMode ? new Conversation({ messages: new Map(initMessages?.map(m => [m.messageId, m])) }) : null),
    [isPreviewMode, initMessages],
  );

  const resetChannel = useCallback(
    async (payload?: Pick<FetchSsePayload, 'text'> & Partial<Pick<FetchSsePayload, 'payload'>>) => {
      if (isPreviewMode || !client) return;

      const conversation = new Conversation({
        messages: new Map(initMessages?.map(message => [message.messageId, message])),
      });

      setIsResetting(true);
      setIsConnecting(true);
      setConversation(conversation);

      const resolvedPayload = onBeforeSendMessage
        ? onBeforeSendMessage({ text: payload?.text ?? '', payload: payload?.payload })
        : payload;

      const channel = await Channel.reset(
        {
          client,
          customChannelId,
          customMessageId,
          conversation,
          initialTitle: titleSeedRef.current,
          statesObserver: (states: ChannelStates): void => {
            setIsConnecting(states.isConnecting);
            setConversation(states.conversation);
          },
        },
        resolvedPayload,
        {
          onSseCompleted() {
            setIsResetting(false);
          },
          onSseError(error) {
            setIsResetting(false);
            // The channel was adopted early (see onChannelCreated below). Reset
            // failed and Channel.reset will close it, so drop it from state —
            // otherwise later sends no-op against a dead channel and the
            // `!channel && isOpen` reset-retry effect can never re-fire.
            setChannel(null);
            // Handle authentication and bot provider errors
            if (error && typeof error === 'object' && ('isAuthError' in error || 'isBotProviderError' in error)) {
              onAuthError?.(
                error as {
                  isAuthError: boolean;
                  isBotProviderError: boolean;
                  errorDetail?: unknown;
                },
              );
            }

            onSseError?.(error);
          },
          onSseMessage(response: SseResponse<EventType>) {
            onSseMessage?.(response, {
              conversation,
            });
          },
        },
        // Adopt the channel as soon as it exists — before the RESET_CHANNEL run
        // completes — so a tool_call.consent emitted during reset can be replied
        // to (otherwise `channel` is still null and the reply is dropped).
        setChannel,
      );

      setIsOpen(true);
      setChannel(channel);
    },
    [
      isPreviewMode,
      client,
      customChannelId,
      customMessageId,
      initMessages,
      onSseMessage,
      onAuthError,
      onSseError,
      onBeforeSendMessage,
    ],
  );

  // Restore an existing channel via GET rejoin (F-015). Unlike reset, the
  // conversation starts EMPTY — its history comes from the server replay, not
  // from initMessages — and no run is dispatched (an existing transcript is
  // never wiped). Input stays disabled (isConnecting) until the replay tails to
  // its terminal; for an idle channel the backend synthesizes one immediately.
  const restoreChannel = useCallback(async () => {
    if (isPreviewMode || !client) return;

    const conversation = new Conversation({ messages: new Map() });

    setIsConnecting(true);
    setConversation(conversation);

    const channel = await Channel.rejoin(
      {
        client,
        customChannelId,
        customMessageId,
        conversation,
        initialTitle: titleSeedRef.current,
        statesObserver: (states: ChannelStates): void => {
          setIsConnecting(states.isConnecting);
          setConversation(states.conversation);
        },
      },
      {
        onSseError(error) {
          // Restore failed and Channel.rejoin closes the channel; drop it from
          // state so a later send does not no-op against a dead channel.
          setChannel(null);
          if (error && typeof error === 'object' && ('isAuthError' in error || 'isBotProviderError' in error)) {
            onAuthError?.(
              error as {
                isAuthError: boolean;
                isBotProviderError: boolean;
                errorDetail?: unknown;
              },
            );
          }

          onSseError?.(error);
        },
        onSseMessage(response: SseResponse<EventType>) {
          onSseMessage?.(response, { conversation });
        },
      },
      // Adopt early so a consent emitted during the restore tail can be replied to.
      setChannel,
    );

    setIsOpen(true);
    setChannel(channel);
  }, [isPreviewMode, client, customChannelId, customMessageId, onSseMessage, onAuthError, onSseError]);

  const initChannel = useCallback(() => {
    if (isPreviewMode || !client) return;

    const conversation = new Conversation({
      messages: new Map(initMessages?.map(message => [message.messageId, message])),
    });

    setConversation(conversation);

    const channel = Channel.create({
      client,
      customChannelId,
      customMessageId,
      conversation,
      initialTitle: titleSeedRef.current,
      statesObserver: (states: ChannelStates): void => {
        setIsConnecting(states.isConnecting);
        setConversation(states.conversation);
      },
    });

    setIsOpen(true);
    setChannel(channel);
  }, [isPreviewMode, client, customChannelId, customMessageId, initMessages]);

  // F-015 mount orchestrator: probe channel metadata, then branch —
  //   exists               → restore (GET rejoin; an existing transcript is never reset)
  //   missing + autoReset   → reset (RESET_CHANNEL dispatches the init run)
  //   missing + !autoReset  → empty channel (first send uses action=NONE)
  // A non-404 metadata error degrades gracefully to an empty channel so an
  // existing transcript is never wiped on an ambiguous failure. A client without
  // getChannelMetadata keeps the pre-F-015 always-reset/always-create behavior.
  const openChannel = useCallback(async () => {
    if (isPreviewMode || !client) return;

    const probe = client.getChannelMetadata?.bind(client);

    if (!probe) {
      if (autoResetChannel !== false) resetChannel(resetPayload);
      else initChannel();

      return;
    }

    // Disable input while we determine the channel's state.
    setIsConnecting(true);

    let metadata: ChannelMetadata | undefined;

    try {
      metadata = await probe(customChannelId);
    } catch (error) {
      if (client.debugMode) {
        // eslint-disable-next-line no-console
        console.warn('[use-channel] channel metadata probe failed; starting empty channel', error);
      }

      // Ambiguous failure: do NOT reset (would wipe an existing transcript). Start empty.
      initChannel();

      return;
    }

    // Seed the channel title from metadata (F-016); live `channel.title.update` refines it after.
    titleSeedRef.current = metadata?.title ?? null;

    if (metadata?.exists) {
      // Existing channel: replay its history. If the client cannot rejoin, fall
      // back to an empty view rather than resetting (which would wipe history).
      if (client.rejoinSse) restoreChannel();
      else initChannel();
    } else if (autoResetChannel !== false) {
      resetChannel(resetPayload);
    } else {
      initChannel();
    }
  }, [
    isPreviewMode,
    client,
    customChannelId,
    autoResetChannel,
    resetChannel,
    restoreChannel,
    initChannel,
    resetPayload,
  ]);

  const closeChannel = useCallback(() => {
    setChannel((prevChannel: Channel | null) => {
      prevChannel?.close();

      return null;
    });
    setIsOpen(false);
    setIsResetting(false);
    setIsConnecting(false);
    setConversation(null);
  }, []);

  const sendMessage = useCallback(
    async (
      payload: Pick<FetchSsePayload, 'text' | 'blobIds'> &
        Partial<Pick<FetchSsePayload, 'payload'>> & {
          filePreviewUrls?: string[];
          documentNames?: string[];
        },
    ): Promise<void> => {
      await channel?.sendMessage(
        { ...payload, customMessageId },
        {
          onSseMessage(response: SseResponse<EventType>) {
            onSseMessage?.(response, {
              conversation,
            });
          },
          onSseError(error) {
            if (error && typeof error === 'object' && ('isAuthError' in error || 'isBotProviderError' in error)) {
              onAuthError?.(
                error as {
                  isAuthError: boolean;
                  isBotProviderError: boolean;
                  errorDetail?: unknown;
                },
              );
            }

            onSseError?.(error);
          },
        },
      );
    },
    [channel, customMessageId, onSseMessage, onAuthError, onSseError, conversation],
  );

  const replyToolCallConsents = useCallback(
    async (answers: ToolCallConsentAnswer[], payload?: FetchSsePayload['payload']): Promise<void> => {
      if (client?.debugMode) {
        // eslint-disable-next-line no-console
        console.log(
          `[consent] use-channel.replyToolCallConsents · channel=${channel ? 'SET' : 'NULL ← reply 會被丟掉!'}`,
        );
      }

      await channel?.replyToolCallConsents(
        answers,
        {
          onSseMessage(response: SseResponse<EventType>) {
            onSseMessage?.(response, {
              conversation,
            });
          },
        },
        payload,
      );
    },
    [channel, client, onSseMessage, conversation],
  );

  // Guards the async open (metadata probe → restore/reset/create) against
  // re-entry: the channel stays null across the probe's await, so without this
  // a re-render (new resetPayload identity, etc.) would kick off a second open.
  const openingRef = useRef(false);
  useEffect(() => {
    if (isPreviewMode) return;

    if (!channel && isOpen && !openingRef.current) {
      openingRef.current = true;
      void openChannel().finally(() => {
        openingRef.current = false;
      });
    }
  }, [isPreviewMode, channel, isOpen, openChannel]);

  const prevChannelRef = useRef<Channel | null>(null);
  useEffect(() => {
    if (channel && channel !== prevChannelRef.current) {
      prevChannelRef.current = channel;
      onChannelReady?.();
    } else if (!channel) {
      prevChannelRef.current = null;
    }
  }, [channel, onChannelReady]);

  useEffect(() => {
    return (): void => closeChannel();
  }, [closeChannel]);

  return useMemo(
    () =>
      isPreviewMode
        ? {
            isOpen: true,
            isResetting: false,
            isConnecting: false,
            conversation: previewConversation,
          }
        : {
            isOpen,
            isResetting,
            isConnecting,
            conversation,
            sendMessage,
            resetChannel,
            closeChannel,
            replyToolCallConsents,
            taskStore: channel?.tasks,
            subagentStore: channel?.subagents,
            channelTitleStore: channel?.channelTitle,
          },
    [
      isPreviewMode,
      previewConversation,
      isOpen,
      isResetting,
      isConnecting,
      conversation,
      sendMessage,
      resetChannel,
      closeChannel,
      replyToolCallConsents,
      channel,
    ],
  );
}
