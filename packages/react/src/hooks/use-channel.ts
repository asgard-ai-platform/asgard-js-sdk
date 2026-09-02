import {
  AsgardServiceClient,
  Channel,
  ChannelBusyError,
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

/** The auth / bot-provider shape core puts on the SSE error channel; mirrored to `onAuthError`. */
type AuthShapedError = { isAuthError: boolean; isBotProviderError: boolean; errorDetail?: unknown };

/**
 * Narrows an SSE error to the auth / bot-provider shape, or null for an ordinary failure. Every SSE
 * entrance reports the same way — mirror an auth-shaped error to `onAuthError`, then hand every error
 * to `onSseError` — so the test lives here once rather than being re-typed at each of them.
 */
function asAuthShapedError(error: unknown): AuthShapedError | null {
  return error && typeof error === 'object' && ('isAuthError' in error || 'isBotProviderError' in error)
    ? (error as AuthShapedError)
    : null;
}

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
  /**
   * @deprecated Use {@link onSseError} instead; this never fires for the first-party client.
   *
   * `@asgard-js/core` has never constructed the `{ isAuthError, isBotProviderError }` shape — the string
   * `isAuthError` does not appear anywhere in `packages/core/src`. So against `AsgardServiceClient` a real
   * 401 / 403 arrives as a plain `HTTP 403: Forbidden`, every entrance's shape check returns `null`, and
   * only `onSseError` is called. A consumer who wired this up got a callback that stays silent forever,
   * with nothing to indicate they had wired the wrong one.
   *
   * Kept, not removed: a custom `IAsgardServiceClient` that throws that shape still reaches it, and the
   * behaviour is unchanged by this deprecation. Scheduled for removal in the next major (#459 §2).
   */
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
  /**
   * End the conversation on the backend and release everything the channel holds (F-032) — the run,
   * transcript, uploaded blobs, tool-call allow-list, Sandbox and Channel Home. Deletes **only**: no
   * opening turn is sent and the local conversation is left as it is, so the host controls what the
   * screen does next.
   *
   * This is what makes "clear the conversation, then send with an attachment" possible at all:
   * `deleteChannel()` → upload → `sendMessage({ blobIds })`. Doing it in one request cannot work,
   * because blobs belong to the channel that was live when they were uploaded.
   *
   * Resolves once the backend confirms the teardown (up to about a minute when a Sandbox has to
   * terminate); rejects if it fails, in which case the old conversation is still there. To clear and
   * show a fresh welcome in one call, use `resetChannel`.
   */
  deleteChannel?: () => Promise<void>;
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
  // One opening flow at a time — see the guard in `startChannel`.
  const openingRef = useRef(false);
  // Bumped whenever an in-flight opening flow must be considered superseded: an explicit
  // `closeChannel()`, or unmount. The delete can take up to a minute, and anything that resolves after
  // one of those must not be adopted — see `isSuperseded` in `startChannel`.
  const generationRef = useRef(0);
  // The live prop, so a flow that started under one channel id can tell that the consumer has since
  // pointed the component at another one.
  const customChannelIdRef = useRef(customChannelId);
  customChannelIdRef.current = customChannelId;

  /**
   * A consumer callback that throws must never wedge the SDK. Core notifies through these *before* it
   * settles the run's promise, so a throw here leaves whatever is awaiting that run pending forever —
   * `startChannel`'s `openingRef`, which is only released in `finally`, or the consent gate's in-flight
   * marker, after which every later answer is a silent no-op.
   */
  const notify = useCallback((fn: (() => void) | undefined): void => {
    if (!fn) return;

    try {
      fn();
    } catch {
      // Swallowed on purpose: it is the consumer's own error on their own callback, and there is no
      // channel of ours it belongs on. Re-raising it here would break the run it was reporting.
    }
  }, []);

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

  /**
   * The opening flow shared by the mount-time open and the header's reset (F-032). `'open'` dispatches
   * the `action=NONE` opening turn straight away — the channel does not exist yet, so there is nothing
   * to delete. `'reset'` deletes first and only opens once the backend confirms the teardown.
   *
   * The local conversation is deliberately **not** swapped up front: `Channel.reset` builds nothing
   * until the delete resolves, so a failed delete leaves the current channel and conversation exactly
   * as they were. The new (empty) conversation reaches state through the states observer, which fires
   * as soon as the new channel subscribes.
   */
  const startChannel = useCallback(
    async (
      mode: 'open' | 'reset',
      payload?: Pick<FetchSsePayload, 'text'> & Partial<Pick<FetchSsePayload, 'payload'>>,
    ): Promise<void> => {
      if (isPreviewMode || !client) return;

      // Re-entrancy has to be refused on a ref, not on `isResetting`. The header button already checks
      // that flag, but it is React state: two clicks landing in the same tick both read the old `false`
      // and both get through. That used to mean two harmless welcome runs; now the second reset's
      // DELETE can land *after* the first one has opened the new conversation and silently destroy it.
      if (openingRef.current) return;

      openingRef.current = true;

      // Set by the SSE error handler below so the catch can tell the two failure kinds apart without
      // re-reporting the same error twice.
      let openingRunFailed = false;
      // The channel this flow adopted, if it got that far. A failed DELETE never builds one, so this is
      // what distinguishes "nothing happened, leave the caller's channel alone" from "we created a
      // channel and then failed", which must not leave a closed instance sitting in state.
      let adopted: Channel | null = null;

      // The awaited work can outlive the reason for doing it: the DELETE alone can take a minute, and in
      // that window the consumer may close the channel, unmount, or point the component at a different
      // `customChannelId`. Adopting the result afterwards would revive a closed channel, or worse, leave
      // the context advertising one id while sends go to another.
      const startedAt = generationRef.current;
      const startedFor = customChannelId;
      const isSuperseded = (): boolean =>
        generationRef.current !== startedAt || customChannelIdRef.current !== startedFor;

      // Everything after the ref is set lives in the try, `finally` included: `onBeforeSendMessage` is
      // consumer code and may throw, and a throw between here and the try would strand the ref at
      // `true` — leaving reset permanently dead for this component, silently.
      try {
        const conversation = new Conversation({
          messages: new Map(initMessages?.map(message => [message.messageId, message])),
        });

        setIsResetting(true);
        setIsConnecting(true);

        const resolvedPayload = onBeforeSendMessage
          ? onBeforeSendMessage({ text: payload?.text ?? '', payload: payload?.payload })
          : payload;

        const start = mode === 'reset' ? Channel.reset : Channel.open;

        const channel = await start(
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
              openingRunFailed = true;
              setIsResetting(false);
              // The channel was adopted early (see onChannelCreated below). The opening run failed and
              // `Channel.open` will close it, so drop it from state — otherwise later sends no-op
              // against a dead channel and the `!channel && isOpen` retry effect can never re-fire.
              setChannel(null);
              // Handle authentication and bot provider errors
              const authError = asAuthShapedError(error);

              if (authError) notify(() => onAuthError?.(authError));

              notify(() => onSseError?.(error));
            },
            delayTime,
            onSseMessage(response: SseResponse<EventType>) {
              notify(() =>
                onSseMessage?.(response, {
                  conversation,
                }),
              );
            },
          },
          // Adopt the channel as soon as it exists — before the opening run completes — so a
          // tool_call.consent emitted during it can be replied to (otherwise `channel` is still null
          // and the reply is dropped).
          created => {
            adopted = created;

            if (isSuperseded()) {
              created.close();

              return;
            }

            setChannel(created);
          },
        );

        if (isSuperseded()) {
          // Closed, or aimed at another channel, while we were waiting. Nothing may be published; the
          // instance we just built is ours to dispose of, or it leaks its subscription and its run.
          channel.close();

          return;
        }

        setIsOpen(true);
        setChannel(channel);
      } catch (error) {
        // Two failures land here. An opening-run error has already been handled by `onSseError` above
        // (state reset, channel dropped) and is only rethrown by core; re-reporting it would double-fire
        // the consumer's callback. A failed DELETE never reached the SSE layer at all, so this is its
        // only report — and the guarantee to keep is that the existing channel and conversation are
        // still on screen, untouched (core builds nothing until the delete resolves).
        setIsResetting(false);
        setIsConnecting(false);

        // A channel was built and then something failed (a throwing `payload` function, for instance,
        // which core resolves after adopting the channel). `Channel.open` has already closed it, so it
        // must not stay in state: a truthy-but-dead channel makes every later send a silent no-op and
        // stops the retry effect from ever re-firing. A failed DELETE never gets here — nothing was
        // adopted, and the caller's existing channel is left exactly as it was.
        if (adopted && !openingRunFailed) {
          setChannel(null);
        }

        if (!openingRunFailed) {
          notify(() => onSseError?.(error));
        }
      } finally {
        openingRef.current = false;
      }
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
      notify,
    ],
  );

  const resetChannel = useCallback(
    (payload?: Pick<FetchSsePayload, 'text'> & Partial<Pick<FetchSsePayload, 'payload'>>): void => {
      void startChannel('reset', payload);
    },
    [startChannel],
  );

  /** Mount-time opening of a channel that does not exist yet (F-015 R3 / UC-025) — no delete (F-032). */
  const openChannel = useCallback(
    (payload?: Pick<FetchSsePayload, 'text'> & Partial<Pick<FetchSsePayload, 'payload'>>): void => {
      void startChannel('open', payload);
    },
    [startChannel],
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
  // metadata (F-016) without deleting or opening anything. `titleSeed` comes from `GET /channel/metadata`.
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

              const authError = asAuthShapedError(error);

              // `notify` because core reports through here before it settles the run — see the comment
              // on `notify`. #459 §3: a throw here skips `settleRun()`, so `isConnecting` stays latched
              // and the restore promise never settles, taking `Channel.restore`'s own cleanup with it.
              if (authError) notify(() => onAuthError?.(authError));

              notify(() => onSseError?.(error));
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
      notify,
      makeStatesObserver,
    ],
  );

  const closeChannel = useCallback(() => {
    // Supersede any opening flow still awaiting its DELETE, so it disposes of what it builds instead of
    // publishing it and undoing this close a minute from now.
    generationRef.current += 1;
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

  /**
   * Delete the channel and nothing else (F-032) — no opening turn, no change to the local conversation.
   * The host owns what happens next, which is the whole point: "clear the conversation and start over
   * *with* an attachment" is impossible in one request (the delete strips the blobs the message would
   * reference), so a host that needs it sequences the three steps itself —
   * `deleteChannel()` → `client.uploadFile()` → `sendMessage({ blobIds })`.
   *
   * Rejects if the delete fails, and does not touch local state either way: the caller decides whether
   * the on-screen transcript should follow. For the "clear it and show a fresh welcome" case use
   * `resetChannel` instead, which does both.
   */
  const deleteChannel = useCallback(async (): Promise<void> => {
    if (isPreviewMode || !client) return;

    await client.deleteChannel(customChannelId);
  }, [isPreviewMode, client, customChannelId]);

  // A reset deletes the channel before it opens a new one, and that delete can take up to a minute. The
  // old `Channel` is idle throughout — its own busy guard sees nothing — so a programmatic send would be
  // dispatched against a conversation that is about to stop existing, and vanish with it. The built-in
  // composer never reaches this (it gates on `isConnecting`); a host driving the SDK directly does.
  // Both call sites are `async`, so throwing here surfaces as a rejection — the same shape core uses for
  // its own busy guard, and the same one callers already handle.
  const refuseWhileResetting = useCallback((): void => {
    if (openingRef.current) throw new ChannelBusyError('reset');
  }, []);

  const sendMessage = useCallback(
    async (
      payload: Pick<FetchSsePayload, 'text' | 'blobIds'> &
        Partial<Pick<FetchSsePayload, 'payload'>> & {
          filePreviewUrls?: string[];
          documentNames?: string[];
        },
    ): Promise<void> => {
      refuseWhileResetting();

      await channel?.sendMessage(
        { ...payload, customMessageId },
        {
          delayTime,
          onSseMessage(response: SseResponse<EventType>) {
            onSseMessage?.(response, {
              conversation,
            });
          },
          // `notify` for the same reason as the consent path (#459 §3) — and here the entrance is the
          // one the built-in composer uses for every message.
          onSseError(error) {
            const authError = asAuthShapedError(error);

            if (authError) notify(() => onAuthError?.(authError));

            notify(() => onSseError?.(error));
          },
        },
      );
    },
    [
      channel,
      delayTime,
      customMessageId,
      onSseMessage,
      onAuthError,
      onSseError,
      conversation,
      notify,
      refuseWhileResetting,
    ],
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
      refuseWhileResetting();

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
          // asgard-freyr-pm#331 — this was the one entrance with no error exit. Without it core's
          // `options?.onSseError?.(err)` is an optional call on a missing key: a rejected reply (the
          // backend refusing the run with a 403 / 400) produced no callback, no log, and no way for a
          // consumer to know, while the card had already been cleared optimistically. `notify` because
          // core reports through here before it settles the run — see the comment on `notify`.
          onSseError(error) {
            const authError = asAuthShapedError(error);

            if (authError) notify(() => onAuthError?.(authError));

            notify(() => onSseError?.(error));
          },
        },
        payload,
      );
    },
    [channel, delayTime, client, onSseMessage, onAuthError, onSseError, conversation, notify, refuseWhileResetting],
  );

  const nudge = useCallback(
    async (payload?: FetchSsePayload['payload']): Promise<void> => {
      await channel?.nudge(
        {
          delayTime,
          onSseMessage(response: SseResponse<EventType>) {
            onSseMessage?.(response, { conversation });
          },
          // #459 §1 — a nudge leaves nothing on screen, failed or not, and that part is the design. What
          // was missing is any way for the consumer to learn it failed: this handlers object held only
          // `onSseMessage`, so core's `options?.onSseError?.(err)` was a call on a missing key.
          onSseError(error) {
            const authError = asAuthShapedError(error);

            if (authError) notify(() => onAuthError?.(authError));

            notify(() => onSseError?.(error));
          },
        },
        payload,
      );
    },
    [channel, delayTime, onSseMessage, onAuthError, onSseError, conversation, notify],
  );

  // F-015 — metadata-gated join-init. On mount, gate on `GET /channel/metadata` instead of unconditionally
  // resetting: an existing channel is always restored (never reset → no history loss); a non-existent one
  // follows `autoResetChannel`. The old "mount always resets" semantics are gone.
  useEffect(() => {
    if (isPreviewMode || !client) return;

    if (channel || !isOpen) return;

    // A client without the metadata gate (a custom IAsgardServiceClient) keeps the pre-F-015 behavior:
    // branch on autoResetChannel with no existence check. Its contract is "mount always resets", and a
    // reset now means delete-then-open (F-032) — unlike the 404 branch below, this one cannot know the
    // channel is absent, so it must not skip the delete.
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
        // R2 — channel exists: always restore, seed the title + live sandboxes from metadata, never re-open.
        restoreChannel(metadata.title, metadata.launchedSandboxes, metadata.runState);
      } else if (autoResetChannel !== false) {
        // R3 — not exists + auto-reset (default): open with `action=NONE`. No delete (F-032): there is
        // no channel to tear down, and on an absent one a reset was only ever an expensive `NONE`.
        openChannel(resetPayload);
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
    openChannel,
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
      // Same reason as `closeChannel`: this closes the channel that exists at unmount, and an opening
      // flow still waiting on its DELETE would otherwise build one after it and leak the subscription
      // and its run.
      generationRef.current += 1;
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
            deleteChannel,
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
      deleteChannel,
      closeChannel,
      stopGeneration,
      replyToolCallConsents,
      nudge,
    ],
  );
}
