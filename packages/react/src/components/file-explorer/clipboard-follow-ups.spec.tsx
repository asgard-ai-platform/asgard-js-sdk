// @vitest-environment jsdom
import { ReactNode, useEffect, useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useFileExplorerController } from '../../hooks/use-file-explorer-controller';
import { Clipboard, FileExplorerProvider, useFileExplorer } from './file-explorer-context';
import { FileExplorerRoot, FileExplorerWorkspace } from './file-explorer-parts';
import styles from './file-explorer-panel.module.scss';
import { FsEntry, FsListResult, FsProviders, FsSource } from './types';

/**
 * Issue #482 items 2–4: edges #480 left when it tied the clipboard to a source. `setClipboard` changed identity
 * on every source switch, a switch and a set in one handler credited the old source, and a cut stayed dimmed in a
 * source that could no longer move it.
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
const WRITABLE: FsProviders = { listDir, copy: noop, move: noop };

/** Every `setClipboard` the context has handed out, and every clipboard it has exposed, in render order. */
const seen: { setters: unknown[]; clipboards: Clipboard[] } = { setters: [], clipboards: [] };

function Probe({ select }: { select: (id: string) => void }): ReactNode {
  const { setClipboard, clipboard, canPaste } = useFileExplorer();
  const [effectRuns, setEffectRuns] = useState(0);

  seen.setters.push(setClipboard);
  seen.clipboards.push(clipboard);

  // A host effect keyed on `setClipboard` — the pattern item 2 breaks.
  useEffect(() => {
    setEffectRuns(n => n + 1);
  }, [setClipboard]);

  return (
    <div>
      <button type="button" onClick={() => select(A.id)}>
        to-a
      </button>
      <button type="button" onClick={() => select(B.id)}>
        to-b
      </button>
      <button type="button" onClick={() => setClipboard({ op: 'cut', entry: FILE })}>
        cut
      </button>
      <button type="button" onClick={() => setClipboard(OWN)}>
        cut-own
      </button>
      <button
        type="button"
        onClick={() => {
          select(B.id);
          setClipboard({ op: 'cut', entry: FILE });
        }}
      >
        to-b-and-cut
      </button>
      <output data-testid="source">{clipboard?.sourceId ?? '-'}</output>
      <output data-testid="can-paste">{String(canPaste)}</output>
      <output data-testid="effect-runs">{effectRuns}</output>
    </div>
  );
}

const OWN: Clipboard = { op: 'cut', entry: FILE, sourceId: A.id };

function Harness({ providersFor }: { providersFor?: (id: string | null) => FsProviders }): ReactNode {
  const controller = useFileExplorerController({ activeSourceId: A.id });
  const providers = providersFor ? providersFor(controller.activeSourceId) : WRITABLE;

  return (
    <FileExplorerProvider sources={[A, B]} controller={controller} providers={providers}>
      <FileExplorerRoot>
        <Probe select={controller.selectSource} />
        <FileExplorerWorkspace />
      </FileExplorerRoot>
    </FileExplorerProvider>
  );
}

function reset(): void {
  seen.setters = [];
  seen.clipboards = [];
}

const text = (id: string): string => screen.getByTestId(id).textContent ?? '';

describe('#482 item 2 — setClipboard is a stable reference', () => {
  it('keeps the same function across a source switch, so a host effect on it does not re-run', async () => {
    reset();
    render(<Harness />);
    await waitFor(() => expect(text('effect-runs')).toBe('1'));

    fireEvent.click(screen.getByText('to-b'));
    fireEvent.click(screen.getByText('to-a'));

    await waitFor(() => expect(new Set(seen.setters).size).toBe(1));
    expect(text('effect-runs')).toBe('1');
  });

  it('exposes the very object a host set when it carries its own sourceId', async () => {
    reset();
    render(<Harness />);

    fireEvent.click(screen.getByText('cut-own'));

    await waitFor(() => expect(text('source')).toBe('a'));
    expect(seen.clipboards[seen.clipboards.length - 1]).toBe(OWN);
  });
});

describe('#482 item 3 — the clipboard goes to the source the host means', () => {
  it('credits the new source when one handler switches and then sets', async () => {
    reset();
    render(<Harness />);

    fireEvent.click(screen.getByText('to-b-and-cut'));

    await waitFor(() => expect(text('source')).toBe('b'));
    expect(text('can-paste')).toBe('true');
  });

  it('keeps the source a set happened in when the switch comes later', async () => {
    reset();
    render(<Harness />);

    fireEvent.click(screen.getByText('cut'));
    await waitFor(() => expect(text('source')).toBe('a'));

    fireEvent.click(screen.getByText('to-b'));
    await waitFor(() => expect(text('can-paste')).toBe('false'));
    expect(text('source')).toBe('a');

    fireEvent.click(screen.getByText('to-a'));
    await waitFor(() => expect(text('can-paste')).toBe('true'));
  });
});

/** The tree row for `a.txt`. */
async function fileRow(): Promise<HTMLElement> {
  const label = await screen.findByText('a.txt');
  const row = label.closest(`.${styles.node}`);

  if (!(row instanceof HTMLElement)) throw new Error('a.txt row not found');

  return row;
}

describe('#482 item 4 — the cut dimming follows move', () => {
  it('dims a cut entry while its source can move it', async () => {
    reset();
    render(<Harness />);

    fireEvent.click(screen.getByText('cut'));

    await waitFor(async () => expect((await fileRow()).classList.contains(styles.cut)).toBe(true));
  });

  it('does not dim it once the same source drops move', async () => {
    reset();
    // Same source, no switch: the host takes `move` away while A stays active.
    function DroppingMove(): ReactNode {
      const [canMove, setCanMove] = useState(true);
      const controller = useFileExplorerController({ activeSourceId: A.id });

      return (
        <FileExplorerProvider
          sources={[A, B]}
          controller={controller}
          providers={canMove ? WRITABLE : { listDir, copy: noop }}
        >
          <FileExplorerRoot>
            <button type="button" onClick={() => setCanMove(false)}>
              drop-move
            </button>
            <Probe select={controller.selectSource} />
            <FileExplorerWorkspace />
          </FileExplorerRoot>
        </FileExplorerProvider>
      );
    }

    render(<DroppingMove />);
    fireEvent.click(screen.getByText('cut'));
    await waitFor(async () => expect((await fileRow()).classList.contains(styles.cut)).toBe(true));

    fireEvent.click(screen.getByText('drop-move'));

    await waitFor(async () => expect((await fileRow()).classList.contains(styles.cut)).toBe(false));
    expect(text('can-paste')).toBe('false');
  });
});
