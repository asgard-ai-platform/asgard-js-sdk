import { BehaviorSubject, combineLatest, distinctUntilChanged, map, Observable, Subscription } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import {
  ChannelConfig,
  ChannelRunState,
  ChannelStates,
  FetchSseOptions,
  FetchSsePayload,
  IAsgardServiceClient,
  LaunchedSandbox,
  MessageFeedbackReply,
  MessageFeedbackState,
  ObserverOrNext,
  RunKind,
  RunStatus,
  SandboxPhase,
  StopGenerationOptions,
  Subagent,
  SseResponse,
  Task,
  ToolCallConsentAnswer,
} from '../types';
import { ChannelBusyError } from '../types/channel-busy-error';
import { ChannelAwaitingConsentError } from '../types/channel-awaiting-consent-error';
import { FetchSseAction, EventType } from '../constants/enum';
import Conversation from './conversation';
import { createDerivedStores, DerivedStores } from './derived-stores';
import { reconcileLaunched } from './launched-sandboxes';

/** Nothing running, nothing stopping. */
const IDLE_RUN_STATUS: RunStatus = { kind: null, stopPhase: 'idle' };

/** How long an accepted stop waits for the terminal event before offering force-stop (F-023 AC7). */
export const FORCE_STOP_TIMEOUT_MS = 10_000;

function runStatusEqual(a: RunStatus, b: RunStatus): boolean {
  return a.kind === b.kind && a.stopPhase === b.stopPhase && a.requestId === b.requestId;
}

export default class Channel {
  private client: IAsgardServiceClient;

  public customChannelId: string;
  public customMessageId?: string;
  // Join-time run state from `GET /channel/metadata` (F-023 AC9): decides whether a rejoin is tailing a
  // live run (`restore`) or replaying a finished transcript (`replay`).
  private joinRunState: ChannelRunState;

  private isConnecting$: BehaviorSubject<boolean>;
  private runStatusSubject: BehaviorSubject<RunStatus>;
  private conversation$: BehaviorSubject<Conversation>;
  private channelTitleSubject: BehaviorSubject<string | null>;
  private promptSuggestionSubject: BehaviorSubject<string | null>;
  private sandboxPhaseSubject: BehaviorSubject<SandboxPhase>;
  private launchedSandboxesSubject: BehaviorSubject<LaunchedSandbox[]>;
  // Sandboxes hinted live by an `asgard.sandbox.launch` frame but not yet confirmed by metadata (F-019).
  // Never merged into the live list directly — cleared once metadata confirms (or held until it does).
  private pendingLaunches: string[] = [];
  private derivedStores: DerivedStores;
  private statesObserver?: ObserverOrNext<ChannelStates>;
  private statesSubscription?: Subscription;

  /** Reactive Task Check List store (F-013): emits only when the list changes; replays the snapshot. */
  public readonly tasks$: Observable<Task[]>;
  /** Reactive Subagent list store (F-013): emits only when the list changes; replays the snapshot. */
  public readonly subagents$: Observable<Subagent[]>;
  /** Reactive channel title store (F-016): seeded from metadata, updated by `title.update`; replay-safe. */
  public readonly channelTitle$: Observable<string | null>;
  /**
   * Reactive next-turn suggestion store (F-028): fed by `asgard.prompt_suggestion`, cleared when the
   * prediction expires. Live-only — a rejoin replay carries no such event, so this legitimately stays
   * `null` after a reload. Never seeded: there is no metadata source for it.
   */
  public readonly promptSuggestion$: Observable<string | null>;
  /** Reactive sandbox cold-start phase store (F-018): per-slice, derived from the last sandbox event; replay-safe. */
  public readonly sandboxPhase$: Observable<SandboxPhase>;
  /** Reactive live-sandbox list store (F-019): authoritative from `/channel/metadata`, per-slice; replay-safe. */
  public readonly launchedSandboxes$: Observable<LaunchedSandbox[]>;
  /** Reactive run identity + stop lifecycle store (F-023): who holds the connection, and is a stop pending. */
  public readonly runStatus$: Observable<RunStatus>;
  private currentUserMessageId?: string;
  // The most-recently-sent user message id. Unlike currentUserMessageId (which
  // is cleared once a traceId is attached), this is kept across the SSE
  // lifecycle so RESPONSE_TOOL_CALL_CONSENT — fired after run.done — can echo
  // back the message id the bot is waiting on.
  private lastSentMessageId?: string;
  // The in-flight SSE run's subscription. Held so the connection can be aborted locally (unsubscribe →
  // create-sse-observable teardown → AbortController.abort()) on close, on channel switch, and on the
  // legacy stop fallback. Cleared on every terminal (complete / error).
  //
  // NOTE (F-023): a user-initiated stop no longer unsubscribes this. Runs execute in the background on
  // the server, so cutting the stream would only stop *watching* — the stop is requested through
  // `client.suspendChannel()` and declared by this same stream's terminal event.
  private currentRun?: Subscription;
  // Armed when a stop is accepted; fires after FORCE_STOP_TIMEOUT_MS to offer force-stop (F-023 AC7).
  // Cleared on terminal, on suspend failure, and in close() (§1.5).
  private forceStopTimer?: ReturnType<typeof setTimeout>;

