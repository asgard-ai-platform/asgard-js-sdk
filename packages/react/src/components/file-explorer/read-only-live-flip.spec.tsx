// @vitest-environment jsdom
import { ReactNode, useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useFileExplorerController } from '../../hooks/use-file-explorer-controller';
import { t } from '../../i18n';
import { FileExplorerProvider } from './file-explorer-context';
import { FileExplorerRoot, FileExplorerWorkspace } from './file-explorer-parts';
import { FsListResult, FsProviders, FsSource } from './types';

/**
 * Two holes the static suite could not see, because both need a prop to *change* after the viewer is
 * already open — every other case renders once and asserts.
 *
 * 1. `readOnly` flipping to true left the buffer typable **and still writing**. The viewer's body is
 *    memoized; `canEdit` was missing from its dependency list, so React reused the previous element,
 *    whose `onChange` still closed over the pre-flip saver. The "withhold the saver" defence one layer
 *    up never got a chance to apply.
 * 2. `locale` never reached the viewer at all — it read the chat template context, which defaults to
 *    en-US, so a standalone panel rendered its tree in one language and its file header in another.
 *
 * `CodeEditor` is replaced with a textarea: the real one lazy-loads CodeMirror, which made the earlier
 * jsdom attempt at this pass vacuously (no editor had mounted yet, so "not editable" was trivially true).
 */

vi.mock('./code-editor', () => ({
  CodeEditor: (props: { editable: boolean; value: string; onChange: (v: string) => void }): ReactNode => (
    <textarea
      data-testid="editor"
      data-editable={String(props.editable)}
      value={props.value}
      onChange={e => props.onChange(e.target.value)}
    />
  ),
}));

const SOURCE: FsSource = { id: 'src-1', label: 'Source', rootPath: '/work' };

const listDir = async (): Promise<FsListResult> => ({
  entries: [{ name: 'a.txt', isDir: false, sizeBytes: 5, mtimeUnix: 0, mode: 420 }],
  truncated: false,
});
const readFile = async (): Promise<string> => 'hello';

afterEach(() => {
  cleanup();
});

function Harness(props: { providers: FsProviders; locale?: 'en-US' | 'zh-TW' }): ReactNode {
  const [readOnly, setReadOnly] = useState(false);
  const controller = useFileExplorerController();

  return (
    <>
      <button type="button" data-testid="lock" onClick={() => setReadOnly(true)}>
        lock
      </button>
      <FileExplorerProvider
        sources={[SOURCE]}
        controller={controller}
        providers={props.providers}
        readOnly={readOnly}
        locale={props.locale}
      >
        <FileExplorerRoot>
          <FileExplorerWorkspace />
        </FileExplorerRoot>
      </FileExplorerProvider>
    </>
  );
}

/** Open `a.txt` and switch it into edit mode. */
async function openForEditing(providers: FsProviders, locale?: 'en-US' | 'zh-TW'): Promise<void> {
  render(<Harness providers={providers} locale={locale} />);
  fireEvent.doubleClick(await screen.findByText('a.txt'));
  await screen.findByLabelText(t(locale ?? 'en-US', 'fileExplorer.reloadFile'));
  fireEvent.click(screen.getByLabelText(t(locale ?? 'en-US', 'fileExplorer.switchToEdit')));
  await waitFor(() => expect(screen.getByTestId('editor')).toBeTruthy());
}

describe('readOnly turning on while a file is open', () => {
  it('stops the buffer being editable', async () => {
    await openForEditing({ listDir, readFile, saveFile: vi.fn() });
    expect(screen.getByTestId('editor').getAttribute('data-editable')).toBe('true');

    fireEvent.click(screen.getByTestId('lock'));

    await waitFor(() => expect(screen.getByTestId('editor').getAttribute('data-editable')).toBe('false'));
  });

  it('does not write — a panel showing "read only" must not be issuing saves', async () => {
    const saveFile = vi.fn(async (): Promise<void> => undefined);
    await openForEditing({ listDir, readFile, saveFile });

    fireEvent.click(screen.getByTestId('lock'));
    fireEvent.change(screen.getByTestId('editor'), { target: { value: 'MUTATED WHILE READ ONLY' } });
    await new Promise(resolve => setTimeout(resolve, 700)); // past the 400ms debounce

    expect(saveFile).not.toHaveBeenCalled();
  });

  it('cancels a save that was already pending when the lock came on', async () => {
    const saveFile = vi.fn(async (): Promise<void> => undefined);
    await openForEditing({ listDir, readFile, saveFile });

    fireEvent.change(screen.getByTestId('editor'), { target: { value: 'typed just before locking' } });
    fireEvent.click(screen.getByTestId('lock')); // inside the debounce window
    await new Promise(resolve => setTimeout(resolve, 700));

    expect(saveFile).not.toHaveBeenCalled();
  });

  it('still saves normally when the lock never comes on', async () => {
    const saveFile = vi.fn(async (): Promise<void> => undefined);
    await openForEditing({ listDir, readFile, saveFile });

    fireEvent.change(screen.getByTestId('editor'), { target: { value: 'ordinary edit' } });
    await waitFor(() => expect(saveFile).toHaveBeenCalledWith(SOURCE.id, '/work/a.txt', 'ordinary edit'));
  });
});

describe('locale reaches the file viewer', () => {
  it('translates the viewer chrome, not just the tree', async () => {
    await openForEditing({ listDir, readFile, saveFile: vi.fn() }, 'zh-TW');

    // The tree and toolbar were already translated; the viewer's own buttons were not.
    expect(screen.getByLabelText(t('zh-TW', 'fileExplorer.reloadFile'))).toBeTruthy();
    expect(screen.queryByLabelText(t('en-US', 'fileExplorer.reloadFile'))).toBeNull();
  });
});
