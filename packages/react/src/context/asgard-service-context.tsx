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
  /** Framework-agnostic derived-state stores (F-013); absent in preview mode. Read via `useTaskList()` / `useSubagents()`. */
  taskStore?: UseChannelReturn['taskStore'];
  subagentStore?: UseChannelReturn['subagentStore'];
  /** Channel-title store (F-016); absent in preview mode. Read via `useChannelTitle()`. */
  channelTitleStore?: UseChannelReturn['channelTitleStore'];
  /** Sandbox-name store (sandbox Files/Browser); absent in preview mode. Read via `useSandboxName()`. */
  sandboxStore?: UseChannelReturn['sandboxStore'];
  pendingConsent: ToolCallConsentEventData | null;
  botTypingPlaceholder?: string;
  inputPlaceholder?: string;
  enableUpload?: boolean;
  enableExport?: boolean;
  enableDocumentUpload?: boolean;
  allowedImageMimeTypes?: string[];
  allowedDocumentMimeTypes?: string[];
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
  allowedImageMimeTypes: undefined,
  allowedDocumentMimeTypes: undefined,
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
  allowedImageMimeTypes?: string[];
  allowedDocumentMimeTypes?: string[];
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
   * When true, the in-flight SSE run is kept alive on unmount instead of being
   * aborted, so it can finish on the backend. Defaults to false.
   */
  keepConnectionOnUnmount?: boolean;
  /**
   * Fired once the chat channel is ready to accept messages. Re-fires after
   * channel reset.
   */
  onChannelReady?: () => void;
}

// Marks that a channel-owning AsgardServiceContextProvider is already mounted above (F-014). Lets a
// nested provider (e.g. the one `<Chatbot>` creates internally) detect an ambient shared channel and
// pass through instead of opening a second connection — so sibling components rendered under a shared
// provider (Task/Subagent panels, custom UI) read the SAME conversation as the Chatbot.
const AsgardChannelProvidedContext = createContext(false);

/** True when a shared channel provider (`AsgardConversationProvider` / a parent service provider) is above. */
export function useIsAsgardChannelProvided(): boolean {
  return useContext(AsgardChannelProvidedContext);
}

// Owns the channel + all state hooks. Only mounted when there is no ambient channel provider, so its
// hooks never run conditionally (the pass-through decision lives in the public wrapper below).
function AsgardServiceContextProviderInner(props: AsgardServiceContextProviderProps): ReactNode {
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
    allowedImageMimeTypes,
    allowedDocumentMimeTypes,
    customChannelId,
    initMessages,
    onSseMessage,
    onAuthError,
    onSseError,
    onBeforeSendMessage,
    onMessageSent,
    autoResetChannel,
    keepConnectionOnUnmount,
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

  const client = useAsgardServiceClient({ config, keepConnectionOnUnmount });

  const {
    isOpen,
    isResetting,
    isConnecting,
    conversation,
    sendMessage,
    resetChannel,
    closeChannel,
    replyToolCallConsents,
    taskStore,
    subagentStore,
    channelTitleStore,
    sandboxStore,
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
      taskStore,
      subagentStore,
      channelTitleStore,
      sandboxStore,
      botTypingPlaceholder,
      inputPlaceholder,
      enableUpload,
      enableExport,
      enableDocumentUpload,
      allowedImageMimeTypes,
      allowedDocumentMimeTypes,
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
      taskStore,
      subagentStore,
      channelTitleStore,
      sandboxStore,
      botTypingPlaceholder,
      inputPlaceholder,
      enableUpload,
      enableExport,
      enableDocumentUpload,
      allowedImageMimeTypes,
      allowedDocumentMimeTypes,
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

// Public entry — idempotent (F-014). Reuse an ambient channel provider if one is already mounted
// above (so `<Chatbot>` and sibling panels under a shared provider share ONE channel); otherwise open
// a channel of its own. `useContext` runs unconditionally; the channel-owning hooks live in the inner
// component, which only mounts on the non-ambient branch — so no hook runs conditionally.
export function AsgardServiceContextProvider(props: AsgardServiceContextProviderProps): ReactNode {
  const alreadyProvided = useContext(AsgardChannelProvidedContext);

  // A shared channel provider already exists above — don't open a second channel; the ambient
  // AsgardServiceContext (and its Task/Subagent stores) stays in effect for these children.
  if (alreadyProvided) return props.children;

  return (
    <AsgardChannelProvidedContext.Provider value={true}>
      <AsgardServiceContextProviderInner {...props} />
    </AsgardChannelProvidedContext.Provider>
  );
}

/**
 * Wrap a whole layout — a `<Chatbot>` plus sibling panels / custom UI — in ONE shared conversation
 * channel (F-014). Everything inside reads the same conversation: `<Chatbot>`'s own internal provider
 * detects this one and passes through, and any component calling `useTaskList()` / `useSubagents()` /
 * `useAsgardContext()` as a sibling of `<Chatbot>` sees that same channel. Use this when the chat and
 * its derived-state panels are laid out independently (e.g. a docking layout where the consumer owns
 * sizing/placement). For a standalone chat, `<Chatbot>` alone still opens its own channel as before.
 */
export function AsgardConversationProvider(props: AsgardServiceContextProviderProps): ReactNode {
  return <AsgardServiceContextProvider {...props} />;
}

export function useAsgardContext(): AsgardServiceContextValue {
  return useContext(AsgardServiceContext);
}
