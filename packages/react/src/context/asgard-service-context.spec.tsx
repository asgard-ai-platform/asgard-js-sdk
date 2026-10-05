import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ClientConfig } from '@asgard-js/core';
import type { AsgardServiceContextValue, SendMessageParams } from './asgard-service-context';

/**
 * BUG-004 — every outbound has to collect payload the same way, or a consumer's session-level payload
 * silently misses some of them.
 *
 * `onBeforeSendMessage` is the one hook a consumer has for attaching session-level payload (agent-hub
 * puts its agent names / source set / working directory there). Consent reply already ran through it;
 * nudge did not, and nudge is the turn that *reconfigures the sandbox it wakes* — the backend rebuilds
 * `prevPayload` from the incoming payload every turn and never carries the previous one over. So a
 * nudge that skipped this hook woke a sandbox with no subagents and the default working directory, and
 * did it silently, because those blueprint expressions all have falsy fallbacks.
 *
 * `useChannel` is mocked out so the assertions are about the provider's wrapping alone: what reaches
 * the hook, and what the callback was shown.
 */

const inner = vi.hoisted(() => ({
  nudge: vi.fn<[unknown?], Promise<void>>(() => Promise.resolve()),
  wakeSandbox: vi.fn<[string?, unknown?], Promise<string>>(() => Promise.resolve('live')),
  replyToolCallConsents: vi.fn<[unknown, unknown?], Promise<void>>(() => Promise.resolve()),
}));

vi.mock('../hooks', () => ({
  useAsgardServiceClient: (): null => null,
  useChannel: (): Record<string, unknown> => ({
    channel: null,
    isOpen: true,
    isResetting: false,
    isConnecting: false,
    conversation: null,
    channelTitle: null,
    sandboxPhase: 'idle',
    runStatus: { kind: null, stopPhase: 'idle' },
    nudge: inner.nudge,
    wakeSandbox: inner.wakeSandbox,
    replyToolCallConsents: inner.replyToolCallConsents,
  }),
}));

const { AsgardServiceContextProvider, useAsgardContext } = await import('./asgard-service-context');

const CONFIG: ClientConfig = { botProviderEndpoint: 'https://example.test/ns/ns-1/bot-provider/bp-1' };

let captured: AsgardServiceContextValue | null = null;

function Probe(): null {
  captured = useAsgardContext();

  return null;
}

function mount(onBeforeSendMessage?: (params: SendMessageParams) => SendMessageParams): AsgardServiceContextValue {
  captured = null;

  renderToStaticMarkup(
    <AsgardServiceContextProvider config={CONFIG} customChannelId="ch" onBeforeSendMessage={onBeforeSendMessage}>
      <Probe />
    </AsgardServiceContextProvider>,
  );

  if (!captured) throw new Error('context was not captured');

  return captured;
}

describe('AsgardServiceContextProvider — nudge payload (BUG-004)', () => {
  beforeEach(() => {
    inner.nudge.mockClear();
    inner.replyToolCallConsents.mockClear();
  });

  it('runs nudge through onBeforeSendMessage and forwards the returned payload', async () => {
    const onBeforeSendMessage = vi.fn((params: SendMessageParams) => ({
      ...params,
      payload: { agent_hub: { agent_names: ['writer'] } },
    }));

    await mount(onBeforeSendMessage).nudge?.();

    // Same shape the consent path is given: no user text, so `text` is '' and `blobIds` is absent.
    expect(onBeforeSendMessage).toHaveBeenCalledWith({ text: '', payload: undefined });
    expect(inner.nudge).toHaveBeenCalledWith({ agent_hub: { agent_names: ['writer'] } });
  });

  it('shows the callback a caller-supplied payload so it can be merged', async () => {
    const onBeforeSendMessage = vi.fn((params: SendMessageParams) => ({
      ...params,
      payload: { ...(params.payload as Record<string, unknown>), session: 'attached' },
    }));

    await mount(onBeforeSendMessage).nudge?.({ turn: 'explicit' });

    expect(onBeforeSendMessage).toHaveBeenCalledWith({ text: '', payload: { turn: 'explicit' } });
    expect(inner.nudge).toHaveBeenCalledWith({ turn: 'explicit', session: 'attached' });
  });

  it('passes the payload straight through when no callback is configured', async () => {
    await mount().nudge?.({ turn: 'explicit' });

    expect(inner.nudge).toHaveBeenCalledWith({ turn: 'explicit' });
  });

  it('sends no payload when neither a caller nor a callback supplies one', async () => {
    await mount().nudge?.();

    expect(inner.nudge).toHaveBeenCalledWith(undefined);
  });

  // F-038 — a wake is a nudge: the File Explorer button and the download card wake through it, so it has to
  // collect payload exactly like `nudge`, or a card-started wake would bring up an unconfigured sandbox.
  it('runs wakeSandbox through onBeforeSendMessage and keeps the sandbox name', async () => {
    inner.wakeSandbox.mockClear();
    const onBeforeSendMessage = vi.fn((params: SendMessageParams) => ({
      ...params,
      payload: { agent_hub: { agent_names: ['writer'] } },
    }));

    await expect(mount(onBeforeSendMessage).wakeSandbox?.('sbx-1')).resolves.toBe('live');

    expect(onBeforeSendMessage).toHaveBeenCalledWith({ text: '', payload: undefined });
    expect(inner.wakeSandbox).toHaveBeenCalledWith('sbx-1', { agent_hub: { agent_names: ['writer'] } });
  });

  it('keeps the consent reply on the same collection path', async () => {
    const onBeforeSendMessage = vi.fn((params: SendMessageParams) => ({
      ...params,
      payload: { agent_hub: { agent_names: ['writer'] } },
    }));

    await mount(onBeforeSendMessage).replyToolCallConsents?.([]);

    expect(inner.replyToolCallConsents).toHaveBeenCalledWith([], { agent_hub: { agent_names: ['writer'] } });
  });
});
