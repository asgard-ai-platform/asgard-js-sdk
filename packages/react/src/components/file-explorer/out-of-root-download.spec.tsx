// @vitest-environment jsdom
import { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import { useFileExplorerController } from '../../hooks/use-file-explorer-controller';
import { FileExplorerProvider, useFileExplorer } from './file-explorer-context';
import { FileExplorerRoot, FileExplorerWorkspace } from './file-explorer-parts';
import { FsListResult, FsProviders, FsSource } from './types';

/**
 * The out-of-root notice offers a download for a FILE it cannot show.
 *
 * The tree is rooted at the sandbox's working directory, but the sandbox can read further than that, and
 * the explorer's `download` provider goes through the same `fs/file` read as the download card. So a card
 * pointing outside the tree can still end with the user holding the file. The shape is the 2026-10-29 Agent
 * Hub case: the tree at the Directory (`/agent-hub-work`), the agent's Word file in the Channel Home.
 *
 * A folder gets no link — `fs/file` refuses a directory — and neither does a source with no `download`.
 */

const SOURCE: FsSource = { id: 'sbx-1', label: 'Sandbox A', rootPath: '/agent-hub-work' };
const OTHER: FsSource = { id: 'sbx-2', label: 'Sandbox B', rootPath: '/elsewhere' };

const OUTSIDE_FILE = '/work/output/報價單_IELTS成績驗證Agent_20261029.docx';
const OUTSIDE_FOLDER = '/work/output';

afterEach(() => {
  cleanup();
});

type MockProviders = {
  listDir: Mock<[], Promise<FsListResult>>;
  readFile: Mock<[], Promise<string>>;
  watchFile: Mock<[], () => void>;
  download?: Mock<[string, string, string], Promise<void>>;
};

function makeProviders(download?: MockProviders['download']): MockProviders {
  return {
    listDir: vi.fn(async (): Promise<FsListResult> => ({ entries: [], truncated: false })),
    readFile: vi.fn(async (): Promise<string> => ''),
    watchFile: vi.fn((): (() => void) => () => undefined),
    ...(download ? { download } : {}),
  };
}

/** The `download` provider: `(sourceId, path, name)`. */
function downloadMock(): Mock<[string, string, string], Promise<void>> {
  return vi.fn<[string, string, string], Promise<void>>();
}

/** A promise the test settles by hand, to look at the notice while the download is in flight. */
function deferred(): { promise: Promise<void>; resolve: () => void; reject: (error: Error) => void } {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

function Requests(): ReactNode {
  const { controller } = useFileExplorer();

  return (
    <>
      <button type="button" onClick={() => controller.requestFile(SOURCE.id, OUTSIDE_FILE)}>
        request-outside-file
      </button>
      <button type="button" onClick={() => controller.requestFolder(SOURCE.id, OUTSIDE_FOLDER)}>
        request-outside-folder
      </button>
      <button type="button" onClick={() => controller.selectSource(OTHER.id)}>
        switch-source
      </button>
    </>
  );
}

function Harness({ providers }: { providers: MockProviders }): ReactNode {
  const controller = useFileExplorerController();

  return (
    <FileExplorerProvider sources={[SOURCE, OTHER]} controller={controller} providers={providers as FsProviders}>
      <FileExplorerRoot>
        <Requests />
        <FileExplorerWorkspace />
      </FileExplorerRoot>
    </FileExplorerProvider>
  );
}

describe('out-of-root notice download', () => {
  it('downloads the file it cannot show, by its own name, without touching the tree', async () => {
    const download = downloadMock().mockResolvedValue(undefined);
    const providers = makeProviders(download);
    const { listDir, readFile, watchFile } = providers;
    render(<Harness providers={providers} />);

    await waitFor(() => expect(listDir).toHaveBeenCalled());
    const listCallsBefore = listDir.mock.calls.length;

    fireEvent.click(screen.getByText('request-outside-file'));
    const notice = await screen.findByRole('status');
    expect(notice.textContent).toContain(OUTSIDE_FILE);

    fireEvent.click(screen.getByRole('button', { name: 'Download it instead' }));

    await waitFor(() => {
      expect(download).toHaveBeenCalledWith(SOURCE.id, OUTSIDE_FILE, '報價單_IELTS成績驗證Agent_20261029.docx');
    });
    expect(listDir.mock.calls.length).toBe(listCallsBefore);
    expect(readFile).not.toHaveBeenCalled();
    expect(watchFile).not.toHaveBeenCalled();
  });

  it('shows the download in flight, and offers it again once it is done', async () => {
    const pending = deferred();
    const download = downloadMock().mockReturnValue(pending.promise);
    render(<Harness providers={makeProviders(download)} />);

    fireEvent.click(screen.getByText('request-outside-file'));
    fireEvent.click(await screen.findByRole('button', { name: 'Download it instead' }));

    const inFlight = await screen.findByRole('button', { name: 'Downloading…' });
    expect((inFlight as HTMLButtonElement).disabled).toBe(true);

    // A second click while in flight starts nothing.
    fireEvent.click(inFlight);
    expect(download).toHaveBeenCalledTimes(1);

    pending.resolve();
    expect(await screen.findByRole('button', { name: 'Download it instead' })).toBeTruthy();
  });

  it('says so when the download fails, and lets the user try again', async () => {
    const download = downloadMock().mockRejectedValueOnce(new Error('412')).mockResolvedValueOnce(undefined);
    render(<Harness providers={makeProviders(download)} />);

    fireEvent.click(screen.getByText('request-outside-file'));
    fireEvent.click(await screen.findByRole('button', { name: 'Download it instead' }));

    expect(await screen.findByText('Download failed. Try again.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Download it instead' }));
    await waitFor(() => expect(download).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText('Download failed. Try again.')).toBeNull());
  });

  it('does not carry a failure over to the next notice for the same path', async () => {
    const download = downloadMock().mockRejectedValue(new Error('412'));
    render(<Harness providers={makeProviders(download)} />);

    fireEvent.click(screen.getByText('request-outside-file'));
    fireEvent.click(await screen.findByRole('button', { name: 'Download it instead' }));
    await screen.findByText('Download failed. Try again.');

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notice' }));
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());

    fireEvent.click(screen.getByText('request-outside-file'));
    await screen.findByRole('button', { name: 'Download it instead' });
    expect(screen.queryByText('Download failed. Try again.')).toBeNull();
  });

  it('does not carry a failure over when the same card is pushed again', async () => {
    const download = downloadMock().mockRejectedValue(new Error('412'));
    render(<Harness providers={makeProviders(download)} />);

    fireEvent.click(screen.getByText('request-outside-file'));
    fireEvent.click(await screen.findByRole('button', { name: 'Download it instead' }));
    await screen.findByText('Download failed. Try again.');

    // No dismiss: the agent pushes the same card while the failed notice is still up.
    fireEvent.click(screen.getByText('request-outside-file'));
    await waitFor(() => expect(screen.queryByText('Download failed. Try again.')).toBeNull());
  });

  it('does not let an earlier download settle the state of a later one for the same path', async () => {
    const first = deferred();
    const second = deferred();
    const download = downloadMock().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    render(<Harness providers={makeProviders(download)} />);

    fireEvent.click(screen.getByText('request-outside-file'));
    fireEvent.click(await screen.findByRole('button', { name: 'Download it instead' }));
    await screen.findByRole('button', { name: 'Downloading…' });

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notice' }));
    fireEvent.click(screen.getByText('request-outside-file'));
    fireEvent.click(await screen.findByRole('button', { name: 'Download it instead' }));
    await screen.findByRole('button', { name: 'Downloading…' });

    await act(async () => {
      first.reject(new Error('412'));
      await first.promise.catch(() => undefined);
    });

    // The second download is still running: it stays in flight, with no failure from the first.
    expect(screen.getByRole('button', { name: 'Downloading…' })).toBeTruthy();
    expect(screen.queryByText('Download failed. Try again.')).toBeNull();

    second.resolve();
    expect(await screen.findByRole('button', { name: 'Download it instead' })).toBeTruthy();
  });

  it('offers no download for a folder', async () => {
    const download = downloadMock().mockResolvedValue(undefined);
    render(<Harness providers={makeProviders(download)} />);

    fireEvent.click(screen.getByText('request-outside-folder'));

    const notice = await screen.findByRole('status');
    expect(notice.textContent).toContain(OUTSIDE_FOLDER);
    expect(screen.queryByRole('button', { name: 'Download it instead' })).toBeNull();
  });

  it('offers no download when the source cannot download', async () => {
    render(<Harness providers={makeProviders()} />);

    fireEvent.click(screen.getByText('request-outside-file'));

    const notice = await screen.findByRole('status');
    expect(notice.textContent).toContain(OUTSIDE_FILE);
    expect(screen.queryByRole('button', { name: 'Download it instead' })).toBeNull();
  });

  it('goes away with the notice when the source changes', async () => {
    const download = downloadMock().mockResolvedValue(undefined);
    render(<Harness providers={makeProviders(download)} />);

    fireEvent.click(screen.getByText('request-outside-file'));
    await screen.findByRole('button', { name: 'Download it instead' });

    fireEvent.click(screen.getByText('switch-source'));
    await waitFor(() => {
      expect(screen.queryByRole('status')).toBeNull();
    });
    expect(screen.queryByRole('button', { name: 'Download it instead' })).toBeNull();
  });
});
