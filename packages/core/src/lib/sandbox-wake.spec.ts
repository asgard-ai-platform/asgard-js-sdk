import { describe, it, expect, vi } from 'vitest';
import Channel from './channel';
import Conversation from './conversation';
import { FetchSseAction } from '../constants/enum';
import { ChannelBusyError } from '../types/channel-busy-error';
import type {
  ChannelMetadata,
  FetchSseOptions,
  FetchSsePayload,
  IAsgardServiceClient,
  LaunchedSandbox,
  SandboxWakePhase,
  ToolCallConsentEventData,
} from '../types';

// F-038 — the channel's one shared sandbox wake. Every entry point (File Explorer, download card, a host
// calling `nudge()` directly) reads and joins the same wake, so the harness below lets a test hold the
// nudge turn and the metadata re-fetch open and finish them by hand.

function sb(sandboxName: string): LaunchedSandbox {
  return {
    sandboxName,
    sandboxBlueprintName: 'bp',
    workingDirectory: '/work',
    editorServerEnabled: false,
    browserEnabled: false,
  };
}

interface Harness {
  channel: Channel;
  sent: FetchSsePayload[];
  phases: SandboxWakePhase[];
  /** Live sandboxes the next metadata re-fetch will report. */
  serverLive: string[];
  completeRun: () => void;
  failRun: (error?: unknown) => void;
  metadataCalls: () => number;
  /** When set, the metadata re-fetch waits until `releaseMetadata()` is called. */
  holdMetadata: () => void;
  releaseMetadata: () => void;
  failMetadata: () => void;
}

function harness(opts: { pendingConsent?: boolean; live?: string[] } = {}): Harness {
  const sent: FetchSsePayload[] = [];
  let runOptions: FetchSseOptions | undefined;
  let held: (() => void) | null = null;
  let hold = false;
  let metadataFails = false;
  const state = { serverLive: [] as string[] };

  const channelMetadata = vi.fn(async (): Promise<ChannelMetadata> => {
    if (hold) await new Promise<void>(resolve => (held = resolve));

    if (metadataFails) throw new Error('metadata down');

    return { title: null, runState: 'IDLE', launchedSandboxes: state.serverLive.map(sb) };
  });

  const client = {
    fetchSse(payload: FetchSsePayload, options?: FetchSseOptions): void {
      sent.push(payload);
      runOptions = options;
      options?.onSseStart?.();
    },
    channelMetadata,
  } as unknown as IAsgardServiceClient;

  const pendingConsent = opts.pendingConsent ? ({ processId: 'proc-1' } as ToolCallConsentEventData) : null;
  const channel = Channel.create({
    client,
    customChannelId: 'ch',
    conversation: new Conversation({ messages: new Map(), pendingConsent }),
    launchedSandboxes: (opts.live ?? []).map(sb),
  });
  const phases: SandboxWakePhase[] = [];
  channel.sandboxWake$.subscribe(s => phases.push(s.phase));

  return {
    channel,
    sent,
    phases,
    get serverLive(): string[] {
      return state.serverLive;
    },
    set serverLive(names: string[]) {
      state.serverLive = names;
    },
    completeRun: (): void => runOptions?.onSseCompleted?.(),
    failRun: (error: unknown = new Error('nudge failed')): void => runOptions?.onSseError?.(error),
    metadataCalls: (): number => channelMetadata.mock.calls.length,
    holdMetadata: (): void => {
      hold = true;
    },
    releaseMetadata: (): void => held?.(),
    failMetadata: (): void => {
      metadataFails = true;
    },
  };
}

const flush = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

