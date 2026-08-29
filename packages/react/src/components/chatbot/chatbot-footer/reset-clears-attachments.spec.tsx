// @vitest-environment jsdom
import { ReactNode, useContext, useRef } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Channel } from '@asgard-js/core';
import { AsgardServiceContext, AsgardServiceContextValue } from '../../../context/asgard-service-context';
import { AsgardTemplateContextProvider } from '../../../context/asgard-template-context';
import { FileDropContextProvider } from '../../../context/file-drop-context';
// The `?react` suffix is a vite-plugin-svgr transform; under vitest it resolves to the asset URL
// string, so rendering one would try to create an element named after the file path.
vi.mock('../../../icons/paperclip.svg?react', () => ({ default: (): null => null }));
vi.mock('../../../icons/send.svg?react', () => ({ default: (): null => null }));
vi.mock('../../../icons/stop.svg?react', () => ({ default: (): null => null }));

const { ChatComposer } = await import('./chat-composer');

/**
 * asgard-js-sdk#455 (1) — a blob belongs to the channel that was live when it was uploaded. A reset
 * deletes that channel and every blob on it, so a pending attachment the composer is still holding
 * becomes an id that resolves to nothing — and the backend answers with no error, which is the whole
 * failure mode F-032 exists to remove. The composer is not remounted by a reset, so nothing used to
 * clear it.
 *
 * (2) — the same window must not accept new uploads: the teardown can take up to a minute, and a file
 * uploaded into a channel being deleted is gone before it can be referenced.
 */

function Harness({ override }: { override: Partial<AsgardServiceContextValue> }): ReactNode {
  const base = useContext(AsgardServiceContext);
  const footerRef = useRef<HTMLDivElement | null>(null);

  return (
    <AsgardServiceContext.Provider value={{ ...base, sendMessage: vi.fn(), ...override }}>
      <AsgardTemplateContextProvider locale="en-US">
        <FileDropContextProvider>
          <div ref={footerRef}>
            <ChatComposer enableUpload enableDocumentUpload footerRef={footerRef} />
          </div>
        </FileDropContextProvider>
      </AsgardTemplateContextProvider>
    </AsgardServiceContext.Provider>
  );
}

/** Two distinct instances is all the composer needs — it keys on identity, not on any channel field. */
const channelA = { id: 'a' } as unknown as Channel;
const channelB = { id: 'b' } as unknown as Channel;

function attachOne(): void {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(['margins'], 'margins.txt', { type: 'text/plain' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {
        return undefined;
      }
      unobserve(): void {
        return undefined;
      }
      disconnect(): void {
        return undefined;
      }
    },
  );
  if (!URL.createObjectURL) {
    Object.defineProperty(URL, 'createObjectURL', { value: () => 'blob:stub', configurable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: () => undefined, configurable: true });
  }
});

afterEach(cleanup);
afterAll(() => {
  vi.unstubAllGlobals();
});

describe('composer attachments across a reset (#455)', () => {
  it('R1: replacing the channel drops the pending attachment', async () => {
    const uploadFile = vi.fn().mockResolvedValue({ data: [{ blobId: 'blob-1' }] });
    const client = { uploadFile } as unknown as AsgardServiceContextValue['client'];
    const { rerender } = render(
      <Harness override={{ channel: channelA, client, customChannelId: 'ch', enableUpload: true }} />,
    );

    attachOne();
    expect(await screen.findByText('margins.txt')).toBeTruthy();

    // The reset hands the context a new Channel instance; the composer itself is never remounted.
    rerender(<Harness override={{ channel: channelB, client, customChannelId: 'ch', enableUpload: true }} />);

    expect(screen.queryByText('margins.txt')).toBeNull();
  });

  it('R1: a re-render that does not change the channel keeps the attachment', async () => {
    const uploadFile = vi.fn().mockResolvedValue({ data: [{ blobId: 'blob-1' }] });
    const client = { uploadFile } as unknown as AsgardServiceContextValue['client'];
    const { rerender } = render(
      <Harness override={{ channel: channelA, client, customChannelId: 'ch', enableUpload: true }} />,
    );

    attachOne();
    expect(await screen.findByText('margins.txt')).toBeTruthy();

    rerender(
      <Harness
        override={{ channel: channelA, client, customChannelId: 'ch', enableUpload: true, isConnecting: true }}
      />,
    );

    expect(screen.queryByText('margins.txt')).toBeTruthy();
  });

  it('R2: the attachment entrance is refused while a reset is in flight', () => {
    render(<Harness override={{ channel: channelA, isResetting: true, enableUpload: true }} />);

    expect(screen.getByLabelText('Attach files').hasAttribute('disabled')).toBe(true);
  });

  it('R2: and is available again once the reset settles', () => {
    render(<Harness override={{ channel: channelA, isResetting: false, enableUpload: true }} />);

    expect(screen.getByLabelText('Attach files').hasAttribute('disabled')).toBe(false);
  });
});
