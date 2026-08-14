// @vitest-environment jsdom
import { ReactNode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpError } from '@asgard-js/core';
import { useFileExplorerController } from '../../hooks/use-file-explorer-controller';
import { t } from '../../i18n';
import { FileExplorerProvider } from './file-explorer-context';
import {
  FileExplorerHeader,
  FileExplorerHeaderRow,
  FileExplorerReadOnlyBadge,
  FileExplorerRoot,
  FileExplorerWorkspace,
} from './file-explorer-parts';
import { FsListResult, FsProviders, FsSource } from './types';

/**
 * BUILD-061 — the two additive changes that let the same explorer serve a SourceSet volume: `readOnly`
 * (F-025) and a listing that can report how much it held back (F-026). Both must leave the shipped
 * sandbox panel untouched when absent, which is what half these cases assert.
 *
 * `readOnly` **hides** the mutating actions, while "nothing is selected" keeps **disabling** them —
 * F-025 asks for both, and the difference is the whole point: absent permission removes the action,
 * absent selection merely parks it.
 *
 * The expected set was read off the rendered prototype, not off the ticket: with `readOnly` on, its
 * toolbar keeps exactly Download and Refresh, and its header grows a "Read only" badge.
 */

const SOURCE: FsSource = { id: 'src-1', label: 'Source', rootPath: '/work' };

/** Every action `readOnly` must remove, by i18n key. Copy/cut go too: a clipboard with no paste is dead UI. */
const MUTATING = [
  'fileExplorer.newFile',
  'fileExplorer.newFolder',
  'fileExplorer.upload',
  'fileExplorer.copy',
  'fileExplorer.cut',
  'fileExplorer.paste',
  'fileExplorer.rename',
  'fileExplorer.delete',
] as const;

/** What survives `readOnly`. */
const NON_MUTATING = ['fileExplorer.download', 'fileExplorer.refresh'] as const;

const listDir = async (): Promise<FsListResult> => ({
  entries: [
    { name: 'sub', isDir: true, sizeBytes: 0, mtimeUnix: 0, mode: 493 },
    { name: 'a.txt', isDir: false, sizeBytes: 5, mtimeUnix: 0, mode: 420 },
  ],
  truncated: false,
});

const readFile = async (): Promise<string> => 'hello';

/** Every capability wired, so nothing is hidden merely because its provider is missing. */
const ALL_PROVIDERS: FsProviders = {
  listDir,
  readFile,
  saveFile: vi.fn(),
  mkdir: vi.fn(),
  remove: vi.fn(),
  copy: vi.fn(),
  move: vi.fn(),
  upload: vi.fn(),
  download: vi.fn(),
};

function Harness(props: { providers?: FsProviders; readOnly?: boolean; onError?: (e: unknown) => void }): ReactNode {
  const controller = useFileExplorerController();

  return (
    <FileExplorerProvider
      sources={[SOURCE]}
      controller={controller}
      providers={props.providers ?? ALL_PROVIDERS}
      readOnly={props.readOnly}
      onError={props.onError}
    >
      <FileExplorerRoot>
        <FileExplorerHeader>
          <FileExplorerHeaderRow>
            <span>{SOURCE.label}</span>
            <FileExplorerReadOnlyBadge />
          </FileExplorerHeaderRow>
        </FileExplorerHeader>
        <FileExplorerWorkspace />
      </FileExplorerRoot>
    </FileExplorerProvider>
  );
}

function toolbarLabels(): string[] {
  return Array.from(screen.getByRole('toolbar').querySelectorAll('button')).map(
    b => b.getAttribute('aria-label') ?? '',
  );
}

function toolButton(key: string): HTMLButtonElement | undefined {
  return Array.from(screen.getByRole('toolbar').querySelectorAll('button')).find(
    b => b.getAttribute('aria-label') === t('en-US', key),
  );
}

/** Right-click the tree background and return the menu item labels. */
function backgroundMenuLabels(): string[] {
  fireEvent.contextMenu(screen.getByText('a.txt'));

  return Array.from(screen.getByRole('menu').querySelectorAll('button')).map(b => b.textContent ?? '');
}

afterEach(() => {
  cleanup();
});

