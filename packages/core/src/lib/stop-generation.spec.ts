import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Subscription } from 'rxjs';
import Channel, { FORCE_STOP_TIMEOUT_MS } from './channel';
import Conversation from './conversation';
import { EventType, FetchSseAction } from '../constants/enum';
import { ChannelBusyError, HttpError } from '../types';
import type {
  ChannelStates,
  FetchSseOptions,
  FetchSsePayload,
  IAsgardServiceClient,
  RunStatus,
  SseResponse,
} from '../types';

// F-023 — stopping must actually suspend the *server-side* run, not just cut the local stream. These
// specs drive a mock client whose SSE run is held open by hand, so the two halves of the lifecycle can
// be observed separately: the suspend request going out, and the terminal event that ends the wait.

interface HeldRun {
  options: FetchSseOptions;
  payload?: FetchSsePayload;
  unsubscribed: boolean;
}

interface Harness {
  client: IAsgardServiceClient;
  runs: HeldRun[];
  suspendCalls: { customChannelId: string; requestId?: string; force?: boolean }[];
  /** The run currently held open (the last one started). */
  current: () => HeldRun;
}

/**
 * A client whose runs never settle on their own — the test decides when (and whether) the terminal
 * event arrives. That is the whole point of F-023: the suspend call and the terminal are two separate
 * moments, and the SDK must not conflate them.
 */
function makeHarness(options?: {
  suspend?: (customChannelId: string, opts?: { requestId?: string; force?: boolean }) => Promise<void>;
  omitSuspend?: boolean;
}): Harness {
  const runs: HeldRun[] = [];
  const suspendCalls: Harness['suspendCalls'] = [];

  const start = (payload: FetchSsePayload | undefined, sseOptions?: FetchSseOptions): Subscription => {
    const run: HeldRun = { options: sseOptions ?? {}, payload, unsubscribed: false };
    runs.push(run);
    sseOptions?.onSseStart?.();

    return new Subscription(() => {
      run.unsubscribed = true;
    });
  };

  const client: Partial<IAsgardServiceClient> = {
    fetchSse: (payload, sseOptions) => start(payload, sseOptions),
    rejoinSse: (_customChannelId, sseOptions) => start(undefined, sseOptions),
  };

  // F-032 — `Channel.reset` deletes before it opens, so the harness has to be able to delete.
  client.deleteChannel = async (): Promise<void> => undefined;

  if (!options?.omitSuspend) {
    client.suspendChannel = async (customChannelId, opts): Promise<void> => {
      suspendCalls.push({ customChannelId, requestId: opts?.requestId, force: opts?.force });

      if (options?.suspend) await options.suspend(customChannelId, opts);
    };
  }

  return {
    client: client as IAsgardServiceClient,
    runs,
    suspendCalls,
    current: () => runs[runs.length - 1],
  };
}

function frame(requestId: string): SseResponse<EventType> {
  return {
    eventType: EventType.MESSAGE_COMPLETE,
    requestId,
    namespace: 'ns',
    botProviderName: 'bp',
    customChannelId: 'ch',
    fact: { messageComplete: { message: { messageId: 'm1', text: 'partial' } } },
  } as unknown as SseResponse<EventType>;
}

function makeChannel(
  client: IAsgardServiceClient,
  extra?: { runState?: 'RUNNING' | 'IDLE'; statesObserver?: (states: ChannelStates) => void },
): Channel {
  return Channel.create({
    client,
    customChannelId: 'ch',
    conversation: new Conversation({ messages: new Map() }),
    runState: extra?.runState,
    statesObserver: extra?.statesObserver,
  });
}

/** Start a user turn and leave its run open. Returns the channel and the pending send promise. */
function startUserRun(harness: Harness): { channel: Channel; sent: Promise<void> } {
  const channel = makeChannel(harness.client);
  const sent = channel.sendMessage({ text: 'hello' });
  // Let the run adopt a backend request id, exactly as a real first frame would.
  harness.current().options.onSseMessage?.(frame('req-42'));

  return { channel, sent };
}

function statusOf(channel: Channel): RunStatus {
  return channel.getRunStatus();
}

