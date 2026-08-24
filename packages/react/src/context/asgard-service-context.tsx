import {
  AsgardServiceClient,
  Channel,
  ClientConfig,
  Conversation,
  ConversationMessage,
  RunStatus,
  SandboxPhase,
  ToolCallConsentEventData,
  isChannelAwaitingConsentError,
  isChannelBusyError,
} from '@asgard-js/core';
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

/** Resting run status — nothing in flight, nothing stopping (F-023). */
const IDLE_RUN_STATUS: RunStatus = { kind: null, stopPhase: 'idle' };

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
  /** The live `Channel` (F-019+) — for hooks that need the channel object (e.g. `useLaunchedSandboxes`). */
  channel: Channel | null;
  customChannelId?: string;
  isOpen: boolean;
  isResetting: boolean;
  isConnecting: boolean;
  messages: Map<string, ConversationMessage> | null;
  /** The current Conversation (F-013) — the derivation source for the docked Task / Subagent panels. */
  conversation: Conversation | null;
  /** The current channel title (F-016) — seeded from metadata + updated by `title.update`. `null` = unnamed. */
  channelTitle: string | null;
  /**
   * The current next-turn suggestion (F-028) — offered as the composer's placeholder, adopted with
   * Tab. `null` = none, which is the normal case (most turns get none, and it is never replayed).
   */
  promptSuggestion: string | null;
  /** Drop the current suggestion (F-028) — the composer calls this once the user adopts it. */
  clearPromptSuggestion: () => void;
  /** The current sandbox cold-start phase (F-018) — drives the Launch HUD. `idle` when no sandbox in flight. */
  sandboxPhase: SandboxPhase;
  /** Which run holds the connection and where it is in the stop lifecycle (F-023). */
  runStatus: RunStatus;
  /**
   * Whether something is actually being generated right now (F-023 AC9). Narrower than `isConnecting`,
   * which is also `true` while a finished conversation is merely being replayed on rejoin — that must
   * not show a run-in-progress indicator.
   */
  isRunning: boolean;
  /**
   * Whether a stop control belongs on screen (F-023 AC8): only the user's own turn is stoppable, never
   * the welcome run, a transcript rejoin, or an invisible nudge.
   */
  canStop: boolean;
  /** Whether a stop has been requested and the terminal event has not arrived yet (F-023 AC2/AC5). */
  isStopping: boolean;
  /**
   * Whether the accepted stop has waited past the timeout and the control should escalate to force-stop
   * (F-023 AC7). Implies {@link isStopping}.
   */
  canForceStop: boolean;
  messageBoxBottomRef: RefObject<HTMLDivElement | null>;
  sendMessage?: UseChannelReturn['sendMessage'];
  resetChannel?: UseChannelReturn['resetChannel'];
  closeChannel?: UseChannelReturn['closeChannel'];
  /**
   * User-initiated stop-generation (F-023): asks the backend to suspend the background run, then waits
   * for the stream's terminal event. Resolving means "accepted", not "stopped"; rejects if the request
   * failed. Gate its visibility on {@link canStop}. No-op when idle or on a non-user run.
   */
  stopGeneration?: UseChannelReturn['stopGeneration'];
  replyToolCallConsents?: UseChannelReturn['replyToolCallConsents'];
  /**
   * Nudge an idle sandbox back to life (F-021 AC4) — invisible `action=NUDGE` turn. Runs through
   * `onBeforeSendMessage` like the other outbounds, so a session-level payload attaches on its own
   * (BUG-004).
   *
   * A `payload` passed here does **not** override the callback's: it is handed to
   * `onBeforeSendMessage` as `params.payload`, and whatever the callback returns wins wholesale. A
   * callback that builds a fresh payload without spreading `params.payload` silently drops it —
   * merging is the callback's job. With no callback configured the argument is sent as-is.
   *
   * Takes a parameter, so it cannot be bound straight to an event handler:
   * `onClick={() => nudge()}`, not `onClick={nudge}` (which would send the event as payload).
   */
  nudge?: UseChannelReturn['nudge'];
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
  /**
   * 外部設定 textarea 文字的值（透過 ref 呼叫）。可為字串（取代）或 `(current) => next` 更新函式（依當前
   * 草稿計算，供「換行接續」等情境）——footer 以 `setValue(pendingInputValue)` 套用，函式即走 React
   * functional update。
   */
  pendingInputValue: string | ((current: string) => string) | null;
  /** 設定待填入 textarea 的文字（字串取代 / 函式依當前草稿更新） */
  setPendingInputValue: (value: string | ((current: string) => string) | null) => void;
}

