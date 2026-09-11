// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * F-021 AC9 / F-034 AC8 — a card fires its intent when it *arrives*, not only when it is clicked, and each
 * kind reaches its own handler. The once-per-(message, uri) guard is what keeps a conversation that re-renders
 * on every stream frame from firing the same card over and over.
 */

const conversation: { messages: Map<string, unknown> } = { messages: new Map() };

vi.mock('../../context/asgard-service-context', () => ({
  useAsgardContext: (): Record<string, unknown> => ({ conversation }),
}));

const { FileExplorerArrivalBridge } = await import('./chatbot-file-explorer');

function botCardMessage(messageId: string, uri: string): unknown {
  return {
    type: 'bot',
    messageId,
    message: { template: { type: 'ATTACHMENT', attachments: [{ defaultAction: { type: 'uri', uri } }] } },
  };
}

beforeEach(() => {
  conversation.messages = new Map();
});

afterEach(() => {
  cleanup();
});

describe('FileExplorerArrivalBridge — open-folder (F-034 AC8)', () => {
  it('fires the folder handler on arrival, without a click', () => {
    const onFileIntent = vi.fn();
    const onFolderIntent = vi.fn();
    conversation.messages.set(
      'm1',
      botCardMessage('m1', 'sandbox://sb-1/open-folder?absolute_path=%2Fwork%2F%E7%94%9F%E6%B4%BB%E5%B8%82%E9%9B%86'),
    );

    render(<FileExplorerArrivalBridge onFileIntent={onFileIntent} onFolderIntent={onFolderIntent} />);

    expect(onFolderIntent).toHaveBeenCalledWith('sb-1', '/work/生活市集');
    expect(onFileIntent).not.toHaveBeenCalled();
  });

  it('keeps routing a file card to the file handler', () => {
    const onFileIntent = vi.fn();
    const onFolderIntent = vi.fn();
    conversation.messages.set('m1', botCardMessage('m1', 'sandbox://sb-1/open-file?absolute_path=%2Fwork%2Fa.txt'));

    render(<FileExplorerArrivalBridge onFileIntent={onFileIntent} onFolderIntent={onFolderIntent} />);

    expect(onFileIntent).toHaveBeenCalledWith('sb-1', '/work/a.txt');
    expect(onFolderIntent).not.toHaveBeenCalled();
  });

  it('does not fire the same folder card twice as the conversation re-renders', () => {
    const onFolderIntent = vi.fn();
    conversation.messages.set('m1', botCardMessage('m1', 'sandbox://sb-1/open-folder?absolute_path=%2Fwork%2Fout'));

    const { rerender } = render(<FileExplorerArrivalBridge onFileIntent={vi.fn()} onFolderIntent={onFolderIntent} />);
    // A later frame appends a message; the map is a new object, so the effect re-runs over both.
    conversation.messages = new Map(conversation.messages);
    conversation.messages.set('m2', botCardMessage('m2', 'sandbox://sb-1/open-folder?absolute_path=%2Fwork%2Fother'));
    rerender(<FileExplorerArrivalBridge onFileIntent={vi.fn()} onFolderIntent={onFolderIntent} />);

    expect(onFolderIntent).toHaveBeenCalledTimes(2);
    expect(onFolderIntent).toHaveBeenNthCalledWith(1, 'sb-1', '/work/out');
    expect(onFolderIntent).toHaveBeenNthCalledWith(2, 'sb-1', '/work/other');
  });
});
