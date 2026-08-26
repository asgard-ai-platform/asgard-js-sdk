import {
  createContext,
  DragEvent as ReactDragEvent,
  DragEventHandler,
  MouseEvent as ReactMouseEvent,
  ReactNode,
  RefObject,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { FileExplorerController, SourceViewState } from '../../hooks/use-file-explorer-controller';
import { useAsgardTemplateContext } from '../../context/asgard-template-context';
import { Locale, t } from '../../i18n';
import {
  formatUploadSize,
  isFileDrag,
  isUploadPlanEmpty,
  planFromDataTransfer,
  planFromFileList,
  splitRelPath,
  UploadConflictDialog,
  UploadProgress,
  useUploadQueue,
  type UploadLabels,
  type UploadPlan,
  type UploadPlanSource,
  type UploadReason,
  type UploadWrite,
} from '../upload-queue';
import { useFileExplorerDialog } from './file-explorer-dialog';
import { ancestorDirs, baseName, joinPath, parentDir, uniqueName } from './paths';
import { FsEntry, FsProviders, FsSource } from './types';

export type Clipboard = { op: 'copy' | 'cut'; entry: FsEntry } | null;
export type MenuTarget = { kind: 'file' | 'dir'; entry: FsEntry } | { kind: 'background' };
export type OpenMenu = { x: number; y: number; target: MenuTarget } | null;
/** Anchor for the "files or folder?" upload menu; `dir` is where that batch will land. */
export type OpenUploadMenu = { x: number; y: number; dir: string } | null;

/**
 * Handlers that make a container accept files dragged in from outside the browser (F-031 AC3).
 *
 * All four are needed, not just `onDrop`: the enter/leave pair is what keeps an enclosing drop target
 * (the chat shell) from tracking a drag this panel has already taken over — see issue #446.
 */
export interface DropZoneProps {
  onDragEnter: DragEventHandler<HTMLElement>;
  onDragOver: DragEventHandler<HTMLElement>;
  onDragLeave: DragEventHandler<HTMLElement>;
  onDrop: DragEventHandler<HTMLElement>;
}

/**
 * Everything the File Explorer parts need. Holding it here — rather than inside one panel component —
 * is what lets a consumer assemble a different explorer (Sindri's directory tab has no source picker
 * and no sandbox nudge) while every behavior below stays shared and identical.
 */
export interface FileExplorerContextValue {
  // --- inputs ---
  sources: FsSource[];
  activeSource: FsSource | null;
  activeSourceId: string | null;
  /** The tree root for the active source (`basePath` override wins). `null` when there is no source. */
  rootPath: string | null;
  providers: FsProviders;
  controller: FileExplorerController;
  locale: Locale;
  onClose?: () => void;
  onNudge?: () => void | Promise<void>;
  nudgeDisabled?: boolean;

  // --- state ---
  expanded: Set<string>;
  selectedPath: string | null;
  selectedEntry: FsEntry | null;
  /** Bumped to force every mounted directory level to re-list. */
  refreshKey: number;
  openFile: FsEntry | null;
  clipboard: Clipboard;
  menu: OpenMenu;
  /** The "files or folder?" menu the upload button opens; `null` when closed. */
  uploadMenu: OpenUploadMenu;
  /** External files are hovering the panel — highlight the tree container as one drop target. */
  dropping: boolean;
  nudging: boolean;
  /** The directory actions target: the selected dir, else the root. */
  targetDir: string;
  /** Shared so the paste hint reads identically in the toolbar and both context-menu variants. */
  pasteLabel: string;

  // --- refs owned by <FileExplorerRoot> ---
  rootRef: RefObject<HTMLDivElement | null>;
  /** The multi-file picker. Must stay the **first** `input[type=file]` inside the root. */
  uploadInputRef: RefObject<HTMLInputElement | null>;
  /** The folder picker (`webkitdirectory`), which yields every file in the tree but no empty folder. */
  uploadDirInputRef: RefObject<HTMLInputElement | null>;

  // --- actions ---
  setOpenFile: (entry: FsEntry | null) => void;
  setClipboard: (clipboard: Clipboard) => void;
  closeMenu: () => void;
  openContext: (event: ReactMouseEvent, target: MenuTarget) => void;
  bumpRefresh: () => void;
  toggleExpand: (path: string) => void;
  onSelect: (entry: FsEntry) => void;
  /**
   * Drops the selection back to "nothing selected", so the directory actions fall back to the tree
   * root (BUG-009). A sibling of {@link onSelect} rather than a widened `onSelect`: this type is
   * public, and taking `FsEntry | null` where callers hand over `FsEntry` breaks assignment for
   * anyone who supplies a handler of their own.
   */
  clearSelection: () => void;
  actNewFile: (dir: string) => Promise<void>;
  actNewFolder: (dir: string) => Promise<void>;
  actRename: (entry: FsEntry) => Promise<void>;
  actDelete: (entry: FsEntry) => Promise<void>;
  actPaste: (dstDir: string) => Promise<void>;
  /** Opens the multi-file picker. Unchanged signature and behavior, now accepting several files. */
  actUpload: (dir: string) => void;
  /** Opens the folder picker. */
  actUploadFolder: (dir: string) => void;
  /**
   * Opens the "files or folder?" menu, and records the destination immediately — the target directory
   * follows from the selection at the moment upload was invoked, not from which item is chosen next.
   */
  openUploadMenu: (event: ReactMouseEvent, dir: string) => void;
  closeUploadMenu: () => void;
  actDownload: (entry: FsEntry) => void;
  onUploadPicked: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onUploadDirPicked: (event: React.ChangeEvent<HTMLInputElement>) => void;
  /** Spread onto the panel container so files dragged in from outside upload to `targetDir`. */
  dropZoneProps: DropZoneProps;
  handleNudge: () => Promise<void>;

  /** The confirm / prompt dialog element; `<FileExplorerRoot>` always mounts it. */
  dialog: ReactNode;
  /**
   * The batch upload progress panel and its conflict dialog. Mounted by `<FileExplorerRoot>` for the
   * same reason `dialog` is: a worker awaiting a collision answer whose dialog went unmounted would
   * park forever, and the batch with it.
   */
  uploadOverlay: ReactNode;
}

const FileExplorerContext = createContext<FileExplorerContextValue | null>(null);

/**
 * Read the explorer's shared state. Throws outside a provider rather than falling back to defaults —
 * a part rendered in the wrong tree used to fail silently and cosmetically (Sindri once shipped a
 * light-on-dark panel and an English-only panel inside an otherwise translated app, both because a
 * context was quietly missing), which is far harder to notice than a thrown error.
 */
export function useFileExplorer(): FileExplorerContextValue {
  const value = useContext(FileExplorerContext);
  if (!value) {
    throw new Error('File Explorer parts must be rendered inside <FileExplorer.Provider>.');
  }

  return value;
}

export interface FileExplorerProviderProps {
  /** Browsable sources. The picker lists them; with one source there is nothing to pick. */
  sources: FsSource[];
  /** Shared controller — header toggle / open-file card / a consumer-placed panel all bind one. */
  controller: FileExplorerController;
  /** What this explorer can do against a source. Only `listDir` is required. */
  providers: FsProviders;
  /** Override the tree root (absolute path); the source's own `rootPath` still shows as the cwd (AC2). */
  basePath?: string;
  /** Nudge an idle sandbox back to life (F-021 AC4); when provided, the empty state shows a Nudge button. */
  onNudge?: () => void | Promise<void>;
  /** Greys out the Nudge button — pass the host's "a run already holds the channel" state (F-023 AC6). */
  nudgeDisabled?: boolean;
  /** When provided, the header shows a close (X) button. */
  onClose?: () => void;
  /**
   * Per-file size cap in bytes for uploads; omitted means no cap. The sandbox edge server enforces
   * one (`FileWriteMaxBytes`) and a SourceSet volume, which streams in chunks, does not — so the
   * explorer takes it as a parameter. An oversized file fails in the browser rather than spending a
   * request to be told `400`.
   */
  maxUploadBytes?: number;
  /**
   * How many uploads may be in flight at once (default 3). This is the ceiling: the queue halves it
   * when the server pushes back and works back up. A source offering only the single-file `upload`
   * provider ignores it and runs strictly sequentially, since that signature cannot carry the
   * per-request options a batch needs.
   */
  uploadConcurrency?: number;
  children: ReactNode;
}

export function FileExplorerProvider(props: FileExplorerProviderProps): ReactNode {
  const {
    sources,
    controller,
    providers,
    basePath,
    onNudge,
    nudgeDisabled,
    onClose,
    maxUploadBytes,
    uploadConcurrency,
    children,
  } = props;
  const { listDir, saveFile, mkdir, remove, copy, move, upload, uploadMany, download } = providers;

  const { locale = 'en-US' } = useAsgardTemplateContext();
  const { dialog, requestInput, requestConfirm } = useFileExplorerDialog(locale);

  // A selected id that is not in `sources` falls back to the first source rather than resolving to no
  // source at all. The controller outlives any one source list — sandbox names are per-channel and get
  // recycled, and a controller held across a host's remount (see below) arrives carrying the previous
  // list's selection. Without the fallback that stale id produced a null root and the panel rendered
  // as a blank rectangle: no tree, no empty state, nothing to click.
  const activeSource = sources.find(s => s.id === controller.activeSourceId) ?? sources[0] ?? null;
  const activeSourceId = activeSource?.id ?? null;

  // Which directories are unfolded / what is selected / which file is open lives on the controller,
  // keyed by source (F-027 AC8). Two consequences fall out of that one move: switching sources shows
  // that source's own history instead of a wiped tree, and a host that remounts the panel (Sindri
  // rebuilds its conversation subtree on every conversation switch) can hold the controller above the
  // remount and keep the view. Everything below reads and writes it exactly like local state.
  const { expanded, selectedPath, selectedEntry, openFile } = controller.sourceView(activeSourceId);
  // Depend on `updateSourceView` alone, never the whole controller. `updateSourceView` writes
  // `sourceViews`, which is a controller field — so depending on the controller makes this callback a
  // function of its own side effect. The open-file effect below depends on `updateView`, and that loop
  // (effect → write → new controller → new updateView → effect) is issue #427.
  const { updateSourceView } = controller;
  const updateView = useCallback(
    (update: (prev: SourceViewState) => SourceViewState): void => {
      if (!activeSourceId) return;

      updateSourceView(activeSourceId, update);
    },
    [updateSourceView, activeSourceId],
  );

  const [refreshKey, setRefreshKey] = useState(0);
  const [clipboard, setClipboard] = useState<Clipboard>(null);
  const [menu, setMenu] = useState<OpenMenu>(null);
  const [uploadMenu, setUploadMenu] = useState<OpenUploadMenu>(null);
  const [dropping, setDropping] = useState(false);
  const [nudging, setNudging] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const uploadDirRef = useRef<string | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const uploadDirInputRef = useRef<HTMLInputElement>(null);

  const rootPath = basePath ?? activeSource?.rootPath ?? null;

  /** Where a directory action lands: the selected directory, else the tree root. */
  const targetDir = selectedEntry?.isDir ? selectedEntry.path : rootPath ?? '/';
  // Mirrored for the drop handlers below, which are memoized on the providers alone so that changing
  // the selection mid-drag does not rebuild them (and drop where the selection used to be).
  const targetDirRef = useRef(targetDir);
  targetDirRef.current = targetDir;

  const bumpRefresh = useCallback((): void => setRefreshKey(k => k + 1), []);
  const closeMenu = useCallback((): void => setMenu(null), []);

  const toggleExpand = useCallback(
    (path: string): void => {
      updateView(prev => {
        const next = new Set(prev.expanded);
        if (next.has(path)) next.delete(path);
        else next.add(path);

        return { ...prev, expanded: next };
      });
    },
    [updateView],
  );
  const expand = useCallback(
    (path: string): void => updateView(prev => ({ ...prev, expanded: new Set(prev.expanded).add(path) })),
    [updateView],
  );

  const onSelect = useCallback(
    (entry: FsEntry): void => updateView(prev => ({ ...prev, selectedPath: entry.path, selectedEntry: entry })),
    [updateView],
  );

  const clearSelection = useCallback(
    (): void => updateView(prev => ({ ...prev, selectedPath: null, selectedEntry: null })),
    [updateView],
  );

  const setOpenFile = useCallback(
    (entry: FsEntry | null): void => updateView(prev => ({ ...prev, openFile: entry })),
    [updateView],
  );

  // The context menu is per-interaction chrome, not part of a source's remembered view — a menu left
  // open while the source changes is stale in a way "where was I" state is not.
  useEffect(() => {
    setMenu(null);
  }, [activeSourceId]);

  // open-file intent (AC9): expand ancestors + highlight + open in the FileView.
  useEffect(() => {
    const rf = controller.requestedFile;
    if (!rf || rf.sourceId !== activeSourceId || !rootPath) return;

    updateView(prev => {
      const next = new Set(prev.expanded);
      ancestorDirs(rootPath, rf.absolutePath).forEach(d => next.add(d));

      return {
        ...prev,
        expanded: next,
        selectedPath: rf.absolutePath,
        openFile: {
          name: baseName(rf.absolutePath),
          path: rf.absolutePath,
          isDir: false,
          sizeBytes: 0,
          mtimeUnix: 0,
          mode: 0,
        },
      };
    });
  }, [controller.requestedFile, activeSourceId, rootPath, updateView]);

  // --- actions (toolbar + context menu share these) ---
  const run = useCallback(
    async (p: Promise<void> | void, affectedDir?: string): Promise<void> => {
      try {
        await Promise.resolve(p);
        if (affectedDir) expand(affectedDir);

        bumpRefresh();
      } catch {
        // Surface via the tree's own error rows on refetch; nothing to roll back here.
        bumpRefresh();
      }
    },
    [expand, bumpRefresh],
  );

  const actNewFile = useCallback(
    async (dir: string): Promise<void> => {
      if (!activeSourceId || !saveFile) return;

      const name = await requestInput({ title: t(locale, 'fileExplorer.newFilePrompt'), defaultValue: 'untitled.txt' });
      if (!name) return;

      void run(saveFile(activeSourceId, joinPath(dir, name), ''), dir);
    },
    [activeSourceId, saveFile, run, requestInput, locale],
  );
  const actNewFolder = useCallback(
    async (dir: string): Promise<void> => {
      if (!activeSourceId || !mkdir) return;

      const name = await requestInput({ title: t(locale, 'fileExplorer.newFolderPrompt'), defaultValue: 'new-folder' });
      if (!name) return;

      void run(mkdir(activeSourceId, joinPath(dir, name)), dir);
    },
    [activeSourceId, mkdir, run, requestInput, locale],
  );
  const actRename = useCallback(
    async (entry: FsEntry): Promise<void> => {
      if (!activeSourceId || !move) return;

      const name = await requestInput({ title: t(locale, 'fileExplorer.renamePrompt'), defaultValue: entry.name });
      if (!name || name === entry.name) return;

      void run(move(activeSourceId, entry.path, joinPath(parentDir(entry.path), name)), parentDir(entry.path));
    },
    [activeSourceId, move, run, requestInput, locale],
  );
  const actDelete = useCallback(
    async (entry: FsEntry): Promise<void> => {
      if (!activeSourceId || !remove) return;

      const confirmed = await requestConfirm({
        title: t(locale, entry.isDir ? 'fileExplorer.confirmDeleteDir' : 'fileExplorer.confirmDelete', {
          name: entry.name,
        }),
      });
      if (!confirmed) return;

      void run(remove(activeSourceId, entry.path, entry.isDir), parentDir(entry.path));
    },
    [activeSourceId, remove, run, requestConfirm, locale],
  );
  const actPaste = useCallback(
    async (dstDir: string): Promise<void> => {
      if (!activeSourceId || !clipboard) return;

      const { op, entry } = clipboard;
      // Cutting and pasting into the same folder is a no-op, not a collision — deduplicating it would
      // silently rename the item the user only meant to leave where it was.
      if (op === 'cut' && parentDir(entry.path) === dstDir) {
        setClipboard(null);

        return;
      }

      // Ask the destination what it already holds. If the listing fails, fall back to the plain name:
      // a 409 from the backend is a worse outcome than a wrong-looking suffix, but a failed *listing*
      // says nothing about whether the name is taken, so inventing a suffix would be the wrong guess.
      let name = entry.name;
      try {
        const listing = await listDir(activeSourceId, dstDir);
        name = uniqueName(new Set(listing.entries.map(e => e.name)), entry.name);
      } catch {
        name = entry.name;
      }

      const dst = joinPath(dstDir, name);
      if (op === 'copy') {
        if (copy) void run(copy(activeSourceId, entry.path, dst), dstDir);
      } else if (move) {
        void run(move(activeSourceId, entry.path, dst), dstDir);
        setClipboard(null);
      }
    },
    [activeSourceId, clipboard, copy, move, listDir, run],
  );
  // --- batch upload (F-031) ---
  //
  // Every file is its own request: there is no batch endpoint anywhere in the chain. The queue below
  // owns the pacing, the collision prompts and cancellation; this layer only turns a relative path
  // into an absolute one and hands over a provider.

  /**
   * Writes one file of a batch. `uploadMany` is the real path; a source offering only the legacy
   * `upload` still works, and still keeps the folder structure — that signature derives its
   * destination as `${dirPath}/${file.name}`, so the relative directory goes into `dirPath` and the
   * backend creates the levels. What it cannot express is `createOnly` or `signal`, so a degraded
   * batch overwrites silently (exactly as single-file upload always has) and cannot be interrupted
   * mid-request.
   */
  const uploadWrite = useCallback<UploadWrite>(
    (relPath, file, options) => {
      const dir = uploadDirRef.current;

      if (!activeSourceId || !dir) return Promise.reject(new Error('No upload destination is selected.'));

      if (uploadMany) return uploadMany(activeSourceId, dir, relPath, file, options);

      if (upload) {
        const { dir: relDir } = splitRelPath(relPath);

        return upload(activeSourceId, relDir ? joinPath(dir, relDir) : dir, file);
      }

      return Promise.reject(new Error('This source cannot upload.'));
    },
    [activeSourceId, upload, uploadMany],
  );

  const uploadMkdir = useCallback(
    (relPath: string): Promise<void> => {
      const dir = uploadDirRef.current;

      if (!activeSourceId || !dir || !mkdir) return Promise.resolve();

      return mkdir(activeSourceId, joinPath(dir, relPath));
    },
    [activeSourceId, mkdir],
  );

  const uploads = useUploadQueue({
    write: uploadWrite,
    // Only the drag path ever reports empty directories, and `mkdir` is what preserves them.
    mkdir: mkdir ? uploadMkdir : undefined,
    maxBytes: maxUploadBytes,
    // A legacy-only source cannot carry per-request options, so it runs strictly one at a time.
    concurrency: uploadMany ? uploadConcurrency : 1,
    // One refresh for the whole batch. The per-action `run()` below bumps once per action, which is
    // right for a single mutation and wrong by two hundred for a folder upload.
    onSettled: () => {
      const dir = uploadDirRef.current;
      if (dir) expand(dir);

      bumpRefresh();
    },
  });

  const startUpload = useCallback(
    (dir: string, plan: UploadPlan): void => {
      if (isUploadPlanEmpty(plan)) return;

      uploadDirRef.current = dir;
      uploads.start(plan);
    },
    [uploads],
  );

  const actUpload = useCallback((dir: string): void => {
    uploadDirRef.current = dir;
    uploadInputRef.current?.click();
  }, []);
  const actUploadFolder = useCallback((dir: string): void => {
    uploadDirRef.current = dir;
    uploadDirInputRef.current?.click();
  }, []);

  /**
   * The upload button asks "files or folder?" rather than doing one of them, because the two really
   * do differ: a folder pick cannot see empty folders, and a file pick cannot see folders at all.
   * The destination is recorded here, when upload was invoked — not when the choice is made.
   */
  const openUploadMenu = useCallback((event: ReactMouseEvent, dir: string): void => {
    const rootRect = rootRef.current?.getBoundingClientRect();
    const buttonRect = event.currentTarget.getBoundingClientRect();

    uploadDirRef.current = dir;
    setUploadMenu({
      x: rootRect ? buttonRect.left - rootRect.left : buttonRect.left,
      y: rootRect ? buttonRect.bottom - rootRect.top + 2 : buttonRect.bottom,
      dir,
    });
  }, []);
  const closeUploadMenu = useCallback((): void => setUploadMenu(null), []);

  /**
   * Reads a picked `FileList` and starts the batch.
   *
   * The copy on the first line is not incidental. `input.files` is **live**: clearing `input.value`
   * empties the very `FileList` you are holding, so reading it afterwards finds nothing and the batch
   * silently never starts. And the value does have to be cleared, or picking the same file twice in a
   * row fires no `change` at all. Copy first, then clear.
   */
  const takePicked = useCallback(
    (input: HTMLInputElement, source: UploadPlanSource): void => {
      const picked = input.files ? Array.from(input.files) : [];
      const dir = uploadDirRef.current;

      input.value = '';
      if (picked.length === 0 || !dir) return;

      startUpload(dir, planFromFileList(picked, source));
    },
    [startUpload],
  );

  const onUploadPicked = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>): void => takePicked(e.target, 'files'),
    [takePicked],
  );

  const onUploadDirPicked = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>): void => takePicked(e.target, 'directory'),
    [takePicked],
  );

  /**
   * Accepts files dragged in **from outside the browser** only. Dragging nodes around inside the tree
   * stays unsupported (moving is cut-and-paste, per the SourceSet explorer's own decision), which is
   * also why the highlight covers the whole container rather than the row under the cursor: a per-row
   * highlight would advertise dropping onto a node, and that is the gesture that does not exist.
   *
   * Spread on the panel container (`FileExplorerRoot`), so every part of the panel behaves the same
   * way — the toolbar and the header strip are as much "the File Explorer" to the person dragging as
   * the tree is, and the upload progress panel covers the tree's own bottom edge mid-batch.
   */
  const dropZoneProps = useMemo<DropZoneProps>(() => {
    /** Will this panel serve the drag? Only a served drag is claimed; anything else passes through. */
    const serves = (event: ReactDragEvent<HTMLElement>): boolean =>
      !openFile && (!!upload || !!uploadMany) && isFileDrag(event.dataTransfer);

    /**
     * Take the event out of circulation. `preventDefault()` alone only suppresses the browser default
     * — the event keeps bubbling, and the chat shell around this panel is itself a drop target that
     * turns dropped files into composer attachments. Without the `stopPropagation()`, one drop into
     * the panel both uploaded the batch *and* left one attachment chip per file to dismiss by hand
     * (issue #446), and every `dragenter` crossing the panel lit the shell's global drop overlay
     * beside this panel's own highlight.
     */
    const claim = (event: ReactDragEvent<HTMLElement>): void => {
      event.preventDefault();
      event.stopPropagation();
    };

    return {
      onDragEnter: (event: ReactDragEvent<HTMLElement>): void => {
        if (!serves(event)) return;

        claim(event);
        setDropping(true);
      },
      onDragOver: (event: ReactDragEvent<HTMLElement>): void => {
        if (!serves(event)) return;

        claim(event);
        setDropping(true);
      },
      onDragLeave: (event: ReactDragEvent<HTMLElement>): void => {
        if (!serves(event)) return;

        // Claimed before the guard below, not after: a move between two rows inside the panel is the
        // panel's own business, and letting that `dragleave` reach the shell would decrement a
        // counter this panel never let it increment — leaving its overlay stuck on afterwards.
        claim(event);

        // Only the container's own leave counts; bubbling from a child row would flicker the state.
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;

        setDropping(false);
      },
      onDrop: (event: ReactDragEvent<HTMLElement>): void => {
        if (!serves(event)) return;

        claim(event);
        setDropping(false);

        const dir = targetDirRef.current;
        // `DataTransfer` does not survive the await inside, so hand it over synchronously.
        const dataTransfer = event.dataTransfer;

        void planFromDataTransfer(dataTransfer).then(plan => startUpload(dir, plan));
      },
    };
  }, [openFile, upload, uploadMany, startUpload]);
  const actDownload = useCallback(
    (entry: FsEntry): void => {
      if (activeSourceId && download) void download(activeSourceId, entry.path, entry.name);
    },
    [activeSourceId, download],
  );

  const handleNudge = useCallback(async (): Promise<void> => {
    if (!onNudge || nudging || nudgeDisabled) return;

    setNudging(true);
    try {
      await onNudge();
    } catch {
      // A nudge is refused outright while a run holds the channel (F-023 AC6), and the host may reject
      // for its own reasons. Nothing here can act on that, and this runs from a click handler — an
      // uncaught rejection would surface as an unhandled promise rejection rather than anything useful.
    } finally {
      setNudging(false);
    }
  }, [onNudge, nudging, nudgeDisabled]);

  const openContext = useCallback(
    (e: ReactMouseEvent, target: MenuTarget): void => {
      e.preventDefault();
      e.stopPropagation();
      const rect = rootRef.current?.getBoundingClientRect();
      setMenu({ x: rect ? e.clientX - rect.left : e.clientX, y: rect ? e.clientY - rect.top : e.clientY, target });
      if (target.kind !== 'background') {
        updateView(prev => ({ ...prev, selectedPath: target.entry.path, selectedEntry: target.entry }));
      }
    },
    [updateView],
  );

  const pasteLabel = clipboard
    ? t(locale, 'fileExplorer.pasteNamed', { name: clipboard.entry.name })
    : t(locale, 'fileExplorer.paste');

  /**
   * The chat explorer's copy for the shared upload UI, drawn from `fileExplorer.*`. The components
   * themselves hold no strings: the SourceSet explorer mounts the same ones against its own
   * `sourceSetExplorer.*` namespace, so neither namespace can be baked in.
   */
  const uploadLabels = useMemo<UploadLabels>(
    () => ({
      region: t(locale, 'fileExplorer.uploadProgress'),
      uploading: t(locale, 'fileExplorer.uploading'),
      cancelled: t(locale, 'fileExplorer.uploadCancelled'),
      doneWithFailures: t(locale, 'fileExplorer.uploadDoneWithFailures'),
      done: t(locale, 'fileExplorer.uploadDone'),
      cancel: t(locale, 'fileExplorer.cancel'),
      retry: (count): string => t(locale, 'fileExplorer.uploadRetry', { count: String(count) }),
      dismiss: t(locale, 'fileExplorer.uploadDismiss'),
      throttled: (limit, max): string =>
        t(locale, 'fileExplorer.uploadThrottled', { limit: String(limit), max: String(max) }),
      emptyDirsHint: t(locale, 'fileExplorer.uploadEmptyDirsHint'),
      reason: (reason: UploadReason): string => {
        switch (reason.code) {
          case 'too-large':
            return t(locale, 'fileExplorer.uploadTooLarge', {
              max: formatUploadSize(reason.maxBytes),
              size: formatUploadSize(reason.size),
            });
          case 'exists-skipped':
            return t(locale, 'fileExplorer.uploadExistsSkipped');
          case 'cancelled':
            return t(locale, 'fileExplorer.uploadCancelled');
          default:
            if (reason.status === 403) return t(locale, 'fileExplorer.uploadForbidden');

            if (reason.status === 413) return t(locale, 'fileExplorer.uploadTooLargeForServer');

            if (reason.status === 429) return t(locale, 'fileExplorer.uploadServerBusy');

            if (reason.status !== undefined && reason.status >= 500) {
              return t(locale, 'fileExplorer.uploadServerError', { status: String(reason.status) });
            }

            return reason.message || t(locale, 'fileExplorer.uploadUnknownError');
        }
      },
      conflictTitle: t(locale, 'fileExplorer.uploadConflictTitle'),
      skip: t(locale, 'fileExplorer.uploadSkip'),
      keepBoth: t(locale, 'fileExplorer.uploadKeepBoth'),
      overwrite: t(locale, 'fileExplorer.uploadOverwrite'),
      applyToRest: (count): string => t(locale, 'fileExplorer.uploadApplyToRest', { count: String(count) }),
      allSkip: t(locale, 'fileExplorer.uploadAllSkip'),
      allKeepBoth: t(locale, 'fileExplorer.uploadAllKeepBoth'),
      allOverwrite: t(locale, 'fileExplorer.uploadAllOverwrite'),
      cancelBatch: t(locale, 'fileExplorer.uploadCancelBatch'),
    }),
    [locale],
  );

  const uploadOverlay = useMemo(
    () => (
      <>
        <UploadProgress
          items={uploads.items}
          running={uploads.running}
          cancelled={uploads.cancelled}
          limit={uploads.limit}
          ceiling={uploads.ceiling}
          source={uploads.source}
          labels={uploadLabels}
          onCancel={uploads.cancel}
          onRetryFailed={uploads.retryFailed}
          onDismiss={uploads.dismiss}
        />
        {uploads.conflict && (
          <UploadConflictDialog ask={uploads.conflict} labels={uploadLabels} onAnswer={uploads.answerConflict} />
        )}
      </>
    ),
    [uploads, uploadLabels],
  );

  const value = useMemo<FileExplorerContextValue>(
    () => ({
      sources,
      activeSource,
      activeSourceId,
      rootPath,
      providers,
      controller,
      locale,
      onClose,
      onNudge,
      nudgeDisabled,
      expanded,
      selectedPath,
      selectedEntry,
      refreshKey,
      openFile,
      clipboard,
      menu,
      uploadMenu,
      dropping,
      nudging,
      targetDir,
      pasteLabel,
      rootRef,
      uploadInputRef,
      uploadDirInputRef,
      setOpenFile,
      setClipboard,
      closeMenu,
      openContext,
      bumpRefresh,
      toggleExpand,
      onSelect,
      clearSelection,
      actNewFile,
      actNewFolder,
      actRename,
      actDelete,
      actPaste,
      actUpload,
      actUploadFolder,
      openUploadMenu,
      closeUploadMenu,
      actDownload,
      onUploadPicked,
      onUploadDirPicked,
      dropZoneProps,
      handleNudge,
      dialog,
      uploadOverlay,
    }),
    [
      sources,
      activeSource,
      activeSourceId,
      rootPath,
      providers,
      controller,
      locale,
      onClose,
      onNudge,
      nudgeDisabled,
      expanded,
      selectedPath,
      selectedEntry,
      refreshKey,
      openFile,
      setOpenFile,
      clipboard,
      menu,
      uploadMenu,
      dropping,
      nudging,
      targetDir,
      pasteLabel,
      closeMenu,
      openContext,
      bumpRefresh,
      toggleExpand,
      onSelect,
      clearSelection,
      actNewFile,
      actNewFolder,
      actRename,
      actDelete,
      actPaste,
      actUpload,
      actUploadFolder,
      openUploadMenu,
      closeUploadMenu,
      actDownload,
      onUploadPicked,
      onUploadDirPicked,
      dropZoneProps,
      handleNudge,
      dialog,
      uploadOverlay,
    ],
  );

  return <FileExplorerContext.Provider value={value}>{children}</FileExplorerContext.Provider>;
}
