// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { t } from '../../i18n';
import { SourceSetFileExplorer } from './source-set-file-explorer';

/**
 * BUG-008 — the SourceSet explorer's batch upload, driven through a fake volume at the `fetch` boundary
 * so the real `AsgardSourceSetClient` runs and the wire-level parts this bug is about (`create_only`
 * answering 409, the `signal` a cancel rides on) are exercised as they ship.
 *
 * The volume here can hold a write open, which is what makes the pool observable at all: a volume that
 * answers instantly never has two requests in flight, so every concurrency claim would pass vacuously.
 */

const ENDPOINT = 'https://volume.test/v1/source-set/abc/volume';

interface WriteRecord {
  path: string;
  createOnly: boolean;
  signal: AbortSignal | null;
}

interface VolumeConfig {
  /** Existing paths — a `create_only` write to one answers 409. */
  existing?: string[];
  /** Root-level file names the listing reports, for the cases that need something to open. */
  entries?: string[];
  /** Path → statuses to answer before finally succeeding, e.g. `{ 'a.txt': [429] }`. */
  failFirst?: Record<string, number[]>;
  /** Park every write until `release()`; the batch then stays running for as long as the test needs. */
  hold?: boolean;
}

interface VolumeProbe {
  writes: WriteRecord[];
  mkdirs: string[];
  listed: () => string[];
  /** How many writes are open right now, and the high-water mark across the whole run. */
  inFlight: () => number;
  peakInFlight: () => number;
  release: () => void;
}

function installVolume(config: VolumeConfig = {}): VolumeProbe {
  const writes: WriteRecord[] = [];
  const mkdirs: string[] = [];
  const lists: string[] = [];
  const existing = new Set(config.existing ?? []);
  const remainingFailures: Record<string, number[]> = Object.fromEntries(
    Object.entries(config.failFirst ?? {}).map(([path, statuses]) => [path, [...statuses]]),
  );

  let open = 0;
  let peak = 0;
  let releaseAll = (): void => undefined;
  const held = new Promise<void>(resolve => {
    releaseAll = resolve;
  });

  const fetchMock = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input));
    const op = url.pathname.split('/').pop() ?? '';
    const method = init?.method ?? 'GET';
    const path = url.searchParams.get('path') ?? '';

    if (op === 'list') {
      lists.push(path);
      const names = path === '' ? config.entries ?? [] : [];
      const entries = names.map(name => ({ name, isDir: false, sizeBytes: 3, mtimeUnix: 0, mode: 420 }));

      return Response.json({ data: { entries, paging: { index: 0, size: 1000, total: entries.length } } });
    }

    if (op === 'mkdir') {
      mkdirs.push(path);

      return Response.json({ data: {} });
    }

    if (op === 'file' && method === 'GET') return new Response('hi', { headers: { 'X-Total-Bytes': '2' } });

    if (op === 'file' && method === 'PUT') {
      const createOnly = url.searchParams.get('create_only') === 'true';
      const signal = init?.signal ?? null;
      writes.push({ path, createOnly, signal });

      open += 1;
      peak = Math.max(peak, open);

      try {
        if (config.hold) {
          // Reject the way a real aborted `fetch` does, so cancelling actually settles the worker
          // instead of parking it forever.
          await Promise.race([
            held,
            new Promise<never>((_, reject) => {
              if (!signal) return;

              if (signal.aborted) {
                reject(new DOMException('Aborted', 'AbortError'));

                return;
              }

              signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), {
                once: true,
              });
            }),
          ]);
        }

        const forced = remainingFailures[path]?.shift();
        if (forced) return new Response('{"message":"nope"}', { status: forced, statusText: 'Error' });

        if (createOnly && existing.has(path)) {
          return new Response('{"message":"exists"}', { status: 409, statusText: 'Conflict' });
        }

        existing.add(path);

        return Response.json({ data: { bytesWritten: 1 } });
      } finally {
        open -= 1;
      }
    }

    return Response.json({ data: {} });
  };

  vi.stubGlobal('fetch', fetchMock);

  return {
    writes,
    mkdirs,
    listed: () => [...lists],
    inFlight: () => open,
    peakInFlight: () => peak,
    release: () => releaseAll(),
  };
}

