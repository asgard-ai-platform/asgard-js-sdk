// @vitest-environment jsdom
import { ReactNode, useEffect } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { LaunchedSandbox } from '@asgard-js/core';
import { useFileExplorerController } from '../../hooks/use-file-explorer-controller';
import { t } from '../../i18n';
import { FileExplorerProvider, useFileExplorer } from './file-explorer-context';
import { FileExplorerPanel } from './file-explorer-panel';
import { FileExplorerRoot } from './file-explorer-parts';
import { FsEntry, FsListResult, FsProviders, FsSource } from './types';

/**
 * Issue #482 item 1: the clipboard knows its source only by id, and sandbox names are per-channel, so a cut
 * taken in one conversation stayed pasteable in the next one whose sandbox reused the name — and a source that
 * left the list came back to a live clipboard. The clipboard now empties when its source leaves `sources` and
 * when the host's `clipboardScope` changes.
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

function Harness({ sources, scope }: { sources: FsSource[]; scope?: string }): ReactNode {
  const controller = useFileExplorerController({ activeSourceId: A.id });

  return (
    <FileExplorerProvider sources={sources} controller={controller} providers={PROVIDERS} clipboardScope={scope}>
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

function pasteButton(): HTMLButtonElement {
  const found = Array.from(screen.getByRole('toolbar').querySelectorAll('button')).find(
    b => b.getAttribute('aria-label') === t('en-US', 'fileExplorer.paste'),
  );
  if (!found) throw new Error('no toolbar Paste button');

  return found;
}

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

  it('keeps the clipboard when a different source leaves', async () => {
    const { rerender } = render(<Harness sources={[A, B]} />);
    await cutInA();

    rerender(<Harness sources={[A]} />);

    expect(text('clipboard')).toBe('cut:a');
    expect(text('can-paste')).toBe('true');
  });
});

describe('#482 item 1 — the clipboard empties when clipboardScope changes', () => {
  it('clears on a new scope even though the same source id is still listed', async () => {
    const { rerender } = render(<Harness sources={[A, B]} scope="ch-1" />);
    await cutInA();

    rerender(<Harness sources={[A, B]} scope="ch-2" />);

    await waitFor(() => expect(text('clipboard')).toBe('empty'));
    expect(text('can-paste')).toBe('false');
  });

  it('leaves everything else alone: the open file stays open and nothing remounts', async () => {
    mounts = 0;
    const { rerender } = render(<Harness sources={[A, B]} scope="ch-1" />);
    fireEvent.click(screen.getByText('open'));
    await cutInA();

    rerender(<Harness sources={[A, B]} scope="ch-2" />);

    await waitFor(() => expect(text('clipboard')).toBe('empty'));
    expect(text('open-file')).toBe('/work/a.txt');
    expect(mounts).toBe(1);
  });

  it('keeps the clipboard while the scope stays the same', async () => {
    const { rerender } = render(<Harness sources={[A, B]} scope="ch-1" />);
    await cutInA();

    rerender(<Harness sources={[A, B]} scope="ch-1" />);

    expect(text('clipboard')).toBe('cut:a');
    expect(text('can-paste')).toBe('true');
  });

  it('keeps today’s behaviour without a scope: B disables paste, back in A it works again', async () => {
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

describe('#482 item 1 — FileExplorerPanel forwards clipboardScope', () => {
  const sandbox: LaunchedSandbox = {
    sandboxName: 'sbx',
    sandboxBlueprintName: 'Workspace',
    workingDirectory: '/work',
    editorServerEnabled: false,
    browserEnabled: false,
  };

  /** The panel owns its provider, so the clipboard is set and read through the panel's own context. */
  function PanelHarness({ scope }: { scope: string }): ReactNode {
    const controller = useFileExplorerController();

    return (
      <FileExplorerPanel
        sandboxes={[sandbox]}
        controller={controller}
        listDir={listDir}
        copy={noop}
        move={noop}
        clipboardScope={scope}
      />
    );
  }

  it('clears the clipboard the panel holds when the scope changes', async () => {
    const { rerender } = render(<PanelHarness scope="ch-1" />);

    fireEvent.contextMenu((await screen.findByText('a.txt')).closest('button') as HTMLElement);
    const cut = within(screen.getByRole('menu'))
      .getAllByRole('menuitem')
      .find(item => item.textContent?.startsWith(t('en-US', 'fileExplorer.cut')));

    if (!cut) throw new Error('no Cut menu item');

    fireEvent.click(cut);
    await waitFor(() => expect(pasteButton().disabled).toBe(false));

    rerender(<PanelHarness scope="ch-2" />);

    await waitFor(() => expect(pasteButton().disabled).toBe(true));
  });
});
