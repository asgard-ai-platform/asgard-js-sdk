import {
  AsgardServiceClient,
  Channel,
  ChannelStates,
  Conversation,
  ConversationMessage,
  EventType,
  FetchSsePayload,
  SseResponse,
} from '@asgard-js/core';
import { useCallback, useEffect, useMemo, useState } from 'react';

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
  onBeforeSendMessage?: (params: {
    text: string;
    payload?: Record<string, unknown> | (() => Record<string, unknown>);
  }) => { text: string; payload?: Record<string, unknown> | (() => Record<string, unknown>) };
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
    onBeforeSendMessage,
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
        },
      );
    },
    [channel, customMessageId, onSseMessage, conversation],
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
    ],
  );
}