/** Give an input the browser's own live-`FileList` behavior (see `upload-picked-live-filelist.spec.tsx`). */
function makeLive(input: HTMLInputElement, files: File[]): void {
  const live = [...files];

  Object.defineProperty(input, 'files', { configurable: true, get: () => live as unknown as FileList });
  Object.defineProperty(input, 'value', { configurable: true, get: () => '', set: () => void (live.length = 0) });
}

function named(name: string, relativePath?: string): File {
  const file = new File(['x'], name);
  if (relativePath) Object.defineProperty(file, 'webkitRelativePath', { value: relativePath });

  return file;
}

/** The two hidden pickers, in render order: multi-file first, then the `webkitdirectory` one. */
function pickers(container: HTMLElement): { files: HTMLInputElement; folder: HTMLInputElement } {
  const inputs = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="file"]'));
  if (inputs.length < 2) throw new Error(`expected two file inputs, found ${inputs.length}`);

  return { files: inputs[0], folder: inputs[1] };
}

function openUploadMenu(): void {
  fireEvent.click(screen.getByLabelText(t('en-US', 'sourceSetExplorer.upload')));
}

/** Choose one of the two upload entries and hand the picker its files. */
async function uploadThrough(container: HTMLElement, which: 'files' | 'folder', files: File[]): Promise<void> {
  openUploadMenu();
  fireEvent.click(
    await screen.findByText(
      t('en-US', which === 'files' ? 'sourceSetExplorer.uploadFiles' : 'sourceSetExplorer.uploadFolder'),
    ),
  );

  const input = pickers(container)[which];
  makeLive(input, files);
  fireEvent.change(input);
}

function progressPanel(): HTMLElement {
  return screen.getByRole('region', { name: t('en-US', 'sourceSetExplorer.uploadProgress') });
}

async function mounted(): Promise<HTMLElement> {
  return screen.findByText(t('en-US', 'sourceSetExplorer.emptyDir'));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('BUG-008 R1 — the upload action asks "files or folder?"', () => {
  it('opens a two-item menu instead of a picker, and mounts a webkitdirectory input for the second', async () => {
    const { container } = installAndRender();
    await mounted();

    openUploadMenu();

    const menu = await screen.findByRole('menu');
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map(item => item.textContent),
    ).toEqual([t('en-US', 'sourceSetExplorer.uploadFiles'), t('en-US', 'sourceSetExplorer.uploadFolder')]);

    // The capability difference is the whole reason there are two entries: a `webkitdirectory` pick
    // reaches every file in a tree, and a plain pick sees no folders at all.
    const { files, folder } = pickers(container);
    expect(Boolean(files.webkitdirectory)).toBe(false);
    expect(folder.webkitdirectory).toBe(true);
  });

  it('offers neither entry while readOnly', async () => {
    installVolume();
    render(<SourceSetFileExplorer sourceSetEndpoint={ENDPOINT} apiKey="k" readOnly />);
    await mounted();

    expect(screen.queryByLabelText(t('en-US', 'sourceSetExplorer.upload'))).toBeNull();
  });

  it('refuses a file drag while readOnly instead of claiming it', async () => {
    const probe = installVolume();
    render(<SourceSetFileExplorer sourceSetEndpoint={ENDPOINT} apiKey="k" readOnly />);
    await mounted();

    // Hiding the toolbar entry is not enough: a claimed drop would still upload, and a claimed drag
    // would still take the gesture away from whatever page hosts this panel.
    const over = fireEvent.dragOver(rootOf(), { dataTransfer: fileDrag([]) });
    fireEvent.drop(rootOf(), { dataTransfer: fileDrag([entryFor('a.txt')]) });

    await new Promise(resolve => setTimeout(resolve, 0));
    expect(over).toBe(true); // fireEvent returns false only when the handler called preventDefault
    expect(screen.queryByText(t('en-US', 'sourceSetExplorer.dropToUpload', { dir: '/' }))).toBeNull();
    expect(probe.writes).toEqual([]);
  });

  it('refuses a drag while a file is open, where there is no tree to drop onto', async () => {
    const probe = installVolume({ entries: ['a.txt'] });
    render(<SourceSetFileExplorer sourceSetEndpoint={ENDPOINT} apiKey="k" />);

    fireEvent.doubleClick(await screen.findByText('a.txt'));
    await screen.findByTitle(t('en-US', 'sourceSetExplorer.backToTree'));

    fireEvent.drop(rootOf(), { dataTransfer: fileDrag([entryFor('b.txt')]) });

    await new Promise(resolve => setTimeout(resolve, 0));
    expect(probe.writes).toEqual([]);
  });
});

