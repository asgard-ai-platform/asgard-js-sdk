// @vitest-environment jsdom
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
  ToolCallConsentAnswer,
  ToolCallConsentPendingCall,
} from '@asgard-js/core';
import { AsgardServiceContext } from '../../context/asgard-service-context';
import { AsgardTemplateContextProvider } from '../../context/asgard-template-context';
import { useChannel, UseChannelReturn } from '../../hooks/use-channel';
import { ToolCallConsentGate } from './tool-call-consent-gate';

/**
 * asgard-freyr-pm#901 — the consent card answers on its own, so a host had no way to learn what the user
 * chose: `onBeforeSendMessage` fires without the answers, and `pendingConsent` is cleared before the
 * request whichever button was pressed. `onToolCallConsentReply` reports the answers once the backend
 * has accepted them. Driven through the real `useChannel` + gate against a scripted client, like the
 * #331 spec next to this one, because "accepted" is decided by the frames core hands back.
 */

function frame(eventType: EventType, fact: Record<string, unknown> = {}): SseResponse<EventType> {
  return {
    eventType,
    requestId: 'req-1',
    namespace: 'ns',
    botProviderName: 'bp',
    customChannelId: 'ch',
    fact,
  } as unknown as SseResponse<EventType>;
}

function call(toolCallId: string, overrides: Partial<ToolCallConsentPendingCall> = {}): ToolCallConsentPendingCall {
  return {
    toolCallId,
    toolsetName: 'freyr',
    toolName: 'freyr_navigate',
    parameter: { path: '/orders' },
    alreadyAllowed: false,
    ...overrides,
  };
}

function consentFrame(processId: string, pendingCalls: ToolCallConsentPendingCall[]): SseResponse<EventType> {
  return frame(EventType.TOOL_CALL_CONSENT, { toolCallConsent: { processId, pendingCalls } });
}

interface ScriptedClient {
  client: AsgardServiceClient;
  sent: FetchSsePayload[];
  /** Handlers of the latest reply run; the test plays the backend through them. */
  run(): FetchSseOptions;
}

/** Restores onto a channel parked on `pendingCalls`; each reply opens a run the test drives by hand. */
function scriptedClient(pendingCalls: ToolCallConsentPendingCall[]): ScriptedClient {
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
      options?.onSseMessage?.(consentFrame('proc-1', pendingCalls));
      options?.onSseCompleted?.();
    },
  } as unknown as AsgardServiceClient;

  return {
    client,
    sent,
    run: (): FetchSseOptions => {
      if (!runOptions) throw new Error('no reply run has been opened');

      return runOptions;
    },
  };
}

interface HarnessProps {
  client: AsgardServiceClient;
  onToolCallConsentReply?: (answers: ToolCallConsentAnswer[]) => void;
  onSseMessage?: (response: SseResponse<EventType>) => void;
  expose?: { current: UseChannelReturn | null };
}

