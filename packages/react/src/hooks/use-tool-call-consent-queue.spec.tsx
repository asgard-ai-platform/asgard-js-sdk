// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ReactNode, useContext } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { EventType } from '@asgard-js/core';
import type {
  AsgardServiceClient,
  ChannelMetadata,
  FetchSseOptions,
  FetchSsePayload,
  SseResponse,
  ToolCallConsentPendingCall,
} from '@asgard-js/core';
import { AsgardServiceContext, useAsgardContext } from '../context/asgard-service-context';
import { AsgardTemplateContextProvider } from '../context/asgard-template-context';
import { ToolCallConsentGate } from '../components/tool-call-consent/tool-call-consent-gate';
import { useChannel } from './use-channel';
import { useToolCallConsentQueue } from './use-tool-call-consent-queue';

/**
 * asgard-freyr-pm#901 (2026-10-01) — a host that wants its own consent UI had no way to keep `<Chatbot>`
 * from mounting the built-in modal, and hiding it did not work either: once the host answered through
 * `replyToolCallConsents` the gate's queue never let go of the batch, so the hidden modal stayed mounted
 * with the body scroll lock on. `<Chatbot toolCallConsent="off">` now mounts nothing, and the queue the
 * modal runs on is public as `useToolCallConsentQueue()`.
 *
 * Driven through the real `useChannel` against a scripted client, as the other consent specs are: the
 * clear / restore of `pendingConsent` around a reply is core's, and is part of what is under test.
 */

function call(toolCallId: string, toolsetName: string, toolName: string, alreadyAllowed = false): object {
  return { toolCallId, toolsetName, toolName, parameter: {}, alreadyAllowed };
}

/** Allowed already, then a tool asked twice (so "Allow for This Chat" covers the second), then another. */
const BATCH = [
  call('call-read', 'files', 'Read', true),
  call('call-run-1', 'shell', 'run'),
  call('call-run-2', 'shell', 'run'),
  call('call-search', 'web', 'search'),
];

function consentEvent(pendingCalls: object[]): SseResponse<EventType> {
  return {
    eventType: EventType.TOOL_CALL_CONSENT,
    requestId: 'req-1',
    namespace: 'ns',
    botProviderName: 'bp',
    customChannelId: 'ch',
    fact: { toolCallConsent: { processId: 'proc-1', pendingCalls } },
  } as unknown as SseResponse<EventType>;
}

interface ConsentClient {
  client: AsgardServiceClient;
  sent: FetchSsePayload[];
  failRun(error: unknown): void;
}

/** Restores onto a channel parked on a consent prompt; the test decides how the reply's run ends. */
function consentClient(pendingCalls: object[] = BATCH): ConsentClient {
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
      options?.onSseMessage?.(consentEvent(pendingCalls));
      options?.onSseCompleted?.();
    },
  } as unknown as AsgardServiceClient;

  return { client, sent, failRun: (error: unknown) => runOptions?.onSseError?.(error) };
}

/** Every `pendingCall` the hook has exposed, render by render — a call shown for one frame counts. */
let exposed: string[] = [];

/** What a host's own consent card does with the hook: show the head and offer the answers. */
function HostCard(): ReactNode {
  const { pendingCall, currentIndex, totalCount, decide } = useToolCallConsentQueue();

  if (pendingCall) exposed.push(pendingCall.toolCallId);

  if (!pendingCall) return <p>no pending call</p>;

  return (
    <div>
      <p>
        {pendingCall.toolCallId} · {currentIndex}/{totalCount}
      </p>
      <button type="button" onClick={(): void => decide({ result: 'ALLOW_ONCE' })}>
        host allow
      </button>
      <button type="button" onClick={(): void => decide({ result: 'ALLOW_ALWAYS' })}>
        host allow always
      </button>
      <button type="button" onClick={(): void => decide({ result: 'DENY_ONCE', denyReason: 'no' })}>
        host deny
      </button>
    </div>
  );
}

/** A host that skips the queue and answers through the context, as the README always allowed. */
function HostDirectReply({ answer }: { answer: ToolCallConsentPendingCall['toolCallId'] }): ReactNode {
  const { replyToolCallConsents } = useAsgardContext();

  return (
    <button
      type="button"
      onClick={(): void => {
        void replyToolCallConsents?.([{ toolCallId: answer, result: 'ALLOW_ONCE', denyReason: '' }]);
      }}
    >
      host replies directly
    </button>
  );
}

function Harness({ client, children }: { client: AsgardServiceClient; children: ReactNode }): ReactNode {
  const base = useContext(AsgardServiceContext);
  const channelState = useChannel({ client, customChannelId: 'ch' });

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
      <AsgardTemplateContextProvider locale="en-US">{children}</AsgardTemplateContextProvider>
    </AsgardServiceContext.Provider>
  );
}

function sentAnswers(scripted: ConsentClient): unknown {
  return scripted.sent.map(payload => payload.toolCallConsents);
}