describe('BUG-008 R2 — a folder upload keeps its shape without pre-creating levels', () => {
  it('writes each file at its relative path and issues no mkdir for the intermediate directories', async () => {
    const probe = installVolume();
    const { container } = renderExplorer();
    await mounted();

    await uploadThrough(container, 'folder', [named('a.txt', 'docs/a.txt'), named('b.md', 'docs/sub/b.md')]);

    await waitFor(() => expect(probe.writes).toHaveLength(2));
    expect(probe.writes.map(w => w.path)).toEqual(['docs/a.txt', 'docs/sub/b.md']);
    // `PUT volume/file` creates the parents itself; a mkdir per level would be one extra round trip
    // per level per file.
    expect(probe.mkdirs).toEqual([]);
  });

  it('warns that the folder picker could not see empty folders', async () => {
    installVolume();
    const { container } = renderExplorer();
    await mounted();

    await uploadThrough(container, 'folder', [named('a.txt', 'docs/a.txt')]);

    expect(await screen.findByText(t('en-US', 'sourceSetExplorer.uploadEmptyDirsHint'))).toBeTruthy();
  });
});

describe('BUG-008 R3 — progress is a count and a list, not a spinner', () => {
  it('reports n / N and names what failed, and retries only the failures', async () => {
    const probe = installVolume({ failFirst: { 'b.txt': [403] } });
    const { container } = renderExplorer();
    await mounted();

    await uploadThrough(container, 'files', [named('a.txt'), named('b.txt'), named('c.txt')]);

    await waitFor(() => expect(progressPanel().textContent).toContain('2 / 3'));

    const panel = progressPanel();
    expect(panel.textContent).toContain(t('en-US', 'sourceSetExplorer.uploadDoneWithFailures'));
    expect(panel.textContent).toContain('b.txt');
    expect(panel.textContent).toContain(t('en-US', 'sourceSetExplorer.uploadForbidden'));
    // Everything that succeeded is already visible in the tree; the list is for what still needs a
    // decision, so `a.txt` and `c.txt` are deliberately absent from it.
    expect(within(panel).queryByText('a.txt')).toBeNull();

    probe.writes.length = 0;
    fireEvent.click(screen.getByText(t('en-US', 'sourceSetExplorer.uploadRetry', { count: '1' })));

    await waitFor(() => expect(progressPanel().textContent).toContain('3 / 3'));
    expect(probe.writes.map(w => w.path)).toEqual(['b.txt']);
  });
});

describe('BUG-008 R4 — a worker pool, never all at once', () => {
  it('keeps at most `uploadConcurrency` writes in flight', async () => {
    const probe = installVolume({ hold: true });
    const { container } = renderExplorer({ uploadConcurrency: 2 });
    await mounted();

    await uploadThrough(
      container,
      'files',
      ['a', 'b', 'c', 'd', 'e', 'f'].map(n => named(`${n}.txt`)),
    );

    await waitFor(() => expect(probe.inFlight()).toBe(2));
    // Settle every pending microtask so a pool that dispatched more would have shown it by now.
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(probe.inFlight()).toBe(2);
    expect(probe.writes).toHaveLength(2);

    probe.release();
    await waitFor(() => expect(progressPanel().textContent).toContain('6 / 6'));
    expect(probe.peakInFlight()).toBeLessThanOrEqual(2);
  });

  it('says so when the volume pushes back and the ceiling comes down', async () => {
    const probe = installVolume({ hold: true, failFirst: { 'a.txt': [429] } });
    const { container } = renderExplorer({ uploadConcurrency: 3 });
    await mounted();

    await uploadThrough(
      container,
      'files',
      ['a', 'b', 'c', 'd'].map(n => named(`${n}.txt`)),
    );

    // Release only the first round; `a.txt` comes back 429, which halves the ceiling while the other
    // two are still open — silence here reads as "why is this so slow".
    await waitFor(() => expect(probe.writes).toHaveLength(3));
    probe.release();

    expect(
      await screen.findByText(t('en-US', 'sourceSetExplorer.uploadThrottled', { limit: '1', max: '3' })),
    ).toBeTruthy();
  });
});