describe('stopGeneration — the suspend request (F-023 AC1)', () => {
  it('calls the backend suspend endpoint instead of only aborting the local connection', async () => {
    const harness = makeHarness();
    const { channel } = startUserRun(harness);

    await channel.stopGeneration();

    expect(harness.suspendCalls).toEqual([{ customChannelId: 'ch', requestId: 'req-42', force: undefined }]);
    // The stream is the only place the "stopped" signal can come from, so it must stay connected.
    expect(harness.current().unsubscribed).toBe(false);
  });

  it('names the run being stopped so a later run is never suspended by accident', async () => {
    const harness = makeHarness();
    const { channel } = startUserRun(harness);

    await channel.stopGeneration();

    expect(harness.suspendCalls[0].requestId).toBe('req-42');
  });

  it('falls back to the legacy local abort when the client predates the suspend endpoint', async () => {
    const harness = makeHarness({ omitSuspend: true });
    const { channel } = startUserRun(harness);

    await channel.stopGeneration();

    expect(harness.current().unsubscribed).toBe(true);
    expect(statusOf(channel).kind).toBeNull();
  });
});

describe('stopGeneration — waiting for the terminal event (F-023 AC2/AC3)', () => {
  it('stays in `stopping` after the request is accepted, and only releases on the terminal event', async () => {
    const harness = makeHarness();
    const { channel, sent } = startUserRun(harness);

    await channel.stopGeneration();

    expect(statusOf(channel)).toMatchObject({ kind: 'user', stopPhase: 'stopping' });

    harness.current().options.onSseCompleted?.();
    await sent;

    expect(statusOf(channel)).toMatchObject({ kind: null, stopPhase: 'idle' });
  });

  it('ignores a repeat press while stopping, so the endpoint is not hit twice', async () => {
    const harness = makeHarness();
    const { channel } = startUserRun(harness);

    await channel.stopGeneration();
    await channel.stopGeneration();

    expect(harness.suspendCalls).toHaveLength(1);
  });

  it('settles the sendMessage promise once the run terminates, rather than hanging forever', async () => {
    const harness = makeHarness();
    const { channel, sent } = startUserRun(harness);

    await channel.stopGeneration();
    harness.current().options.onSseCompleted?.();

    await expect(sent).resolves.toBeUndefined();
  });
});

describe('stopGeneration — a failed request must not strand the UI (F-023 AC4)', () => {
  it('rolls `stopPhase` back to idle and rethrows, so the user can retry', async () => {
    const harness = makeHarness({
      suspend: () => Promise.reject(new HttpError(500, 'Internal Server Error')),
    });
    const { channel } = startUserRun(harness);

    await expect(channel.stopGeneration()).rejects.toBeInstanceOf(HttpError);

    expect(statusOf(channel)).toMatchObject({ kind: 'user', stopPhase: 'idle' });
  });

  it('lets a retry after a failure reach the endpoint again', async () => {
    let failNext = true;
    const harness = makeHarness({
      suspend: () => {
        if (failNext) {
          failNext = false;

          return Promise.reject(new HttpError(503, 'Service Unavailable'));
        }

        return Promise.resolve();
      },
    });
    const { channel } = startUserRun(harness);

    await expect(channel.stopGeneration()).rejects.toBeInstanceOf(HttpError);
    await channel.stopGeneration();

    expect(harness.suspendCalls).toHaveLength(2);
    expect(statusOf(channel).stopPhase).toBe('stopping');
  });
});

