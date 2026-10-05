// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { ToolCallConsentEventData } from '@asgard-js/core';

import { useFileExplorerController } from '../../hooks/use-file-explorer-controller';

/**
 * #409 — the "Wake a sandbox" button in the File Explorer's empty state was gated on `isRunning`
 * alone. During a consent pause the run has already ended (the consent frame precedes the terminal),
 * so `isRunning` is false and the button stayed live — but core refuses the nudge (#407).
 *
 * This state is hard to reach in a browser: the empty state needs zero live sandboxes, while the
 * consent bot that produces a pending prompt also launches one. So the wiring is pinned here instead.
 */

const ctx = vi.hoisted(() => ({
  value: {} as Record<string, unknown>,
}));

vi.mock('../../context/asgard-service-context', () => ({
  useAsgardContext: (): Record<string, unknown> => ctx.value,
}));

// No live sandboxes → FileExplorerPanel renders its empty state, which is where the nudge button lives.
vi.mock('../../hooks/use-derived-state', () => ({
  useLaunchedSandboxes: (): unknown[] => [],
  useSandboxWakeState: (): { phase: 'idle' } => ({ phase: 'idle' }),
}));

const { ChatbotFileExplorerAside } = await import('./chatbot-file-explorer');

/**
 * The controller comes from the real hook rather than a hand-written literal. The literal this
 * replaced was cast through `as unknown as`, so the compiler never checked it — it had drifted to
 * three members the interface no longer has, and went on "passing" until a fourth member was added
 * and the render blew up at runtime instead.
 */
function AsideUnderTest(): ReactNode {
  const controller = useFileExplorerController({ open: true });

  return <ChatbotFileExplorerAside controller={controller} />;
}

const PENDING: ToolCallConsentEventData = {
  processId: 'proc-1',
  pendingCalls: [{ toolCallId: 'call-1', toolsetName: 'shell', toolName: 'run', parameter: {}, alreadyAllowed: false }],
};

function renderWith(state: { isRunning: boolean; pendingConsent: ToolCallConsentEventData | null }): string {
  ctx.value = {
    client: {},
    channel: null,
    nudge: vi.fn(),
    isRunning: state.isRunning,
    pendingConsent: state.pendingConsent,
  };

  return renderToStaticMarkup(<AsideUnderTest />);
}

/** The wake button is the only one carrying that label; grab its rendered tag. */
function wakeButtonTag(html: string): string {
  const idx = html.indexOf('Wake a sandbox');
  expect(idx, 'empty state with the wake button should be rendered').toBeGreaterThan(-1);

  return html.slice(0, idx).slice(html.slice(0, idx).lastIndexOf('<button'));
}

describe('#409 — nudge entry point during a consent pause', () => {
  it('disables the wake button while a consent is pending, even though no run is in flight', () => {
    const html = renderWith({ isRunning: false, pendingConsent: PENDING });

    expect(wakeButtonTag(html)).toContain('disabled');
  });

  it('still disables it while a run is in flight (pre-existing F-023 AC6 gate)', () => {
    const html = renderWith({ isRunning: true, pendingConsent: null });

    expect(wakeButtonTag(html)).toContain('disabled');
  });

  it('leaves it enabled when the channel is genuinely idle', () => {
    const html = renderWith({ isRunning: false, pendingConsent: null });

    expect(wakeButtonTag(html)).not.toContain('disabled');
  });
});