describe('BUG-008 R5 — cancel reaches the requests already in flight', () => {
  it('aborts the open writes, dispatches no more, and keeps what was already written', async () => {
    const probe = installVolume({ hold: true });
    const { container } = renderExplorer({ uploadConcurrency: 2 });
    await mounted();

    await uploadThrough(
      container,
      'files',
      ['a', 'b', 'c', 'd'].map(n => named(`${n}.txt`)),
    );
    await waitFor(() => expect(probe.writes).toHaveLength(2));

    const openSignals = probe.writes.map(w => w.signal);
    // Reported per signal rather than as one boolean: "expected false to be true" cannot tell a missing
    // signal from an already-aborted one, and those have completely different causes.
    expect(openSignals.map(signal => (signal === null ? 'missing' : signal.aborted ? 'aborted' : 'open'))).toEqual([
      'open',
      'open',
    ]);

    fireEvent.click(screen.getByText(t('en-US', 'sourceSetExplorer.cancel')));

    await waitFor(() => expect(progressPanel().textContent).toContain(t('en-US', 'sourceSetExplorer.uploadCancelled')));
    expect(openSignals.every(signal => signal?.aborted)).toBe(true);
    // The two that were never dispatched stay that way; nothing already written is rolled back.
    expect(probe.writes).toHaveLength(2);
  });
});

describe('BUG-008 R6 — a collision is asked about, and only stops that file', () => {
  it('asks once at a time and finishes the rest of the batch', async () => {
    const probe = installVolume({ existing: ['a.txt', 'b.txt'] });
    const { container } = renderExplorer({ uploadConcurrency: 3 });
    await mounted();

    await uploadThrough(container, 'files', [named('a.txt'), named('b.txt'), named('c.txt')]);

    await screen.findByRole('dialog');
    // Two files collide under a pool of three. Asking both at once would let the second resolver
    // overwrite the first, parking that worker forever.
    expect(screen.getAllByRole('dialog')).toHaveLength(1);

    fireEvent.click(screen.getByText(t('en-US', 'sourceSetExplorer.uploadKeepBoth')));
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByText(t('en-US', 'sourceSetExplorer.uploadSkip')));

    await waitFor(() => expect(progressPanel().textContent).toContain('2 / 3'));

    const paths = probe.writes.map(w => w.path);
    // Keep both renames and stays `create_only`: renaming is not permission to overwrite whatever
    // happens to sit at the new name either.
    expect(paths).toContain('a (2).txt');
    expect(probe.writes.every(w => w.createOnly)).toBe(true);
    expect(paths).toContain('c.txt');
    expect(progressPanel().textContent).toContain(t('en-US', 'sourceSetExplorer.uploadExistsSkipped'));
  });

  it('applies one answer to the rest instead of asking two hundred times', async () => {
    const probe = installVolume({ existing: ['a.txt', 'b.txt', 'c.txt'] });
    const { container } = renderExplorer({ uploadConcurrency: 1 });
    await mounted();

    await uploadThrough(container, 'files', [named('a.txt'), named('b.txt'), named('c.txt')]);

    await screen.findByRole('dialog');
    fireEvent.click(screen.getByText(t('en-US', 'sourceSetExplorer.uploadAllOverwrite')));

    await waitFor(() => expect(progressPanel().textContent).toContain('3 / 3'));
    expect(screen.queryByRole('dialog')).toBeNull();
    // One `create_only` attempt each, then the overwrite retry — and no second question.
    expect(probe.writes.filter(w => !w.createOnly).map(w => w.path)).toEqual(['a.txt', 'b.txt', 'c.txt']);
  });
});