// A nudge is invisible, but it is still a turn — and `sendMessage` already refuses to dispatch a second
// one because a channel may only ever hold one run (AC6 / UC-045). Nudge skipped that check, and the
// damage was not just a duplicate run: `fetchSse` overwrites `currentRun` without unsubscribing the old
// one, and stamps `runStatus.kind` with `nudge`. Since a stop control is only offered for `kind ===
// 'user'`, the user's own turn silently lost its stop button and could never be stopped again. The
// window is real — between sending a message and the sandbox coming up, the File Explorer shows its
// empty state with the Nudge button live.
describe('nudge — one run at a time (F-023 AC6 / UC-045)', () => {
  it('refuses to dispatch while a run is in flight', async () => {
    const harness = makeHarness();
    const { channel } = startUserRun(harness);

    await expect(channel.nudge()).rejects.toBeInstanceOf(ChannelBusyError);
    expect(harness.runs).toHaveLength(1);
  });

  it('leaves the in-flight run stoppable — its identity is not overwritten', async () => {
    const harness = makeHarness();
    const { channel } = startUserRun(harness);

    await expect(channel.nudge()).rejects.toBeInstanceOf(ChannelBusyError);

    expect(statusOf(channel).kind).toBe('user');
    expect(statusOf(channel).requestId).toBe('req-42');
  });

  it('does not strand the in-flight run by replacing its subscription', async () => {
    const harness = makeHarness();
    const { channel } = startUserRun(harness);

    await expect(channel.nudge()).rejects.toBeInstanceOf(ChannelBusyError);
    channel.close();

    // Only reachable through `currentRun`; a nudge that replaced it would leave this one open forever.
    expect(harness.runs[0].unsubscribed).toBe(true);
  });

  it('still dispatches once the run has settled', () => {
    const harness = makeHarness();
    const { channel } = startUserRun(harness);

    harness.current().options.onSseCompleted?.();
    // Left in flight on purpose — the harness never settles a run on its own; settled below.
    void channel.nudge();

    expect(harness.runs).toHaveLength(2);
    expect(harness.runs[1].payload?.action).toBe(FetchSseAction.NUDGE);
    harness.current().options.onSseCompleted?.();
  });
});

describe('sendMessage — one run at a time (F-023 AC6 / UC-045)', () => {
  it('rejects with ChannelBusyError while a run is in flight', async () => {
    const harness = makeHarness();
    const { channel } = startUserRun(harness);

    await expect(channel.sendMessage({ text: 'second' })).rejects.toBeInstanceOf(ChannelBusyError);
    expect(harness.runs).toHaveLength(1);
  });

  it('rejects while stopping too — the old run has not finished yet', async () => {
    const harness = makeHarness();
    const { channel } = startUserRun(harness);

    await channel.stopGeneration();

    await expect(channel.sendMessage({ text: 'second' })).rejects.toBeInstanceOf(ChannelBusyError);
    expect(harness.runs).toHaveLength(1);
  });

  it('leaves no optimistic user bubble behind for the refused message', async () => {
    const harness = makeHarness();
    const seen: ChannelStates[] = [];
    const channel = makeChannel(harness.client, { statesObserver: states => seen.push(states) });

    void channel.sendMessage({ text: 'first' });
    await expect(channel.sendMessage({ text: 'second' })).rejects.toBeInstanceOf(ChannelBusyError);

    const latest = seen[seen.length - 1];
    const userTexts = [...(latest.conversation.messages?.values() ?? [])]
      .filter(message => message.type === 'user')
      .map(message => message.text);

    expect(userTexts).toEqual(['first']);
  });

  it('accepts the next message once the stopped run has terminated', async () => {
    const harness = makeHarness();
    const { channel, sent } = startUserRun(harness);

    await channel.stopGeneration();
    harness.current().options.onSseCompleted?.();
    await sent;

    void channel.sendMessage({ text: 'second' });

    expect(harness.runs).toHaveLength(2);
    expect(harness.runs[1].payload?.action).toBe(FetchSseAction.NONE);
  });
});

describe('stopGeneration — force stop after the timeout (F-023 AC7)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('escalates to `force-stoppable` when the terminal event never arrives', async () => {
    const harness = makeHarness();
    const { channel } = startUserRun(harness);

    await channel.stopGeneration();
    expect(statusOf(channel).stopPhase).toBe('stopping');

    vi.advanceTimersByTime(FORCE_STOP_TIMEOUT_MS);

    expect(statusOf(channel).stopPhase).toBe('force-stoppable');
  });

  it('sends `force` on the follow-up press', async () => {
    const harness = makeHarness();
    const { channel } = startUserRun(harness);

    await channel.stopGeneration();
    vi.advanceTimersByTime(FORCE_STOP_TIMEOUT_MS);
    await channel.stopGeneration({ force: true });

    expect(harness.suspendCalls).toHaveLength(2);
    expect(harness.suspendCalls[1].force).toBe(true);
  });

  it('never escalates once the run has already terminated', async () => {
    const harness = makeHarness();
    const { channel, sent } = startUserRun(harness);

    await channel.stopGeneration();
    harness.current().options.onSseCompleted?.();
    await sent;

    vi.advanceTimersByTime(FORCE_STOP_TIMEOUT_MS);

    expect(statusOf(channel)).toMatchObject({ kind: null, stopPhase: 'idle' });
  });
});

