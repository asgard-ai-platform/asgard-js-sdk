// @vitest-environment jsdom
import { ReactNode, useContext } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EventType } from '@asgard-js/core';
import type {
  AsgardServiceClient,
  ChannelMetadata,
  FetchSseOptions,
  FetchSsePayload,
  SseResponse,
} from '@asgard-js/core';
import { AsgardServiceContext } from '../../context/asgard-service-context';
import { AsgardTemplateContextProvider } from '../../context/asgard-template-context';
import { useChannel } from '../../hooks/use-channel';
import { ToolCallConsentGate } from './tool-call-consent-gate';

/**
 * asgard-freyr-pm#331 — answering a consent prompt was the one SSE entrance whose failures had no
 * exit. `use-channel` handed `replyToolCallConsents` a handlers object with only `onSseMessage`, so
 * core's `options?.onSseError?.(err)` was an optional call on a missing key: no consumer callback, no
 * log, nothing. Core does also `reject()` the promise, but the built-in gate dispatches the reply as
 * `void submit(...)`, so that rejection went nowhere either. Net effect on screen: the card vanished
 * and absolutely nothing happened.
 *
 * These drive the real `useChannel` against a scripted client rather than a stubbed context, because
 * what is under test is the seam between the two — including the clear/restore of `pendingConsent`
 * that core performs around the request, which React collapses into a single render.
 */

function consentEvent(processId: string, alreadyAllowed = false): SseResponse<EventType> {
  return {
    eventType: EventType.TOOL_CALL_CONSENT,
    requestId: 'req-1',
    namespace: 'ns',
    botProviderName: 'bp',
    customChannelId: 'ch',
    fact: {
      toolCallConsent: {
        processId,
        pendingCalls: [
          {
            toolCallId: 'call-1',
            toolsetName: 'shell',
            toolName: 'run',
            parameter: { command: 'rm -rf /tmp/x' },
            alreadyAllowed,
            reason: '高風險操作',
          },
        ],
      },
    },
  } as unknown as SseResponse<EventType>;
}

interface ConsentClient {
  client: AsgardServiceClient;
  sent: FetchSsePayload[];
  failRun(error: unknown): void;
}

/** Restores onto a channel that is already parked on a consent prompt, then lets the test fail the reply. */
function consentClient(alreadyAllowed = false): ConsentClient {
  const sent: FetchSsePayload[] = [];
  let runOptions: FetchSseOptions | undefined;

  const client = {
    async channelMetadata(): Promise<ChannelMetadata | null> {
      return { title: 'x', runState: 'IDLE', launchedSandboxes: [] } as unknown as ChannelMetadata;
    },
    fetchSse(payload: FetchSsePayload, options?: FetchSseOptions): void {
      sent.push(payload);
      runOptions = options;
      options?.onSseStart?.();
    },
    rejoinSse(_customChannelId: string, options?: FetchSseOptions): void {
      options?.onSseStart?.();
      options?.onSseMessage?.(consentEvent('proc-1', alreadyAllowed));
      options?.onSseCompleted?.();
    },
  } as unknown as AsgardServiceClient;

  return {
    client,
    sent,
    failRun: (error: unknown) => runOptions?.onSseError?.(error),
  };
}

interface HarnessProps {
  client: AsgardServiceClient;
  onSseError?: (error: unknown) => void;
  onAuthError?: (error: { isAuthError: boolean; isBotProviderError: boolean; errorDetail?: unknown }) => void;
}

function Harness({ client, onSseError, onAuthError }: HarnessProps): ReactNode {
  const base = useContext(AsgardServiceContext);
  const channelState = useChannel({ client, customChannelId: 'ch', onSseError, onAuthError });

  return (
    <AsgardServiceContext.Provider
      value={{
        ...base,
        client,
        channel: channelState.channel,
        conversation: channelState.conversation,
        pendingConsent: channelState.conversation?.pendingConsent ?? null,
        replyToolCallConsents: channelState.replyToolCallConsents,
      }}
    >
      <AsgardTemplateContextProvider locale="en-US">
        <ToolCallConsentGate />
      </AsgardTemplateContextProvider>
    </AsgardServiceContext.Provider>
  );
}

const ALLOW_ONCE = '僅此次允許';

/**
 * The shape every SSE entrance mirrors to `onAuthError`. Note that `@asgard-js/core` does not currently
 * construct it anywhere — a live 403 arrives as a plain `HTTP 403: Forbidden` and reaches `onSseError`
 * only (checked in the browser). What this pins is that the consent path now applies the same rule as
 * `sendMessage` / `reset` / `restore`, including for a consumer-supplied `IAsgardServiceClient` that
 * does raise it.
 */
const FORBIDDEN = { isAuthError: false, isBotProviderError: true, errorDetail: { code: 'channel_brand_forbidden' } };

let unhandled: unknown[] = [];

