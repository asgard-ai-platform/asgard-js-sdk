import {
  AsgardServiceClient,
  ClientConfig,
  ConversationMessage,
} from '@asgard-js/core';
import {
  createContext,
  ForwardedRef,
  ReactNode,
  RefObject,
  useContext,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react';
import {
  useAsgardServiceClient,
  useChannel,
  UseChannelProps,
  UseChannelReturn,
} from 'src/hooks';

export interface AsgardServiceContextValue {
  avatar?: string;
  client: AsgardServiceClient | null;
  isOpen: boolean;
  isResetting: boolean;
  isConnecting: boolean;
  messages: Map<string, ConversationMessage> | null;
  messageBoxBottomRef: RefObject<HTMLDivElement>;
  sendMessage?: UseChannelReturn['sendMessage'];
  sendMessageWithFiles?: UseChannelReturn['sendMessageWithFiles'];
  resetChannel?: UseChannelReturn['resetChannel'];
  closeChannel?: UseChannelReturn['closeChannel'];
  botTypingPlaceholder?: string;
}

export const AsgardServiceContext = createContext<AsgardServiceContextValue>({
  avatar: undefined,
  client: null,
  isOpen: false,
  isResetting: false,
  isConnecting: false,
  messages: null,
  messageBoxBottomRef: { current: null },
  botTypingPlaceholder: undefined,
});

export interface AsgardServiceContextProviderProps {
  children: ReactNode;
  parentRef?: ForwardedRef<
    Partial<{ serviceContext?: AsgardServiceContextValue }>
  >;
  avatar?: string;
  config: ClientConfig;
  botTypingPlaceholder?: string;
  customChannelId: string;
  customMessageId?: string;
  delayTime?: number;
  initMessages?: ConversationMessage[];
  onSseMessage?: UseChannelProps['onSseMessage'];
}

export function AsgardServiceContextProvider(
  props: AsgardServiceContextProviderProps
): ReactNode {
  const {
    avatar,
    children,
    parentRef,
    config,
    botTypingPlaceholder,
    customChannelId,
    initMessages,
    onSseMessage,
  } = props;

  const messageBoxBottomRef = useRef<HTMLDivElement>(null);

  const client = useAsgardServiceClient({ config });

  const {
    isOpen,
    isResetting,
    isConnecting,
    conversation,
    sendMessage,
    sendMessageWithFiles,
    resetChannel,
    closeChannel,
  } = useChannel({
    client,
    customChannelId,
    initMessages,
    onSseMessage,
  });

  const contextValue = useMemo(
    () => ({
      avatar,
      client,
      isOpen,
      isResetting,
      isConnecting,
      messages: conversation?.messages ?? null,
      sendMessage,
      sendMessageWithFiles,
      resetChannel,
      closeChannel,
      botTypingPlaceholder,
      messageBoxBottomRef,
    }),
    [
      avatar,
      client,
      isOpen,
      isResetting,
      isConnecting,
      conversation?.messages,
      sendMessage,
      sendMessageWithFiles,
      resetChannel,
      closeChannel,
      botTypingPlaceholder,
    ]
  );

  useImperativeHandle(parentRef, () => {
    return {
      serviceContext: contextValue,
    };
  });

  return (
    <AsgardServiceContext.Provider value={contextValue}>
      {children}
    </AsgardServiceContext.Provider>
  );
}

export function useAsgardContext(): AsgardServiceContextValue {
  return useContext(AsgardServiceContext);
}
