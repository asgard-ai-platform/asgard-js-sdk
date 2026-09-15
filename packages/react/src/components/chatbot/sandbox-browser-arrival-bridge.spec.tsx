// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * F-035 — an `open-browser` card notifies on *arrival*, not only on click, and exactly once per
 * (message, uri). The once-guard is what keeps a conversation that re-renders on every stream frame from
 * firing the same card repeatedly — which here would mean tearing down and re-establishing a WebRTC stream
 * on every frame, not merely a redundant callback.
 */

const conversation: { messages: Map<string, unknown> } = { messages: new Map() };

// A **new** wrapper object every read, which is what the real store does: the conversation is replaced on
// every stream frame. Returning one stable object would make the effect run only on mount and quietly turn
// the once-per-card guard below into a test of nothing.
vi.mock('../../context/asgard-service-context', () => ({
  useAsgardContext: (): Record<string, unknown> => ({ conversation: { messages: conversation.messages } }),
}));

const { SandboxBrowserArrivalBridge } = await import('./chatbot-sandbox-browser');

function botCardMessage(
  messageId: string,
  uri: string,
  surface: 'attachment' | 'button' | 'carousel' = 'attachment',
): unknown {
  const action = { type: 'uri', uri };
  const template =
    surface === 'attachment'
      ? { type: 'ATTACHMENT', attachments: [{ defaultAction: action }] }
      : surface === 'button'
      ? { type: 'BUTTON', buttons: [{ action }] }
      : { type: 'CAROUSEL', columns: [{ buttons: [{ action }] }] };

  return { type: 'bot', messageId, message: { template } };
}

beforeEach(() => {
  conversation.messages = new Map();
});

afterEach(() => {
  cleanup();
});

describe('SandboxBrowserArrivalBridge', () => {
  it('fires on arrival, without a click', () => {
    const onBrowserIntent = vi.fn();
    conversation.messages.set('m1', botCardMessage('m1', 'sandbox://sb-1/open-browser'));

    render(<SandboxBrowserArrivalBridge onBrowserIntent={onBrowserIntent} />);

    expect(onBrowserIntent).toHaveBeenCalledWith('sb-1');
  });

  // The click dispatcher covers all three surfaces, so the arrival scan has to as well — otherwise the same
  // card behaves differently depending on which template carried it.
  it.each(['attachment', 'button', 'carousel'] as const)('finds the card on a %s template', surface => {
    const onBrowserIntent = vi.fn();
    conversation.messages.set('m1', botCardMessage('m1', 'sandbox://sb-1/open-browser', surface));

    render(<SandboxBrowserArrivalBridge onBrowserIntent={onBrowserIntent} />);

    expect(onBrowserIntent).toHaveBeenCalledWith('sb-1');
  });

  it('fires once per (message, uri) however often the conversation re-renders', () => {
    const onBrowserIntent = vi.fn();
    conversation.messages.set('m1', botCardMessage('m1', 'sandbox://sb-1/open-browser'));

    const { rerender } = render(<SandboxBrowserArrivalBridge onBrowserIntent={onBrowserIntent} />);
    rerender(<SandboxBrowserArrivalBridge onBrowserIntent={onBrowserIntent} />);
    rerender(<SandboxBrowserArrivalBridge onBrowserIntent={onBrowserIntent} />);

    expect(onBrowserIntent).toHaveBeenCalledTimes(1);
  });

  it('fires again for a second card, even one naming the same sandbox', () => {
    const onBrowserIntent = vi.fn();
    conversation.messages.set('m1', botCardMessage('m1', 'sandbox://sb-1/open-browser'));

    const { rerender } = render(<SandboxBrowserArrivalBridge onBrowserIntent={onBrowserIntent} />);

    conversation.messages.set('m2', botCardMessage('m2', 'sandbox://sb-1/open-browser'));
    rerender(<SandboxBrowserArrivalBridge onBrowserIntent={onBrowserIntent} />);

    expect(onBrowserIntent).toHaveBeenCalledTimes(2);
  });

  // The other two sandbox intents have their own bridge and their own destinations.
  it.each([
    ['open-file', 'sandbox://sb-1/open-file?absolute_path=%2Fwork%2Fa.txt'],
    ['open-folder', 'sandbox://sb-1/open-folder?absolute_path=%2Fwork'],
  ])('ignores an %s card', (_kind, uri) => {
    const onBrowserIntent = vi.fn();
    conversation.messages.set('m1', botCardMessage('m1', uri));

    render(<SandboxBrowserArrivalBridge onBrowserIntent={onBrowserIntent} />);

    expect(onBrowserIntent).not.toHaveBeenCalled();
  });

  it('ignores a plain link and a user message', () => {
    const onBrowserIntent = vi.fn();
    conversation.messages.set('m1', botCardMessage('m1', 'https://example.com/open-browser'));
    conversation.messages.set('m2', { type: 'user', messageId: 'm2', message: { text: 'hi' } });

    render(<SandboxBrowserArrivalBridge onBrowserIntent={onBrowserIntent} />);

    expect(onBrowserIntent).not.toHaveBeenCalled();
  });

  it('renders nothing', () => {
    const { container } = render(<SandboxBrowserArrivalBridge onBrowserIntent={vi.fn()} />);

    expect(container.innerHTML).toBe('');
  });
});