function noop(): void {
  // intentionally empty
}

export const AsgardServiceContext = createContext<AsgardServiceContextValue>({
  avatar: undefined,
  title: undefined,
  client: null,
  channel: null,
  customChannelId: undefined,
  isOpen: false,
  isResetting: false,
  isConnecting: false,
  messages: null,
  conversation: null,
  channelTitle: null,
  promptSuggestion: null,
  clearPromptSuggestion: () => undefined,
  sandboxPhase: 'idle',
  runStatus: IDLE_RUN_STATUS,
  isRunning: false,
  canStop: false,
  isStopping: false,
  canForceStop: false,
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
  /**
   * How long (ms) SSE frames are gathered before being applied. Defaults to 50; `0` removes the
   * wait. See `FetchSseOptions.delayTime` in `@asgard-js/core`.
   */
  delayTime?: number;
  initMessages?: ConversationMessage[];
  /** Seed for the channel title store (F-016) — e.g. from `GET /channel/metadata` (wired by F-015). */
  channelTitle?: string | null;
  onSseMessage?: UseChannelProps['onSseMessage'];
  onAuthError?: (error: { isAuthError: boolean; isBotProviderError: boolean; errorDetail?: unknown }) => void;
  /** Callback fired when SSE connection encounters an error */
  onSseError?: (error: unknown) => void;
  /**
   * Callback to modify outbound params before they hit the wire. It fires on
   * **four** paths, not just user sends:
   *
   * 1. `sendMessage` — the only one carrying real user text.
   * 2. `resetChannel` — including the automatic one on mount, since
   *    `autoResetChannel` defaults to `true`. Expect a call before the user
   *    has done anything at all.
   * 3. Tool-call consent reply (Allow / Deny on the consent modal).
   * 4. The invisible sandbox nudge (F-021 AC4).
   *
   * On 2–4 `params.text` is `''` and `params.blobIds` is `undefined`, and only
   * the returned `payload` is forwarded — `text` / `blobIds` from the return
   * are dropped on those paths. Side effects inside the callback therefore fire
   * on all four; branch on intent (e.g. `params.text === ''`) if they should
   * not. Note the textless paths are not distinguishable from each other here.
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
    allowedImageMimeTypes,
    allowedDocumentMimeTypes,
    customChannelId,
    delayTime,
    initMessages,
    channelTitle: channelTitleSeed,
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

  // 外部設定 textarea 文字（字串取代 / 函式依當前草稿更新）
  const [pendingInputValue, setPendingInputValue] = useState<string | ((current: string) => string) | null>(null);

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
    channel,
    isOpen,
    isResetting,
    isConnecting,
    conversation,
    channelTitle,
    promptSuggestion,
    clearPromptSuggestion,
    sandboxPhase,
    runStatus,
    sendMessage,
    resetChannel,
    closeChannel,
    stopGeneration,
    replyToolCallConsents,
    nudge,
  } = useChannel({
    client,
    customChannelId,
    delayTime,
    initMessages,
    channelTitle: channelTitleSeed,
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
      } catch (error) {
        // #409 — a *refusal* never opens an SSE connection, so `onSseError` (which the SDK otherwise
        // relies on for error reporting) is never reached and the caller is told nothing at all.
        // Forward those two explicitly so the documented channel is actually true for them.
        if (isChannelBusyError(error) || isChannelAwaitingConsentError(error)) {
          onSseError?.(error);
        }

        // Everything else is surfaced via the `onSseError` prop by the transport itself; swallow here
        // so fire-and-forget callers (e.g. `ref.serviceContext.sendMessage(...)`) do not trigger
        // unhandled promise rejections.
        return undefined;
      }
    };
  }, [sendMessage, onBeforeSendMessage, onMessageSent, onSseError]);

  // The textless outbounds — consent reply and the invisible sandbox nudge —
  // run through onBeforeSendMessage too, so consumers can use a single hook to
  // attach session-level payload (e.g. interaction_mode) on *every* outbound.
  // The callback is invoked with `text: ''` and the caller-supplied payload (if
  // any); only the resulting `payload` is forwarded — `text`/`blobIds` from the
  // return are ignored on these paths. Side effects inside the callback fire
  // here too — branch on intent (e.g. inspect `params.text === ''`) if they
  // should not.
  const resolveOutboundPayload = useCallback(
    (payload?: SendMessageParams['payload']): SendMessageParams['payload'] =>
      onBeforeSendMessage ? onBeforeSendMessage({ text: '', payload }).payload : payload,
    [onBeforeSendMessage],
  );

  // Differences from `wrappedSendMessage`:
  //   - No `onMessageSent` fire: consent reply isn't a user message, so the
  //     sent-message lifecycle hook should not fire here.
  //   - No try/catch swallow: the inner `replyToolCallConsents` does not yet
  //     propagate `onSseError`/`onAuthError` (pre-existing gap), so the
  //     promise rejection is the only error signal callers get — swallowing
  //     it would drop errors entirely.
  const wrappedReplyToolCallConsents: UseChannelReturn['replyToolCallConsents'] = useMemo(() => {
    if (!replyToolCallConsents) return undefined;

    return async (answers, payload) => replyToolCallConsents(answers, resolveOutboundPayload(payload));
  }, [replyToolCallConsents, resolveOutboundPayload]);

  // BUG-004 — the nudge turn configures the sandbox it wakes from its own payload (the backend rebuilds
  // `prevPayload` per turn and never carries the previous one over), so it has to collect payload the
  // same way. Without this a consumer had no way to get payload onto a nudge at all, and the sandbox
  // came back empty with no error to show for it.
  const wrappedNudge: UseChannelReturn['nudge'] = useMemo(() => {
    if (!nudge) return undefined;

    return async payload => nudge(resolveOutboundPayload(payload));
  }, [nudge, resolveOutboundPayload]);

  // F-023 — the four questions components actually ask about the run, derived once here so each of
  // them (composer, quick replies, running indicator) does not re-derive the same conditions.
  const { isRunning, canStop, isStopping, canForceStop } = useMemo(
    () => ({
      // A rejoin `replay` is loading history, not generating — no run-in-progress indicator (AC9).
      isRunning: runStatus.kind !== null && runStatus.kind !== 'replay',
      // Only the user's own turn is stoppable (AC8), and only while the stop has not been requested yet.
      canStop: runStatus.kind === 'user' && runStatus.stopPhase === 'idle' && Boolean(stopGeneration),
      isStopping: runStatus.stopPhase !== 'idle',
      canForceStop: runStatus.stopPhase === 'force-stoppable',
    }),
    [runStatus, stopGeneration],
  );

  const contextValue = useMemo(
    () => ({
      avatar,
      title,
      client,
      channel,
      customChannelId,
      isOpen,
      isResetting,
      isConnecting,
      messages: conversation?.messages ?? null,
      conversation: conversation ?? null,
      channelTitle,
      promptSuggestion,
      clearPromptSuggestion,
      sandboxPhase,
      runStatus,
      isRunning,
      canStop,
      isStopping,
      canForceStop,
      sendMessage: wrappedSendMessage,
      resetChannel,
      closeChannel,
      stopGeneration,
      replyToolCallConsents: wrappedReplyToolCallConsents,
      nudge: wrappedNudge,
      pendingConsent: conversation?.pendingConsent ?? null,
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
      channel,
      customChannelId,
      isOpen,
      isResetting,
      isConnecting,
      conversation,
      channelTitle,
      promptSuggestion,
      clearPromptSuggestion,
      sandboxPhase,
      runStatus,
      isRunning,
      canStop,
      isStopping,
      canForceStop,
      wrappedSendMessage,
      resetChannel,
      closeChannel,
      stopGeneration,
      wrappedReplyToolCallConsents,
      wrappedNudge,
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
      // 字串 → 取代；函式 → 依當前草稿更新（換行接續）。存函式時用 updater 回傳它，避免 React 把它當
      // setState 的 updater 立即執行掉；原封存進 pendingInputValue，由 footer 的 setValue 套用。
      setInputValue: (value: string | ((current: string) => string)): void => {
        if (typeof value === 'function') {
          setPendingInputValue((): ((current: string) => string) => value);
        } else {
          setPendingInputValue(value);
        }
      },
    };
  });

  return <AsgardServiceContext.Provider value={contextValue}>{children}</AsgardServiceContext.Provider>;
}

export function useAsgardContext(): AsgardServiceContextValue {
  return useContext(AsgardServiceContext);
}