describe('readOnly (F-025)', () => {
  it('hides every mutating action in the toolbar and keeps the rest', async () => {
    render(<Harness readOnly />);
    await screen.findByText('a.txt');

    const labels = toolbarLabels();
    MUTATING.forEach(key => expect(labels).not.toContain(t('en-US', key)));
    NON_MUTATING.forEach(key => expect(labels).toContain(t('en-US', key)));
  });

  it('hides every mutating action in the right-click menu too — the two entry points stay equal', async () => {
    render(<Harness readOnly />);
    await screen.findByText('a.txt');

    const labels = backgroundMenuLabels();
    MUTATING.forEach(key => expect(labels).not.toContain(t('en-US', key)));
    expect(labels).toContain(t('en-US', 'fileExplorer.refresh'));
  });

  it('leaves the toolbar exactly as it is today when the prop is absent', async () => {
    render(<Harness />);
    await screen.findByText('a.txt');

    const labels = toolbarLabels();
    [...MUTATING, ...NON_MUTATING].forEach(key => expect(labels).toContain(t('en-US', key)));
  });

  it('still disables rather than hides when nothing is selected — absent selection is not absent permission', async () => {
    render(<Harness />);
    await screen.findByText('a.txt');

    // Nothing selected yet: rename and delete are present but parked.
    expect(toolButton('fileExplorer.rename')?.disabled).toBe(true);
    expect(toolButton('fileExplorer.delete')?.disabled).toBe(true);
  });

  it('marks the panel read-only in the header, so absent actions read as "you cannot" not "it is broken"', async () => {
    render(<Harness readOnly />);
    await screen.findByText('a.txt');

    expect(screen.getByText(t('en-US', 'fileExplorer.readOnly'))).toBeTruthy();
  });

  it('shows no badge when the prop is absent', async () => {
    render(<Harness />);
    await screen.findByText('a.txt');

    expect(screen.queryByText(t('en-US', 'fileExplorer.readOnly'))).toBeNull();
  });
});

describe('readOnly reaches the file viewer too (F-025 R1)', () => {
  /** Open `a.txt` in the wide viewer and hand back what the viewer offers. */
  async function openFile(readOnly: boolean): Promise<{ labels: string[] }> {
    render(<Harness readOnly={readOnly} />);
    const row = await screen.findByText('a.txt');
    fireEvent.doubleClick(row);
    await screen.findByLabelText(t('en-US', 'fileExplorer.reloadFile'));

    const labels = screen
      .getAllByRole('button')
      .map(b => b.getAttribute('aria-label') ?? '')
      .filter(Boolean);

    return { labels };
  }

  // The editor is lazily loaded, so whether the buffer is typable is asserted in the browser (§3 R1),
  // not here — a jsdom check would pass vacuously whenever CodeMirror simply had not mounted yet. What
  // *is* deterministic here is the promise the button makes, and that is the half that misleads.
  it('offers source, not editing — a "Switch to editing" that cannot save is worse than no button', async () => {
    // The chat-kit prototype gets this wrong: under readOnly its viewer still offers "Switch to edit"
    // and hands back an editable buffer whose save silently no-ops. Matching the design would mean
    // matching a defect.
    const { labels } = await openFile(true);

    expect(labels).toContain(t('en-US', 'fileExplorer.switchToSource'));
    expect(labels).not.toContain(t('en-US', 'fileExplorer.switchToEdit'));
  });

  it('offers editing as before when readOnly is absent', async () => {
    const { labels } = await openFile(false);

    expect(labels).toContain(t('en-US', 'fileExplorer.switchToEdit'));
    expect(labels).not.toContain(t('en-US', 'fileExplorer.switchToSource'));
  });
});

