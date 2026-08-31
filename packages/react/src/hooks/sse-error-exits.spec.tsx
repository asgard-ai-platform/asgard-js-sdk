// @vitest-environment jsdom
import { ReactNode } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { AsgardServiceClient, ChannelMetadata, FetchSseOptions, FetchSsePayload } from '@asgard-js/core';
import { useChannel, UseChannelReturn } from './use-channel';

/**
 * asgard-js-sdk#459 §1 / §3 — the entrances BUILD-073 left behind.
 *
 * `nudge` was handed a handlers object with only `onSseMessage`, so a failed nudge reached no one
 * (§1). And `restoreChannel` / `sendMessage` called the consumer's callbacks bare, while `startChannel`
 * and the consent path routed them through `notify` (§3).
 *
 * The guard matters because of the order in `Channel.buildRunHandlers`:
 *
 *     onSseError: err => { options?.onSseError?.(err); this.settleRun(); reject(err); }
 *
 * A consumer callback that throws skips both of the lines after it. `settleRun()` is what calls
 * `isConnecting$.next(false)`, so the channel never leaves the connecting state — every assertion below
 * reads that flag rather than the run promise, because a skipped `reject()` means the promise does not
 * reject either: it simply never settles, and there is nothing to await.
 */

const AUTH_SHAPED = { isAuthError: true, isBotProviderError: false, errorDetail: 'nope' };

interface Scripted {
  client: AsgardServiceClient;
  sent: FetchSsePayload[];
  /** Fails the run started by `fetchSse` (nudge / sendMessage), the way a live SSE error arrives. */
  failRun(error: unknown): void;
  /** Fails the join-restore stream. */
  failRejoin(error: unknown): void;
}

/**
 * `rejoin: 'complete'` opens the channel and settles, leaving it idle for a nudge or a send.
 * `rejoin: 'capture'` holds the restore stream open so the test can fail it instead.
 *
 * The second `channelMetadata()` never resolves on purpose: dropping the channel re-arms the mount
 * effect, and a second restore would set `isConnecting` back to true and mask what is being asserted.
 */
function scriptedClient(rejoin: 'complete' | 'capture' = 'complete'): Scripted {
  const sent: FetchSsePayload[] = [];
  let runOptions: FetchSseOptions | undefined;
  let rejoinOptions: FetchSseOptions | undefined;
  let metadataCalls = 0;

  const client = {
    async channelMetadata(): Promise<ChannelMetadata | null> {
      metadataCalls += 1;

      if (metadataCalls > 1) return new Promise<ChannelMetadata | null>(() => undefined);

      return { title: 'x', runState: 'IDLE', launchedSandboxes: [] } as unknown as ChannelMetadata;
    },
    fetchSse(payload: FetchSsePayload, options?: FetchSseOptions): void {
      sent.push(payload);
      runOptions = options;
      options?.onSseStart?.();
    },
    rejoinSse(_customChannelId: string, options?: FetchSseOptions): void {
      rejoinOptions = options;
      options?.onSseStart?.();

      if (rejoin === 'complete') options?.onSseCompleted?.();
    },
  } as unknown as AsgardServiceClient;

  return {
    client,
    sent,
    failRun: (error: unknown) => runOptions?.onSseError?.(error),
    failRejoin: (error: unknown) => rejoinOptions?.onSseError?.(error),
  };
}

interface HarnessProps {
  client: AsgardServiceClient;
  onSseError?: (error: unknown) => void;
  onAuthError?: (error: { isAuthError: boolean; isBotProviderError: boolean; errorDetail?: unknown }) => void;
}

let latest: UseChannelReturn | undefined;

function Harness({ client, onSseError, onAuthError }: HarnessProps): ReactNode {
  latest = useChannel({ client, customChannelId: 'ch', onSseError, onAuthError });

  return null;
}

/** Pre-fix the consumer's throw escapes core and lands here; the assertion is what the run did, not this. */
function swallow(fn: () => void): void {
  try {
    fn();
  } catch {
    // Intentional: this is the escape the fix removes. Asserting on it would test the symptom.
  }
}

function connecting(): boolean {
  return latest?.isConnecting ?? false;
}

async function mount(props: HarnessProps): Promise<void> {
  render(<Harness {...props} />);
  await act(async () => undefined);
}

afterEach(() => {
  latest = undefined;
  cleanup();
});

describe('#459 §1 — nudge has an error exit', () => {
  it('R1: a failed nudge reaches the consumer onSseError', async () => {
    const scripted = scriptedClient();
    const errors: unknown[] = [];

    await mount({ client: scripted.client, onSseError: error => errors.push(error) });

    const boom = new Error('nudge refused');

    await act(async () => {
      latest?.nudge?.().catch(() => undefined);
    });
    act(() => swallow(() => scripted.failRun(boom)));

    expect(errors).toEqual([boom]);
  });

  it('R2: an auth-shaped nudge failure is mirrored to onAuthError before onSseError', async () => {
    const scripted = scriptedClient();
    const order: string[] = [];

    await mount({
      client: scripted.client,
      onSseError: () => order.push('sse'),
      onAuthError: () => order.push('auth'),
    });

    await act(async () => {
      latest?.nudge?.().catch(() => undefined);
    });
    act(() => swallow(() => scripted.failRun(AUTH_SHAPED)));

    expect(order).toEqual(['auth', 'sse']);
  });

  it('R3: a throwing consumer callback on the nudge path still settles the run', async () => {
    const scripted = scriptedClient();
    // Counted, not just thrown: without R1 there is no handler to call, so asserting only that the run
    // settled would pass vacuously — nothing would have thrown in the first place.
    let calls = 0;

    await mount({
      client: scripted.client,
      onSseError: () => {
        calls += 1;

        throw new Error('consumer blew up');
      },
    });

    await act(async () => {
      latest?.nudge?.().catch(() => undefined);
    });
    expect(connecting()).toBe(true);

    act(() => swallow(() => scripted.failRun(new Error('nudge refused'))));

    expect(calls).toBe(1);
    expect(connecting()).toBe(false);
  });
});

describe('#459 §3 — the throw-guard covers every entrance', () => {
  it('R4: a throwing consumer callback on the restore path still settles the run', async () => {
    const scripted = scriptedClient('capture');

    await mount({
      client: scripted.client,
      onSseError: () => {
        throw new Error('consumer blew up');
      },
    });

    expect(connecting()).toBe(true);

    act(() => swallow(() => scripted.failRejoin(new Error('restore refused'))));

    expect(connecting()).toBe(false);
  });

  it('R5: a throwing consumer callback on the send path still settles the run', async () => {
    const scripted = scriptedClient();

    await mount({
      client: scripted.client,
      onSseError: () => {
        throw new Error('consumer blew up');
      },
    });

    await act(async () => {
      latest?.sendMessage?.({ text: 'hi' }).catch(() => undefined);
    });
    expect(connecting()).toBe(true);

    act(() => swallow(() => scripted.failRun(new Error('send refused'))));

    expect(connecting()).toBe(false);
  });

  it('R6: an ordinary failure — no throwing callback — reports and settles exactly as before', async () => {
    const scripted = scriptedClient();
    const errors: unknown[] = [];

    await mount({ client: scripted.client, onSseError: error => errors.push(error) });

    const boom = new Error('send refused');

    await act(async () => {
      latest?.sendMessage?.({ text: 'hi' }).catch(() => undefined);
    });
    act(() => scripted.failRun(boom));

    expect(errors).toEqual([boom]);
    expect(connecting()).toBe(false);
  });
});
