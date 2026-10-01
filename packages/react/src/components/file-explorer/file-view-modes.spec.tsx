// @vitest-environment jsdom
import { ReactNode, useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SandboxFsDirEntry } from '@asgard-js/core';
import { useFileExplorerController } from '../../hooks/use-file-explorer-controller';
import { t } from '../../i18n';
import { FileExplorerProvider } from './file-explorer-context';
import { FileExplorerBody, FileExplorerRoot, FileExplorerView } from './file-explorer-parts';
import { FileExplorerTree } from './file-explorer-tree';
import { FsListResult, FsSaveFile, FsSource } from './types';

/**
 * UC-006（開檔檢視與編輯）的替代流程。三種副檔名走三條不同的呈現路徑，而「返回」必須把樹留在原狀
 * ——使用者展開了幾層、選了哪一個，開檔再回來不該重來一次。
 */

const SOURCE: FsSource = { id: 'src-1', label: 'Source', rootPath: '/work' };
const IMAGE_DATA_URL = 'data:image/png;base64,iVBORw0KGgo=';
const SAVE: FsSaveFile = vi.fn();

const CONTENT: Record<string, string> = {
  '/work/notes.md': '# heading',
  '/work/script.ts': 'export const x = 1;',
  '/work/pic.png': IMAGE_DATA_URL,
  '/work/docs/inner.txt': 'inner',
};

afterEach(() => {
  cleanup();
});

function entry(name: string, isDir = false): SandboxFsDirEntry {
  return { name, isDir, sizeBytes: 1, mtimeUnix: 0, mode: isDir ? 493 : 420 };
}

function Harness({ failRead = false, canSave = true }: { failRead?: boolean; canSave?: boolean }): ReactNode {
  const controller = useFileExplorerController();
  // A button rather than a re-render with new props: the host swapping providers mid-view is the case under test.
  const [writable, setWritable] = useState(canSave);
  const saveFile: FsSaveFile | undefined = writable ? SAVE : undefined;

  const listDir = async (_sourceId: string, path: string): Promise<FsListResult> => ({
    entries:
      path === SOURCE.rootPath
        ? [entry('docs', true), entry('notes.md'), entry('pic.png'), entry('script.ts')]
        : [entry('inner.txt')],
    truncated: false,
  });

  const readFile = async (_sourceId: string, path: string): Promise<string> => {
    if (failRead) throw new Error('boom');

    return CONTENT[path] ?? '';
  };

  return (
    <FileExplorerProvider sources={[SOURCE]} controller={controller} providers={{ listDir, readFile, saveFile }}>
      <button type="button" onClick={() => setWritable(false)}>
        drop-save
      </button>
      <FileExplorerRoot>
        <FileExplorerBody>
          <FileExplorerTree />
          <FileExplorerView />
        </FileExplorerBody>
      </FileExplorerRoot>
    </FileExplorerProvider>
  );
}

/** Double-click the tree row for `name`, the way a user opens a file. */
async function open(name: string): Promise<void> {
  fireEvent.doubleClick(await screen.findByText(name));
}

const toEdit = t('en-US', 'fileExplorer.switchToEdit');
const toPreview = t('en-US', 'fileExplorer.switchToPreview');

describe('UC-006 — how a file is presented', () => {
  it('shows an image with no way to edit it', async () => {
    const { container } = render(<Harness />);

    await open('pic.png');

    await waitFor(() => expect(container.querySelector('img')).toBeTruthy());
    expect(container.querySelector('img')?.getAttribute('src')).toBe(IMAGE_DATA_URL);
    // The preview↔edit toggle is absent entirely, rather than present-but-disabled.
    expect(screen.queryByLabelText(toEdit)).toBeNull();
    expect(screen.queryByLabelText(toPreview)).toBeNull();
  });

  it('offers the preview↔edit toggle for a non-markdown text file', async () => {
    render(<Harness />);

    await open('script.ts');

    // Opens read-only; the control on offer is "switch to edit".
    const toggle = await screen.findByLabelText(toEdit);
    fireEvent.click(toggle);

    // Now editable, and the control flips to "switch back to preview".
    expect(await screen.findByLabelText(toPreview)).toBeTruthy();
  });

  it('offers the same toggle for markdown', async () => {
    render(<Harness />);

    await open('notes.md');

    expect(await screen.findByLabelText(toEdit)).toBeTruthy();
  });

  it('reports a failed read inside the viewer', async () => {
    render(<Harness failRead />);

    await open('notes.md');

    expect(await screen.findByText(t('en-US', 'fileExplorer.loadError', { error: 'boom' }))).toBeTruthy();
  });
});

/** The CodeMirror content node's editability, once the lazily loaded editor has mounted. */
async function editable(container: HTMLElement): Promise<string | null> {
  await waitFor(() => expect(container.querySelector('.cm-content')).toBeTruthy());

  return container.querySelector('.cm-content')?.getAttribute('contenteditable') ?? null;
}

describe('#476 R6 — no save provider, no editing', () => {
  it('offers no toggle and keeps text read-only when the host cannot save', async () => {
    const { container } = render(<Harness canSave={false} />);

    await open('script.ts');

    expect(await editable(container)).toBe('false');
    expect(screen.queryByLabelText(toEdit)).toBeNull();
    expect(screen.queryByLabelText(toPreview)).toBeNull();
  });

  it('shows markdown rendered, with no way into its source', async () => {
    const { container } = render(<Harness canSave={false} />);

    await open('notes.md');

    await waitFor(() => expect(container.querySelector('h1')?.textContent).toBe('heading'));
    expect(screen.queryByLabelText(toEdit)).toBeNull();
  });

  it('falls back to read-only when the save provider goes away mid-edit', async () => {
    const { container } = render(<Harness />);

    await open('script.ts');
    fireEvent.click(await screen.findByLabelText(toEdit));
    expect(await editable(container)).toBe('true');

    fireEvent.click(screen.getByText('drop-save'));

    await waitFor(() => expect(container.querySelector('.cm-content')?.getAttribute('contenteditable')).toBe('false'));
    expect(screen.queryByLabelText(toPreview)).toBeNull();
  });
});

describe('UC-006 — going back to the tree', () => {
  it('keeps the expansion and selection the user had before opening a file', async () => {
    render(<Harness />);

    // Expand `docs` (single click on a dir toggles) and confirm its child is listed.
    fireEvent.click(await screen.findByText('docs'));
    expect(await screen.findByText('inner.txt')).toBeTruthy();

    // Select a file, then open a different one.
    fireEvent.click(screen.getByText('script.ts'));
    await open('notes.md');
    expect(await screen.findByLabelText(toEdit)).toBeTruthy();

    // Back to the tree.
    fireEvent.click(screen.getByTitle(t('en-US', 'fileExplorer.backToTree')));

    // `docs` is still expanded — its child is on screen without re-expanding.
    expect(await screen.findByText('inner.txt')).toBeTruthy();
  });
});
