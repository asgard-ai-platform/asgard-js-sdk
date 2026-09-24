// @vitest-environment jsdom
import { ReactNode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useFileExplorerController } from '../../hooks/use-file-explorer-controller';
import { t } from '../../i18n';
import { FileExplorerProvider, useFileExplorer } from './file-explorer-context';
import { FileExplorerRoot, FileExplorerWorkspace } from './file-explorer-parts';
import styles from './file-explorer-panel.module.scss';
import { FsEntry, FsListResult, FsMutateSrcDst, FsProviders, FsSource } from './types';

/**
 * Issue #476. `FsProviders` promises that an omitted capability disables the actions that need it — "which
 * is how a read-only source is expressed". Copy, cut, paste and the source editor ignored that promise, and
 * the clipboard did not remember which source it came from, so a cut in one source pasted as a move in
 * another with the first source's path.
 *
 * The harness is the shape of the real host (Heimdall's ed-chat asset panel): two sources, and the host
 * hands the explorer a write-free provider set while the read-only one is active. Both sources share a root
 * so a path that exists in one exists in the other — the case where a clipboard without a source is wrong.
 */

const WRITABLE: FsSource = { id: 'rw', label: 'Workspace', rootPath: '/work' };
const READ_ONLY: FsSource = { id: 'ro', label: 'Content', rootPath: '/work' };
const FILE: FsEntry = { name: 'a.txt', path: '/work/a.txt', isDir: false, sizeBytes: 5, mtimeUnix: 0, mode: 420 };

afterEach(() => {
  cleanup();
});

// `docs` is empty, so a paste into it keeps the plain name rather than a deduplicated one.
const listDir = async (_sourceId: string, path: string): Promise<FsListResult> => ({
  entries:
    path === '/work'
      ? [
          { name: 'docs', isDir: true, sizeBytes: 0, mtimeUnix: 0, mode: 493 },
          { name: 'a.txt', isDir: false, sizeBytes: 5, mtimeUnix: 0, mode: 420 },
        ]
      : [],
  truncated: false,
});

interface Spies {
  copy: FsMutateSrcDst;
  move: FsMutateSrcDst;
}

function spies(): Spies {
  return { copy: vi.fn(async (): Promise<void> => undefined), move: vi.fn(async (): Promise<void> => undefined) };
}

function Harness({ writable, readOnly }: { writable: FsProviders; readOnly: FsProviders }): ReactNode {
  const controller = useFileExplorerController({ activeSourceId: WRITABLE.id });
  const providers = controller.activeSourceId === READ_ONLY.id ? readOnly : writable;

  return (
    <FileExplorerProvider sources={[WRITABLE, READ_ONLY]} controller={controller} providers={providers}>
      <FileExplorerRoot>
        <Probe select={controller.selectSource} />
        <FileExplorerWorkspace />
      </FileExplorerRoot>
    </FileExplorerProvider>
  );
}

/** What a host holding the context can do by hand — the path R3 and R5 are about. */
function Probe({ select }: { select: (sourceId: string) => void }): ReactNode {
  const { setClipboard, actPaste } = useFileExplorer();

  return (
    <div>
      <button type="button" onClick={() => select(WRITABLE.id)}>
        to-writable
      </button>
      <button type="button" onClick={() => select(READ_ONLY.id)}>
        to-read-only
      </button>
      <button type="button" onClick={() => setClipboard({ op: 'cut', entry: FILE })}>
        host-cut
      </button>
      <button type="button" onClick={() => void actPaste('/work/docs')}>
        host-paste
      </button>
    </div>
  );
}

function toolButton(key: string): HTMLButtonElement {
  const found = Array.from(screen.getByRole('toolbar').querySelectorAll('button')).find(
    b => b.getAttribute('aria-label') === t('en-US', key),
  );
  if (!found) throw new Error(`no toolbar button labelled ${key}`);

  return found;
}

function menuItem(key: string): HTMLButtonElement {
  const label = t('en-US', key);
  const found = within(screen.getByRole('menu'))
    .getAllByRole('menuitem')
    .find(item => item.textContent?.startsWith(label));
  if (!found) throw new Error(`no menu item labelled ${key}`);

  return found as HTMLButtonElement;
}

async function row(name: string): Promise<HTMLElement> {
  return (await screen.findByText(name)).closest('button') as HTMLElement;
}

async function settle(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 20));
}

describe('#476 R1 — copy and cut follow the providers they need', () => {
  it('disables copy and cut in the toolbar and both entry menus when the source has neither', async () => {
    render(<Harness writable={{ listDir }} readOnly={{ listDir }} />);
    fireEvent.click(await row('a.txt'));

    expect(toolButton('fileExplorer.copy').disabled).toBe(true);
    expect(toolButton('fileExplorer.cut').disabled).toBe(true);

    fireEvent.contextMenu(await row('a.txt'));
    expect(menuItem('fileExplorer.copy').disabled).toBe(true);
    expect(menuItem('fileExplorer.cut').disabled).toBe(true);
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });

    fireEvent.contextMenu(await row('docs'));
    expect(menuItem('fileExplorer.copy').disabled).toBe(true);
    expect(menuItem('fileExplorer.cut').disabled).toBe(true);
  });

  it('gates each on its own provider', async () => {
    const { copy } = spies();
    render(<Harness writable={{ listDir, copy }} readOnly={{ listDir }} />);
    fireEvent.click(await row('a.txt'));

    expect(toolButton('fileExplorer.copy').disabled).toBe(false);
    expect(toolButton('fileExplorer.cut').disabled).toBe(true);
  });
});

