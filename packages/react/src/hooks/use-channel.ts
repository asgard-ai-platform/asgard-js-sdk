import {
  AsgardServiceClient,
  Channel,
  ChannelStates,
  Conversation,
  ConversationMessage,
  EventType,
  FetchSsePayload,
  SseResponse,
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
  replyToolCallConsents?: (answers: ToolCallConsentAnswer[]) => Promise<void>;
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
      statesObserver: (states: ChannelStates): void => {
        setIsConnecting(states.isConnecting);
        setConversation(states.conversation);
      },
    });

    setIsOpen(true);
    setChannel(channel);
  }, [isPreviewMode, client, customChannelId, customMessageId, initMessages]);

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
    async (answers: ToolCallConsentAnswer[]): Promise<void> => {
      await channel?.replyToolCallConsents(answers, {
        onSseMessage(response: SseResponse<EventType>) {
          onSseMessage?.(response, {
            conversation,
          });
        },
      });
    },
    [channel, onSseMessage, conversation],
  );

  useEffect(() => {
    if (isPreviewMode) return;

    if (!channel && isOpen) {
      if (autoResetChannel !== false) {
        resetChannel(resetPayload);
      } else {
        initChannel();
      }
    }
  }, [isPreviewMode, channel, isOpen, autoResetChannel, resetChannel, initChannel, resetPayload]);

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
    ],
  );
}