  private constructor(config: ChannelConfig) {
    if (!config.client) {
      throw new Error('client must be required');
    }

    if (!config.customChannelId) {
      throw new Error('customChannelId must be required');
    }

    this.client = config.client;
    this.customChannelId = config.customChannelId;
    this.customMessageId = config.customMessageId;
    this.joinRunState = config.runState ?? 'IDLE';

    this.isConnecting$ = new BehaviorSubject(false);
    this.runStatusSubject = new BehaviorSubject<RunStatus>(IDLE_RUN_STATUS);
    this.conversation$ = new BehaviorSubject(config.conversation);
    this.channelTitleSubject = new BehaviorSubject<string | null>(config.channelTitle ?? null);
    this.promptSuggestionSubject = new BehaviorSubject<string | null>(null);
    this.sandboxPhaseSubject = new BehaviorSubject<SandboxPhase>('idle');
    this.launchedSandboxesSubject = new BehaviorSubject<LaunchedSandbox[]>(
      reconcileLaunched(config.launchedSandboxes ?? []),
    );
    this.derivedStores = createDerivedStores(this.conversation$);
    this.tasks$ = this.derivedStores.tasks$;
    this.subagents$ = this.derivedStores.subagents$;
    // Emit only when the title actually changes (ignore duplicate `title.update`s with the same value).
    this.channelTitle$ = this.channelTitleSubject.pipe(distinctUntilChanged());
    // Per-slice: the same suggestion arriving twice must not re-notify consumers (F-028).
    this.promptSuggestion$ = this.promptSuggestionSubject.pipe(distinctUntilChanged());
    // Per-slice: emit only when the phase actually changes, so unrelated high-frequency message
    // deltas never re-notify the HUD (UC-031, same performance rule as the F-013 derived stores).
    this.sandboxPhase$ = this.sandboxPhaseSubject.pipe(distinctUntilChanged());
    // Per-slice: only `applyLaunchedSandboxes` / `dropSandbox` push here (never the conversation stream),
    // so high-frequency message deltas never re-emit the live-sandbox list (UC-032 ALT2).
    this.launchedSandboxes$ = this.launchedSandboxesSubject.pipe(distinctUntilChanged());
    // Per-slice: `RunStatus` is a fresh object on every write, so compare by field — otherwise the
    // states observer would re-notify on every identical write during a run (F-023).
    this.runStatus$ = this.runStatusSubject.pipe(distinctUntilChanged(runStatusEqual));
    this.statesObserver = config.statesObserver;
  }

  /** Current Task Check List snapshot (F-013) — for framework-agnostic `getSnapshot()` bridging. */
  public getTasks(): Task[] {
    return this.derivedStores.getTasks();
  }

  /** Current Subagent list snapshot (F-013) — for framework-agnostic `getSnapshot()` bridging. */
  public getSubagents(): Subagent[] {
    return this.derivedStores.getSubagents();
  }

  /** Current channel title snapshot (F-016) — for framework-agnostic `getSnapshot()` bridging. */
  public getChannelTitle(): string | null {
    return this.channelTitleSubject.value;
  }

  /** Current next-turn suggestion snapshot (F-028) — for framework-agnostic `getSnapshot()` bridging. */
  public getPromptSuggestion(): string | null {
    return this.promptSuggestionSubject.value;
  }

  /**
   * Drop the current suggestion (F-028). Called when the prediction has expired: the user adopted it
   * (it is in the textarea now, and re-offering it would duplicate the text), or a send / a new run
   * made it stale. Losing focus is deliberately NOT one of those moments.
   */
  public clearPromptSuggestion(): void {
    this.promptSuggestionSubject.next(null);
  }

  /** Current sandbox phase snapshot (F-018) — for framework-agnostic `getSnapshot()` bridging. */
  public getSandboxPhase(): SandboxPhase {
    return this.sandboxPhaseSubject.value;
  }

  /** Current live-sandbox snapshot (F-019) — for framework-agnostic `getSnapshot()` bridging. */
  public getLaunchedSandboxes(): LaunchedSandbox[] {
    return this.launchedSandboxesSubject.value;
  }

  /** Current run identity + stop lifecycle snapshot (F-023) — for framework-agnostic `getSnapshot()` bridging. */
  public getRunStatus(): RunStatus {
    return this.runStatusSubject.value;
  }

  /** Names hinted by `sandbox.launch` but not yet confirmed live by metadata (F-019) — "starting" placeholders. */
  public getPendingLaunches(): string[] {
    return this.pendingLaunches;
  }