function Harness({ client, onToolCallConsentReply, onSseMessage, expose }: HarnessProps): ReactNode {
  const base = useContext(AsgardServiceContext);
  const channelState = useChannel({
    client,
    customChannelId: 'ch',
    onToolCallConsentReply,
    onSseMessage,
    onSseError: () => undefined,
  });

  if (expose) expose.current = channelState;

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
const ALLOW_ALWAYS = '本次對話皆允許';
const DENY = '拒絕';
const SUBMIT_DENY = '送出拒絕';

async function play(fn: () => void): Promise<void> {
  await act(async () => {
    fn();
    await Promise.resolve();
  });
}

afterEach(() => {
  cleanup();
});

describe('onToolCallConsentReply (asgard-freyr-pm#901)', () => {
  it('R1: fires once with the answers when the resumed run’s first frame arrives, before onSseMessage sees it', async () => {
    const order: string[] = [];
    const replies: ToolCallConsentAnswer[][] = [];
    const scripted = scriptedClient([call('toolu_1')]);

    render(
      <Harness
        client={scripted.client}
        onToolCallConsentReply={answers => {
          replies.push(answers);
          order.push('reply');
        }}
        onSseMessage={response => order.push(response.eventType)}
      />,
    );

    fireEvent.click(await screen.findByText(ALLOW_ONCE));
    await waitFor(() => expect(scripted.sent).toHaveLength(1));

    // Sent is not accepted: nothing yet.
    expect(replies).toEqual([]);

    await play(() => scripted.run().onSseMessage?.(frame(EventType.INIT)));
    await play(() =>
      scripted.run().onSseMessage?.(
        frame(EventType.TOOL_CALL_START, {
          toolCallStart: {
            processId: 'proc-1',
            callSeq: 0,
            toolUseId: 'toolu_1',
            toolCall: { toolsetName: 'freyr', toolName: 'freyr_navigate', parameter: { path: '/orders' } },
          },
        }),
      ),
    );
    await play(() => scripted.run().onSseCompleted?.());

    expect(replies).toEqual([[{ toolCallId: 'toolu_1', result: 'ALLOW_ONCE', denyReason: '' }]]);
    expect(order.slice(-3)).toEqual(['reply', EventType.INIT, EventType.TOOL_CALL_START]);
  });

  it('R1: a denial carries DENY_ONCE and the reason', async () => {
    const replies: ToolCallConsentAnswer[][] = [];
    const scripted = scriptedClient([call('toolu_1')]);

    render(<Harness client={scripted.client} onToolCallConsentReply={answers => replies.push(answers)} />);

    fireEvent.click(await screen.findByText(DENY));
    fireEvent.change(screen.getByLabelText('拒絕原因（選填）'), { target: { value: 'wrong page' } });
    fireEvent.click(screen.getByText(SUBMIT_DENY));
    await waitFor(() => expect(scripted.sent).toHaveLength(1));
    await play(() => scripted.run().onSseMessage?.(frame(EventType.INIT)));

    expect(replies).toEqual([[{ toolCallId: 'toolu_1', result: 'DENY_ONCE', denyReason: 'wrong page' }]]);
  });

  it('R1: a host calling replyToolCallConsents itself is reported the same way', async () => {
    const replies: ToolCallConsentAnswer[][] = [];
    const scripted = scriptedClient([call('toolu_1')]);
    const expose: { current: UseChannelReturn | null } = { current: null };
    const answers: ToolCallConsentAnswer[] = [{ toolCallId: 'toolu_1', result: 'ALLOW_ONCE', denyReason: '' }];

    render(
      <Harness client={scripted.client} expose={expose} onToolCallConsentReply={answers => replies.push(answers)} />,
    );
    await screen.findByText(ALLOW_ONCE);

    await play(() => void expose.current?.replyToolCallConsents?.(answers));
    await play(() => scripted.run().onSseMessage?.(frame(EventType.INIT)));

    expect(replies).toEqual([answers]);
  });

  it('R2: a resumed run that ends without any frame still reports the reply, on completion', async () => {
    const replies: ToolCallConsentAnswer[][] = [];
    const scripted = scriptedClient([call('toolu_1')]);

    render(<Harness client={scripted.client} onToolCallConsentReply={answers => replies.push(answers)} />);

    fireEvent.click(await screen.findByText(ALLOW_ONCE));
    await waitFor(() => expect(scripted.sent).toHaveLength(1));
    await play(() => scripted.run().onSseCompleted?.());

    expect(replies).toEqual([[{ toolCallId: 'toolu_1', result: 'ALLOW_ONCE', denyReason: '' }]]);
  });

  it('R3: a refused reply is never reported; the answer to the restored card is, once accepted', async () => {
    const replies: ToolCallConsentAnswer[][] = [];
    const scripted = scriptedClient([call('toolu_1')]);

    render(<Harness client={scripted.client} onToolCallConsentReply={answers => replies.push(answers)} />);

    fireEvent.click(await screen.findByText(ALLOW_ONCE));
    await waitFor(() => expect(scripted.sent).toHaveLength(1));
    await play(() => scripted.run().onSseError?.(new Error('HTTP 403: Forbidden')));

    expect(replies).toEqual([]);

    fireEvent.click(await screen.findByText(ALLOW_ALWAYS));
    await waitFor(() => expect(scripted.sent).toHaveLength(2));
    await play(() => scripted.run().onSseMessage?.(frame(EventType.INIT)));

    expect(replies).toEqual([[{ toolCallId: 'toolu_1', result: 'ALLOW_ALWAYS', denyReason: '' }]]);
  });

  it('R4: answers the card gives without prompting arrive in the same single callback', async () => {
    const replies: ToolCallConsentAnswer[][] = [];
    const scripted = scriptedClient([
      call('toolu_1', { toolName: 'freyr_read', alreadyAllowed: true }),
      call('toolu_2'),
      call('toolu_3'),
    ]);

    render(<Harness client={scripted.client} onToolCallConsentReply={answers => replies.push(answers)} />);

    // `toolu_1` is skipped; the card is for `toolu_2`, and "allow for this chat" carries `toolu_3` with it.
    fireEvent.click(await screen.findByText(ALLOW_ALWAYS));
    await waitFor(() => expect(scripted.sent).toHaveLength(1));
    await play(() => scripted.run().onSseMessage?.(frame(EventType.INIT)));

    expect(replies).toEqual([
      [
        { toolCallId: 'toolu_1', result: 'ALLOW_ONCE', denyReason: '' },
        { toolCallId: 'toolu_2', result: 'ALLOW_ALWAYS', denyReason: '' },
        { toolCallId: 'toolu_3', result: 'ALLOW_ALWAYS', denyReason: '' },
      ],
    ]);
    expect(scripted.sent[0]?.toolCallConsents).toEqual(replies[0]);
  });

  it('R5: a callback that throws does not cost the frame, and the next batch can still be answered', async () => {
    const scripted = scriptedClient([call('toolu_1')]);

    render(
      <Harness
        client={scripted.client}
        onToolCallConsentReply={() => {
          throw new Error('host handler blew up');
        }}
      />,
    );

    fireEvent.click(await screen.findByText(ALLOW_ONCE));
    await waitFor(() => expect(scripted.sent).toHaveLength(1));

    // The first frame of the resumed run is itself the next consent prompt: had the throw escaped, core
    // would never have folded it in, and no card would come up.
    await play(() => scripted.run().onSseMessage?.(consentFrame('proc-2', [call('toolu_2')])));
    await play(() => scripted.run().onSseCompleted?.());

    fireEvent.click(await screen.findByText(ALLOW_ONCE));
    await waitFor(() => expect(scripted.sent).toHaveLength(2));
    expect(scripted.sent[1]?.toolCallConsents).toEqual([
      { toolCallId: 'toolu_2', result: 'ALLOW_ONCE', denyReason: '' },
    ]);
  });
});
