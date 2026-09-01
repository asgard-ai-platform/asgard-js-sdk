// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { t } from '../../i18n';
import type { ContextMenuItem } from '../file-explorer';
import type { FsEntry } from '../file-explorer/types';
import { SourceSetFileExplorer } from './source-set-file-explorer';

/**
 * Behavior of the standalone SourceSet explorer, driven through a fake volume at the `fetch` boundary
 * rather than a mocked client — so the real `AsgardSourceSetClient` runs and the volume-relative path
 * rules, the paging walk and the 409 semantics are exercised exactly as they ship.
 */

const ENDPOINT = 'https://volume.test/v1/source-set/abc/volume';

interface VolumeEntry {
  name: string;
  isDir: boolean;
}

interface FakeVolume {
  /** Directory path (the root is `''`) → its entries. */
  dirs: Record<string, VolumeEntry[]>;
  files?: Record<string, string>;
  /** Force a status for one op, e.g. `{ list: 403 }`. */
  fail?: Record<string, number>;
  /** What the listing claims the directory holds; larger than what is served means a shortfall. */
  claimedTotal?: Record<string, number>;
  /** Answer without a `paging` block at all. */
  noPaging?: boolean;
}

interface VolumeProbe {
  /** Every request the component made, in order. */
  calls: { op: string; method: string; url: URL }[];
  listedPaths: () => string[];
}

const file = (name: string): VolumeEntry => ({ name, isDir: false });
const dir = (name: string): VolumeEntry => ({ name, isDir: true });

const wireEntry = (entry: VolumeEntry): Record<string, unknown> => ({
  name: entry.name,
  isDir: entry.isDir,
  sizeBytes: entry.isDir ? 0 : 3,
  mtimeUnix: 0,
  mode: 420,
});

function installVolume(volume: FakeVolume): VolumeProbe {
  const calls: { op: string; method: string; url: URL }[] = [];

  const fetchMock = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input));
    const op = url.pathname.split('/').pop() ?? '';
    const method = init?.method ?? 'GET';
    const path = url.searchParams.get('path') ?? '';
    calls.push({ op, method, url });

    const forced = volume.fail?.[op];
    if (forced) return new Response('{"message":"nope"}', { status: forced, statusText: 'Error' });

    if (op === 'list') {
      const all = volume.dirs[path] ?? [];
      const size = Number(url.searchParams.get('page_size') ?? '1000');
      const page = Number(url.searchParams.get('page') ?? '0');
      const body: Record<string, unknown> = {
        entries: all.slice(page * size, page * size + size).map(wireEntry),
      };
      if (!volume.noPaging) {
        body.paging = { index: page, size, total: volume.claimedTotal?.[path] ?? all.length };
      }

      return Response.json({ data: body });
    }

    if (op === 'file' && method === 'GET') {
      return new Response(volume.files?.[path] ?? '', { headers: { 'X-Total-Bytes': '3' } });
    }

    if (op === 'file') {
      // PUT — `create_only` turns an occupied path into a 409 rather than an overwrite.
      const occupied = volume.files?.[path] != null || volume.dirs[path] != null;
      if (url.searchParams.get('create_only') === 'true' && occupied) {
        return new Response('{"message":"exists"}', { status: 409, statusText: 'Conflict' });
      }

      return Response.json({ data: { bytesWritten: 0 } });
    }

    if (op === 'copy') return Response.json({ data: { bytesCopied: 0 } });

    return Response.json({ data: {} });
  };

  vi.stubGlobal('fetch', fetchMock);

  return {
    calls,
    listedPaths: () => calls.filter(c => c.op === 'list').map(c => c.url.searchParams.get('path') ?? ''),
  };
}

/** Toolbar button carrying `key`'s label, or `null` when the toolbar does not offer it. */
function toolButton(key: string, vars?: Record<string, string | number>): HTMLButtonElement | null {
  const toolbar = screen.getByRole('toolbar');
  const label = t('en-US', key, vars);

  return Array.from(toolbar.querySelectorAll('button')).find(b => b.getAttribute('aria-label') === label) ?? null;
}

function requireToolButton(key: string, vars?: Record<string, string | number>): HTMLButtonElement {
  const found = toolButton(key, vars);
  if (!found) throw new Error(`no toolbar button labelled ${key}`);

  return found;
}

function toolbarLabels(): (string | null)[] {
  return Array.from(screen.getByRole('toolbar').querySelectorAll('button')).map(b => b.getAttribute('aria-label'));
}

/** The ten actions, in the order F-025 lists them. */
const ACTION_ORDER = [
  'sourceSetExplorer.newFile',
  'sourceSetExplorer.newFolder',
  'sourceSetExplorer.upload',
  'sourceSetExplorer.download',
  'sourceSetExplorer.copy',
  'sourceSetExplorer.cut',
  'sourceSetExplorer.paste',
  'sourceSetExplorer.rename',
  'sourceSetExplorer.delete',
  'sourceSetExplorer.refresh',
] as const;

