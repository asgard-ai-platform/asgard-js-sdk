import { AsgardServiceClient, ClientConfig, ConversationMessage, ToolCallConsentEventData } from '@asgard-js/core';
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

/** Parameters for sending a message */
export interface SendMessageParams {
  text: string;
  blobIds?: string[];
  filePreviewUrls?: string[];
  documentNames?: string[];
  payload?: Record<string, unknown> | (() => Record<string, unknown>);
}

export interface AsgardServiceContextValue {
  avatar?: string;
  title?: string;
  client: AsgardServiceClient | null;
  customChannelId?: string;
  isOpen: boolean;
  isResetting: boolean;
  isConnecting: boolean;
  messages: Map<string, ConversationMessage> | null;
  messageBoxBottomRef: RefObject<HTMLDivElement | null>;
  sendMessage?: UseChannelReturn['sendMessage'];
  resetChannel?: UseChannelReturn['resetChannel'];
  closeChannel?: UseChannelReturn['closeChannel'];
  replyToolCallConsents?: UseChannelReturn['replyToolCallConsents'];
  pendingConsent: ToolCallConsentEventData | null;
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
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  /** 外部設定 textarea 文字的值（透過 ref 呼叫） */
  pendingInputValue: string | null;
  /** 設定待填入 textarea 的文字 */
  setPendingInputValue: (value: string | null) => void;
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
  pendingInputValue: null,
  setPendingInputValue: noop,
  pendingConsent: null,
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
  /** Callback fired when SSE connection encounters an error */
  onSseError?: (error: unknown) => void;
  /**
   * Callback to modify outbound params before they hit the wire. Fires for
   * both regular `sendMessage` and tool-call consent reply (Allow / Deny on
   * the consent modal). For consent reply, `params.text` is always `''` and
   * `params.blobIds` is `undefined` — only the resulting `payload` is
   * forwarded; `text` / `blobIds` from the return are dropped on that path.
   */
  onBeforeSendMessage?: (params: SendMessageParams) => SendMessageParams;
  /** Callback fired after a message has been sent */
  onMessageSent?: () => void;
  /** Whether to automatically reset channel on mount. Defaults to true. */
  autoResetChannel?: boolean;
  /**
   * Fired once the chat channel is ready to accept messages. Re-fires after
   * channel reset.
   */
  onChannelReady?: () => void;
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
    onSseError,
    onBeforeSendMessage,
    onMessageSent,
    autoResetChannel,
    onChannelReady,
  } = props;

  const messageBoxBottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // 外部設定 textarea 文字
  const [pendingInputValue, setPendingInputValue] = useState<string | null>(null);

  // 滾動跟隨狀態管理
  const [isFollowingLatest, setIsFollowingLatest] = useState(true);

  const setFollowingLatest = useCallback((value: boolean) => {
    setIsFollowingLatest(value);
  }, []);

  // 直接操作 chatbot 內部的 scroll container，避免使用 scrollIntoView —
  // scrollIntoView 會冒泡到最近的可捲動祖先，當 chatbot 被嵌入到外部文件
  // 頁面時會連帶捲動整個 <body>，把訪客推離原本的位置。
  const scrollContainerToBottom = useCallback((behavior: ScrollBehavior) => {
    const container = scrollContainerRef.current;
    if (!container) return;

    container.scrollTo({ top: container.scrollHeight, behavior });
  }, []);

  // 用戶觸發的滾動 - 會恢復跟隨狀態
  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = 'smooth') => {
      scrollContainerToBottom(behavior);
      setIsFollowingLatest(true);
    },
    [scrollContainerToBottom],
  );

  // 程式觸發的滾動（串流更新）- 不改變跟隨狀態
  const programmaticScrollToBottom = useCallback(
    (behavior: ScrollBehavior = 'smooth') => {
      scrollContainerToBottom(behavior);
    },
    [scrollContainerToBottom],
  );

  const client = useAsgardServiceClient({ config });

  const {
    isOpen,
    isResetting,
    isConnecting,
    conversation,
    sendMessage,
    resetChannel,
    closeChannel,
    replyToolCallConsents,
  } = useChannel({
    client,
    customChannelId,
    initMessages,
    autoResetChannel,
    onSseMessage,
    onAuthError,
    onSseError,
    onBeforeSendMessage,
    onChannelReady,
  });

  const wrappedSendMessage: UseChannelReturn['sendMessage'] = useMemo(() => {
    if (!sendMessage) return undefined;

    return async params => {
      const resolvedParams = onBeforeSendMessage ? onBeforeSendMessage(params) : params;

      try {
        const result = await sendMessage(resolvedParams);

        onMessageSent?.();

        return result;
      } catch {
        // Errors are surfaced via the `onSseError` prop; swallow here so
        // fire-and-forget callers (e.g. `ref.serviceContext.sendMessage(...)`)
        // do not trigger unhandled promise rejections.
        return undefined;
      }
    };
  }, [sendMessage, onBeforeSendMessage, onMessageSent]);

  // Consent reply runs through onBeforeSendMessage too, so consumers can use a
  // single hook to attach session-level payload (e.g. interaction_mode) on
  // every outbound. The callback is invoked with `text: ''` and the
  // caller-supplied payload (if any) — only the resulting `payload` is
  // forwarded; `text`/`blobIds` from the return are ignored on this path.
  // Side effects inside the callback fire on this path too — branch on
  // intent (e.g. inspect `params.text === ''`) if they should not.
  //
  // Differences from `wrappedSendMessage`:
  //   - No `onMessageSent` fire: consent reply isn't a user message, so the
  //     sent-message lifecycle hook should not fire here.
  //   - No try/catch swallow: the inner `replyToolCallConsents` does not yet
  //     propagate `onSseError`/`onAuthError` (pre-existing gap), so the
  //     promise rejection is the only error signal callers get — swallowing
  //     it would drop errors entirely.
  const wrappedReplyToolCallConsents: UseChannelReturn['replyToolCallConsents'] = useMemo(() => {
    if (!replyToolCallConsents) return undefined;

    return async (answers, payload) => {
      const resolved = onBeforeSendMessage ? onBeforeSendMessage({ text: '', payload }) : { text: '', payload };

      return replyToolCallConsents(answers, resolved.payload);
    };
  }, [replyToolCallConsents, onBeforeSendMessage]);

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
      sendMessage: wrappedSendMessage,
      resetChannel,
      closeChannel,
      replyToolCallConsents: wrappedReplyToolCallConsents,
      pendingConsent: conversation?.pendingConsent ?? null,
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
      pendingInputValue,
      setPendingInputValue,
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
      conversation?.pendingConsent,
      wrappedSendMessage,
      resetChannel,
      closeChannel,
      wrappedReplyToolCallConsents,
      botTypingPlaceholder,
      inputPlaceholder,
      enableUpload,
      enableExport,
      enableDocumentUpload,
      isFollowingLatest,
      setFollowingLatest,
      scrollToBottom,
      programmaticScrollToBottom,
      pendingInputValue,
    ],
  );

  useImperativeHandle(parentRef, () => {
    return {
      serviceContext: contextValue,
      setInputValue: (value: string): void => setPendingInputValue(value),
    };
  });

  return <AsgardServiceContext.Provider value={contextValue}>{children}</AsgardServiceContext.Provider>;
}

export function useAsgardContext(): AsgardServiceContextValue {
  return useContext(AsgardServiceContext);
}
