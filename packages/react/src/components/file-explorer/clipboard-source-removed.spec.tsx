// @vitest-environment jsdom
import { ReactNode, useEffect } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useFileExplorerController } from '../../hooks/use-file-explorer-controller';
import { FileExplorerProvider, useFileExplorer } from './file-explorer-context';
import { FileExplorerRoot } from './file-explorer-parts';
import { FsEntry, FsListResult, FsProviders, FsSource } from './types';

/**
 * Issue #482 item 1: the clipboard knows its source only by id, so a source that left the list came back to a
 * live clipboard — and a sandbox name is reused, so the "same" source may be a different machine. The clipboard
 * now empties when its source leaves `sources`, and nothing else about it changes.
 */

const A: FsSource = { id: 'a', label: 'A', rootPath: '/work' };
const B: FsSource = { id: 'b', label: 'B', rootPath: '/work' };
const FILE: FsEntry = { name: 'a.txt', path: '/work/a.txt', isDir: false, sizeBytes: 5, mtimeUnix: 0, mode: 420 };

afterEach(() => {
  cleanup();
});

const listDir = async (): Promise<FsListResult> => ({
  entries: [{ name: 'a.txt', isDir: false, sizeBytes: 5, mtimeUnix: 0, mode: 420 }],
  truncated: false,
});
const noop = async (): Promise<void> => undefined;
const PROVIDERS: FsProviders = { listDir, copy: noop, move: noop };

let mounts = 0;

/** Reads the clipboard and counts its own mounts, so a remount of the provider would show. */
function Probe(): ReactNode {
  const { clipboard, canPaste, setClipboard, openFile, setOpenFile } = useFileExplorer();

  useEffect(() => {
    mounts += 1;
  }, []);

  return (
    <div>
      <button type="button" onClick={() => setClipboard({ op: 'cut', entry: FILE })}>
        cut
      </button>
      <button type="button" onClick={() => setOpenFile(FILE)}>
        open
      </button>
      <output data-testid="clipboard">{clipboard ? `${clipboard.op}:${clipboard.sourceId ?? '?'}` : 'empty'}</output>
      <output data-testid="can-paste">{String(canPaste)}</output>
      <output data-testid="open-file">{openFile?.path ?? '-'}</output>
    </div>
  );
}

function Harness({ sources }: { sources: FsSource[] }): ReactNode {
  const controller = useFileExplorerController({ activeSourceId: A.id });

  return (
    <FileExplorerProvider sources={sources} controller={controller} providers={PROVIDERS}>
      <FileExplorerRoot>
        <button type="button" onClick={() => controller.selectSource(A.id)}>
          to-a
        </button>
        <button type="button" onClick={() => controller.selectSource(B.id)}>
          to-b
        </button>
        <Probe />
      </FileExplorerRoot>
    </FileExplorerProvider>
  );
}

const text = (id: string): string => screen.getByTestId(id).textContent ?? '';

async function cutInA(): Promise<void> {
  fireEvent.click(screen.getByText('cut'));
  await waitFor(() => expect(text('clipboard')).toBe('cut:a'));
}

describe('#482 item 1 — the clipboard empties when its source leaves the list', () => {
  it('clears once the source is gone, and stays empty when the same id comes back', async () => {
    const { rerender } = render(<Harness sources={[A, B]} />);
    await cutInA();

    rerender(<Harness sources={[B]} />);
    await waitFor(() => expect(text('clipboard')).toBe('empty'));

    rerender(<Harness sources={[A, B]} />);
    fireEvent.click(screen.getByText('to-a'));
    await waitFor(() => expect(text('can-paste')).toBe('false'));
    expect(text('clipboard')).toBe('empty');
  });

  it('drops only the clipboard: the file open in the remaining source stays open and nothing remounts', async () => {
    mounts = 0;
    const { rerender } = render(<Harness sources={[A, B]} />);
    await cutInA();
    // Open files are kept per source, so the one to watch is in B — the source that stays.
    fireEvent.click(screen.getByText('to-b'));
    fireEvent.click(screen.getByText('open'));
    await waitFor(() => expect(text('open-file')).toBe('/work/a.txt'));

    rerender(<Harness sources={[B]} />);

    await waitFor(() => expect(text('clipboard')).toBe('empty'));
    expect(text('open-file')).toBe('/work/a.txt');
    expect(mounts).toBe(1);
  });

  it('keeps the clipboard when a different source leaves', async () => {
    const { rerender } = render(<Harness sources={[A, B]} />);
    await cutInA();

    rerender(<Harness sources={[A]} />);

    expect(text('clipboard')).toBe('cut:a');
    expect(text('can-paste')).toBe('true');
  });

  it('keeps today’s behaviour while every source stays listed: B disables paste, back in A it works again', async () => {
    const { rerender } = render(<Harness sources={[A, B]} />);
    await cutInA();

    rerender(<Harness sources={[A, B]} />);
    fireEvent.click(screen.getByText('to-b'));
    await waitFor(() => expect(text('can-paste')).toBe('false'));
    expect(text('clipboard')).toBe('cut:a');

    fireEvent.click(screen.getByText('to-a'));
    await waitFor(() => expect(text('can-paste')).toBe('true'));
  });
});