  /**
   * Authoritatively replace the live-sandbox list from a fresh `/channel/metadata` snapshot (F-019). This
   * is the only sanctioned way to change "who is live": it reconciles the list and clears any pending
   * launch whose name now appears (promoted to live). metadata (heartbeat-backed) is the sole authority.
   */
  public applyLaunchedSandboxes(list: readonly LaunchedSandbox[]): void {
    const next = reconcileLaunched(list);
    this.pendingLaunches = this.pendingLaunches.filter(name => !next.some(sandbox => sandbox.sandboxName === name));
    this.launchedSandboxesSubject.next(next);
  }

  /**
   * Optimistically drop one sandbox (F-019) — e.g. its fs calls keep failing or it is known to be
   * recycled. The next `/channel/metadata` refetch reconciles the authoritative truth.
   */
  public dropSandbox(sandboxName: string): void {
    const current = this.launchedSandboxesSubject.value;
    const next = current.filter(sandbox => sandbox.sandboxName !== sandboxName);
    if (next.length !== current.length) this.launchedSandboxesSubject.next(next);
  }

  /**
   * Record an `asgard.sandbox.launch` hint (F-019): the event is not trusted to add a live sandbox (it may
   * not be Ready / heartbeat-visible yet), so the name is held as pending and a metadata refetch is
   * scheduled. `applyLaunchedSandboxes` promotes it to live once metadata confirms.
   */
  public noteSandboxLaunch(sandboxName: string): void {
    if (!this.pendingLaunches.includes(sandboxName)) {
      this.pendingLaunches = [...this.pendingLaunches, sandboxName];
    }

    void this.refetchMetadata();
  }

  /**
   * Re-fetch `/channel/metadata` and authoritatively apply its `launchedSandboxes` (F-019). Called on a
   * launch hint, and by the react adapter on `visibilitychange` / polling. A client without metadata
   * support is a no-op.
   */
  public async refetchMetadata(): Promise<void> {
    if (!this.client.channelMetadata) return;

    const metadata = await this.client.channelMetadata(this.customChannelId);
    if (metadata) this.applyLaunchedSandboxes(metadata.launchedSandboxes);
  }

  /** Seed / override the channel title (F-016) — used by the join-restore metadata seed (F-015). */
  public setChannelTitle(title: string | null): void {
    this.channelTitleSubject.next(title);
  }

  public static create(config: ChannelConfig): Channel {
    const channel = new Channel(config);
    channel.subscribe();

    return channel;
  }

  /**
   * Open a channel with a fresh conversation (F-032): create it and dispatch a single `action=NONE`
   * opening turn, which the backend answers with the welcome run. Used for the mount-time opening of a
   * channel that does not exist yet (UC-025) — nothing is deleted, because there is nothing there.
   *
   * The run's kind stays `'reset'`: an opening turn is not a turn the user dispatched, so
   * stop-generation must not fire on it (F-023 AC8).
   */
  public static async open(
    config: ChannelConfig,
    payload?: Pick<FetchSsePayload, 'text' | 'payload'>,
    options?: FetchSseOptions,
    onChannelCreated?: (channel: Channel) => void,
  ): Promise<Channel> {
    const channel = new Channel(config);

    try {
      channel.subscribe();

      // Expose the channel before the opening run finishes. The backend can emit a tool_call.consent
      // *during* this run (before run.done), so a reply submitted while the modal is up must reach a
      // non-null channel — otherwise the consent answer is silently dropped.
      onChannelCreated?.(channel);

      await channel.openChannel(payload, options);

      return channel;
    } catch (error) {
      channel.close();

      throw error;
    }
  }

  /**
   * Clear an **existing** conversation and start over on the same id (F-032) — what the header's reset
   * button does. Two steps, in this order and never bundled:
   *
   * 1. `client.deleteChannel()` — the backend releases the run, transcript, blobs, consent allow-list,
   *    Sandbox and Channel Home, and answers only once that teardown is done.
   * 2. {@link Channel.open} — a plain `action=NONE` opening turn on the now-empty id.
   *
   * This replaces the single `RESET_CHANNEL` turn, which bundled both into one request and therefore
   * could never carry attachments: blobs belong to the channel that was live when they were uploaded, so
   * the delete stripped them and the `blobIds` resolved to nothing without an error. A host that needs
   * "clear, then send with attachments" sequences it itself: `deleteChannel` → upload → `sendMessage`.
   *
   * **Nothing local changes until the delete succeeds** — no channel is constructed, so no state
   * observer fires. A failed delete therefore leaves the caller's current channel and conversation
   * exactly as they were, which is the point: the screen must never be cleared while the server still
   * holds the old conversation.
   */
  public static async reset(
    config: ChannelConfig,
    payload?: Pick<FetchSsePayload, 'text' | 'payload'>,
    options?: FetchSseOptions,
    onChannelCreated?: (channel: Channel) => void,
  ): Promise<Channel> {
    if (!config.client.deleteChannel) {
      // A hand-rolled IAsgardServiceClient that predates F-032. Refuse loudly rather than skipping the
      // delete (the screen would clear while the backend keeps the old conversation) or falling back to
      // the retired RESET_CHANNEL turn. `AsgardServiceClient` always has the method, so only a custom
      // client can land here.
      throw new Error(
        'This client cannot reset a channel: IAsgardServiceClient.deleteChannel is not implemented. ' +
          'Implement it (DELETE {base}/channel?custom_channel_id=…) or use AsgardServiceClient.',
      );
    }

    await config.client.deleteChannel(config.customChannelId);

    return Channel.open(config, payload, options, onChannelCreated);
  }

