import { AsgardServiceClient, ClientConfig, ConversationMessage } from '@asgard-js/core';
import {
  createContext,
  ForwardedRef,
  ReactNode,
  RefObject,
  useCallback,
  useContext,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useAsgardServiceClient, useChannel, UseChannelProps, UseChannelReturn } from '../hooks';

export interface AsgardServiceContextValue {
  avatar?: string;
  title?: string;
  client: AsgardServiceClient | null;
  customChannelId?: string;
  isOpen: boolean;
  isResetting: boolean;
  isConnecting: boolean;
  messages: Map<string, ConversationMessage> | null;
  messageBoxBottomRef: RefObject<HTMLDivElement>;
  sendMessage?: UseChannelReturn['sendMessage'];
  resetChannel?: UseChannelReturn['resetChannel'];
  closeChannel?: UseChannelReturn['closeChannel'];
  botTypingPlaceholder?: string;
  inputPlaceholder?: string;
  enableUpload?: boolean;
  enableExport?: boolean;
  enableDocumentUpload?: boolean;
  /** 用戶是否正在跟隨最新內容（用於自動滾動判斷） */
  isFollowingLatest: boolean;
  /** 設定跟隨狀態 */
  setFollowingLatest: (value: boolean) => void;
  /** 滾動到底部（由用戶觸發，會恢復跟隨狀態） */
  scrollToBottom: (behavior?: ScrollBehavior) => void;
  /** 程式滾動到底部（不會改變跟隨狀態） */
  programmaticScrollToBottom: (behavior?: ScrollBehavior) => void;
  /** 滾動容器的 ref */
  scrollContainerRef: RefObject<HTMLDivElement>;
}

function noop(): void {
  // intentionally empty
}

export const AsgardServiceContext = createContext<AsgardServiceContextValue>({
  avatar: undefined,
  title: undefined,
  client: null,
  customChannelId: undefined,
  isOpen: false,
  isResetting: false,
  isConnecting: false,
  messages: null,
  messageBoxBottomRef: { current: null },
  botTypingPlaceholder: undefined,
  inputPlaceholder: undefined,
  enableUpload: undefined,
  enableExport: undefined,
  enableDocumentUpload: undefined,
  isFollowingLatest: true,
  setFollowingLatest: noop,
  scrollToBottom: noop,
  programmaticScrollToBottom: noop,
  scrollContainerRef: { current: null },
});

export interface AsgardServiceContextProviderProps {
  children: ReactNode;
  parentRef?: ForwardedRef<Partial<{ serviceContext?: AsgardServiceContextValue }>>;
  avatar?: string;
  title?: string;
  config: ClientConfig;
  botTypingPlaceholder?: string;
  inputPlaceholder?: string;
  enableUpload?: boolean;
  enableExport?: boolean;
  enableDocumentUpload?: boolean;
  customChannelId: string;
  customMessageId?: string;
  delayTime?: number;
  initMessages?: ConversationMessage[];
  onSseMessage?: UseChannelProps['onSseMessage'];
  onAuthError?: (error: { isAuthError: boolean; isBotProviderError: boolean; errorDetail?: unknown }) => void;
}

export function AsgardServiceContextProvider(props: AsgardServiceContextProviderProps): ReactNode {
  const {
    avatar,
    title,
    children,
    parentRef,
    config,
    botTypingPlaceholder,
    inputPlaceholder,
    enableUpload,
    enableExport,
    enableDocumentUpload,
    customChannelId,
    initMessages,
    onSseMessage,
    onAuthError,
  } = props;

  const messageBoxBottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // 滾動跟隨狀態管理
  const [isFollowingLatest, setIsFollowingLatest] = useState(true);

  const setFollowingLatest = useCallback((value: boolean) => {
    setIsFollowingLatest(value);
  }, []);

  // 用戶觸發的滾動 - 會恢復跟隨狀態
  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const scrollContainer = scrollContainerRef.current;
    if (scrollContainer) {
      scrollContainer.scrollTo({
        top: scrollContainer.scrollHeight,
        behavior,
      });
    }

    setIsFollowingLatest(true);
  }, []);

  // 程式觸發的滾動（串流更新）- 不改變跟隨狀態
  const programmaticScrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const scrollContainer = scrollContainerRef.current;
    if (scrollContainer) {
      scrollContainer.scrollTo({
        top: scrollContainer.scrollHeight,
        behavior,
      });
    }
  }, []);

  const client = useAsgardServiceClient({ config });

  const { isOpen, isResetting, isConnecting, conversation, sendMessage, resetChannel, closeChannel } = useChannel({
    client,
    customChannelId,
    initMessages,
    onSseMessage,
    onAuthError,
  });

  const contextValue = useMemo(
    () => ({
      avatar,
      title,
      client,
      customChannelId,
      isOpen,
      isResetting,
      isConnecting,
      messages: conversation?.messages ?? null,
      sendMessage,
      resetChannel,
      closeChannel,
      botTypingPlaceholder,
      inputPlaceholder,
      enableUpload,
      enableExport,
      enableDocumentUpload,
      messageBoxBottomRef,
      scrollContainerRef,
      isFollowingLatest,
      setFollowingLatest,
      scrollToBottom,
      programmaticScrollToBottom,
    }),
    [
      avatar,
      title,
      client,
      customChannelId,
      isOpen,
      isResetting,
      isConnecting,
      conversation?.messages,
      sendMessage,
      resetChannel,
      closeChannel,
      botTypingPlaceholder,
      inputPlaceholder,
      enableUpload,
      enableExport,
      enableDocumentUpload,
      isFollowingLatest,
      setFollowingLatest,
      scrollToBottom,
      programmaticScrollToBottom,
    ],
  );

  useImperativeHandle(parentRef, () => {
    return {
      serviceContext: contextValue,
    };
  });

  return <AsgardServiceContext.Provider value={contextValue}>{children}</AsgardServiceContext.Provider>;
}

export function useAsgardContext(): AsgardServiceContextValue {
  return useContext(AsgardServiceContext);
}
