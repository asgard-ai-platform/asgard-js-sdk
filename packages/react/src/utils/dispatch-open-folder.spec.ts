// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dispatchUriAction } from './dispatch-uri-action';

/**
 * F-034 AC2 / UC-060 — an `open-folder` card routes to its own host handler.
 *
 * Two things have to hold at once. It must not reach the file handler, because the File Explorer would send
 * a directory into the viewer — `fs/file` answers `500` and the `fs/watch` connection dies. And it must not
 * reach `window.open` either: `sandbox://` has no network endpoint, so opening it raw produces a broken tab.
 * Before this branch existed the card resolved to `null` and fell through to exactly that fallback.
 */

const OPEN_FOLDER = 'sandbox://sb-1/open-folder?absolute_path=%2Fwork%2Fout';
const OPEN_FILE = 'sandbox://sb-1/open-file?absolute_path=%2Fwork%2Fout%2Fa.txt';

let windowOpen: ReturnType<typeof vi.fn>;

beforeEach(() => {
  windowOpen = vi.fn();
  vi.stubGlobal('open', windowOpen);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('dispatchUriAction — open-folder (F-034 AC2)', () => {
  it('calls the folder handler with the decoded path, and not the file handler', () => {
    const onSandboxOpenFolder = vi.fn();
    const onSandboxOpenFile = vi.fn();

    dispatchUriAction(OPEN_FOLDER, { onSandboxOpenFolder, onSandboxOpenFile });

    expect(onSandboxOpenFolder).toHaveBeenCalledWith('sb-1', '/work/out');
    expect(onSandboxOpenFile).not.toHaveBeenCalled();
  });

  it('leaves the file card on the file handler', () => {
    const onSandboxOpenFolder = vi.fn();
    const onSandboxOpenFile = vi.fn();

    dispatchUriAction(OPEN_FILE, { onSandboxOpenFolder, onSandboxOpenFile });

    expect(onSandboxOpenFile).toHaveBeenCalledWith('sb-1', '/work/out/a.txt');
    expect(onSandboxOpenFolder).not.toHaveBeenCalled();
  });

  it('is a no-op — never a window.open of the raw uri — when no folder handler is wired', () => {
    dispatchUriAction(OPEN_FOLDER, {});

    expect(windowOpen).not.toHaveBeenCalled();
  });

  it('still ignores a folder card with no absolute_path', () => {
    const onSandboxOpenFolder = vi.fn();

    dispatchUriAction('sandbox://sb-1/open-folder', { onSandboxOpenFolder });

    expect(onSandboxOpenFolder).not.toHaveBeenCalled();
    expect(windowOpen).not.toHaveBeenCalled();
  });
});

// F-038 AC7 — the download card has its own branch. Without it, the sandbox branch's `else` took it for an
// open-file card and sent it to the File Explorer.
describe('dispatchUriAction — download-file (F-038 AC7)', () => {
  const DOWNLOAD = 'sandbox://sb-1/download-file?absolute_path=%2FMHdata%2Fq3.pdf';

  it('calls the download handler with the decoded path, and neither open handler', () => {
    const onSandboxDownloadFile = vi.fn();
    const onSandboxOpenFile = vi.fn();
    const onSandboxOpenFolder = vi.fn();

    dispatchUriAction(DOWNLOAD, { onSandboxDownloadFile, onSandboxOpenFile, onSandboxOpenFolder });

    expect(onSandboxDownloadFile).toHaveBeenCalledWith('sb-1', '/MHdata/q3.pdf');
    expect(onSandboxOpenFile).not.toHaveBeenCalled();
    expect(onSandboxOpenFolder).not.toHaveBeenCalled();
  });

  it('is a no-op — never the file handler, never window.open — without a download handler', () => {
    const onSandboxOpenFile = vi.fn();

    dispatchUriAction(DOWNLOAD, { onSandboxOpenFile });

    expect(onSandboxOpenFile).not.toHaveBeenCalled();
    expect(windowOpen).not.toHaveBeenCalled();
  });
});