  /**
   * Join an **existing** channel without resetting it (F-015). Seeds the title from `config.channelTitle`
   * (the `GET /channel/metadata` value) at construction, then replays the server transcript via GET
   * `rejoinSse` and holds `isConnecting` until the run reaches a terminal. Never deletes and never
   * opens, so the channel's history / session / title are preserved — this is the fix for the mount-time
   * "join an existing channel and wipe its history" data-loss bug.
   */
  public static async restore(
    config: ChannelConfig,
    options?: FetchSseOptions,
    onChannelCreated?: (channel: Channel) => void,
  ): Promise<Channel> {
    const channel = new Channel(config);

    try {
      channel.subscribe();

      // Adopt the channel before the replay finishes — a RUNNING restore can stream a tool_call.consent
      // before its terminal, and a reply submitted then must reach a non-null channel (same rationale as
      // reset).
      onChannelCreated?.(channel);

      await channel.rejoinChannel(options);

      return channel;
    } catch (error) {
      channel.close();

      throw error;
    }
  }

  private subscribe(): void {
    this.statesSubscription = combineLatest([
      this.isConnecting$,
      this.conversation$,
      this.derivedStores.tasks$,
      this.derivedStores.subagents$,
      this.channelTitle$,
      this.promptSuggestion$,
      this.sandboxPhase$,
      this.launchedSandboxes$,
      this.runStatus$,
    ])
      .pipe(
        map(
          ([
            isConnecting,
            conversation,
            tasks,
            subagents,
            channelTitle,
            promptSuggestion,
            sandboxPhase,
            launchedSandboxes,
            runStatus,
          ]) => ({
            isConnecting,
            conversation,
            tasks,
            subagents,
            channelTitle,
            promptSuggestion,
            sandboxPhase,
            launchedSandboxes,
            runStatus,
          }),
        ),
      )
      .subscribe(this.statesObserver);
  }

