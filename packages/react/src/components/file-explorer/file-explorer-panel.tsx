import { ReactNode, useMemo } from 'react';
import { LaunchedSandbox, SandboxWakePhase } from '@asgard-js/core';
import { FileExplorerController } from '../../hooks/use-file-explorer-controller';
import { FileExplorerProvider } from './file-explorer-context';
import {
  FileExplorerCloseButton,
  FileExplorerCwd,
  FileExplorerEmptyState,
  FileExplorerHeader,
  FileExplorerHeaderRow,
  FileExplorerRoot,
  FileExplorerSourceSelect,
  FileExplorerWorkspace,
} from './file-explorer-parts';
import { FsListDir, FsProviders, FsReadFile, FsSaveFile, FsUploadMany, FsWatchFile, sandboxesAsSources } from './types';

export type { FsListDir } from './types';

/** F-021 Cycle 2 — optional fs mutation callbacks; when omitted the corresponding action is unavailable. */
export interface FileExplorerMutations {
  mkdir?: (sandboxName: string, path: string) => Promise<void>;
  remove?: (sandboxName: string, path: string, isDir: boolean) => Promise<void>;
  copy?: (sandboxName: string, src: string, dst: string) => Promise<void>;
  move?: (sandboxName: string, src: string, dst: string) => Promise<void>;
  upload?: (sandboxName: string, dirPath: string, file: File) => Promise<void>;
  /**
   * Batch-capable upload (F-031) — called once per file by the shared upload queue, which owns the
   * pacing and the collision prompts. With only `upload`, batches still work but run one file at a
   * time and cannot ask before overwriting.
   */
  uploadMany?: FsUploadMany;
  download?: (sandboxName: string, path: string, name: string) => Promise<void>;
}

export interface FileExplorerPanelProps extends FileExplorerMutations {
  /** Live sandboxes (F-019 `launchedSandboxes$` snapshot) shown in the dropdown. */
  sandboxes: LaunchedSandbox[];
  /** Shared controller (F-021 AC7) — header toggle / open-file card / this panel all bind one. */
  controller: FileExplorerController;
  /** List a directory (≈ `GET fs/list`). */
  listDir: FsListDir;
  /** Read a file (≈ `GET fs/file`). */
  readFile?: FsReadFile;
  /** Save a file (≈ `PUT fs/file`). */
  saveFile?: FsSaveFile;
  /** Watch the open file (≈ `fs/watch` SSE) for the FileView's watch-and-reload (AC3). */
  watchFile?: FsWatchFile;
  /** Override the tree root (absolute path); the dropdown + cwd still show the real `workingDirectory` (AC2). */
  basePath?: string;
  /** Nudge an idle sandbox back to life (F-021 AC4); when provided, the empty state shows a Nudge button. */
  onNudge?: () => void | Promise<void>;
  /**
   * Greys out the Nudge button. Pass the host's "a run already holds the channel" state: a nudge is a
   * turn, so it is refused outright while one is in flight (F-023 AC6), and the empty state is on
   * screen during exactly that window — between the send and the sandbox coming up.
   */
  nudgeDisabled?: boolean;
  /**
   * The channel's shared sandbox-wake phase (F-038) — pass `useSandboxWake().phase` (or read
   * `channel.sandboxWake$`) so a wake started elsewhere, e.g. from a download card, shows here at once and a
   * failed wake shows here too. Omitted, the panel only tracks its own `onNudge` call.
   */
  wakePhase?: SandboxWakePhase;
  /** When provided, the header shows a close (X) button (the built-in aside passes `controller.closeExplorer`). */
  onClose?: () => void;
  /**
   * Chrome: `card` = a standalone card (rounded, fully bordered) for consumer-placed panels;
   * `flush` = the built-in aside split into the chat view (no radius, left divider only). Defaults to `card`.
   */
  chrome?: 'card' | 'flush';
  /**
   * Per-file upload cap in bytes (the sandbox edge server's `FileWriteMaxBytes`); omitted means no cap.
   * An oversized file is failed in the browser instead of spending a request to be told `400`.
   */
  maxUploadBytes?: number;
  /** Uploads in flight at once, as a ceiling the queue backs off from (default 3). */
  uploadConcurrency?: number;
}

/**
 * The sandbox File Explorer panel (F-021) — the ready-made assembly of the File Explorer parts, and the
 * one to reach for unless you specifically need a different header: a sandbox picker + lazy tree rooted
 * at `workingDirectory` (overridable via `basePath`), a single-panel FileView on open, and a toolbar +
 * right-click context menu + copy/cut/paste clipboard wired to the fs mutation providers.
 *
 * A host that browses something other than sandboxes composes the same parts with its own header and
 * the shared `<FileExplorer.Workspace>` — see `FileExplorerProvider`.
 */
export function FileExplorerPanel(props: FileExplorerPanelProps): ReactNode {
  const {
    sandboxes,
    controller,
    listDir,
    readFile,
    saveFile,
    watchFile,
    basePath,
    mkdir,
    remove,
    copy,
    move,
    upload,
    uploadMany,
    download,
    onNudge,
    nudgeDisabled,
    wakePhase,
    onClose,
    chrome = 'card',
    maxUploadBytes,
    uploadConcurrency,
  } = props;

  const sources = useMemo(() => sandboxesAsSources(sandboxes), [sandboxes]);
  const providers = useMemo<FsProviders>(
    () => ({ listDir, readFile, saveFile, watchFile, mkdir, remove, copy, move, upload, uploadMany, download }),
    [listDir, readFile, saveFile, watchFile, mkdir, remove, copy, move, upload, uploadMany, download],
  );

  // "Is there anything to browse" — deliberately not "is the selected id present". The provider resolves
  // an unknown selection to the first source, so any non-empty list has an active source; asking the
  // narrower question here made a controller that outlives one source list (it carries the previous
  // list's sandbox name) render "no sandbox is running" on top of a perfectly live one.
  const hasSource = sources.length > 0;

  return (
    <FileExplorerProvider
      sources={sources}
      controller={controller}
      providers={providers}
      basePath={basePath}
      onNudge={onNudge}
      nudgeDisabled={nudgeDisabled}
      wakePhase={wakePhase}
      onClose={onClose}
      maxUploadBytes={maxUploadBytes}
      uploadConcurrency={uploadConcurrency}
    >
      <FileExplorerRoot chrome={chrome}>
        {hasSource ? (
          <>
            <FileExplorerHeader>
              <FileExplorerHeaderRow>
                <FileExplorerSourceSelect />
                <FileExplorerCloseButton />
              </FileExplorerHeaderRow>
              <FileExplorerCwd />
            </FileExplorerHeader>
            <FileExplorerWorkspace />
          </>
        ) : (
          <FileExplorerEmptyState />
        )}
      </FileExplorerRoot>
    </FileExplorerProvider>
  );
}

export default FileExplorerPanel;
