// @vitest-environment jsdom
import { ReactNode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import { useFileExplorerController, type FileExplorerController } from '../../hooks/use-file-explorer-controller';
import { FileExplorerProvider, useFileExplorer } from './file-explorer-context';
import { FileExplorerRoot, FileExplorerWorkspace } from './file-explorer-parts';
import { FsListResult, FsSource } from './types';

/**
 * F-034 AC4 / AC5 / AC7 + UC-060 / UC-061 — where a reveal request lands.
 *
 * The destination is decided by the request's `kind`, which comes from the card's own uri action. The
 * alternative these tests exist to forbid is "open it as a file, and fall back to a folder if that fails":
 * the backend answers `500` for `fs/file` on a directory and drops the `fs/watch` connection, so the
 * fallback path cannot work — it was the 2026-09-09 agent-hub incident.
 *
 * A path outside the tree root gets neither treatment: nothing is expanded, nothing selected, no fs call
 * goes out, and the panel says so instead of going quiet.
 */

const SOURCE: FsSource = { id: 'sbx-1', label: 'Sandbox A', rootPath: '/work' };
const OTHER: FsSource = { id: 'sbx-2', label: 'Sandbox B', rootPath: '/elsewhere' };

const FOLDER = '/work/out/archive';
const FILE = '/work/out/report.md';
/** Outside the root, and a prefix match on it — `/work` must not swallow `/workspace/...`. */
const OUTSIDE = '/workspace/other/file.txt';

afterEach(() => {
  cleanup();
});

type MockProviders = {
  listDir: Mock<[], Promise<FsListResult>>;
  readFile: Mock<[], Promise<string>>;
  watchFile: Mock<[], () => void>;
};

function makeProviders(): MockProviders {
  return {
    listDir: vi.fn(async (): Promise<FsListResult> => ({ entries: [], truncated: false })),
    readFile: vi.fn(async (): Promise<string> => ''),
    watchFile: vi.fn((): (() => void) => () => undefined),
  };
}

/** Reports the view the provider resolved to, and drives the two reveal entries. */
function Probe(): ReactNode {
  const { expanded, selectedPath, selectedEntry, openFile, outOfRoot, controller } = useFileExplorer();

  return (
    <>
      <div data-testid="expanded">{[...expanded].sort().join(',') || 'none'}</div>
      <div data-testid="selected">{selectedPath ?? 'none'}</div>
      <div data-testid="selected-is-dir">{selectedEntry ? String(selectedEntry.isDir) : 'none'}</div>
      <div data-testid="open">{openFile?.path ?? 'none'}</div>
      <div data-testid="out-of-root">{outOfRoot ?? 'none'}</div>
      <button type="button" onClick={() => controller.requestFolder(SOURCE.id, FOLDER)}>
        request-folder
      </button>
      <button type="button" onClick={() => controller.requestFile(SOURCE.id, FILE)}>
        request-file
      </button>
      <button type="button" onClick={() => controller.requestFolder(SOURCE.id, OUTSIDE)}>
        request-outside
      </button>
      <button type="button" onClick={() => controller.selectSource(OTHER.id)}>
        switch-source
      </button>
      <button type="button" onClick={() => controller.selectSource(SOURCE.id)}>
        back-to-source
      </button>
    </>
  );
}

function Harness({ providers }: { providers: MockProviders }): ReactNode {
  const controller = useFileExplorerController();

  return (
    <FileExplorerProvider sources={[SOURCE, OTHER]} controller={controller} providers={providers}>
      <FileExplorerRoot>
        <Probe />
        <FileExplorerWorkspace />
      </FileExplorerRoot>
    </FileExplorerProvider>
  );
}

/** The controller alone, with no panel: what `requestFile` / `requestFolder` actually publish. */
function ControllerHarness({ onRender }: { onRender: (controller: FileExplorerController) => void }): ReactNode {
  const controller = useFileExplorerController();
  onRender(controller);

  return (
    <>
      <button type="button" onClick={() => controller.requestFolder(SOURCE.id, FOLDER)}>
        c-folder
      </button>
      <button type="button" onClick={() => controller.requestFile(SOURCE.id, FILE, { reveal: false })}>
        c-file-quiet
      </button>
    </>
  );
}

describe('controller reveal requests (F-034 AC3)', () => {
  it('stamps the kind the caller asked for, and keeps the reveal option on both', () => {
    const seen: { current: FileExplorerController | null } = { current: null };
    render(<ControllerHarness onRender={c => (seen.current = c)} />);

    fireEvent.click(screen.getByText('c-folder'));
    expect(seen.current?.requestedFile).toMatchObject({ kind: 'folder', sourceId: SOURCE.id, absolutePath: FOLDER });
    expect(seen.current?.open).toBe(true);

    fireEvent.click(screen.getByText('c-file-quiet'));
    expect(seen.current?.requestedFile).toMatchObject({ kind: 'file', sourceId: SOURCE.id, absolutePath: FILE });
  });

  it('bumps the nonce so the same folder can be requested twice', () => {
    const seen: { current: FileExplorerController | null } = { current: null };
    render(<ControllerHarness onRender={c => (seen.current = c)} />);

    fireEvent.click(screen.getByText('c-folder'));
    const first = seen.current?.requestedFile?.nonce;
    fireEvent.click(screen.getByText('c-folder'));

    expect(seen.current?.requestedFile?.nonce).toBeGreaterThan(first ?? 0);
  });
});

describe('folder reveal (F-034 AC4 / UC-060)', () => {
  it('expands the ancestors and the directory itself, and selects it as a directory', async () => {
    const providers = makeProviders();
    render(<Harness providers={providers} />);

    fireEvent.click(screen.getByText('request-folder'));

    await waitFor(() => {
      expect(screen.getByTestId('selected').textContent).toBe(FOLDER);
    });
    // `/work` is the root and is never listed; `/work/out` is the ancestor, `FOLDER` is the target — and the
    // target is expanded too, because what the user asked for is to see inside it, not to see it.
    expect(screen.getByTestId('expanded').textContent).toBe(`/work/out,${FOLDER}`);
    expect(screen.getByTestId('selected-is-dir').textContent).toBe('true');
  });

  it('stays on the tree: no file is opened, and neither readFile nor watchFile is called', async () => {
    const providers = makeProviders();
    const { readFile, watchFile } = providers;
    render(<Harness providers={providers} />);

    fireEvent.click(screen.getByText('request-folder'));

    await waitFor(() => {
      expect(screen.getByTestId('selected').textContent).toBe(FOLDER);
    });
    expect(screen.getByTestId('open').textContent).toBe('none');
    expect(readFile).not.toHaveBeenCalled();
    expect(watchFile).not.toHaveBeenCalled();
  });

  it('closes a FileView that was covering the tree', async () => {
    const providers = makeProviders();
    render(<Harness providers={providers} />);

    fireEvent.click(screen.getByText('request-file'));
    await waitFor(() => {
      expect(screen.getByTestId('open').textContent).toBe(FILE);
    });

    fireEvent.click(screen.getByText('request-folder'));
    await waitFor(() => {
      expect(screen.getByTestId('open').textContent).toBe('none');
    });
  });

  it('still routes a file request into the viewer', async () => {
    const providers = makeProviders();
    render(<Harness providers={providers} />);

    fireEvent.click(screen.getByText('request-file'));

    await waitFor(() => {
      expect(screen.getByTestId('open').textContent).toBe(FILE);
    });
    expect(screen.getByTestId('selected-is-dir').textContent).toBe('false');
    expect(screen.getByTestId('expanded').textContent).toBe('/work/out');
  });
});

describe('folder reveal survives a source round trip (F-034 AC9 / F-027)', () => {
  it('keeps the unfolded directories and the selection when you leave and come back', async () => {
    const providers = makeProviders();
    render(<Harness providers={providers} />);

    fireEvent.click(screen.getByText('request-folder'));
    await waitFor(() => expect(screen.getByTestId('selected').textContent).toBe(FOLDER));

    fireEvent.click(screen.getByText('switch-source'));
    await waitFor(() => expect(screen.getByTestId('expanded').textContent).toBe('none'));

    fireEvent.click(screen.getByText('back-to-source'));
    await waitFor(() => {
      expect(screen.getByTestId('expanded').textContent).toBe(`/work/out,${FOLDER}`);
    });
    expect(screen.getByTestId('selected').textContent).toBe(FOLDER);
    expect(screen.getByTestId('selected-is-dir').textContent).toBe('true');
  });
});

describe('out-of-root reveal (F-034 AC7 / UC-061)', () => {
  it('expands nothing, selects nothing, and issues no fs request', async () => {
    const providers = makeProviders();
    const { listDir, readFile, watchFile } = providers;
    render(<Harness providers={providers} />);

    // The root level lists on mount; only calls caused by the reveal itself are of interest.
    await waitFor(() => expect(listDir).toHaveBeenCalled());
    const listCallsBefore = listDir.mock.calls.length;

    fireEvent.click(screen.getByText('request-outside'));

    await waitFor(() => {
      expect(screen.getByTestId('out-of-root').textContent).toBe(OUTSIDE);
    });
    expect(screen.getByTestId('expanded').textContent).toBe('none');
    expect(screen.getByTestId('selected').textContent).toBe('none');
    expect(screen.getByTestId('open').textContent).toBe('none');
    expect(listDir.mock.calls.length).toBe(listCallsBefore);
    expect(readFile).not.toHaveBeenCalled();
    expect(watchFile).not.toHaveBeenCalled();
  });

  it('names the path in a dismissible notice', async () => {
    const providers = makeProviders();
    render(<Harness providers={providers} />);

    fireEvent.click(screen.getByText('request-outside'));

    const notice = await screen.findByRole('status');
    expect(notice.textContent).toContain(OUTSIDE);

    fireEvent.click(screen.getByLabelText('Dismiss notice'));
    await waitFor(() => {
      expect(screen.queryByRole('status')).toBeNull();
    });
  });

  it('keeps what the user was looking at', async () => {
    const providers = makeProviders();
    render(<Harness providers={providers} />);

    fireEvent.click(screen.getByText('request-file'));
    await waitFor(() => expect(screen.getByTestId('open').textContent).toBe(FILE));

    fireEvent.click(screen.getByText('request-outside'));
    await waitFor(() => expect(screen.getByTestId('out-of-root').textContent).toBe(OUTSIDE));

    expect(screen.getByTestId('open').textContent).toBe(FILE);
    expect(screen.getByTestId('selected').textContent).toBe(FILE);
    expect(screen.getByTestId('expanded').textContent).toBe('/work/out');
  });

  it('clears the notice when the source changes', async () => {
    const providers = makeProviders();
    render(<Harness providers={providers} />);

    fireEvent.click(screen.getByText('request-outside'));
    await waitFor(() => expect(screen.getByTestId('out-of-root').textContent).toBe(OUTSIDE));

    fireEvent.click(screen.getByText('switch-source'));
    await waitFor(() => {
      expect(screen.getByTestId('out-of-root').textContent).toBe('none');
    });
  });

  it('clears the notice when a later in-root reveal arrives', async () => {
    const providers = makeProviders();
    render(<Harness providers={providers} />);

    fireEvent.click(screen.getByText('request-outside'));
    await waitFor(() => expect(screen.getByTestId('out-of-root').textContent).toBe(OUTSIDE));

    fireEvent.click(screen.getByText('request-folder'));
    await waitFor(() => {
      expect(screen.getByTestId('out-of-root').textContent).toBe('none');
    });
    expect(screen.getByTestId('selected').textContent).toBe(FOLDER);
  });
});