afterEach(() => {
  cleanup();
  exposed = [];
  document.body.style.overflow = '';
});

describe('useToolCallConsentQueue (asgard-freyr-pm#901)', () => {
  it('R2: exposes only the calls that need an answer, and sends the batch once it is complete', async () => {
    const scripted = consentClient();
    render(
      <Harness client={scripted.client}>
        <HostCard />
      </Harness>,
    );

    // `call-read` is alreadyAllowed: answered without ever being shown.
    expect(await screen.findByText('call-run-1 · 2/4')).toBeTruthy();
    fireEvent.click(screen.getByText('host allow always'));

    // `call-run-2` is the same tool, so "Allow for This Chat" answers it too.
    expect(await screen.findByText('call-search · 4/4')).toBeTruthy();
    expect(scripted.sent).toHaveLength(0);
    fireEvent.click(screen.getByText('host deny'));

    await waitFor(() => expect(scripted.sent).toHaveLength(1));
    expect(sentAnswers(scripted)).toEqual([
      [
        { toolCallId: 'call-read', result: 'ALLOW_ONCE', denyReason: '' },
        { toolCallId: 'call-run-1', result: 'ALLOW_ALWAYS', denyReason: '' },
        { toolCallId: 'call-run-2', result: 'ALLOW_ALWAYS', denyReason: '' },
        { toolCallId: 'call-search', result: 'DENY_ONCE', denyReason: 'no' },
      ],
    ]);
    expect(await screen.findByText('no pending call')).toBeTruthy();
    expect(new Set(exposed), 'calls the queue answers on its own must never be exposed').toEqual(
      new Set(['call-run-1', 'call-search']),
    );
  });

  it('R3: a refused reply puts the same batch back from its first call', async () => {
    const scripted = consentClient();
    render(
      <Harness client={scripted.client}>
        <HostCard />
      </Harness>,
    );

    await screen.findByText('call-run-1 · 2/4');
    fireEvent.click(screen.getByText('host allow'));
    await screen.findByText('call-run-2 · 3/4');
    fireEvent.click(screen.getByText('host allow'));
    await screen.findByText('call-search · 4/4');
    fireEvent.click(screen.getByText('host allow'));
    await waitFor(() => expect(scripted.sent).toHaveLength(1));

    await act(async () => {
      scripted.failRun(new Error('HTTP 409'));
      await Promise.resolve();
    });

    expect(await screen.findByText('call-run-1 · 2/4')).toBeTruthy();
    expect(scripted.sent).toHaveLength(1);
  });

  it('R4: a host answering through replyToolCallConsents takes the built-in modal and its scroll lock away', async () => {
    const scripted = consentClient([call('call-run-1', 'shell', 'run')]);
    render(
      <Harness client={scripted.client}>
        <ToolCallConsentGate />
        <HostDirectReply answer="call-run-1" />
      </Harness>,
    );

    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.click(screen.getByText('host replies directly'));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.body.style.overflow).toBe('');
    // The host's reply is the only one: the dropped queue does not answer the batch a second time.
    expect(sentAnswers(scripted)).toEqual([[{ toolCallId: 'call-run-1', result: 'ALLOW_ONCE', denyReason: '' }]]);
  });

  it('R4: the same holds for the hook — the host card empties instead of offering a prompt that is gone', async () => {
    const scripted = consentClient([call('call-run-1', 'shell', 'run')]);
    render(
      <Harness client={scripted.client}>
        <HostCard />
        <HostDirectReply answer="call-run-1" />
      </Harness>,
    );

    await screen.findByText('call-run-1 · 1/1');
    fireEvent.click(screen.getByText('host replies directly'));

    expect(await screen.findByText('no pending call')).toBeTruthy();
    expect(scripted.sent).toHaveLength(1);
  });

  it('R1: a host card alone raises no dialog and leaves the body scrollable', async () => {
    const scripted = consentClient();
    render(
      <Harness client={scripted.client}>
        <HostCard />
      </Harness>,
    );

    await screen.findByText('call-run-1 · 2/4');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.body.style.overflow).toBe('');
  });
});

/**
 * Mounting the authenticated `<Chatbot>` needs a live client, so — as `chatbot-locale-scope.spec.tsx`
 * does — the mount condition is pinned on the source.
 */
describe('<Chatbot toolCallConsent> (asgard-freyr-pm#901)', () => {
  const CHATBOT_SRC = readFileSync(join(__dirname, '../components/chatbot/chatbot.tsx'), 'utf-8');

  it('R1: mounts the built-in gate only for "builtin", which stays the default', () => {
    expect(CHATBOT_SRC).toContain("toolCallConsent = 'builtin',");
    expect(CHATBOT_SRC.match(/<ToolCallConsentGate \/>/g)).toHaveLength(1);
    expect(CHATBOT_SRC).toContain("{toolCallConsent === 'builtin' && <ToolCallConsentGate />}");
  });
});
