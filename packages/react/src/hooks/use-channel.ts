import {
  AsgardServiceClient,
  Channel,
  ChannelMetadata,
  ChannelStates,
  Conversation,
  ChannelRunState,
  ConversationMessage,
  EventType,
  FetchSsePayload,
  LaunchedSandbox,
  RunStatus,
  SandboxPhase,
  SseResponse,
  StopGenerationOptions,
  ToolCallConsentAnswer,
} from '@asgard-js/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/** Resting run status — nothing in flight, nothing stopping (F-023). */
const IDLE_RUN_STATUS: RunStatus = { kind: null, stopPhase: 'idle' };

export interface UseChannelProps {
  defaultIsOpen?: boolean;
  resetPayload?: Pick<FetchSsePayload, 'text'> & Partial<Pick<FetchSsePayload, 'payload'>>;
  client: AsgardServiceClient | null;
  customChannelId: string;
  customMessageId?: string;
  /** SSE batch window in ms, forwarded to `FetchSseOptions.delayTime` (default 50; `0` = no wait). */
  delayTime?: number;
  initMessages?: ConversationMessage[];
  /** Seed for the channel title store (F-016) — e.g. from `GET /channel/metadata` (wired by F-015). */
  channelTitle?: string | null;
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
  /** The live `Channel` (null in preview mode / before creation) — for hooks like `useLaunchedSandboxes`. */
  channel: Channel | null;
  isOpen: boolean;
  isResetting: boolean;
  isConnecting: boolean;
  conversation: Conversation | null;
  /** Current channel title (F-016) — seeded from metadata + updated by `title.update`. `null` = unnamed. */
  channelTitle: string | null;
  /**
   * Current next-turn suggestion (F-028). `null` = none on offer, which is the normal case: most turns
   * get none, and the event is live-only, so a reload / rejoin always starts here.
   */
  promptSuggestion: string | null;
  /** Drop the current suggestion (F-028) — call after adopting it. No-op in preview mode. */
  clearPromptSuggestion: () => void;
  /** Current sandbox cold-start phase (F-018) — drives the Launch HUD. `idle` when no sandbox in flight. */
  sandboxPhase: SandboxPhase;
  /**
   * Which run holds the connection and where it is in the stop lifecycle (F-023). Unlike
   * `isConnecting` — which is `true` for a user turn, a welcome run, a transcript replay and an
   * invisible nudge alike — this says *which*, so only a user's own turn offers a stop control.
   */
  runStatus: RunStatus;
  sendMessage?: (
    payload: Pick<FetchSsePayload, 'text' | 'blobIds'> &
      Partial<Pick<FetchSsePayload, 'payload'>> & { filePreviewUrls?: string[]; documentNames?: string[] },
  ) => Promise<void>;
  resetChannel?: (payload?: Pick<FetchSsePayload, 'text'> & Partial<Pick<FetchSsePayload, 'payload'>>) => void;
  closeChannel?: () => void;
  /**
   * User-initiated stop-generation (F-023). Asks the backend to suspend the background run and keeps
   * the SSE stream connected — the stop is declared by that stream's terminal event, so resolving here
   * means "accepted", not "stopped"; watch `runStatus.stopPhase` for the transition back to idle.
   *
   * Rejects when the suspend request fails, leaving `stopPhase` back at `idle` so the user can retry.
   * Pass `{ force: true }` once `stopPhase` is `force-stoppable` to give up on an unresponsive run.
   *
   * No-op when idle, or when the run is not the user's own (welcome / transcript replay / nudge).
   *
   * @remarks Was a synchronous `() => void` before v0.3.26, when stopping only cut the local
   * connection and never reached the backend. Existing `onClick={stopGeneration}` call sites keep
   * working; callers that want to surface a failed stop should now await it.
   */
  stopGeneration?: (options?: StopGenerationOptions) => Promise<void>;
  replyToolCallConsents?: (answers: ToolCallConsentAnswer[], payload?: FetchSsePayload['payload']) => Promise<void>;
  /**
   * Nudge an idle sandbox back to life (F-021 AC4) — invisible `action=NUDGE` turn, no reply rendered.
   *
   * Takes `payload` because the woken sandbox is configured from *this* turn's payload (BUG-004); the
   * backend never carries the previous turn's over.
   *
   * This hook sends the argument straight through — unlike `resetChannel`, it does **not** run it past
   * this hook's `onBeforeSendMessage`, so a direct `useChannel` consumer must supply payload here. It is
   * `AsgardServiceContextProvider` that wires nudge to `onBeforeSendMessage`; consumers on that context
   * can leave the argument out.
   *
   * Takes a parameter, so it cannot be bound straight to an event handler:
   * `onClick={() => nudge()}`, not `onClick={nudge}` (which would send the event as payload).
   */
  nudge?: (payload?: FetchSsePayload['payload']) => Promise<void>;
}

