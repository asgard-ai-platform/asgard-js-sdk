// @vitest-environment jsdom
import { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Channel, Conversation, HttpError } from '@asgard-js/core';
import type {
  ChannelMetadata,
  FetchSseOptions,
  FetchSsePayload,
  IAsgardServiceClient,
  LaunchedSandbox,
  RunStatus,
  SandboxFsReadOptions,
  SandboxFsReadResult,
  SandboxWakeResult,
  ToolCallConsentEventData,
} from '@asgard-js/core';
import { t } from '../../i18n';

/**
 * F-038 / UC-062–064 — the download card's state machine, driven by a real `Channel` so the wake it joins is
 * the channel's one shared wake. The test holds the nudge turn and every `fs/file` read open and settles them
 * by hand.
 */

const ctx = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));

vi.mock('../../context/asgard-service-context', () => ({
  useAsgardContext: (): Record<string, unknown> => ctx.value,
}));

const { SandboxDownloadProvider, useSandboxDownload } = await import('./sandbox-download-context');
const { SandboxDownloadCard } = await import('./sandbox-download-card');

const SBX = 'sbx-1';
const FILE_A = '/work/out/q3.pdf';
const FILE_B = '/work/out/clients.pdf';
const FILE_C = '/MHdata/contract.pdf';

const L = (key: string, vars?: Record<string, string>): string => t('en-US', key, vars);

function sb(sandboxName: string): LaunchedSandbox {
  return {
    sandboxName,
    sandboxBlueprintName: 'bp',
    workingDirectory: '/work',
    editorServerEnabled: false,
    browserEnabled: false,
  };
}

interface PendingRead {
  path: string;
  options: SandboxFsReadOptions | undefined;
  resolve: (result: SandboxFsReadResult) => void;
  reject: (error: unknown) => void;
}

interface Harness {
  channel: Channel;
  nudges: () => number;
  reads: PendingRead[];
  serverLive: string[];
  completeNudge: () => Promise<void>;
  save: ReturnType<typeof vi.fn>;
  setRun: (runStatus: RunStatus, pendingConsent?: ToolCallConsentEventData | null) => void;
  rerender: () => void;
}

function blob(size: number): Blob {
  return new Blob([new Uint8Array(size)]);
}

function harness(opts: { live?: string[]; consent?: boolean } = {}): Harness {
  const sent: FetchSsePayload[] = [];
  let runOptions: FetchSseOptions | undefined;
  const reads: PendingRead[] = [];
  const state = { serverLive: [] as string[] };

  const channel = Channel.create({
    client: {
      fetchSse(payload: FetchSsePayload, options?: FetchSseOptions): void {
        sent.push(payload);
        runOptions = options;
      },
      channelMetadata: async (): Promise<ChannelMetadata> => ({
        title: null,
        runState: 'IDLE',
        launchedSandboxes: state.serverLive.map(sb),
      }),
    } as unknown as IAsgardServiceClient,
    customChannelId: 'ch',
    conversation: new Conversation({ messages: new Map() }),
    launchedSandboxes: (opts.live ?? []).map(sb),
  });
  // Keep the server consistent with the seed, so the mount-time metadata refetch does not undo it.
  state.serverLive = [...(opts.live ?? [])];

  const client = {
    sandboxFsRead: (_name: string, path: string, options?: SandboxFsReadOptions): Promise<SandboxFsReadResult> =>
      new Promise((resolve, reject) => reads.push({ path, options, resolve, reject })),
  };
  const save = vi.fn();

  ctx.value = {
    client,
    channel,
    customChannelId: 'ch',
    runStatus: { kind: null, stopPhase: 'idle' },
    pendingConsent: opts.consent ? ({ processId: 'p' } as ToolCallConsentEventData) : null,
    wakeSandbox: (name?: string): Promise<SandboxWakeResult> => channel.wakeSandbox(name),
  };

  const tree = (): ReactNode => (
    <SandboxDownloadProvider saveDownloadedFile={save}>
      <ControllerProbe />
      <div data-testid="a1">
        <SandboxDownloadCard sandboxName={SBX} absolutePath={FILE_A} title="q3.pdf" text="1.7 MB · PDF" />
      </div>
      <div data-testid="a2">
        <SandboxDownloadCard sandboxName={SBX} absolutePath={FILE_A} title="q3.pdf (again)" text="same file" />
      </div>
      <div data-testid="b">
        <SandboxDownloadCard sandboxName={SBX} absolutePath={FILE_B} title="clients.pdf" />
      </div>
      <div data-testid="c">
        <SandboxDownloadCard sandboxName={SBX} absolutePath={FILE_C} title="contract.pdf" />
      </div>
    </SandboxDownloadProvider>
  );
  const view = render(tree());

  return {
    channel,
    nudges: (): number => sent.filter(p => p.action === 'NUDGE').length,
    reads,
    get serverLive(): string[] {
      return state.serverLive;
    },
    set serverLive(names: string[]) {
      state.serverLive = names;
    },
    completeNudge: async (): Promise<void> => {
      await act(async () => {
        runOptions?.onSseCompleted?.();
        await flush();
      });
    },
    save,
    setRun: (runStatus, pendingConsent = null): void => {
      ctx.value = { ...ctx.value, runStatus, pendingConsent };
      view.rerender(tree());
    },
    rerender: (): void => view.rerender(tree()),
  };
}