describe('mutation failures are named, not swallowed (F-025)', () => {
  /** Reject the way the volume does: a real `HttpError` carrying the status the caller branches on. */
  const failWith = (status: number) => (): Promise<void> => Promise.reject(new HttpError(status, 'nope', 'raw body'));

  it('says "already exists" on a 409 instead of leaving the click looking like a no-op', async () => {
    render(<Harness providers={{ ...ALL_PROVIDERS, createFile: failWith(409) }} />);
    await screen.findByText('a.txt');

    fireEvent.click(toolButton('fileExplorer.newFile') as HTMLButtonElement);
    fireEvent.click(screen.getByText(t('en-US', 'fileExplorer.confirm')));

    const notice = await screen.findByRole('status');
    expect(notice.textContent).toContain(t('en-US', 'fileExplorer.errorExists'));
  });

  it.each([
    [400, 'fileExplorer.errorBadRequest'],
    [403, 'fileExplorer.errorForbidden'],
    [404, 'fileExplorer.errorNotFound'],
  ])('maps %i to a sentence rather than the raw body', async (status, key) => {
    render(<Harness providers={{ ...ALL_PROVIDERS, createFile: failWith(status) }} />);
    await screen.findByText('a.txt');

    fireEvent.click(toolButton('fileExplorer.newFile') as HTMLButtonElement);
    fireEvent.click(screen.getByText(t('en-US', 'fileExplorer.confirm')));

    const notice = await screen.findByRole('status');
    expect(notice.textContent).toContain(t('en-US', key));
    expect(notice.textContent).not.toContain('raw body');
  });

  it('hands the untouched error to onError so the host can log the real thing', async () => {
    const onError = vi.fn();
    render(<Harness providers={{ ...ALL_PROVIDERS, createFile: failWith(409) }} onError={onError} />);
    await screen.findByText('a.txt');

    fireEvent.click(toolButton('fileExplorer.newFile') as HTMLButtonElement);
    fireEvent.click(screen.getByText(t('en-US', 'fileExplorer.confirm')));

    await screen.findByRole('status');
    expect(onError).toHaveBeenCalledTimes(1);
    expect((onError.mock.calls[0][0] as HttpError).status).toBe(409);
  });

  it('is dismissible, and stays away until something actually fails', async () => {
    render(<Harness providers={{ ...ALL_PROVIDERS, createFile: failWith(409) }} />);
    await screen.findByText('a.txt');
    expect(screen.queryByRole('status')).toBeNull();

    fireEvent.click(toolButton('fileExplorer.newFile') as HTMLButtonElement);
    fireEvent.click(screen.getByText(t('en-US', 'fileExplorer.confirm')));
    await screen.findByRole('status');

    fireEvent.click(screen.getByLabelText(t('en-US', 'fileExplorer.dismissNotice')));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('creates through createFile when a source offers it, so a clash 409s instead of overwriting', async () => {
    const createFile = vi.fn(async (): Promise<void> => undefined);
    const saveFile = vi.fn(async (): Promise<void> => undefined);
    render(<Harness providers={{ ...ALL_PROVIDERS, createFile, saveFile }} />);
    await screen.findByText('a.txt');

    fireEvent.click(toolButton('fileExplorer.newFile') as HTMLButtonElement);
    fireEvent.click(screen.getByText(t('en-US', 'fileExplorer.confirm')));

    await waitFor(() => expect(createFile).toHaveBeenCalledWith(SOURCE.id, '/work/untitled.txt', ''));
    expect(saveFile).not.toHaveBeenCalled();
  });

  it('falls back to saveFile when a source has no createFile — the sandbox path is unchanged', async () => {
    const saveFile = vi.fn(async (): Promise<void> => undefined);
    render(<Harness providers={{ ...ALL_PROVIDERS, saveFile }} />);
    await screen.findByText('a.txt');

    fireEvent.click(toolButton('fileExplorer.newFile') as HTMLButtonElement);
    fireEvent.click(screen.getByText(t('en-US', 'fileExplorer.confirm')));

    await waitFor(() => expect(saveFile).toHaveBeenCalledWith(SOURCE.id, '/work/untitled.txt', ''));
  });
});

describe('listDir shortfall (F-026 UI half)', () => {
  it('says how many entries were left out instead of ending the list silently', async () => {
    const capped = async (): Promise<FsListResult> => ({
      entries: [{ name: 'a.txt', isDir: false, sizeBytes: 5, mtimeUnix: 0, mode: 420 }],
      truncated: true,
      totalEntries: 3000,
    });
    render(<Harness providers={{ ...ALL_PROVIDERS, listDir: capped }} />);
    await screen.findByText('a.txt');

    expect(screen.getByText(t('en-US', 'fileExplorer.notLoaded', { n: 2999 }))).toBeTruthy();
  });

  it('shows nothing extra when the provider reports no shortfall — the sandbox path is unchanged', async () => {
    render(<Harness />);
    await screen.findByText('a.txt');

    expect(screen.queryByText(/not loaded/i)).toBeNull();
  });
});
