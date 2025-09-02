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
  onSseMessage?: (
    response: SseResponse<EventType>,
    context: {
      conversation: Conversation | null;
    }
  ) => void;
  onAuthError?: (error: { isAuthError: boolean; isBotProviderError: boolean; errorDetail?: any }) => void;
}

export interface UseChannelReturn {
  isOpen: boolean;
  isResetting: boolean;
  isConnecting: boolean;
  conversation: Conversation | null;
  sendMessage?: (payload: Pick<FetchSsePayload, 'text'> & Partial<Pick<FetchSsePayload, 'payload'>>) => void;
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
    onSseMessage,
    onAuthError,
  } = props;

  if (!client) {
    throw new Error('Client instance is required');
  }

  if (!customChannelId) {
    throw new Error('Custom channel id is required');
  }

  const [channel, setChannel] = useState<Channel | null>(null);
  const [isOpen, setIsOpen] = useState(defaultIsOpen ?? true);
  const [isResetting, setIsResetting] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [conversation, setConversation] = useState<Conversation | null>(null);

  const resetChannel = useCallback(
    async (payload?: Pick<FetchSsePayload, 'text'> & Partial<Pick<FetchSsePayload, 'payload'>>) => {
      const conversation = new Conversation({
        messages: new Map(
          initMessages?.map((message) => [message.messageId, message])
        ),
      });

      setIsResetting(true);
      setIsConnecting(true);
      setConversation(conversation);

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
        payload,
        {
          onSseCompleted() {
            setIsResetting(false);
          },
          onSseError(error) {
            setIsResetting(false);
            // Handle authentication and bot provider errors
            if (error && typeof error === 'object' && ('isAuthError' in error || 'isBotProviderError' in error)) {
              onAuthError?.(error as any);
            }
          },
          onSseMessage(response: SseResponse<EventType>) {
            onSseMessage?.(response, {
              conversation,
            });
          },
        }
      );

      setIsOpen(true);
      setChannel(channel);
    },
    [client, customChannelId, customMessageId, initMessages, onSseMessage, onAuthError]
  );

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
    (payload: Pick<FetchSsePayload, 'text'> & Partial<Pick<FetchSsePayload, 'payload'>>) =>
      channel?.sendMessage({ ...payload, customMessageId }),
    [channel, customMessageId]
  );

  useEffect(() => {
    if (!channel && isOpen) resetChannel(resetPayload);
  }, [channel, isOpen, resetChannel, resetPayload]);

  useEffect(() => {
    return (): void => closeChannel();
  }, [closeChannel]);

  return useMemo(
    () => ({
      isOpen,
      isResetting,
      isConnecting,
      conversation,
      sendMessage,
      resetChannel,
      closeChannel,
    }),
    [
      isOpen,
      isResetting,
      isConnecting,
      conversation,
      sendMessage,
      resetChannel,
      closeChannel,
    ]
  );
}