describe('#476 R2/R3 — paste needs a same-source clipboard and the provider for its operation', () => {
  it('pastes a cut within the source it came from', async () => {
    const s = spies();
    render(<Harness writable={{ listDir, ...s }} readOnly={{ listDir }} />);
    fireEvent.click(await row('a.txt'));
    fireEvent.click(toolButton('fileExplorer.cut'));

    fireEvent.click(await row('docs'));
    expect(toolButton('fileExplorer.paste').disabled).toBe(false);
    fireEvent.click(toolButton('fileExplorer.paste'));

    await waitFor(() => expect(s.move).toHaveBeenCalledWith(WRITABLE.id, '/work/a.txt', '/work/docs/a.txt'));
  });

  it('will not paste into another source, even one that could move', async () => {
    // The bug in its original form: a cut taken in one source, a paste in another that has `move`.
    const s = spies();
    render(<Harness writable={{ listDir, ...s }} readOnly={{ listDir, ...s }} />);
    fireEvent.click(await row('a.txt'));
    fireEvent.click(toolButton('fileExplorer.cut'));

    fireEvent.click(screen.getByText('to-read-only'));
    await row('a.txt');

    expect(toolButton('fileExplorer.paste').disabled).toBe(true);
    fireEvent.contextMenu(await row('docs'));
    expect(menuItem('fileExplorer.paste').disabled).toBe(true);
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    fireEvent.contextMenu(document.querySelector(`.${styles.tree}`) as HTMLElement);
    expect(menuItem('fileExplorer.paste').disabled).toBe(true);

    fireEvent.click(screen.getByText('host-paste'));
    await settle();
    expect(s.move).not.toHaveBeenCalled();
    expect(s.copy).not.toHaveBeenCalled();
  });

  it('disables a cut paste when the source has copy but no move', async () => {
    const s = spies();
    render(<Harness writable={{ listDir, copy: s.copy }} readOnly={{ listDir }} />);
    await row('a.txt');

    fireEvent.click(screen.getByText('host-cut'));
    expect(toolButton('fileExplorer.paste').disabled).toBe(true);

    fireEvent.click(screen.getByText('host-paste'));
    await settle();
    expect(s.copy).not.toHaveBeenCalled();
  });
});

describe('#476 R4 — the clipboard belongs to the source it was taken in', () => {
  it('survives a round trip to another source and pastes on return', async () => {
    const s = spies();
    render(<Harness writable={{ listDir, ...s }} readOnly={{ listDir }} />);
    fireEvent.click(await row('a.txt'));
    fireEvent.click(toolButton('fileExplorer.copy'));

    fireEvent.click(screen.getByText('to-read-only'));
    await row('a.txt');
    fireEvent.click(screen.getByText('to-writable'));
    fireEvent.click(await row('docs'));

    expect(toolButton('fileExplorer.paste').disabled).toBe(false);
    fireEvent.click(toolButton('fileExplorer.paste'));
    await waitFor(() => expect(s.copy).toHaveBeenCalledWith(WRITABLE.id, '/work/a.txt', '/work/docs/a.txt'));
  });

  it('dims the cut entry only in its own source, and names it only where it can be pasted', async () => {
    const s = spies();
    render(<Harness writable={{ listDir, ...s }} readOnly={{ listDir }} />);
    fireEvent.click(await row('a.txt'));
    fireEvent.click(toolButton('fileExplorer.cut'));

    expect((await row('a.txt')).classList.contains(styles.cut)).toBe(true);
    expect(toolButton('fileExplorer.paste').title).toBe(t('en-US', 'fileExplorer.pasteNamed', { name: 'a.txt' }));

    fireEvent.click(screen.getByText('to-read-only'));

    expect((await row('a.txt')).classList.contains(styles.cut)).toBe(false);
    expect(toolButton('fileExplorer.paste').title).toBe(t('en-US', 'fileExplorer.paste'));
  });
});

describe('#476 R5 — setClipboard without a source still works', () => {
  it('attributes a host-set entry to the active source', async () => {
    const s = spies();
    render(<Harness writable={{ listDir, ...s }} readOnly={{ listDir }} />);
    await row('a.txt');

    fireEvent.click(screen.getByText('host-cut'));
    expect(toolButton('fileExplorer.paste').disabled).toBe(false);

    fireEvent.click(screen.getByText('host-paste'));
    await waitFor(() => expect(s.move).toHaveBeenCalledWith(WRITABLE.id, '/work/a.txt', '/work/docs/a.txt'));
  });
});
