import { useCallback, useMemo, useRef, useState } from 'react';

import type { FsEntry } from '../components/file-explorer/types';

// F-021 — the shared File Explorer controller decouples *behavior* from *placement* (F-019 decision).
// Three sources can drive "is the explorer open / which sandbox / reveal which file": (1) the built-in
// header folder toggle, (2) an agent open-file `sandbox://` card, (3) a consumer-placed <FileExplorerPanel>
// in `fileExplorer="off"` mode. Binding all three to one controller means an open-file intent hits the
// panel wherever it lives — placement and behavior stay separate. Framework-light: pure state + actions.

/** One "reveal this path" request; the nonce lets a repeat request for the same path re-trigger the reveal. */
export interface RequestedFile {
  /**
   * Where the reveal ends: `'file'` opens the viewer (read + watch), `'folder'` only unfolds and selects the
   * directory on the tree (F-034 AC3).
   *
   * This comes **from the card**, never from a guess: the panel has not listed that level yet when the reveal
   * arrives, so it cannot tell a file from a directory — and trying it as a file first is not an option, since
   * the backend answers `500` for `fs/file` on a directory and drops the `fs/watch` connection. `open-file` and
   * `open-folder` are two separate uri actions for exactly this reason.
   */
  kind: 'file' | 'folder';
  /**
   * The source this request targets. Always equal to {@link RequestedFile.sandboxName} — the explorer
   * generalized "which sandbox" to "which source" (a sandbox is one kind of source, a Sindri directory
   * volume another), and both names are kept so existing callers keep working.
   */
  sourceId: string;
  /** @deprecated Use {@link RequestedFile.sourceId}; kept as an alias so existing readers keep working. */
  sandboxName: string;
  absolutePath: string;
  nonce: number;
}

/** Options for {@link FileExplorerController.requestFile} / {@link FileExplorerController.requestFolder}. */
export interface RequestFileOptions {
  /** Also open the built-in aside (F-021 AC9 — "fire intent" and "open panel" are separate; default true). */
  reveal?: boolean;
}

/**
 * What the user was looking at in one source: which directories are unfolded, what is selected, and
 * which file is open in the viewer.
 *
 * This lives on the controller rather than inside `<FileExplorer.Provider>` for two reasons. First,
 * keeping one record per source is what makes leaving a source and coming back restore the view instead
 * of resetting it (F-027 AC8) — the provider used to hold a single copy and wipe it on every switch, so
 * A → B → A landed on an empty tree. Second, the controller is created by the consumer
 * ({@link useFileExplorerController}), so a host that remounts its panel — Sindri rebuilds the whole
 * conversation subtree when you switch conversations — can hold the controller above that boundary and
 * keep the view across the remount. State kept inside the provider cannot survive that by construction.
 */
export interface SourceViewState {
  /** Absolute paths of the unfolded directories. */
  expanded: Set<string>;
  selectedPath: string | null;
  selectedEntry: FsEntry | null;
  /** The file open in the viewer, if any. */
  openFile: FsEntry | null;
}

/**
 * A source with no history yet — also what the provider reads while there is no active source.
 * Shared, so every updater must replace rather than mutate (they all build a `new Set`).
 */
export const EMPTY_SOURCE_VIEW: SourceViewState = {
  expanded: new Set<string>(),
  selectedPath: null,
  selectedEntry: null,
  openFile: null,
};

export interface FileExplorerController {
  // --- state ---
  /** Whether the built-in right-side aside is expanded. Consumer-placed panels may ignore this. */
  open: boolean;
  /** Which source is being viewed (`null` = unset; the panel falls back to the first one). */
  activeSourceId: string | null;
  /** @deprecated Use {@link FileExplorerController.activeSourceId}; same value, kept as an alias. */
  activeSandboxName: string | null;
  /** The latest "reveal + select this path" request (the panel expands ancestors, highlights, then follows `kind`). */
  requestedFile: RequestedFile | null;
  /** Whether a file is currently being edited with unsaved changes (F-021 AC10 — mid-edit guard). */
  isEditingDirty: boolean;
  /**
   * Per-source browsing state, keyed by source id — see {@link SourceViewState}. A source that has
   * never been visited is simply absent; read through {@link FileExplorerController.sourceView}.
   */
  sourceViews: Record<string, SourceViewState>;