/**
 * The same set as the context menu renders it (BUG-008 R1). Upload is one toolbar button that opens a
 * menu, because the file picker and the folder picker genuinely see different things; the context menu
 * lists those two rows flat rather than nesting a second menu inside itself.
 */
const MENU_ORDER = ACTION_ORDER.flatMap(key =>
  key === 'sourceSetExplorer.upload' ? ['sourceSetExplorer.uploadFiles', 'sourceSetExplorer.uploadFolder'] : [key],
);

const SIMPLE: FakeVolume = {
  dirs: { '': [dir('notes'), file('a.txt')], notes: [file('todo.md')] },
  files: { 'a.txt': 'hi', 'notes/todo.md': '# todo' },
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('F-025 R4 — the lazy tree', () => {
  it('lists the root, directories before files, and lists a branch only once it is opened', async () => {
    const probe = installVolume(SIMPLE);
    render(<SourceSetFileExplorer sourceSetEndpoint={ENDPOINT} apiKey="k" />);

    await screen.findByText('a.txt');
    expect(screen.getAllByRole('treeitem').map(r => r.textContent)).toEqual(['notes', 'a.txt']);
    expect(probe.listedPaths()).toEqual(['']);

    fireEvent.click(screen.getByText('notes'));

    await screen.findByText('todo.md');
    expect(probe.listedPaths()).toContain('notes');
  });

  it('sends volume-relative paths, with no leading slash on a root-level entry', async () => {
    const probe = installVolume(SIMPLE);
    render(<SourceSetFileExplorer sourceSetEndpoint={ENDPOINT} apiKey="k" />);

    fireEvent.doubleClick(await screen.findByText('a.txt'));

    await waitFor(() => {
      const read = probe.calls.find(c => c.op === 'file' && c.method === 'GET');
      expect(read?.url.searchParams.get('path')).toBe('a.txt');
    });
  });

  it('says a directory is empty rather than showing nothing', async () => {
    installVolume({ dirs: { '': [] } });
    render(<SourceSetFileExplorer sourceSetEndpoint={ENDPOINT} apiKey="k" />);

    expect(await screen.findByText(t('en-US', 'sourceSetExplorer.emptyDir'))).toBeTruthy();
  });

  it('roots the tree at rootPath and never lists above it (R11)', async () => {
    const probe = installVolume(SIMPLE);
    render(<SourceSetFileExplorer sourceSetEndpoint={ENDPOINT} apiKey="k" rootPath="notes" />);

    await screen.findByText('todo.md');

    expect(probe.listedPaths()).toEqual(['notes']);
    expect(screen.queryByText('a.txt')).toBeNull();
  });
});

describe('F-025 R5 — toolbar and context menu offer one set of actions', () => {
  it('lays the ten actions out in the order the spec lists them', async () => {
    installVolume(SIMPLE);
    render(<SourceSetFileExplorer sourceSetEndpoint={ENDPOINT} apiKey="k" />);
    await screen.findByText('a.txt');

    expect(toolbarLabels()).toEqual(ACTION_ORDER.map(key => t('en-US', key)));
  });

  it('offers the same set in the right-click menu', async () => {
    installVolume(SIMPLE);
    render(<SourceSetFileExplorer sourceSetEndpoint={ENDPOINT} apiKey="k" />);

    fireEvent.contextMenu(await screen.findByText('a.txt'));

    const labels = within(await screen.findByRole('menu'))
      .getAllByRole('menuitem')
      .map(item => item.textContent);

    expect(new Set(labels)).toEqual(new Set(MENU_ORDER.map(key => t('en-US', key))));
  });

  it('disables selection-dependent actions rather than hiding them', async () => {
    installVolume(SIMPLE);
    render(<SourceSetFileExplorer sourceSetEndpoint={ENDPOINT} apiKey="k" />);
    await screen.findByText('a.txt');

    expect(requireToolButton('sourceSetExplorer.rename').disabled).toBe(true);
    expect(requireToolButton('sourceSetExplorer.delete').disabled).toBe(true);
    // New file / folder target the root when nothing is picked, so they stay live.
    expect(requireToolButton('sourceSetExplorer.newFile').disabled).toBe(false);

    fireEvent.click(screen.getByText('a.txt'));

    expect(requireToolButton('sourceSetExplorer.rename').disabled).toBe(false);
    expect(requireToolButton('sourceSetExplorer.delete').disabled).toBe(false);
  });

  it('offers no in-tree drag affordance — moving is cut then paste (R6)', async () => {
    installVolume(SIMPLE);
    const { container } = render(<SourceSetFileExplorer sourceSetEndpoint={ENDPOINT} apiKey="k" />);
    await screen.findByText('a.txt');

    expect(container.querySelectorAll('[draggable="true"]')).toHaveLength(0);
    expect(requireToolButton('sourceSetExplorer.cut')).toBeTruthy();
    expect(requireToolButton('sourceSetExplorer.paste').disabled).toBe(true);
  });
});

describe('F-025 R6 — pasting a name that is taken gets a suffix, not an overwrite', () => {
  it('copies to a deduplicated name in the same directory', async () => {
    const probe = installVolume(SIMPLE);
    render(<SourceSetFileExplorer sourceSetEndpoint={ENDPOINT} apiKey="k" />);

    fireEvent.click(await screen.findByText('a.txt'));
    fireEvent.click(requireToolButton('sourceSetExplorer.copy'));
    // Once something is held, the button names it — the label is `pasteNamed`, not `paste`.
    fireEvent.click(requireToolButton('sourceSetExplorer.pasteNamed', { name: 'a.txt' }));

    await waitFor(() => {
      const copy = probe.calls.find(c => c.op === 'copy');
      expect(copy?.url.searchParams.get('src')).toBe('a.txt');
      expect(copy?.url.searchParams.get('dst')).toBe('a (1).txt');
    });
  });
});

describe('F-025 R9 — creating a file never overwrites one', () => {
  it('sends create_only and reports the collision by name', async () => {
    const probe = installVolume(SIMPLE);
    render(<SourceSetFileExplorer sourceSetEndpoint={ENDPOINT} apiKey="k" />);
    await screen.findByText('a.txt');

    fireEvent.click(requireToolButton('sourceSetExplorer.newFile'));
    fireEvent.change(screen.getByRole('dialog').querySelector('input') as HTMLInputElement, {
      target: { value: 'a.txt' },
    });
    fireEvent.click(within(screen.getByRole('dialog')).getByText(t('en-US', 'sourceSetExplorer.confirm')));

    expect(
      await screen.findByText(t('en-US', 'sourceSetExplorer.errorNameTaken', { name: 'a.txt' }), { exact: false }),
    ).toBeTruthy();

    const put = probe.calls.find(c => c.op === 'file' && c.method === 'PUT');
    expect(put?.url.searchParams.get('create_only')).toBe('true');
  });
});

describe('F-025 R10 — readOnly removes every mutating affordance', () => {
  it('leaves only download and refresh in the toolbar', async () => {
    installVolume(SIMPLE);
    render(<SourceSetFileExplorer sourceSetEndpoint={ENDPOINT} apiKey="k" readOnly />);
    await screen.findByText('a.txt');

    expect(toolbarLabels()).toEqual([
      t('en-US', 'sourceSetExplorer.download'),
      t('en-US', 'sourceSetExplorer.refresh'),
    ]);
  });

  it('drops them from the right-click menu too', async () => {
    installVolume(SIMPLE);
    render(<SourceSetFileExplorer sourceSetEndpoint={ENDPOINT} apiKey="k" readOnly />);

    fireEvent.contextMenu(await screen.findByText('a.txt'));

    const labels = within(await screen.findByRole('menu'))
      .getAllByRole('menuitem')
      .map(item => item.textContent);

    expect(labels).not.toContain(t('en-US', 'sourceSetExplorer.delete'));
    expect(labels).not.toContain(t('en-US', 'sourceSetExplorer.rename'));
    expect(labels).toContain(t('en-US', 'sourceSetExplorer.download'));
  });

  it('offers no edit entry point in the open file, only a way to read it', async () => {
    // The gap this closes: the shipped file view renders its edit toggle unconditionally, so a read-only
    // mount would let the user type changes that are then silently dropped.
    installVolume(SIMPLE);
    render(<SourceSetFileExplorer sourceSetEndpoint={ENDPOINT} apiKey="k" readOnly />);

    fireEvent.doubleClick(await screen.findByText('a.txt'));

    await screen.findByLabelText(t('en-US', 'sourceSetExplorer.reloadFile'));
    expect(screen.queryByLabelText(t('en-US', 'sourceSetExplorer.switchToEdit'))).toBeNull();
  });

  it('still lets a read-only user look at markdown source', async () => {
    installVolume(SIMPLE);
    render(<SourceSetFileExplorer sourceSetEndpoint={ENDPOINT} apiKey="k" readOnly />);

    fireEvent.click(await screen.findByText('notes'));
    fireEvent.doubleClick(await screen.findByText('todo.md'));

    expect(await screen.findByLabelText(t('en-US', 'sourceSetExplorer.switchToSource'))).toBeTruthy();
  });
});

describe('F-026 R15 — a listing says when it is not all of it', () => {
  it('reports the shortfall by count when the volume said how many there are', async () => {
    installVolume({ dirs: { '': [file('a.txt')] }, claimedTotal: { '': 3000 } });
    render(<SourceSetFileExplorer sourceSetEndpoint={ENDPOINT} apiKey="k" maxEntries={1} />);

    expect(
      await screen.findByText(t('en-US', 'sourceSetExplorer.moreNotLoaded', { n: 2999 }), { exact: false }),
    ).toBeTruthy();
  });

  it('treats a short page with no paging as the whole directory, with no notice', async () => {
    installVolume({ dirs: { '': [file('a.txt')] }, noPaging: true });
    render(<SourceSetFileExplorer sourceSetEndpoint={ENDPOINT} apiKey="k" />);

    await screen.findByText('a.txt');
    expect(screen.queryByText(t('en-US', 'sourceSetExplorer.moreNotLoadedUnknown'))).toBeNull();
    expect(screen.queryByText(t('en-US', 'sourceSetExplorer.moreNotLoaded', { n: 0 }))).toBeNull();
  });

  it('shows the failure instead of presenting a partial listing as whole (R13)', async () => {
    installVolume({ dirs: { '': [] }, fail: { list: 403 } });
    render(<SourceSetFileExplorer sourceSetEndpoint={ENDPOINT} apiKey="k" />);

    expect(await screen.findByText(t('en-US', 'sourceSetExplorer.errorForbidden'))).toBeTruthy();
    expect(screen.queryByText(t('en-US', 'sourceSetExplorer.emptyDir'))).toBeNull();
  });
});

describe('F-025 R12 — nothing here mentions a sandbox', () => {
  it('renders no sandbox wording and no wake control', async () => {
    installVolume(SIMPLE);
    const { container } = render(<SourceSetFileExplorer sourceSetEndpoint={ENDPOINT} apiKey="k" />);
    await screen.findByText('a.txt');

    expect(container.textContent?.toLowerCase()).not.toContain('sandbox');
    expect(container.textContent?.toLowerCase()).not.toContain('nudge');
  });
});

describe('F-025 R3 — auth reaches the volume the way the host chose', () => {
  it('sends the api key as X-API-KEY when given one', async () => {
    const seen: HeadersInit[] = [];
    vi.stubGlobal('fetch', async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      seen.push(init?.headers ?? {});

      return Response.json({ data: { entries: [], paging: { index: 0, size: 1000, total: 0 } } });
    });

    render(<SourceSetFileExplorer sourceSetEndpoint={ENDPOINT} apiKey="secret" />);
    await screen.findByText(t('en-US', 'sourceSetExplorer.emptyDir'));

    expect(seen[0]).toMatchObject({ 'X-API-KEY': 'secret' });
  });

  it('sends custom headers instead when the host relays through a BFF', async () => {
    const seen: HeadersInit[] = [];
    vi.stubGlobal('fetch', async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      seen.push(init?.headers ?? {});

      return Response.json({ data: { entries: [], paging: { index: 0, size: 1000, total: 0 } } });
    });

    render(<SourceSetFileExplorer sourceSetEndpoint={ENDPOINT} customHeaders={{ Authorization: 'Bearer t' }} />);
    await screen.findByText(t('en-US', 'sourceSetExplorer.emptyDir'));

    expect(seen[0]).toMatchObject({ Authorization: 'Bearer t' });
    expect(seen[0]).not.toHaveProperty('X-API-KEY');
  });
});

