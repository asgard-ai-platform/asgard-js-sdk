// @vitest-environment jsdom
import { ReactNode, useContext } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Channel, ToolCallConsentEventData } from '@asgard-js/core';
import { AsgardServiceContext, AsgardServiceContextValue } from '../../context/asgard-service-context';
import { AsgardTemplateContextProvider } from '../../context/asgard-template-context';
import { ToolCallConsentGate } from './tool-call-consent-gate';

/**
 * asgard-js-sdk#455 (3) — the consent queue belongs to the conversation that raised it, but it lives in
 * the gate's own state. A reset deletes that conversation on the backend and hands the context a new
 * `Channel`; `pendingConsent` merely goes null, and the effect that seeds the queue returns early on
 * null rather than clearing it. The modal renders from `queue`, so it stayed on screen — and answering
 * it submitted an authorization for a process that no longer exists, against a channel that never
 * asked for it.
 */

const PENDING: ToolCallConsentEventData = {
  processId: 'proc-1',
  pendingCalls: [
    {
      toolCallId: 'call-1',
      toolsetName: 'files',
      toolName: 'Write',
      alreadyAllowed: false,
    },
  ],
} as unknown as ToolCallConsentEventData;

const channelA = { id: 'a' } as unknown as Channel;
const channelB = { id: 'b' } as unknown as Channel;

function Harness({ override }: { override: Partial<AsgardServiceContextValue> }): ReactNode {
  const base = useContext(AsgardServiceContext);

  return (
    <AsgardServiceContext.Provider value={{ ...base, ...override }}>
      <AsgardTemplateContextProvider locale="en-US">
        <ToolCallConsentGate />
      </AsgardTemplateContextProvider>
    </AsgardServiceContext.Provider>
  );
}

afterEach(cleanup);

describe('consent queue across a reset (#455)', () => {
  it('R4: replacing the channel drops the queue, so the modal cannot outlive its conversation', () => {
    const replyToolCallConsents = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(
      <Harness override={{ channel: channelA, pendingConsent: PENDING, replyToolCallConsents }} />,
    );

    expect(screen.queryByText('Write')).toBeTruthy();

    // What a reset looks like from here: a new Channel instance, and no pending consent on it.
    rerender(<Harness override={{ channel: channelB, pendingConsent: null, replyToolCallConsents }} />);

    expect(screen.queryByText('Write')).toBeNull();
    expect(replyToolCallConsents).not.toHaveBeenCalled();
  });

  it('R5: pendingConsent going null on the SAME channel drops the queue without replying', () => {
    // This used to pin the opposite, on the belief that a streaming update could null `pendingConsent`
    // for a moment. Core has exactly one place that clears it — `replyToolCallConsents` — so a null on
    // the same channel means the batch was answered. When it was answered from outside the queue
    // (asgard-freyr-pm#901: a host replying itself), keeping the batch left the modal, and its body
    // scroll lock, over a prompt that no longer exists.
    const replyToolCallConsents = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(
      <Harness override={{ channel: channelA, pendingConsent: PENDING, replyToolCallConsents }} />,
    );

    expect(screen.queryByText('Write')).toBeTruthy();

    rerender(<Harness override={{ channel: channelA, pendingConsent: null, replyToolCallConsents }} />);

    expect(screen.queryByText('Write')).toBeNull();
    expect(replyToolCallConsents).not.toHaveBeenCalled();
  });
});