  // --- actions ---
  // open/close named openExplorer/closeExplorer to avoid clashing with the `open` boolean state key.
  openExplorer: () => void;
  closeExplorer: () => void;
  toggle: () => void;
  /** Switch which source the explorer is browsing. */
  selectSource: (sourceId: string) => void;
  /** @deprecated Use {@link FileExplorerController.selectSource}; same function, kept as an alias. */
  selectSandbox: (sandboxName: string) => void;
  /**
   * open-file card / deep-link entry: select the source + request a reveal of `absolutePath`, ending in the
   * viewer. `reveal` (default true) also opens the built-in aside; pass `reveal: false` to expose the intent
   * without yanking the panel (F-021 AC9 notify-not-force).
   */
  requestFile: (sourceId: string, absolutePath: string, options?: RequestFileOptions) => void;
  /**
   * open-folder card entry (F-034): the same request, ending **on the tree** — the directory and its ancestors
   * are unfolded and it is selected, with nothing read and nothing watched.
   */
  requestFolder: (sourceId: string, absolutePath: string, options?: RequestFileOptions) => void;
  /** FileView reports its dirty state here so the arrival wiring can decline to yank mid-edit (AC10). */
  setEditingDirty: (dirty: boolean) => void;
  /** Read one source's view, falling back to {@link EMPTY_SOURCE_VIEW} for a source never visited. */
  sourceView: (sourceId: string | null) => SourceViewState;
  /**
   * Update one source's view. The updater form (rather than a plain value) is what keeps two writes in
   * the same handler from clobbering each other — the same reason the provider's `setState` calls it
   * replaced were functional.
   */
  updateSourceView: (sourceId: string, update: (prev: SourceViewState) => SourceViewState) => void;
}

export interface UseFileExplorerControllerOptions {
  /** Initial aside open state (default false). */
  open?: boolean;
  /** Initial active source (default null → panel falls back to the first one). */
  activeSourceId?: string | null;
  /** @deprecated Use {@link UseFileExplorerControllerOptions.activeSourceId}; kept as an alias. */
  activeSandboxName?: string | null;
}

export function useFileExplorerController({
  open: initialOpen = false,
  activeSourceId: initialActiveSource,
  activeSandboxName: initialActive = null,
}: UseFileExplorerControllerOptions = {}): FileExplorerController {
  const [open, setOpen] = useState(initialOpen);
  const [activeSourceId, setActiveSandboxName] = useState<string | null>(initialActiveSource ?? initialActive);
  const [requestedFile, setRequestedFile] = useState<RequestedFile | null>(null);
  const [isEditingDirty, setIsEditingDirty] = useState(false);
  const [sourceViews, setSourceViews] = useState<Record<string, SourceViewState>>({});
  const nonce = useRef(0);

  const openExplorer = useCallback((): void => setOpen(true), []);
  const closeExplorer = useCallback((): void => setOpen(false), []);
  const toggle = useCallback((): void => setOpen(v => !v), []);

  const selectSource = useCallback((sourceId: string): void => {
    setActiveSandboxName(sourceId);
    // Manual source switch → a reveal request aimed at another source is stale; clear it.
    setRequestedFile(rf => (rf && rf.sourceId !== sourceId ? null : rf));
  }, []);

  // One implementation behind both entries: the only difference between them is the `kind` they stamp on the
  // request, and splitting the body would be two copies of "bump the nonce, open, select the source".
  const request = useCallback(
    (kind: 'file' | 'folder', sourceId: string, absolutePath: string, options?: RequestFileOptions): void => {
      nonce.current += 1;
      if (options?.reveal ?? true) setOpen(true);

      setActiveSandboxName(sourceId);
      setRequestedFile({ kind, sourceId, sandboxName: sourceId, absolutePath, nonce: nonce.current });
    },
    [],
  );

  const requestFile = useCallback(
    (sourceId: string, absolutePath: string, options?: RequestFileOptions): void =>
      request('file', sourceId, absolutePath, options),
    [request],
  );
  const requestFolder = useCallback(
    (sourceId: string, absolutePath: string, options?: RequestFileOptions): void =>
      request('folder', sourceId, absolutePath, options),
    [request],
  );

  const setEditingDirty = useCallback((dirty: boolean): void => setIsEditingDirty(dirty), []);

  const sourceView = useCallback(
    (sourceId: string | null): SourceViewState =>
      sourceId ? sourceViews[sourceId] ?? EMPTY_SOURCE_VIEW : EMPTY_SOURCE_VIEW,
    [sourceViews],
  );

  const updateSourceView = useCallback((sourceId: string, update: (prev: SourceViewState) => SourceViewState): void => {
    setSourceViews(prev => ({ ...prev, [sourceId]: update(prev[sourceId] ?? EMPTY_SOURCE_VIEW) }));
  }, []);

  // A fresh object literal on every render makes every consumer's `memo` / dependency array a no-op, and
  // React Compiler reads the churn as "props changed". Identity now moves only when the state behind it
  // does. This is not on its own what fixes issue #427 — see the note on `updateView` in
  // `file-explorer-context.tsx` — but it stops the controller from inventing changes nobody made.
  return useMemo(
    () => ({
      open,
      activeSourceId,
      activeSandboxName: activeSourceId,
      requestedFile,
      isEditingDirty,
      sourceViews,
      openExplorer,
      closeExplorer,
      toggle,
      selectSource,
      selectSandbox: selectSource,
      requestFile,
      requestFolder,
      setEditingDirty,
      sourceView,
      updateSourceView,
    }),
    [
      open,
      activeSourceId,
      requestedFile,
      isEditingDirty,
      sourceViews,
      openExplorer,
      closeExplorer,
      toggle,
      selectSource,
      requestFile,
      requestFolder,
      setEditingDirty,
      sourceView,
      updateSourceView,
    ],
  );
}

export default useFileExplorerController;