describe('BUG-008 R7 — files dragged in from the desktop', () => {
  it('recurses a dropped directory, reading entries until the reader returns an empty batch', async () => {
    const probe = installVolume();
    renderExplorer();
    await mounted();

    // Chromium hands back one batch of 100 at a time and signals the end with an empty array. Reading
    // once looks like it works and silently drops everything past the first batch.
    const batches = [[entryFor('a.txt'), entryFor('b.txt')], [entryFor('c.txt')], []];
    const directory = {
      isFile: false,
      isDirectory: true,
      name: 'docs',
      createReader: (): { readEntries: (onDone: (entries: unknown[]) => void) => void } => ({
        readEntries: (onDone: (entries: unknown[]) => void): void => onDone(batches.shift() ?? []),
      }),
    };

    fireEvent.drop(rootOf(), { dataTransfer: fileDrag([directory]) });

    await waitFor(() => expect(probe.writes).toHaveLength(3));
    expect(probe.writes.map(w => w.path)).toEqual(['docs/a.txt', 'docs/b.txt', 'docs/c.txt']);
  });

  it('highlights on drag over and lets a drag it cannot serve pass through', async () => {
    installVolume();
    renderExplorer();
    await mounted();

    fireEvent.dragEnter(rootOf(), { dataTransfer: fileDrag([]) });
    expect(await screen.findByText(t('en-US', 'sourceSetExplorer.dropToUpload', { dir: '/' }))).toBeTruthy();

    fireEvent.dragLeave(rootOf(), { dataTransfer: fileDrag([]) });
    await waitFor(() =>
      expect(screen.queryByText(t('en-US', 'sourceSetExplorer.dropToUpload', { dir: '/' }))).toBeNull(),
    );

    // A text drag is somebody else's business; claiming it would take the drop away from the host page.
    const text = { types: ['text/plain'], items: [], files: [] } as unknown as DataTransfer;
    const dragOver = new Event('dragover', { bubbles: true, cancelable: true });
    Object.defineProperty(dragOver, 'dataTransfer', { value: text });
    rootOf().dispatchEvent(dragOver);

    expect(dragOver.defaultPrevented).toBe(false);
  });
});

describe('BUG-008 R8 — one refresh for the whole batch', () => {
  it('re-lists the destination once, not once per file', async () => {
    const probe = installVolume();
    const { container } = renderExplorer();
    await mounted();

    const before = probe.listed().length;
    await uploadThrough(
      container,
      'files',
      ['a', 'b', 'c', 'd'].map(n => named(`${n}.txt`)),
    );

    await waitFor(() => expect(progressPanel().textContent).toContain('4 / 4'));
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(probe.listed().slice(before)).toEqual(['']);
  });
});

// --- helpers that need the component ---

function renderExplorer(props?: { uploadConcurrency?: number }): { container: HTMLElement } {
  const { container } = render(
    <SourceSetFileExplorer sourceSetEndpoint={ENDPOINT} apiKey="k" uploadConcurrency={props?.uploadConcurrency} />,
  );

  return { container };
}

function installAndRender(): { container: HTMLElement } {
  installVolume();

  return renderExplorer();
}

/** The panel root — the drop zone is the whole panel, not the tree alone. */
function rootOf(): HTMLElement {
  const root = screen.getByRole('toolbar').parentElement;
  if (!root) throw new Error('the panel root is missing');

  return root;
}

function entryFor(name: string): unknown {
  return {
    isFile: true,
    isDirectory: false,
    name,
    file: (onDone: (file: File) => void) => onDone(named(name)),
  };
}

function fileDrag(roots: unknown[]): DataTransfer {
  return {
    types: ['Files'],
    items: roots.map(entry => ({ kind: 'file', webkitGetAsEntry: () => entry })),
    files: [],
  } as unknown as DataTransfer;
}