function collectUnhandled(reason: unknown): void {
  unhandled.push(reason);
}

beforeEach(() => {
  unhandled = [];
  process.on('unhandledRejection', collectUnhandled);
});

afterEach(() => {
  process.off('unhandledRejection', collectUnhandled);
  cleanup();
});

async function answerAndFail(scripted: ConsentClient, error: unknown): Promise<void> {
  await screen.findByText(ALLOW_ONCE);
  fireEvent.click(screen.getByText(ALLOW_ONCE));
  await waitFor(() => expect(scripted.sent).toHaveLength(1));

  await act(async () => {
    scripted.failRun(error);
    await Promise.resolve();
  });
}

describe('consent reply error reporting (#331)', () => {
  it('R1: a rejected consent reply reaches the consumer’s onSseError', async () => {
    const errors: unknown[] = [];
    const scripted = consentClient();

    render(<Harness client={scripted.client} onSseError={error => errors.push(error)} />);
    await answerAndFail(scripted, new Error('403 channel_brand_forbidden'));

    expect(scripted.sent[0]?.action).toBe('RESPONSE_TOOL_CALL_CONSENT');
    await waitFor(() => expect(errors).toHaveLength(1));
    expect((errors[0] as Error).message).toBe('403 channel_brand_forbidden');
  });

  it('R2: an auth-shaped failure is mirrored to onAuthError, exactly like a send', async () => {
    const authErrors: unknown[] = [];
    const errors: unknown[] = [];
    const scripted = consentClient();

    render(
      <Harness
        client={scripted.client}
        onSseError={error => errors.push(error)}
        onAuthError={error => authErrors.push(error)}
      />,
    );
    await answerAndFail(scripted, FORBIDDEN);

    await waitFor(() => expect(authErrors).toHaveLength(1));
    expect(errors).toHaveLength(1);
  });

  it('R3: the failed reply is not left as an unhandled rejection', async () => {
    const scripted = consentClient();

    render(<Harness client={scripted.client} onSseError={() => undefined} />);
    await answerAndFail(scripted, new Error('403 channel_brand_forbidden'));

    // The gate dispatches the reply fire-and-forget; a rejection with no catch escapes the component
    // tree entirely, and in a host app lands as a console-only "Uncaught (in promise)".
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(unhandled).toEqual([]);
  });

  it('R4: the consent card comes back after a failed reply, so the answer can be retried', async () => {
    const scripted = consentClient();

    render(<Harness client={scripted.client} onSseError={() => undefined} />);
    await answerAndFail(scripted, new Error('403 channel_brand_forbidden'));

    // Core restores `pendingConsent` on failure (#410) precisely so the user gets another go — the run
    // is still paused on the server, and every send entrance stays blocked until it is answered. The
    // scripted client fails in the same tick it was called, which is where the gap lives: React folds
    // the clear and the restore into one render and the seeding effect sees no change. A real HTTP
    // refusal arrives later and re-seeds without help — verified in the browser — so this pins the
    // synchronous transport failure, not the 403 round trip.
    await waitFor(() => expect(screen.queryByText(ALLOW_ONCE)).toBeTruthy());

    fireEvent.click(screen.getByText(ALLOW_ONCE));
    await waitFor(() => expect(scripted.sent).toHaveLength(2));
  });

  it('R6: a refused batch that needs no user input does not resubmit itself forever', async () => {
    // Every call `alreadyAllowed` means the gate drains the queue on its own and submits with no click
    // at all. Putting such a batch back on a refusal (R4) would hand it straight back to auto-advance,
    // and the two would trade the same rejected reply for as long as the component is mounted.
    const scripted = consentClient(true);

    render(<Harness client={scripted.client} onSseError={() => undefined} />);
    await waitFor(() => expect(scripted.sent).toHaveLength(1));

    await act(async () => {
      scripted.failRun(new Error('403 channel_brand_forbidden'));
      await Promise.resolve();
    });

    // Give the effect every chance to re-fire before calling it settled.
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(scripted.sent).toHaveLength(1);
    expect(unhandled).toEqual([]);
  });

  it('R5: a consumer onSseError that throws does not wedge the gate for the next batch', async () => {
    // Core calls the handler *before* it settles the run's promise, so an unguarded throw leaves the
    // gate's in-flight marker latched and every later consent reply becomes a silent no-op.
    const scripted = consentClient();

    render(
      <Harness
        client={scripted.client}
        onSseError={() => {
          throw new Error('consumer error handler blew up');
        }}
      />,
    );
    await answerAndFail(scripted, new Error('403 channel_brand_forbidden'));

    await waitFor(() => expect(screen.queryByText(ALLOW_ONCE)).toBeTruthy());
    fireEvent.click(screen.getByText(ALLOW_ONCE));
    await waitFor(() => expect(scripted.sent).toHaveLength(2));
  });
});
