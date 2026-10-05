// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Channel, Conversation } from '@asgard-js/core';
import type {
  ChannelMetadata,
  FetchSseOptions,
  FetchSsePayload,
  IAsgardServiceClient,
  SandboxWakeResult,
} from '@asgard-js/core';

import { useFileExplorerController } from '../../hooks/use-file-explorer-controller';
import { t } from '../../i18n';

/**
 * F-038 / UC-063 — the built-in aside reads the channel's one shared wake. A wake started anywhere else (a
 * download card, a host calling `channel.wakeSandbox()`) must show here as waking at once, a failed wake must
 * show here too, and the button must join the shared wake rather than keep a "waking" of its own.
 *
 * A real `Channel` drives this, so the store the aside reads is the same one core writes.
 */

const ctx = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));

vi.mock('../../context/asgard-service-context', () => ({
  useAsgardContext: (): Record<string, unknown> => ctx.value,
}));

const { ChatbotFileExplorerAside } = await import('./chatbot-file-explorer');

interface Harness {
  channel: Channel;
  sent: FetchSsePayload[];
  completeRun: () => void;
}

function harness(): Harness {
  const sent: FetchSsePayload[] = [];
  let runOptions: FetchSseOptions | undefined;
  const client = {
    fetchSse(payload: FetchSsePayload, options?: FetchSseOptions): void {
      sent.push(payload);
      runOptions = options;
    },
    // No sandbox ever comes up — the empty state stays on screen for the whole test.
    channelMetadata: async (): Promise<ChannelMetadata> => ({ title: null, runState: 'IDLE', launchedSandboxes: [] }),
  } as unknown as IAsgardServiceClient;
  const channel = Channel.create({
    client,
    customChannelId: 'ch',
    conversation: new Conversation({ messages: new Map() }),
  });

  ctx.value = {
    client: {},
    channel,
    customChannelId: 'ch',
    isRunning: false,
    pendingConsent: null,
    wakeSandbox: (name?: string): Promise<SandboxWakeResult> => channel.wakeSandbox(name),
  };

  return { channel, sent, completeRun: (): void => runOptions?.onSseCompleted?.() };
}

function AsideUnderTest(): ReactNode {
  const controller = useFileExplorerController({ open: true });

  return <ChatbotFileExplorerAside controller={controller} />;
}

const wakeLabel = t('en-US', 'fileExplorer.wakeSandbox');
const wakingLabel = t('en-US', 'fileExplorer.waking');
const failedLabel = t('en-US', 'fileExplorer.wakeFailed');

afterEach(() => {
  cleanup();
});

describe('F-038 — the built-in aside reads the shared sandbox wake', () => {
  it('shows a wake started elsewhere as waking at once, then its failure', async () => {
    const h = harness();
    render(<AsideUnderTest />);

    expect(screen.getByRole('button', { name: wakeLabel })).toHaveProperty('disabled', false);

    let result: Promise<string> = Promise.resolve('');
    act(() => {
      result = h.channel.wakeSandbox('sbx-1');
    });

    const waking = screen.getByRole('button', { name: wakingLabel });
    expect(waking).toHaveProperty('disabled', true);

    await act(async () => {
      h.completeRun();
      await result;
    });

    expect(screen.getByText(failedLabel)).toBeTruthy();
    expect(screen.getByRole('button', { name: wakeLabel })).toHaveProperty('disabled', false);
    h.channel.close();
  });

  it('wakes through the shared wake from its own button — one nudge, no local spinner of its own', async () => {
    const h = harness();
    render(<AsideUnderTest />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: wakeLabel }));
    });

    expect(h.sent).toHaveLength(1);
    expect(h.channel.getSandboxWake().phase).toBe('waking');

    // A second entry point asking now joins the button's wake instead of sending its own.
    let joined: Promise<string> = Promise.resolve('');
    act(() => {
      joined = h.channel.wakeSandbox('sbx-1');
    });
    expect(h.sent).toHaveLength(1);

    await act(async () => {
      h.completeRun();
      await joined;
    });

    expect(screen.queryByRole('button', { name: wakingLabel })).toBeNull();
    expect(screen.getByText(failedLabel)).toBeTruthy();
    h.channel.close();
  });
});