describe('Channel — shared sandbox wake (F-038)', () => {
  it('starts idle and exposes a snapshot', () => {
    const h = harness();

    expect(h.channel.getSandboxWake()).toEqual({ phase: 'idle' });
    expect(h.phases).toEqual(['idle']);
    h.channel.close();
  });

  it('wakes, stays waking through the metadata re-fetch, then reports live', async () => {
    const h = harness();
    h.serverLive = ['sbx-1'];
    h.holdMetadata();

    const result = h.channel.wakeSandbox('sbx-1');

    expect(h.sent.map(p => p.action)).toEqual([FetchSseAction.NUDGE]);
    expect(h.channel.getSandboxWake().phase).toBe('waking');

    h.completeRun();
    await flush();
    // The turn is over, but metadata has not answered yet — still waking (AC3).
    expect(h.channel.getSandboxWake().phase).toBe('waking');

    h.releaseMetadata();

    await expect(result).resolves.toBe('live');
    expect(h.channel.getSandboxWake().phase).toBe('idle');
    expect(h.channel.getLaunchedSandboxes().map(s => s.sandboxName)).toEqual(['sbx-1']);
    h.channel.close();
  });

  it('sends exactly one nudge for three concurrent wakes (single-flight)', async () => {
    const h = harness();
    h.serverLive = ['sbx-1'];

    const results = [h.channel.wakeSandbox('sbx-1'), h.channel.wakeSandbox('sbx-1'), h.channel.wakeSandbox()];

    h.completeRun();

    await expect(Promise.all(results)).resolves.toEqual(['live', 'live', 'live']);
    expect(h.sent).toHaveLength(1);
    expect(h.metadataCalls()).toBe(1);
    h.channel.close();
  });

  it('joins during the metadata re-fetch window instead of sending a second nudge', async () => {
    const h = harness();
    h.serverLive = ['sbx-1'];
    h.holdMetadata();

    const first = h.channel.wakeSandbox('sbx-1');
    h.completeRun();
    await flush();

    // The nudge turn has ended (no run holds the channel), but the wake is not over yet.
    const joined = h.channel.wakeSandbox('sbx-1');
    const direct = h.channel.nudge();
    h.releaseMetadata();

    await expect(Promise.all([first, joined, direct])).resolves.toEqual(['live', 'live', undefined]);
    expect(h.sent).toHaveLength(1);
    h.channel.close();
  });

  it('fails when the nudge ends but metadata still does not list the target', async () => {
    const h = harness();
    h.serverLive = [];

    const result = h.channel.wakeSandbox('sbx-1');
    h.completeRun();

    await expect(result).resolves.toBe('failed');
    expect(h.channel.getSandboxWake().phase).toBe('failed');
    h.channel.close();
  });

  it('fails when the nudge turn errors, and the next wake clears it', async () => {
    const h = harness();

    const first = h.channel.wakeSandbox('sbx-1');
    h.failRun();

    await expect(first).resolves.toBe('failed');
    expect(h.channel.getSandboxWake().phase).toBe('failed');
    expect(h.metadataCalls()).toBe(0);

    h.serverLive = ['sbx-1'];
    const second = h.channel.wakeSandbox('sbx-1');

    expect(h.channel.getSandboxWake().phase).toBe('waking');
    h.completeRun();
    await expect(second).resolves.toBe('live');
    expect(h.phases).toEqual(['idle', 'waking', 'failed', 'waking', 'idle']);
    h.channel.close();
  });

  it('fails when the metadata re-fetch throws', async () => {
    const h = harness();
    h.failMetadata();

    const result = h.channel.wakeSandbox('sbx-1');
    h.completeRun();

    await expect(result).resolves.toBe('failed');
    expect(h.channel.getSandboxWake().phase).toBe('failed');
    h.channel.close();
  });

  it('is blocked while a user run holds the channel — no nudge, store untouched', async () => {
    const h = harness();
    void h.channel.sendMessage({ text: 'hi' }).catch(() => undefined);

    await expect(h.channel.wakeSandbox('sbx-1')).resolves.toBe('blocked');
    expect(h.sent.map(p => p.action)).not.toContain(FetchSseAction.NUDGE);
    expect(h.channel.getSandboxWake().phase).toBe('idle');
    h.channel.close();
  });

  it('is blocked while a consent prompt is pending', async () => {
    const h = harness({ pendingConsent: true });

    await expect(h.channel.wakeSandbox('sbx-1')).resolves.toBe('blocked');
    expect(h.sent).toEqual([]);
    expect(h.channel.getSandboxWake().phase).toBe('idle');
    h.channel.close();
  });

  it('reports live without a nudge when the target is already live', async () => {
    const h = harness({ live: ['sbx-1'] });

    await expect(h.channel.wakeSandbox('sbx-1')).resolves.toBe('live');
    await expect(h.channel.wakeSandbox()).resolves.toBe('live');
    expect(h.sent).toEqual([]);
    h.channel.close();
  });

  it('drives the same store from a direct nudge() call', async () => {
    const h = harness();
    h.serverLive = ['sbx-1'];

    const nudged = h.channel.nudge();

    expect(h.channel.getSandboxWake().phase).toBe('waking');
    // A card asking now joins the host's nudge rather than sending its own.
    const joined = h.channel.wakeSandbox('sbx-1');
    h.completeRun();

    await nudged;
    await expect(joined).resolves.toBe('live');
    expect(h.sent).toHaveLength(1);
    expect(h.channel.getSandboxWake().phase).toBe('idle');
    h.channel.close();
  });

  it('keeps rejecting a direct nudge() while the nudge turn runs, as before', async () => {
    const h = harness();

    void h.channel.wakeSandbox('sbx-1');

    await expect(h.channel.nudge()).rejects.toBeInstanceOf(ChannelBusyError);
    expect(h.sent).toHaveLength(1);
    h.channel.close();
  });

  it('leaves the store alone when a direct nudge() is refused', async () => {
    const h = harness({ pendingConsent: true });

    await expect(h.channel.nudge()).rejects.toThrow();
    expect(h.phases).toEqual(['idle']);
    h.channel.close();
  });

  it('judges each joining caller by its own target; the store follows the initiator', async () => {
    const h = harness();
    h.serverLive = ['sbx-a'];

    const initiator = h.channel.wakeSandbox('sbx-b');
    const joinerA = h.channel.wakeSandbox('sbx-a');
    const joinerAny = h.channel.wakeSandbox();
    h.completeRun();

    await expect(Promise.all([initiator, joinerA, joinerAny])).resolves.toEqual(['failed', 'live', 'live']);
    expect(h.channel.getSandboxWake().phase).toBe('failed');
    h.channel.close();
  });

  it('treats an unnamed wake as live once metadata lists any sandbox', async () => {
    const h = harness();
    h.serverLive = ['whatever'];

    const result = h.channel.wakeSandbox();
    h.completeRun();

    await expect(result).resolves.toBe('live');
    expect(h.channel.getSandboxWake().phase).toBe('idle');
    h.channel.close();
  });
});