export function useChannel(props: UseChannelProps): UseChannelReturn {
  const {
    client,
    defaultIsOpen,
    resetPayload,
    customChannelId,
    customMessageId,
    delayTime,
    initMessages,
    channelTitle: channelTitleSeed,
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
  const [channelTitle, setChannelTitle] = useState<string | null>(channelTitleSeed ?? null);
  // F-028 — never seeded: the suggestion only ever arrives on the live plane.
  const [promptSuggestion, setPromptSuggestion] = useState<string | null>(null);
  const [sandboxPhase, setSandboxPhase] = useState<SandboxPhase>('idle');
  const [runStatus, setRunStatus] = useState<RunStatus>(IDLE_RUN_STATUS);

  // Preview mode: static conversation from initMessages
  const previewConversation = useMemo(
    () => (isPreviewMode ? new Conversation({ messages: new Map(initMessages?.map(m => [m.messageId, m])) }) : null),
    [isPreviewMode, initMessages],
  );

  // BUG-006 — one shared observer for all three creation paths below. Before this, each path wrote its
  // own copy and `resetChannel`'s was the only one that forwarded `sandboxPhase`, so a channel created
  // via `initChannel` or `restoreChannel` never left the Launch HUD's `idle` state. A single factory
  // makes that class of bug structurally impossible: there is only one place a `ChannelStates` field can
  // be wired up, and every path uses it.
  const makeStatesObserver = useCallback(
    () =>
      (states: ChannelStates): void => {
        setIsConnecting(states.isConnecting);
        setRunStatus(states.runStatus);
        setConversation(states.conversation);
        setChannelTitle(states.channelTitle);
        setPromptSuggestion(states.promptSuggestion);
        setSandboxPhase(states.sandboxPhase);
      },
    [],
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
          channelTitle: channelTitleSeed,
          statesObserver: makeStatesObserver(),
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
          delayTime,
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
      delayTime,
      initMessages,
      channelTitleSeed,
      onSseMessage,
      onAuthError,
      onSseError,
      onBeforeSendMessage,
      makeStatesObserver,
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
      channelTitle: channelTitleSeed,
      statesObserver: makeStatesObserver(),
    });

    setIsOpen(true);
    setChannel(channel);
  }, [isPreviewMode, client, customChannelId, customMessageId, initMessages, channelTitleSeed, makeStatesObserver]);

  // F-015 — join an existing channel: replay the server transcript (F-014) and seed the title from
  // metadata (F-016) without ever sending RESET_CHANNEL. `titleSeed` comes from `GET /channel/metadata`.
  // The live restore path uses the server transcript as the single source of truth, so it does NOT seed
  // from `initMessages` (which stays preview/offline-only — see the preview branch above).
  const restoreChannel = useCallback(
    async (
      titleSeed: string | null,
      launchedSandboxesSeed?: LaunchedSandbox[],
      runStateSeed?: ChannelRunState,
    ): Promise<void> => {
      if (isPreviewMode || !client) return;

      const conversation = new Conversation({ messages: new Map() });

      setIsConnecting(true);
      setConversation(conversation);
      setChannelTitle(titleSeed);

      try {
        const channel = await Channel.restore(
          {
            client,
            customChannelId,
            customMessageId,
            conversation,
            channelTitle: titleSeed,
            // F-019/F-021 — seed the live-sandbox list from the same `/channel/metadata` fetch that gated
            // the restore, so the File Explorer dropdown is populated immediately on join.
            launchedSandboxes: launchedSandboxesSeed,
            // F-023 AC9 / UC-046 — the metadata gate already knows whether a run is still live. Pass it
            // through so replaying a finished conversation does not present as generation in progress.
            runState: runStateSeed,
            statesObserver: makeStatesObserver(),
          },
          {
            onSseError(error) {
              // Restore connection failed. Drop the channel so the mount effect can re-evaluate, and
              // surface the error — never fall back to a reset (that would wipe the channel we restored).
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
            delayTime,
            onSseMessage(response: SseResponse<EventType>) {
              onSseMessage?.(response, {
                conversation,
              });
            },
          },
          // Adopt the channel before the replay finishes — a RUNNING restore can emit a tool_call.consent
          // before its terminal, and a reply submitted then must reach a non-null channel.
          setChannel,
        );

        setIsOpen(true);
        setChannel(channel);
      } catch {
        // Channel.restore rethrows after onSseError already handled and dropped the channel; nothing left
        // to do here (kept out of the unhandled-rejection path).
      }
    },
    [
      isPreviewMode,
      client,
      customChannelId,
      customMessageId,
      delayTime,
      onSseMessage,
      onAuthError,
      onSseError,
      makeStatesObserver,
    ],
  );

  const closeChannel = useCallback(() => {
    setChannel((prevChannel: Channel | null) => {
      prevChannel?.close();

      return null;
    });
    setIsOpen(false);
    setIsResetting(false);
    setIsConnecting(false);
    setRunStatus(IDLE_RUN_STATUS);
    setConversation(null);
    setSandboxPhase('idle');
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
          delayTime,
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
    [channel, delayTime, customMessageId, onSseMessage, onAuthError, onSseError, conversation],
  );

  const clearPromptSuggestion = useCallback((): void => {
    channel?.clearPromptSuggestion();
  }, [channel]);

  const stopGeneration = useCallback(
    async (options?: StopGenerationOptions): Promise<void> => {
      // Asks the backend to suspend the background run and keeps the stream open — the channel only
      // flips isConnecting$ → false once that stream's terminal event arrives (F-023 AC3). Until then
      // `runStatus.stopPhase` is `stopping`, which is what gates the send entrances.
      await channel?.stopGeneration(options);
    },
    [channel],
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
          delayTime,
          onSseMessage(response: SseResponse<EventType>) {
            onSseMessage?.(response, {
              conversation,
            });
          },
        },
        payload,
      );
    },
    [channel, delayTime, client, onSseMessage, conversation],
  );

  const nudge = useCallback(
    async (payload?: FetchSsePayload['payload']): Promise<void> => {
      await channel?.nudge(
        {
          delayTime,
          onSseMessage(response: SseResponse<EventType>) {
            onSseMessage?.(response, { conversation });
          },
        },
        payload,
      );
    },
    [channel, delayTime, onSseMessage, conversation],
  );

  // F-015 — metadata-gated join-init. On mount, gate on `GET /channel/metadata` instead of unconditionally
  // resetting: an existing channel is always restored (never reset → no history loss); a non-existent one
  // follows `autoResetChannel`. The old "mount always resets" semantics are gone.
  useEffect(() => {
    if (isPreviewMode || !client) return;

    if (channel || !isOpen) return;

    // A client without the metadata gate (a custom IAsgardServiceClient) keeps the pre-F-015 behavior:
    // branch on autoResetChannel with no existence check.
    if (!client.channelMetadata) {
      if (autoResetChannel !== false) {
        resetChannel(resetPayload);
      } else {
        initChannel();
      }

      return;
    }

    const getMetadata = client.channelMetadata.bind(client);
    let cancelled = false;

    void (async (): Promise<void> => {
      let metadata: ChannelMetadata | null;

      try {
        metadata = await getMetadata(customChannelId);
      } catch (error) {
        // R6 — indeterminate result (network / 5xx). Never reset on an unknown existence (that would
        // wipe a channel that may exist); settle into an empty, input-enabled state and surface the error.
        if (cancelled) return;

        onSseError?.(error);
        initChannel();

        return;
      }

      if (cancelled) return;

      if (metadata) {
        // R2 — channel exists: always restore, seed the title + live sandboxes from metadata, never RESET_CHANNEL.
        restoreChannel(metadata.title, metadata.launchedSandboxes, metadata.runState);
      } else if (autoResetChannel !== false) {
        // R3 — not exists + auto-reset (default): open via RESET_CHANNEL.
        resetChannel(resetPayload);
      } else {
        // R4 — not exists + no auto-reset: stay empty; the first user send starts it with action=NONE.
        initChannel();
      }
    })();

    return (): void => {
      cancelled = true;
    };
  }, [
    isPreviewMode,
    client,
    channel,
    isOpen,
    customChannelId,
    autoResetChannel,
    restoreChannel,
    resetChannel,
    initChannel,
    resetPayload,
    onSseError,
  ]);

  const prevChannelRef = useRef<Channel | null>(null);
  useEffect(() => {
    if (channel && channel !== prevChannelRef.current) {
      prevChannelRef.current = channel;
      onChannelReady?.();
    } else if (!channel) {
      prevChannelRef.current = null;
    }
  }, [channel, onChannelReady]);

  // Tear down the channel instance on unmount (its RxJS subscription — §1.5). Close ONLY the instance via
  // a ref; do NOT call `closeChannel`, which also resets `isOpen`/`conversation`. Those resets are moot on
  // a real unmount, but under React StrictMode's simulated unmount/remount they flip `isOpen` to false
  // mid-mount and abort the in-flight join-init metadata gate (F-015), leaving the channel never created
  // (empty chat, sends no-op). Consumers that enable StrictMode (e.g. Next.js dev) hit this; keeping the
  // unmount cleanup free of state churn lets the gate complete exactly once across the double-invoke.
  const channelRef = useRef<Channel | null>(null);
  channelRef.current = channel;
  useEffect(() => {
    return (): void => {
      channelRef.current?.close();
    };
  }, []);

  return useMemo(
    () =>
      isPreviewMode
        ? {
            channel: null,
            isOpen: true,
            isResetting: false,
            isConnecting: false,
            conversation: previewConversation,
            channelTitle: channelTitleSeed ?? null,
            promptSuggestion: null,
            clearPromptSuggestion,
            sandboxPhase: 'idle',
            runStatus: IDLE_RUN_STATUS,
          }
        : {
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
          },
    [
      isPreviewMode,
      previewConversation,
      channel,
      isOpen,
      isResetting,
      isConnecting,
      conversation,
      channelTitle,
      channelTitleSeed,
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
    ],
  );
}