describe('run kinds (F-023 AC8/AC9)', () => {
  // F-032 — the opening turn is a plain `action=NONE` now, but its run kind must stay `reset`: it is
  // still not a turn the user dispatched, so no stop control belongs on it. Both entry points are pinned,
  // because it is the run kind (not the action) that gates stop-generation.
  it('marks an opening run as `reset`, and refuses to suspend it', async () => {
    const harness = makeHarness();
    const conversation = new Conversation({ messages: new Map() });
    let channel: Channel | undefined;

    void Channel.open({ client: harness.client, customChannelId: 'ch', conversation }, undefined, undefined, c => {
      channel = c;
    });

    expect(harness.current().payload?.action).toBe(FetchSseAction.NONE);
    expect(statusOf(channel as Channel)).toMatchObject({ kind: 'reset', stopPhase: 'idle' });

    await (channel as Channel).stopGeneration();

    expect(harness.suspendCalls).toHaveLength(0);
    expect(harness.current().unsubscribed).toBe(false);
  });

  it('marks the run that follows a reset delete as `reset` too', async () => {
    const harness = makeHarness();
    const conversation = new Conversation({ messages: new Map() });
    let channel: Channel | undefined;

    void Channel.reset({ client: harness.client, customChannelId: 'ch', conversation }, undefined, undefined, c => {
      channel = c;
    });
    // The delete is awaited first, so the channel only exists after the microtask queue drains.
    await Promise.resolve();
    await Promise.resolve();

    expect(harness.current().payload?.action).toBe(FetchSseAction.NONE);
    expect(statusOf(channel as Channel)).toMatchObject({ kind: 'reset', stopPhase: 'idle' });

    await (channel as Channel).stopGeneration();

    expect(harness.suspendCalls).toHaveLength(0);
  });

  it('marks an invisible nudge as `nudge`, and refuses to suspend it', async () => {
    const harness = makeHarness();
    const channel = makeChannel(harness.client);

    void channel.nudge();

    expect(statusOf(channel).kind).toBe('nudge');

    await channel.stopGeneration();

    expect(harness.suspendCalls).toHaveLength(0);
  });

  it('marks a rejoin of a RUNNING channel as `restore`, and refuses to suspend it', async () => {
    const harness = makeHarness();
    const conversation = new Conversation({ messages: new Map() });
    let channel: Channel | undefined;

    void Channel.restore(
      { client: harness.client, customChannelId: 'ch', conversation, runState: 'RUNNING' },
      undefined,
      c => {
        channel = c;
      },
    );

    expect(statusOf(channel as Channel).kind).toBe('restore');

    await (channel as Channel).stopGeneration();

    expect(harness.suspendCalls).toHaveLength(0);
  });

  it('marks a rejoin of an already-finished channel as `replay` (AC9 / UC-046)', () => {
    const harness = makeHarness();
    const conversation = new Conversation({ messages: new Map() });
    let channel: Channel | undefined;

    void Channel.restore(
      { client: harness.client, customChannelId: 'ch', conversation, runState: 'IDLE' },
      undefined,
      c => {
        channel = c;
      },
    );

    expect(statusOf(channel as Channel).kind).toBe('replay');
  });

  it('defaults an unknown join run state to `replay`, so history never fakes generation', () => {
    const harness = makeHarness();
    const conversation = new Conversation({ messages: new Map() });
    let channel: Channel | undefined;

    void Channel.restore({ client: harness.client, customChannelId: 'ch', conversation }, undefined, c => {
      channel = c;
    });

    expect(statusOf(channel as Channel).kind).toBe('replay');
  });
});

describe('teardown (F-023 AC10 / §1.5)', () => {
  it('clears the pending force-stop timer when the channel closes', async () => {
    vi.useFakeTimers();

    try {
      const harness = makeHarness();
      const { channel } = startUserRun(harness);

      await channel.stopGeneration();
      channel.close();

      // A surviving timer would push onto a completed subject and throw.
      expect(() => vi.advanceTimersByTime(FORCE_STOP_TIMEOUT_MS)).not.toThrow();
    } finally {
      vi.useRealTimers();
    }
  });
});