  /**
   * Resolves payload by executing it if it's a function, otherwise returns as-is.
   */
  private resolvePayload(
    payload: Record<string, unknown> | (() => Record<string, unknown>) | undefined,
  ): Record<string, unknown> | undefined {
    if (typeof payload === 'function') {
      try {
        return payload();
      } catch (error) {
        throw new Error(
          `Failed to resolve payload function: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return payload;
  }

  /**
   * Advance the sandbox phase store from an incoming event's type (F-018). Only sandbox / run-boundary
   * events move it; every other event is a no-op, so `distinctUntilChanged` suppresses re-emission on
   * high-frequency message deltas.
   */
  private updateSandboxPhase(eventType: EventType): void {
    switch (eventType) {
      case EventType.SANDBOX_LAUNCH:
        this.sandboxPhaseSubject.next('launching');

        break;
      case EventType.SANDBOX_READY:
        this.sandboxPhaseSubject.next('ready');

        break;
      case EventType.INIT:
      case EventType.ERROR:
        this.sandboxPhaseSubject.next('idle');

        break;
      default:
        break;
    }
  }

  /**
   * The SSE run handlers shared by every run kind (POST send/reset and GET rejoin): fold each frame
   * through the conversation reducer, keep the title store in sync, attach the traceId to the pending
   * user bubble, and settle the run promise (releasing `isConnecting`) on completion / error.
   */
  private buildRunHandlers(
    options: FetchSseOptions | undefined,
    resolve: () => void,
    reject: (err: unknown) => void,
  ): FetchSseOptions {
    return {
      onSseStart: options?.onSseStart,
      onSseMessage: (response: SseResponse<EventType>): void => {
        options?.onSseMessage?.(response);

        // F-023 — remember which run this is so a stop can name it (`request_id`), stopping only this
        // run rather than whatever happens to be live when the request lands.
        this.captureRequestId(response.requestId);

        // F-016 — the channel title is run-level state, not a message; keep it out of the conversation
        // (it is ephemeral and must survive rejoin replays, which don't carry this event).
        if (response.eventType === EventType.CHANNEL_TITLE_UPDATE) {
          this.channelTitleSubject.next(
            (response as SseResponse<EventType.CHANNEL_TITLE_UPDATE>).fact.channelTitleUpdate.title,
          );
        }

        // F-028 — the next-turn suggestion is run-level state, not a message: ephemeral, live-only,
        // and kept out of the conversation. A new run makes the previous prediction stale (it was
        // about the turn that just ended), so `run.init` drops it — including on a rejoin replay,
        // which carries `run.init` but never a suggestion.
        if (response.eventType === EventType.PROMPT_SUGGESTION) {
          this.promptSuggestionSubject.next(
            (response as SseResponse<EventType.PROMPT_SUGGESTION>).fact.promptSuggestion.suggestion,
          );
        } else if (response.eventType === EventType.INIT) {
          this.clearPromptSuggestion();
        }

        // F-018 — sandbox cold-start phase, derived from the last sandbox event. Run-level (not a
        // conversation message); folds identically on live and on rejoin replay (replay-safe). Reset to
        // idle on run init (fresh run re-arms) and error (collapse); `done` is left to the react latch so
        // the ready-beat / fade-out can finish (happy path: `done` arrives after `ready`).
        this.updateSandboxPhase(response.eventType);

        // F-019 — a `sandbox.launch` frame is only a hint: record the name as pending and schedule a
        // metadata refetch (the authority on "who is live"). Never merge it into the live list directly.
        if (response.eventType === EventType.SANDBOX_LAUNCH) {
          this.noteSandboxLaunch((response as SseResponse<EventType.SANDBOX_LAUNCH>).fact.sandboxLaunch.sandboxName);
        }

        if (this.currentUserMessageId && response.traceId) {
          const messages = new Map(this.conversation$.value.messages);
          const userMessage = messages.get(this.currentUserMessageId);

          if (userMessage && userMessage.type === 'user') {
            messages.set(this.currentUserMessageId, {
              ...userMessage,
              traceId: response.traceId,
            });
            // Carry `pendingConsent` over — this rebuild bypasses the reducer (which preserves it on
            // every hop), so omitting it silently discards a consent prompt that arrived on an earlier,
            // traceId-less frame, stranding a run that is still waiting for the answer.
            this.conversation$.next(
              new Conversation({
                messages,
                pendingConsent: this.conversation$.value.pendingConsent,
                pendingFeedback: this.conversation$.value.pendingFeedback,
              }),
            );
          }

          this.currentUserMessageId = undefined;
        }

        this.conversation$.next(this.conversation$.value.onMessage(response));
      },
      onSseError: (err: unknown): void => {
        options?.onSseError?.(err);
        this.settleRun();
        reject(err);
      },
      onSseCompleted: (): void => {
        options?.onSseCompleted?.();
        this.settleRun();
        resolve();
      },
    };
  }

  /**
   * The terminal of a run, whichever way it ended. For a stop in flight this is the moment the backend
   * declares the run actually finished (F-023 AC3) — the same event a normal run ends with — so it is
   * the only place `stopping` is released back to "waiting for input".
   */
  private settleRun(): void {
    const wasStopping = this.runStatusSubject.value.stopPhase !== 'idle';

    this.clearForceStopTimer();
    this.isConnecting$.next(false);
    this.runStatusSubject.next(IDLE_RUN_STATUS);
    this.currentUserMessageId = undefined;
    this.currentRun = undefined;

    // F-020 AC10 / F-023 — a suspended turn is rolled back, so whatever was mid-flight gets no closing
    // frame of its own: a tool-call would spin as `running` forever and a thinking block would stay
    // highlighted as "Thinking…". Settle both rather than leaving them advertising activity that stopped.
    if (wasStopping) {
      this.conversation$.next(this.conversation$.value.settleInFlightMessages());
    }
  }

  /** Record the backend run id from the first frame that carries one; later frames must not overwrite it. */
  private captureRequestId(requestId: string | undefined): void {
    const current = this.runStatusSubject.value;

    if (!requestId || current.requestId || !current.kind) return;

    this.runStatusSubject.next({ ...current, requestId });
  }

  private clearForceStopTimer(): void {
    if (!this.forceStopTimer) return;

    clearTimeout(this.forceStopTimer);
    this.forceStopTimer = undefined;
  }

  private fetchSse(kind: RunKind, payload: FetchSsePayload, options?: FetchSseOptions): Promise<void> {
    return new Promise((resolve, reject) => {
      this.isConnecting$.next(true);
      this.runStatusSubject.next({ kind, stopPhase: 'idle' });
      this.currentRun = this.client.fetchSse(payload, this.buildRunHandlers(options, resolve, reject));
    });
  }

  /**
   * Join-restore transport (F-015): replay the server transcript via GET `rejoinSse` (F-014) and, if a
   * run is still live, keep listening until its terminal — holding `isConnecting` the whole time so the
   * input stays gated (F-003). A client without GET-replay support settles immediately (nothing to
   * restore), so the input is released rather than stuck.
   */
  private rejoinChannel(options?: FetchSseOptions): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.client.rejoinSse) {
        resolve();

        return;
      }

      this.isConnecting$.next(true);
      // Never stoppable either way — a rejoin is not a turn the user just dispatched (F-023 AC8). But
      // the two cases must not look alike on screen (AC9 / UC-046): `restore` is tailing a run the
      // server says is still RUNNING, whereas `replay` is only loading a finished conversation and must
      // not show a run-in-progress indicator.
      this.runStatusSubject.next({
        kind: this.joinRunState === 'RUNNING' ? 'restore' : 'replay',
        stopPhase: 'idle',
      });
      this.currentRun = this.client.rejoinSse(this.customChannelId, this.buildRunHandlers(options, resolve, reject));
    });
  }

  /**
   * The opening turn (F-032): a plain `action=NONE` with the caller's text / payload (empty text when
   * they gave none). On a channel that does not exist the backend creates it and runs the welcome; on
   * one just emptied by `deleteChannel` it starts the new conversation.
   */
  private openChannel(payload?: Pick<FetchSsePayload, 'text' | 'payload'>, options?: FetchSseOptions): Promise<void> {
    return this.fetchSse(
      'reset',
      {
        action: FetchSseAction.NONE,
        customChannelId: this.customChannelId,
        customMessageId: this.customMessageId,
        text: payload?.text || '',
        payload: this.resolvePayload(payload?.payload),
      },
      options,
    );
  }

  public sendMessage(
    payload: Pick<FetchSsePayload, 'customMessageId' | 'text' | 'payload' | 'blobIds'> & {
      filePreviewUrls?: string[];
      documentNames?: string[];
    },
    options?: FetchSseOptions,
  ): Promise<void> {
    // F-023 AC6 / UC-045 — a channel may only ever hold one run. Runs execute in the background on the
    // server, so dispatching a second would leave two of them writing to the same transcript. Refuse
    // *before* the optimistic user bubble is pushed, so a rejected send leaves no trace in the thread.
    //
    // A rejected promise, not a synchronous throw: this method's contract is `Promise<void>`, and
    // fire-and-forget callers (`sendMessage(...)` inside a DOM handler) must not have it explode
    // underneath them.
    const busyWith = this.runStatusSubject.value.kind;

    if (busyWith) return Promise.reject(new ChannelBusyError(busyWith));

    // #404 — the same rule for a case the run-kind check cannot see. A channel parked on a consent
    // prompt is paused on the server and only `RESPONSE_TOOL_CALL_CONSENT` resumes it; a plain turn
    // comes back rejected ("use RespondToolCallConsent"). The pause is invisible above because the
    // consent frame precedes the run terminal — by the time the prompt is on screen the run has already
    // settled and `kind` is undefined. Refuse before the optimistic bubble, same as the busy guard.
    const pendingConsent = this.conversation$.value.pendingConsent;

    if (pendingConsent) return Promise.reject(new ChannelAwaitingConsentError(pendingConsent.processId));

    // F-028 — the prediction was about what to say after the previous turn, so sending expires it
    // whether or not it was adopted. Cleared here rather than in the composer so programmatic sends
    // expire it too; after the guards above, so a refused send leaves the offer standing.
    this.clearPromptSuggestion();

    const text = payload.text.trim();
    const messageId = payload.customMessageId ?? uuidv4();

    this.currentUserMessageId = messageId;
    this.lastSentMessageId = messageId;

    this.conversation$.next(
      this.conversation$.value.pushMessage({
        type: 'user',
        messageId,
        text,
        blobIds: payload.blobIds,
        filePreviewUrls: payload.filePreviewUrls,
        documentNames: payload.documentNames,
        time: new Date(),
      }),
    );

    return this.fetchSse(
      'user',
      {
        action: FetchSseAction.NONE,
        customChannelId: this.customChannelId,
        customMessageId: messageId,
        payload: this.resolvePayload(payload?.payload),
        text,
        blobIds: payload?.blobIds,
      },
      options,
    );
  }

  /**
   * Rate one assistant reply Good or Bad (F-033 / UC-055, UC-056, UC-059). Posts the verdict, and only
   * once the server has accepted it writes the rating into that reply's `feedback` — the SDK holds no
   * open stream between runs, so the live `asgard.message.feedback` echo of its own post would never
   * arrive; the next rejoin replays it from the transcript instead. A rejection leaves the conversation
   * untouched (no optimistic update, UC-059 Alt B), so the caller can show the error and let the user try
   * again with the same comment.
   *
   * Rating is **not** telling the agent: when the user also wants that, the caller sends an ordinary
   * message composed by `composeFeedbackMessage()` through `sendMessage` after this resolves (UC-057).
   */
  public async sendMessageFeedback(messageId: string, feedback: MessageFeedbackState): Promise<MessageFeedbackReply> {
    if (!this.client.sendMessageFeedback) {
      throw new Error(
        'This client cannot rate a reply: IAsgardServiceClient.sendMessageFeedback is not implemented. ' +
          'Implement it (POST {base}/message/feedback) or use AsgardServiceClient.',
      );
    }

    const reply = await this.client.sendMessageFeedback({
      customChannelId: this.customChannelId,
      messageId,
      verdict: feedback.verdict,
      comment: feedback.comment,
    });

    const comment = feedback.comment?.trim();
    this.conversation$.next(
      this.conversation$.value.applyFeedback(messageId, {
        verdict: feedback.verdict,
        ...(comment ? { comment } : {}),
      }),
    );

    return reply;
  }

  public replyToolCallConsents(
    toolCallConsents: ToolCallConsentAnswer[],
    options?: FetchSseOptions,
    payload?: FetchSsePayload['payload'],
  ): Promise<void> {
    // Cleared optimistically so the modal closes the moment the user answers, rather than lingering
    // while the reply is in flight. Kept so it can be put back if the reply never lands (#410).
    const answered = this.conversation$.value.pendingConsent;

    this.conversation$.next(this.conversation$.value.clearPendingConsent());

    // `user` — answering a consent prompt resumes the user's own turn, so it stays stoppable (F-023 AC8).
    return this.fetchSse(
      'user',
      {
        action: FetchSseAction.RESPONSE_TOOL_CALL_CONSENT,
        customChannelId: this.customChannelId,
        customMessageId: this.lastSentMessageId ?? this.customMessageId,
        payload: this.resolvePayload(payload),
        text: '',
        toolCallConsents,
      },
      options,
    ).catch((error: unknown) => {
      // #410 — the server is still paused, so leaving the prompt cleared would disarm the send/nudge
      // guards and let the next turn hit the backend rejection they exist to prevent. Put it back: the
      // modal returns and the user can answer again.
      if (answered) {
        this.conversation$.next(this.conversation$.value.restorePendingConsent(answered));
      }

      throw error;
    });
  }

  /**
   * Nudge an idle / recycled sandbox back to life (F-021 AC4). Sends an `action=NUDGE` turn with empty
   * text — the backend suppresses `message.*` and writes no transcript, so nothing renders in the
   * conversation; the FE simply waits for the resulting `sandbox.launch`/`ready` frames (and a metadata
   * refetch) to refill `launchedSandboxes$`. An invisible turn, unlike `sendMessage`.
   *
   * Invisible, but still a real turn — so it needs `payload` exactly like the other three outbounds
   * (BUG-004). The backend rebuilds `prevPayload` from *this* turn's incoming payload and never carries
   * the previous turn's over, and the sandbox blueprint reads its subagents / source-set mounts /
   * working directory straight out of it. Omitting payload therefore wakes an empty sandbox rather than
   * the one the channel was working in, and every one of those expressions has a falsy fallback, so it
   * fails silently.
   *
   * @param payload Turn-level payload, resolved through the same path as `sendMessage` — pass a
   * function to compute it at send time. In `@asgard-js/react` this is filled in automatically from
   * `onBeforeSendMessage`.
   *
   * Rejects with `ChannelBusyError` when a run already holds the channel, and with
   * `ChannelAwaitingConsentError` while a consent prompt is pending — exactly like `sendMessage`.
   */
  public nudge(options?: FetchSseOptions, payload?: FetchSsePayload['payload']): Promise<void> {
    // F-023 AC6 / UC-045 — one run per channel. Invisible or not, a nudge is a turn, so it queues
    // behind whatever is running instead of displacing it. Without this the damage went past a
    // duplicate run: `fetchSse` replaces `currentRun` without unsubscribing the old one and stamps
    // `runStatus.kind` with `nudge`, and a stop control is only offered while that is `user` — so the
    // user's own turn quietly lost its stop button and could never be stopped again.
    const busyWith = this.runStatusSubject.value.kind;

    if (busyWith) return Promise.reject(new ChannelBusyError(busyWith));

    // #406 — a nudge is dispatched down the same `PostUserMessage` path as a plain turn (the backend
    // hardcodes `IsTrigger: false` there; `IsNudge` is a separate field), so a channel paused on a
    // consent prompt rejects it exactly like a message. Same guard as `sendMessage`, for the same
    // reason the busy check above cannot catch it: the consent frame precedes the run terminal.
    const pendingConsent = this.conversation$.value.pendingConsent;

    if (pendingConsent) return Promise.reject(new ChannelAwaitingConsentError(pendingConsent.processId));

    // `nudge` — invisible to the user, so it must never surface a stop control (F-023 AC8).
    return this.fetchSse(
      'nudge',
      {
        action: FetchSseAction.NUDGE,
        customChannelId: this.customChannelId,
        customMessageId: this.lastSentMessageId ?? this.customMessageId,
        payload: this.resolvePayload(payload),
        text: '',
      },
      options,
    );
  }

  /**
   * User-initiated stop-generation (F-023).
   *
   * Runs execute in the **background on the server**, so aborting the local SSE connection would only
   * stop *watching*: the agent would keep running, keep spending tokens and keep writing the
   * transcript. Instead this asks the backend to suspend the run and **keeps the stream open**, because
   * the stop is declared by that stream's terminal event — the same event a normal run ends with.
   *
   * The call is therefore asynchronous in two stages:
   * 1. resolving here means the backend **accepted** the request, not that the run has stopped;
   * 2. `isConnecting` / `runStatus` only return to idle when the terminal event arrives (AC3).
   *
   * While waiting, `runStatus.stopPhase` is `stopping` and every send entrance must stay gated (AC5).
   * If the terminal event has not arrived within {@link FORCE_STOP_TIMEOUT_MS} the phase becomes
   * `force-stoppable`, and calling again with `{ force: true }` tells the backend to give up on the run
   * rather than let it wind down (AC7).
   *
   * No-ops (resolving) when nothing is running, when the run is not the user's own — an opening
   * welcome, a transcript replay or an invisible nudge must never be stopped (AC8) — or when a stop is
   * already pending and this is not a force.
   *
   * **Rejects** when the suspend request fails (network error, or a non-2xx that is not `404`). The
   * stop phase is rolled back to `idle` first, so the caller can retry and the UI can never be stuck in
   * `stopping` (AC4).
   *
   * A client that predates the suspend endpoint (a custom `IAsgardServiceClient`) falls back to the old
   * local-abort behavior, so existing integrations keep working.
   */
  public async stopGeneration(options?: StopGenerationOptions): Promise<void> {
    const status = this.runStatusSubject.value;

    if (!this.currentRun || status.kind !== 'user') return;

    // A second press while stopping does nothing; only an explicit force re-issues the request (AC2).
    if (status.stopPhase !== 'idle' && !options?.force) return;

    if (!this.client.suspendChannel) {
      this.abortConnection();

      return;
    }

    this.clearForceStopTimer();
    this.runStatusSubject.next({ ...status, stopPhase: 'stopping' });

    try {
      await this.client.suspendChannel(this.customChannelId, {
        requestId: status.requestId,
        force: options?.force,
      });
    } catch (error) {
      // AC4 — never strand the UI in `stopping`; hand the stop control back so the user can retry.
      this.clearForceStopTimer();
      this.runStatusSubject.next({ ...this.runStatusSubject.value, stopPhase: 'idle' });

      throw error;
    }

    // Accepted. The stream stays connected; `settleRun()` releases the input when the terminal arrives.
    this.armForceStopTimer();
  }

  /**
   * Escalate to `force-stoppable` once an accepted stop has waited too long for the terminal event
   * (F-023 AC7 / UC-044) — the escape hatch for an agent that never winds down. Re-armed on a force
   * retry, so a second timeout offers the same way out again.
   */
  private armForceStopTimer(): void {
    this.clearForceStopTimer();

    this.forceStopTimer = setTimeout(() => {
      this.forceStopTimer = undefined;

      const current = this.runStatusSubject.value;

      if (current.stopPhase !== 'stopping') return;

      this.runStatusSubject.next({ ...current, stopPhase: 'force-stoppable' });
    }, FORCE_STOP_TIMEOUT_MS);
  }

  /**
   * Cut the local SSE connection without telling the backend. This is *not* stop-generation (see
   * {@link stopGeneration}) — the server-side run keeps going. Used when there is nothing to stop
   * remotely: a client without suspend support, and channel teardown.
   *
   * The deliberate abort must never be read as a transport failure — `create-sse-observable` marks the
   * stream disposed so no reconnect is attempted (F-023 AC10).
   */
  private abortConnection(): void {
    if (!this.currentRun) return;

    this.currentRun.unsubscribe();
    this.clearForceStopTimer();
    this.currentRun = undefined;
    this.isConnecting$.next(false);
    this.runStatusSubject.next(IDLE_RUN_STATUS);
    this.currentUserMessageId = undefined;
    // F-020 AC10: settle whatever is still in flight — no closing frame will arrive now that the run is
    // aborted, so a tool-call must not linger as `running` nor a thinking block as "Thinking…".
    this.conversation$.next(this.conversation$.value.settleInFlightMessages());
  }

  public close(): void {
    this.currentRun?.unsubscribe();
    this.currentRun = undefined;
    this.clearForceStopTimer();
    this.isConnecting$.complete();
    this.runStatusSubject.complete();
    this.conversation$.complete();
    this.channelTitleSubject.complete();
    this.sandboxPhaseSubject.complete();
    this.launchedSandboxesSubject.complete();
    this.derivedStores.teardown();
    this.statesSubscription?.unsubscribe();
  }
}