// Captures the controller, for the entry points that call it without a card (a button-template uri action).
let controllerRef: ReturnType<typeof useSandboxDownload> = null;

function ControllerProbe(): null {
  controllerRef = useSandboxDownload();

  return null;
}

const flush = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

const card = (id: string): HTMLElement => screen.getByTestId(id);
const mainButton = (id: string): HTMLElement =>
  within(card(id)).getByRole('button', { name: new RegExp(L('sandboxDownload.download', { name: '' }).trim()) });

async function click(id: string): Promise<void> {
  await act(async () => {
    fireEvent.click(mainButton(id));
    await flush();
  });
}

async function settleRead(index: number, result: SandboxFsReadResult | Error): Promise<void> {
  await act(async () => {
    if (result instanceof Error) harnessReads[index].reject(result);
    else harnessReads[index].resolve(result);

    await flush();
  });
}

let harnessReads: PendingRead[] = [];

function start(opts?: { live?: string[]; consent?: boolean }): Harness {
  const h = harness(opts);
  harnessReads = h.reads;

  return h;
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('download card — sandbox live (UC-062)', () => {
  it('reads without a limit, shows progress, saves under the basename, then returns to idle', async () => {
    const h = start({ live: [SBX] });
    await act(flush);

    await click('a1');

    expect(h.reads).toHaveLength(1);
    expect(h.reads[0].path).toBe(FILE_A);
    expect(h.reads[0].options?.limitBytes).toBeUndefined();
    expect(h.reads[0].options?.customChannelId).toBe('ch');

    act(() => h.reads[0].options?.onProgress?.(512 * 1024, 2 * 1024 * 1024));
    expect(
      within(card('a1')).getByText(L('sandboxDownload.progress', { received: '512 KB', total: '2.0 MB' })),
    ).toBeTruthy();

    vi.useFakeTimers();
    await act(async () => {
      h.reads[0].resolve({ content: blob(10), totalBytes: 10, truncated: false });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(h.save).toHaveBeenCalledWith(expect.any(Blob), 'q3.pdf');
    expect(within(card('a1')).getByText(L('sandboxDownload.done'))).toBeTruthy();

    act(() => vi.advanceTimersByTime(2500));
    expect(within(card('a1')).queryByText(L('sandboxDownload.done'))).toBeNull();
    expect(h.nudges()).toBe(0);
  });

  it('shares one state between two cards for the same file, and ignores repeat clicks', async () => {
    const h = start({ live: [SBX] });
    await act(flush);

    await click('a1');

    expect(within(card('a2')).getByText(L('sandboxDownload.downloading'))).toBeTruthy();
    expect(mainButton('a2')).toHaveProperty('disabled', true);
    expect(h.reads).toHaveLength(1);
  });
});

describe('download controller — entry points without a card', () => {
  it('ignores a second download() for a file already in flight (e.g. a button-template uri)', async () => {
    const h = start({ live: [SBX] });
    await act(flush);

    await act(async () => {
      controllerRef?.download(SBX, FILE_A);
      await flush();
    });
    await act(async () => {
      controllerRef?.download(SBX, FILE_A);
      await flush();
    });

    expect(h.reads).toHaveLength(1);
  });
});

describe('download card — sandbox recycled (UC-063)', () => {
  it('hints that it will wake first, waits, then downloads on its own once metadata lists the sandbox', async () => {
    const h = start();
    await act(flush);

    expect(within(card('a1')).getByText(L('sandboxDownload.coldHint'))).toBeTruthy();

    await click('a1');

    expect(within(card('a1')).getByText(L('sandboxDownload.waiting'))).toBeTruthy();
    expect(within(card('a1')).getByRole('button', { name: L('sandboxDownload.cancel') })).toBeTruthy();
    expect(h.nudges()).toBe(1);
    // The other cards on that sandbox now say a wake is under way elsewhere.
    expect(within(card('b')).getByText(L('sandboxDownload.wakingHint'))).toBeTruthy();

    h.serverLive = [SBX];
    await h.completeNudge();

    expect(h.reads.map(r => r.path)).toEqual([FILE_A]);
  });

  it('sends exactly one nudge for three cards clicked on a cold sandbox, then downloads each', async () => {
    const h = start();
    await act(flush);

    await click('a1');
    await click('b');
    await click('c');

    expect(h.nudges()).toBe(1);

    h.serverLive = [SBX];
    await h.completeNudge();

    expect(h.reads.map(r => r.path).sort()).toEqual([FILE_A, FILE_B, FILE_C].sort());
  });

  it('cancel stops only that card; the shared wake carries on', async () => {
    const h = start();
    await act(flush);

    await click('a1');
    await click('b');
    await act(async () => {
      fireEvent.click(within(card('a1')).getByRole('button', { name: L('sandboxDownload.cancel') }));
    });

    expect(h.channel.getSandboxWake().phase).toBe('waking');

    h.serverLive = [SBX];
    await h.completeNudge();

    expect(h.reads.map(r => r.path)).toEqual([FILE_B]);
  });

  it('does not nudge while another run holds the channel, and wakes once that run ends without it', async () => {
    const h = start();
    await act(flush);
    h.setRun({ kind: 'user', stopPhase: 'idle' });

    await click('a1');

    expect(within(card('a1')).getByText(L('sandboxDownload.waiting'))).toBeTruthy();
    expect(h.nudges()).toBe(0);

    await act(async () => {
      h.setRun({ kind: null, stopPhase: 'idle' });
      await flush();
    });

    expect(h.nudges()).toBe(1);
  });

  // Found in the demo: the run brought the sandbox up, but nothing re-read metadata after `sandbox.ready`, so the
  // local list still said "not live" and the card nudged anyway. "Still not in metadata" has to be asked of metadata.
  it('asks metadata when that run ends, and downloads without a nudge if the run brought the sandbox up', async () => {
    const h = start();
    await act(flush);
    h.setRun({ kind: 'user', stopPhase: 'idle' });

    await click('a1');
    h.serverLive = [SBX]; // the run cold-started it; the channel's own list has not caught up

    await act(async () => {
      h.setRun({ kind: null, stopPhase: 'idle' });
      await flush();
      await flush();
    });

    expect(h.nudges()).toBe(0);
    expect(h.reads.map(r => r.path)).toEqual([FILE_A]);
  });

  it('stays idle and sends nothing while a consent prompt is pending', async () => {
    const h = start({ consent: true });
    await act(flush);

    await click('a1');

    expect(within(card('a1')).queryByText(L('sandboxDownload.waiting'))).toBeNull();
    expect(h.nudges()).toBe(0);
  });

  it('downloads without a nudge when metadata says the sandbox is up after all', async () => {
    const h = start();
    await act(flush);
    h.serverLive = [SBX];

    await click('a1');

    expect(h.nudges()).toBe(0);
    expect(h.reads.map(r => r.path)).toEqual([FILE_A]);
  });
});

describe('download card — failures (UC-064)', () => {
  it('404: says the file is gone and offers no retry', async () => {
    const h = start({ live: [SBX] });
    await act(flush);

    await click('a1');
    await settleRead(0, new HttpError(404, 'Not Found'));

    expect(within(card('a1')).getByText(L('sandboxDownload.error.notFound'))).toBeTruthy();
    expect(within(card('a1')).queryByRole('button', { name: L('sandboxDownload.retry') })).toBeNull();
    expect(mainButton('a1')).toHaveProperty('disabled', true);
    expect(h.save).not.toHaveBeenCalled();
  });

  it('412 the first time: drops the sandbox and goes through the shared wake, then downloads', async () => {
    const h = start({ live: [SBX] });
    await act(flush);
    h.serverLive = [];

    await click('a1');
    await settleRead(0, new HttpError(412, 'Precondition Failed'));

    expect(h.channel.getLaunchedSandboxes()).toEqual([]);
    expect(h.nudges()).toBe(1);

    h.serverLive = [SBX];
    await h.completeNudge();

    expect(h.reads).toHaveLength(2);
    await settleRead(1, { content: blob(4), totalBytes: 4, truncated: false });
    expect(h.save).toHaveBeenCalledTimes(1);
  });

  // Found in the demo: the nudge's `sandbox.launch` frame triggers a metadata refetch mid-wake, and metadata that
  // is still stale lists the recycled sandbox again. Downloading on that would hit 412 again and spend the card's
  // one fallback — the card must wait for the shared wake to settle, whose own refetch is the one that counts.
  it('412 the first time: does not download on a stale re-listing while the wake is still running', async () => {
    const h = start({ live: [SBX] });
    await act(flush);
    h.serverLive = [];

    await click('a1');
    await settleRead(0, new HttpError(412, 'Precondition Failed'));

    act(() => h.channel.applyLaunchedSandboxes([sb(SBX)]));
    await act(flush);

    expect(h.reads).toHaveLength(1);
    expect(within(card('a1')).getByText(L('sandboxDownload.waiting'))).toBeTruthy();

    h.serverLive = [SBX];
    await h.completeNudge();

    expect(h.reads).toHaveLength(2);
    await settleRead(1, { content: blob(4), totalBytes: 4, truncated: false });
    expect(h.save).toHaveBeenCalledTimes(1);
  });

  it('a second 5xx fails with retry, and a manual retry re-grants the wake fallback', async () => {
    const h = start({ live: [SBX] });
    await act(flush);

    await click('a1');
    await settleRead(0, new HttpError(503, 'Service Unavailable'));
    h.serverLive = [SBX];
    await h.completeNudge();
    await settleRead(1, new HttpError(503, 'Service Unavailable'));

    expect(within(card('a1')).getByText(L('sandboxDownload.error.failed'))).toBeTruthy();
    expect(h.nudges()).toBe(1);

    await act(async () => {
      fireEvent.click(within(card('a1')).getByRole('button', { name: new RegExp(L('sandboxDownload.retry')) }));
      await flush();
    });
    await settleRead(2, new HttpError(503, 'Service Unavailable'));

    expect(h.nudges()).toBe(2);
  });

  it('fewer bytes than X-Total-Bytes: incomplete, nothing saved, retry offered', async () => {
    const h = start({ live: [SBX] });
    await act(flush);

    await click('a1');
    await settleRead(0, { content: blob(6), totalBytes: 10, truncated: false });

    expect(within(card('a1')).getByText(L('sandboxDownload.error.incomplete'))).toBeTruthy();
    expect(within(card('a1')).getByRole('button', { name: new RegExp(L('sandboxDownload.retry')) })).toBeTruthy();
    expect(h.save).not.toHaveBeenCalled();
  });

  it('shared wake failed: the card says so and offers retry', async () => {
    const h = start();
    await act(flush);

    await click('a1');
    await h.completeNudge(); // metadata still does not list it

    expect(within(card('a1')).getByText(L('sandboxDownload.error.wakeFailed'))).toBeTruthy();
    expect(h.channel.getSandboxWake().phase).toBe('failed');
    expect(within(card('a1')).getByRole('button', { name: new RegExp(L('sandboxDownload.retry')) })).toBeTruthy();
  });
});