describe('BUILD-064 — host extension points', () => {
  /** Every menu item's label, in the order the menu lays them out. */
  function menuLabels(): (string | null)[] {
    return within(screen.getByRole('menu'))
      .getAllByRole('menuitem')
      .map(item => item.textContent);
  }

  function rows(): HTMLElement[] {
    return screen.getAllByRole('treeitem');
  }

  function rowNamed(name: string): HTMLElement {
    const found = rows().find(row => row.textContent?.startsWith(name));
    if (!found) throw new Error(`no row for ${name}`);

    return found;
  }

  it('renders the host section between the mutating pair and refresh (R1)', async () => {
    installVolume(SIMPLE);
    render(
      <SourceSetFileExplorer
        sourceSetEndpoint={ENDPOINT}
        apiKey="k"
        extraEntryActions={() => [{ key: 'pull', label: 'Pull from external source', onSelect: (): void => undefined }]}
      />,
    );

    fireEvent.contextMenu(await screen.findByText('a.txt'));
    await screen.findByRole('menu');

    expect(menuLabels()).toEqual([
      ...MENU_ORDER.slice(0, -1).map(key => t('en-US', key)),
      'Pull from external source',
      t('en-US', 'sourceSetExplorer.refresh'),
    ]);
  });

  it('passes the selected entry, and null when nothing is selected (R2)', async () => {
    installVolume(SIMPLE);
    const seen: (FsEntry | null)[] = [];
    render(
      <SourceSetFileExplorer
        sourceSetEndpoint={ENDPOINT}
        apiKey="k"
        extraEntryActions={entry => {
          seen.push(entry);

          return [
            {
              key: 'host',
              label: entry ? `Act on ${entry.name}` : 'Act on the volume',
              onSelect: (): void => undefined,
            },
          ];
        }}
      />,
    );

    // Right-clicking the tree itself never selected anything, so the host is asked about `null`.
    fireEvent.contextMenu(await screen.findByRole('tree'));
    expect(menuLabels()).toContain('Act on the volume');
    expect(seen).toContain(null);

    // A right-click on a row selects it first, which is the target every built-in action resolves to.
    fireEvent.contextMenu(screen.getByText('a.txt'));

    await waitFor(() => expect(menuLabels()).toContain('Act on a.txt'));
    expect(seen.at(-1)).toMatchObject({ path: 'a.txt', isDir: false });
  });

  // R3 originally read "drops the whole host section while readOnly" and is inverted by BUILD-075: the
  // rule it appealed to is about this volume's files, which a host action usually does not touch. The
  // case is kept here rather than moved, so the reversal is visible where the old expectation lived.
  it('keeps the host section while readOnly, alongside the built-in suppression (R3, superseded by BUILD-075)', async () => {
    installVolume(SIMPLE);
    render(
      <SourceSetFileExplorer
        sourceSetEndpoint={ENDPOINT}
        apiKey="k"
        readOnly
        extraEntryActions={() => [{ key: 'pull', label: 'Pull from external source', onSelect: (): void => undefined }]}
      />,
    );

    fireEvent.contextMenu(await screen.findByText('a.txt'));

    expect(menuLabels()).toEqual([
      t('en-US', 'sourceSetExplorer.download'),
      'Pull from external source',
      t('en-US', 'sourceSetExplorer.refresh'),
    ]);
  });

  it('renders a disabled host item inert but visible (R4)', async () => {
    installVolume(SIMPLE);
    const onSelect = vi.fn();
    render(
      <SourceSetFileExplorer
        sourceSetEndpoint={ENDPOINT}
        apiKey="k"
        extraEntryActions={() => [{ key: 'pull', label: 'Pulled by nightly-docs', disabled: true, onSelect }]}
      />,
    );

    fireEvent.contextMenu(await screen.findByText('a.txt'));

    const item = within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Pulled by nightly-docs' });
    expect((item as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(item);

    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.queryByRole('menu')).not.toBeNull();
  });

  it('puts the badge after the name, keeps it out of the row click path, and shows it read-only too (R5)', async () => {
    installVolume(SIMPLE);
    const badge = (entry: FsEntry): ReactNode => (entry.isDir ? <span data-testid="badge">synced</span> : null);
    const { unmount } = render(<SourceSetFileExplorer sourceSetEndpoint={ENDPOINT} apiKey="k" entryBadge={badge} />);

    await screen.findByText('a.txt');
    const dirRow = rowNamed('notes');
    const marker = screen.getByTestId('badge');

    // After the name, inside the row, and only on the directory the host marked.
    expect(dirRow.contains(marker)).toBe(true);
    expect(dirRow.lastElementChild).toBe(marker.parentElement);
    expect(dirRow.children.length).toBe(4);
    expect(rowNamed('a.txt').querySelector('[data-testid="badge"]')).toBeNull();

    // Clicking it is a click on the row: the row still selects (and a directory still expands).
    fireEvent.click(marker);

    await waitFor(() => expect(dirRow.getAttribute('aria-selected')).toBe('true'));
    expect(await screen.findByText('todo.md')).toBeTruthy();

    unmount();
    installVolume(SIMPLE);
    render(<SourceSetFileExplorer sourceSetEndpoint={ENDPOINT} apiKey="k" readOnly entryBadge={badge} />);

    await screen.findByText('a.txt');
    expect(screen.getByTestId('badge')).toBeTruthy();
  });

  it('leaves the row exactly as it was when there is no badge to show (R6)', async () => {
    installVolume(SIMPLE);
    const { unmount } = render(<SourceSetFileExplorer sourceSetEndpoint={ENDPOINT} apiKey="k" />);

    await screen.findByText('a.txt');
    // chevron, icon, label — the shape a row has had since F-025.
    const bare = rows().map(row => row.children.length);
    expect(bare).toEqual([3, 3]);

    unmount();
    installVolume(SIMPLE);
    render(<SourceSetFileExplorer sourceSetEndpoint={ENDPOINT} apiKey="k" entryBadge={() => null} />);

    await screen.findByText('a.txt');
    expect(rows().map(row => row.children.length)).toEqual(bare);
  });

  it('types host items through the public ContextMenuItem shape (R7)', () => {
    // A compile-time check: the type a host imports has to describe what the prop accepts. If either
    // drifts, `npm run typecheck` fails here rather than in a consumer app.
    const items: ContextMenuItem[] = [
      {
        key: 'pull',
        label: 'Pull from external source',
        disabled: true,
        danger: false,
        onSelect: (): void => undefined,
      },
    ];
    const hook: NonNullable<Parameters<typeof SourceSetFileExplorer>[0]['extraEntryActions']> = () => items;

    expect(hook(null)).toHaveLength(1);
  });
});

/**
 * BUG-009 — the selection was only ever an entrance on this side too. The hook already accepted `null`
 * and already fell `targetDir` back to the volume root; what was missing was any UI that called it, so
 * these drive the two exits the bug asks for and pin the overlay precedence Esc has to respect.
 */
describe('BUG-009 — the SourceSet explorer can clear its selection', () => {
  const selectedRow = (): HTMLElement | undefined =>
    screen.getAllByRole('treeitem').find(row => row.getAttribute('aria-selected') === 'true');

  const explorerRoot = (container: HTMLElement): HTMLElement => {
    const root = container.firstElementChild;
    if (!(root instanceof HTMLElement)) throw new Error('the explorer root is missing');

    return root;
  };

  it('E1 clears the selection when the tree background is clicked', async () => {
    installVolume(SIMPLE);
    render(<SourceSetFileExplorer sourceSetEndpoint={ENDPOINT} apiKey="k" />);
    fireEvent.click(await screen.findByText('notes'));
    expect(selectedRow()?.textContent).toBe('notes');

    fireEvent.click(screen.getByRole('tree'));

    expect(selectedRow()).toBeUndefined();
  });

  it('E1 keeps the selection when the click lands on a row rather than the background', async () => {
    installVolume(SIMPLE);
    render(<SourceSetFileExplorer sourceSetEndpoint={ENDPOINT} apiKey="k" />);

    fireEvent.click(await screen.findByText('a.txt'));

    expect(selectedRow()?.textContent).toBe('a.txt');
  });

  it('E2 clears the selection on Escape', async () => {
    installVolume(SIMPLE);
    const { container } = render(<SourceSetFileExplorer sourceSetEndpoint={ENDPOINT} apiKey="k" />);
    fireEvent.click(await screen.findByText('notes'));

    fireEvent.keyDown(explorerRoot(container), { key: 'Escape' });

    expect(selectedRow()).toBeUndefined();
  });

  it('E2 leaves the selection alone when Escape closes an open dialog', async () => {
    installVolume(SIMPLE);
    render(<SourceSetFileExplorer sourceSetEndpoint={ENDPOINT} apiKey="k" />);
    fireEvent.click(await screen.findByText('notes'));
    fireEvent.click(requireToolButton('sourceSetExplorer.newFile'));

    fireEvent.keyDown(await screen.findByRole('dialog'), { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(selectedRow()?.textContent).toBe('notes');
  });

  it('E2 leaves the selection alone when Escape closes the context menu', async () => {
    installVolume(SIMPLE);
    const { container } = render(<SourceSetFileExplorer sourceSetEndpoint={ENDPOINT} apiKey="k" />);
    fireEvent.contextMenu(await screen.findByText('notes'));
    await screen.findByRole('menu');

    fireEvent.keyDown(explorerRoot(container), { key: 'Escape' });
    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    expect(selectedRow()?.textContent).toBe('notes');
  });

  it('E3 lands the next directory action back at the volume root once the selection is cleared', async () => {
    const probe = installVolume(SIMPLE);
    render(<SourceSetFileExplorer sourceSetEndpoint={ENDPOINT} apiKey="k" />);
    fireEvent.click(await screen.findByText('notes'));

    fireEvent.click(requireToolButton('sourceSetExplorer.newFile'));
    fireEvent.change(screen.getByRole('dialog').querySelector('input') as HTMLInputElement, {
      target: { value: 'one.txt' },
    });
    fireEvent.click(within(screen.getByRole('dialog')).getByText(t('en-US', 'sourceSetExplorer.confirm')));
    await waitFor(() => expect(probe.calls.some(c => c.url.searchParams.get('path') === 'notes/one.txt')).toBe(true));

    fireEvent.click(screen.getByRole('tree'));
    fireEvent.click(requireToolButton('sourceSetExplorer.newFile'));
    fireEvent.change(screen.getByRole('dialog').querySelector('input') as HTMLInputElement, {
      target: { value: 'two.txt' },
    });
    fireEvent.click(within(screen.getByRole('dialog')).getByText(t('en-US', 'sourceSetExplorer.confirm')));

    await waitFor(() => expect(probe.calls.some(c => c.url.searchParams.get('path') === 'two.txt')).toBe(true));
  });

  it('E2 leaves the selection alone when Escape is pressed while a file is open', async () => {
    installVolume(SIMPLE);
    const { container } = render(<SourceSetFileExplorer sourceSetEndpoint={ENDPOINT} apiKey="k" />);
    const row = await screen.findByText('a.txt');
    fireEvent.click(row);
    fireEvent.doubleClick(row);
    await waitFor(() => expect(screen.queryByRole('tree')).toBeNull());

    fireEvent.keyDown(explorerRoot(container), { key: 'Escape' });
    fireEvent.click(screen.getByTitle(t('en-US', 'sourceSetExplorer.backToTree')));

    await waitFor(() => expect(screen.queryByRole('tree')).not.toBeNull());
    expect(selectedRow()?.textContent).toBe('a.txt');
  });

  it('E4 returns the selection-only toolbar actions to disabled', async () => {
    installVolume(SIMPLE);
    render(<SourceSetFileExplorer sourceSetEndpoint={ENDPOINT} apiKey="k" />);
    fireEvent.click(await screen.findByText('notes'));
    expect(requireToolButton('sourceSetExplorer.rename').disabled).toBe(false);

    fireEvent.click(screen.getByRole('tree'));

    for (const key of ['download', 'copy', 'cut', 'rename', 'delete']) {
      expect(requireToolButton(`sourceSetExplorer.${key}`).disabled).toBe(true);
    }
  });
});

/**
 * BUILD-075 — the four affordances a Search Paths panel beside the tree needs (asgard-sdk-pm#95).
 *
 * The shape they take is the point of each case: a host action survives `readOnly` while the built-in
 * ones do not, a marked path reads differently from the way to it, a seed opens the folder itself and
 * not merely its parent, and the panel is told what is selected without having to own the tree.
 */
describe('BUILD-075 — search-path affordances', () => {
  /** Deep enough to have a chain: a marked folder, one that only leads to it, and one that is neither. */
  const DEEP: FakeVolume = {
    dirs: {
      '': [dir('git'), file('a.txt')],
      git: [dir('skills'), file('README.md')],
      'git/skills': [dir('csv'), dir('pdf')],
      'git/skills/pdf': [file('SKILL.md')],
      'git/skills/csv': [file('SKILL.md')],
    },
    files: { 'git/README.md': '# repo' },
  };

  /** The span carrying an entry's name — the element `highlightPaths` colours. */
  const nameOf = (name: string): HTMLElement => screen.getByText(name);

  function menuLabels(): (string | null)[] {
    return within(screen.getByRole('menu'))
      .getAllByRole('menuitem')
      .map(item => item.textContent);
  }

  it('asks the host for its actions while readOnly, with every built-in mutating one still gone (R1)', async () => {
    installVolume(SIMPLE);
    const seen: (FsEntry | null)[] = [];
    render(
      <SourceSetFileExplorer
        sourceSetEndpoint={ENDPOINT}
        apiKey="k"
        readOnly
        extraEntryActions={entry => {
          seen.push(entry);

          return [{ key: 'add', label: 'Add to search paths', onSelect: (): void => undefined }];
        }}
      />,
    );

    await screen.findByText('a.txt');
    // R10 is untouched: the toolbar still offers only the two actions that change nothing.
    expect(toolbarLabels()).toEqual([
      t('en-US', 'sourceSetExplorer.download'),
      t('en-US', 'sourceSetExplorer.refresh'),
    ]);

    fireEvent.contextMenu(screen.getByText('notes'));
    await screen.findByRole('menu');

    expect(menuLabels()).toContain('Add to search paths');
    expect(menuLabels()).not.toContain(t('en-US', 'sourceSetExplorer.rename'));
    expect(menuLabels()).not.toContain(t('en-US', 'sourceSetExplorer.delete'));
    expect(menuLabels()).not.toContain(t('en-US', 'sourceSetExplorer.newFolder'));
    // The host was asked, and asked about the row that was right-clicked.
    expect(seen.at(-1)).toMatchObject({ path: 'notes', isDir: true });
  });

  it('paints the marked path and the way to it at two different strengths (R2)', async () => {
    installVolume(DEEP);
    render(
      <SourceSetFileExplorer
        sourceSetEndpoint={ENDPOINT}
        apiKey="k"
        autoExpandPaths={['git/skills/pdf']}
        highlightPaths={['git/skills/pdf']}
      />,
    );

    await screen.findByText('SKILL.md');
    const target = nameOf('pdf').className;
    const ancestor = nameOf('skills').className;
    const unmarked = nameOf('csv').className;

    // Three states, three renderings — the whole point of two strengths rather than one.
    expect(new Set([target, ancestor, unmarked]).size).toBe(3);
    expect(nameOf('git').className).toBe(ancestor);
    expect(nameOf('README.md').className).toBe(unmarked);
    // Weight, not only hue: the marked folder is the one that carries it.
    expect(target).toContain('labelHighlight');
    expect(ancestor).toContain('labelHighlightAncestor');
    expect(target).not.toContain('labelHighlightAncestor');
  });

  it('declares both strengths in the stylesheet, off the same accent token (R2)', () => {
    // The CSS-module proxy fabricates any key it is asked for, so the component wiring above would pass
    // even against a stylesheet that declares neither class. This is what actually holds the two apart.
    const sheet = readFileSync(join(__dirname, 'source-set-explorer.module.scss'), 'utf8');
    const block = (selector: string): string => sheet.split(`.${selector} {`)[1]?.split('}')[0] ?? '';

    expect(block('labelHighlight')).toContain('color: var(--asg-color-primary');
    expect(block('labelHighlight')).toContain('font-weight: 600');
    expect(block('labelHighlightAncestor')).toContain('--asg-color-primary');
    expect(block('labelHighlightAncestor')).toContain('--asg-color-text-secondary');
    // Only design-system tokens (F-025 R16): every colour here is a var() with a fallback, none is bare.
    expect(block('labelHighlight')).not.toMatch(/color:\s*#/);
    expect(block('labelHighlightAncestor')).not.toMatch(/color:\s*#/);
  });

  it('matches a path written the way a search path is written, slashes and all (R3)', async () => {
    installVolume(DEEP);
    render(
      <SourceSetFileExplorer
        sourceSetEndpoint={ENDPOINT}
        apiKey="k"
        autoExpandPaths={['/git/skills/']}
        highlightPaths={['/git/skills/pdf/']}
      />,
    );

    // The seed reached `git/skills` despite both slashes, so `pdf` is on screen at all…
    await screen.findByText('pdf');
    // …and the highlight matched it despite its own.
    expect(nameOf('pdf').className).toContain('labelHighlight');
    expect(nameOf('csv').className).not.toContain('labelHighlight');
  });

  it('opens each seeded path together with its chain, its own level included (R4)', async () => {
    const probe = installVolume(DEEP);
    render(<SourceSetFileExplorer sourceSetEndpoint={ENDPOINT} apiKey="k" autoExpandPaths={['git/skills/pdf']} />);

    // `SKILL.md` lives inside the seeded path itself: reaching it is what `initialPath` cannot do.
    expect(await screen.findByText('SKILL.md')).toBeTruthy();
    await waitFor(() =>
      expect(probe.listedPaths()).toEqual(expect.arrayContaining(['', 'git', 'git/skills', 'git/skills/pdf'])),
    );
    // Only the chain — a sibling of the seeded path stays closed and unfetched.
    expect(probe.listedPaths()).not.toContain('git/skills/csv');
  });

  it('never lists a seeded path that turns out to be a file (R4)', async () => {
    const probe = installVolume(DEEP);
    const onError = vi.fn();
    render(
      <SourceSetFileExplorer
        sourceSetEndpoint={ENDPOINT}
        apiKey="k"
        autoExpandPaths={['git/README.md']}
        onError={onError}
      />,
    );

    // The chain above it still opens, so the file is on screen…
    expect(await screen.findByText('README.md')).toBeTruthy();
    // …but a file has nothing to list, and asking would reach the host as an error it cannot act on.
    expect(probe.listedPaths()).not.toContain('git/README.md');
    expect(onError).not.toHaveBeenCalled();
  });

  it('reads autoExpandPaths once, so a later change leaves the tree as the user left it (R5)', async () => {
    installVolume(DEEP);
    const props = { sourceSetEndpoint: ENDPOINT, apiKey: 'k' };
    const { rerender } = render(<SourceSetFileExplorer {...props} autoExpandPaths={['git/skills']} />);

    await screen.findByText('pdf');

    // The user collapses what the seed opened.
    fireEvent.click(screen.getByText('skills'));
    await waitFor(() => expect(screen.queryByText('pdf')).toBeNull());

    // The host recomputes its Search Paths — which must not spring the tree back open underneath them.
    rerender(<SourceSetFileExplorer {...props} autoExpandPaths={['git/skills', 'git/skills/csv']} />);

    expect(screen.queryByText('pdf')).toBeNull();
    expect(screen.queryByText('csv')).toBeNull();
  });

  it('reports every selection change, and nothing that was not one (R6)', async () => {
    installVolume(SIMPLE);
    const seen: (FsEntry | null)[] = [];
    const onSelectEntry = (entry: FsEntry | null): void => void seen.push(entry);
    render(<SourceSetFileExplorer sourceSetEndpoint={ENDPOINT} apiKey="k" onSelectEntry={onSelectEntry} />);

    await screen.findByText('a.txt');
    // Mounting with nothing selected is not a change; the host is not told about it.
    expect(seen).toEqual([]);

    fireEvent.click(screen.getByText('a.txt'));
    await waitFor(() => expect(seen).toHaveLength(1));
    expect(seen[0]).toMatchObject({ path: 'a.txt', isDir: false });

    // Clicking the same row again selects the same entry — nothing changed, so nothing is reported.
    fireEvent.click(screen.getByText('a.txt'));
    expect(seen).toHaveLength(1);

    // The way out of a selection is a change like any other (BUG-009 E1).
    fireEvent.click(screen.getByRole('tree'));
    await waitFor(() => expect(seen).toHaveLength(2));
    expect(seen[1]).toBeNull();
  });

  it('reports the clearing a rootPath change performs (R6)', async () => {
    installVolume(SIMPLE);
    const seen: (FsEntry | null)[] = [];
    const onSelectEntry = (entry: FsEntry | null): void => void seen.push(entry);
    const props = { sourceSetEndpoint: ENDPOINT, apiKey: 'k', onSelectEntry };
    const { rerender } = render(<SourceSetFileExplorer {...props} rootPath="" />);

    fireEvent.click(await screen.findByText('a.txt'));
    await waitFor(() => expect(seen).toHaveLength(1));

    rerender(<SourceSetFileExplorer {...props} rootPath="notes" />);

    // The selection cannot survive a root change, and a panel holding "the selected folder" has to know.
    await waitFor(() => expect(seen).toHaveLength(2));
    expect(seen[1]).toBeNull();
  });

  it('adds nothing at all when none of the four props is supplied (R7)', async () => {
    const probe = installVolume(DEEP);
    render(<SourceSetFileExplorer sourceSetEndpoint={ENDPOINT} apiKey="k" />);

    await screen.findByText('a.txt');
    // Only the root is opened and fetched, exactly as before.
    expect(probe.listedPaths()).toEqual(['']);
    expect(screen.queryByText('skills')).toBeNull();
    // And no row's name carries a highlight class it did not carry before.
    expect(nameOf('git').className).toBe(nameOf('a.txt').className);
    expect(nameOf('git').className).not.toContain('labelHighlight');
  });
});
