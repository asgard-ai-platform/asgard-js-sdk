// @vitest-environment jsdom
import { ReactNode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useFileExplorerController } from '../../hooks/use-file-explorer-controller';
import { t } from '../../i18n';
import { FileExplorerProvider } from './file-explorer-context';
import { FileExplorerRoot, FileExplorerWorkspace } from './file-explorer-parts';
import { FsListResult, FsProviders, FsSource } from './types';

/**
 * BUG-009 — the chat-side explorer's selection was only ever an entrance. The tree container bound
 * `onContextMenu` and nothing else, so once a subfolder was clicked every directory action stayed pinned
 * to it until the page was reloaded.
 *
 * The selection is observed through the toolbar's `disabled` state rather than a CSS class: the class is
 * a CSS-module identifier that carries no meaning in this environment, while "rename is available" is the
 * user-visible consequence the bug report actually names (E4).
 */

const SOURCE: FsSource = { id: 'src-1', label: 'Source', rootPath: '/work' };

afterEach(() => {
  cleanup();
});

const listDir = async (_sourceId: string, path: string): Promise<FsListResult> => ({
  entries:
    path === '/work'
      ? [
          { name: 'sub', isDir: true, sizeBytes: 0, mtimeUnix: 0, mode: 493 },
          { name: 'a.txt', isDir: false, sizeBytes: 5, mtimeUnix: 0, mode: 420 },
        ]
      : [{ name: 'b.txt', isDir: false, sizeBytes: 5, mtimeUnix: 0, mode: 420 }],
  truncated: false,
});

const readFile = async (): Promise<string> => '';

function Harness({ providers }: { providers: FsProviders }): ReactNode {
  const controller = useFileExplorerController();

  return (
    <FileExplorerProvider sources={[SOURCE]} controller={controller} providers={providers}>
      <FileExplorerRoot>
        <FileExplorerWorkspace />
      </FileExplorerRoot>
    </FileExplorerProvider>
  );
}

/** The toolbar button carrying `key`'s label. */
function toolButton(key: string): HTMLButtonElement {
  const toolbar = screen.getByRole('toolbar');
  const found = Array.from(toolbar.querySelectorAll('button')).find(
    b => b.getAttribute('aria-label') === t('en-US', key),
  );
  if (!found) throw new Error(`no toolbar button labelled ${key}`);

  return found;
}

/** The row whose name is `name` — the button the tree renders for that entry. */
function row(name: string): HTMLElement {
  const found = screen.getByText(name).closest('button');
  if (!found) throw new Error(`no row for ${name}`);

  return found;
}

/** The tree container: the element the rows sit directly inside. */
function treeBackground(): HTMLElement {
  const parent = row('a.txt').parentElement;
  if (!parent) throw new Error('the tree container is missing');

  return parent;
}

/** The explorer's outermost element, where the Esc handler lives. */
function explorerRoot(container: HTMLElement): HTMLElement {
  const root = container.firstElementChild;
  if (!(root instanceof HTMLElement)) throw new Error('the explorer root is missing');

  return root;
}

const isSelectionHeld = (): boolean => !toolButton('fileExplorer.rename').disabled;

describe('BUG-009 — the chat-side File Explorer can clear its selection', () => {
  it('E1 clears the selection when the tree background is clicked', async () => {
    render(<Harness providers={{ listDir, readFile, move: vi.fn() }} />);
    fireEvent.click(await screen.findByText('sub'));
    expect(isSelectionHeld()).toBe(true);

    fireEvent.click(treeBackground());

    expect(isSelectionHeld()).toBe(false);
  });

  it('E1 keeps the selection when the click lands on a row rather than the background', async () => {
    render(<Harness providers={{ listDir, readFile, move: vi.fn() }} />);
    fireEvent.click(await screen.findByText('a.txt'));

    expect(isSelectionHeld()).toBe(true);
  });

  it('E2 clears the selection on Escape', async () => {
    const { container } = render(<Harness providers={{ listDir, readFile, move: vi.fn() }} />);
    fireEvent.click(await screen.findByText('sub'));

    fireEvent.keyDown(explorerRoot(container), { key: 'Escape' });

    expect(isSelectionHeld()).toBe(false);
  });

  it('E2 leaves the selection alone when Escape closes an open dialog', async () => {
    const { container } = render(<Harness providers={{ listDir, readFile, saveFile: vi.fn(), move: vi.fn() }} />);
    fireEvent.click(await screen.findByText('sub'));
    fireEvent.click(toolButton('fileExplorer.newFile'));
    const dialog = await screen.findByRole('dialog');

    fireEvent.keyDown(dialog, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(isSelectionHeld()).toBe(true);
    // The root handler must not have fired behind the dialog either.
    fireEvent.keyDown(explorerRoot(container), { key: 'Escape' });
    expect(isSelectionHeld()).toBe(false);
  });

  it('E2 leaves the selection alone when Escape closes the context menu', async () => {
    const { container } = render(<Harness providers={{ listDir, readFile, move: vi.fn() }} />);
    fireEvent.contextMenu(await screen.findByText('sub'));
    await screen.findByRole('menu');

    fireEvent.keyDown(explorerRoot(container), { key: 'Escape' });
    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    expect(isSelectionHeld()).toBe(true);
  });

  it('E2 leaves the selection alone when Escape is pressed while a file is open', async () => {
    // The tree and the toolbar are both gone while the FileView has the body, so clearing here is a
    // change nobody can see until they come back — and coming back to a selection they never dropped
    // reads as the explorer losing their place.
    const { container } = render(<Harness providers={{ listDir, readFile, move: vi.fn() }} />);
    const row = await screen.findByText('a.txt');
    fireEvent.click(row);
    fireEvent.doubleClick(row);
    await waitFor(() => expect(screen.queryByRole('toolbar')).toBeNull());

    fireEvent.keyDown(explorerRoot(container), { key: 'Escape' });
    fireEvent.click(screen.getByTitle(t('en-US', 'fileExplorer.backToTree')));

    await waitFor(() => expect(screen.queryByRole('toolbar')).not.toBeNull());
    expect(isSelectionHeld()).toBe(true);
  });

  it('E3 lands the next directory action back at the root once the selection is cleared', async () => {
    const saveFile = vi.fn(async (): Promise<void> => undefined);
    render(<Harness providers={{ listDir, readFile, saveFile, move: vi.fn() }} />);
    fireEvent.click(await screen.findByText('sub'));

    fireEvent.click(toolButton('fileExplorer.newFile'));
    fireEvent.click(screen.getByText(t('en-US', 'fileExplorer.confirm')));
    await waitFor(() => expect(saveFile).toHaveBeenCalledWith(SOURCE.id, '/work/sub/untitled.txt', ''));

    fireEvent.click(treeBackground());
    fireEvent.click(toolButton('fileExplorer.newFile'));
    fireEvent.click(screen.getByText(t('en-US', 'fileExplorer.confirm')));

    await waitFor(() => expect(saveFile).toHaveBeenLastCalledWith(SOURCE.id, '/work/untitled.txt', ''));
  });
});
