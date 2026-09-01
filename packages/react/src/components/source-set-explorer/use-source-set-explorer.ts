import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AsgardSourceSetClient } from '@asgard-js/core';
import type { FsEntry } from '../file-explorer/types';
import {
  isUploadPlanEmpty,
  useUploadQueue,
  type UploadPlan,
  type UploadQueue,
  type UploadWrite,
} from '../upload-queue';
import { type Locale, t } from '../../i18n';
import { blobToDataUrl, blobToText, isImageName, saveBlob } from './blob';
import { isConflict, volumeErrorMessage } from './errors';
import { baseName, isWithin, joinPath, normalizeRefPath, parentDir, pathChain, sortEntries, uniqueName } from './paths';

/**
 * One directory's listing. `total` / `complete` come straight from `listAll` (F-026): `complete: false`
 * means `entries` is not known to be the whole directory, and `total - entries.length` is the shortfall
 * to report — except when `total` is 0, which means the volume never said how many there are.
 */
export interface DirListing {
  status: 'loading' | 'loaded' | 'error';
  entries: FsEntry[];
  total: number;
  complete: boolean;
  error?: string;
}

export interface ClipboardState {
  entry: FsEntry;
  mode: 'copy' | 'cut';
}

export interface SourceSetExplorerOptions {
  client: AsgardSourceSetClient;
  /** Tree root, volume-relative. `''` is the volume root. */
  rootPath: string;
  /** Path to reveal and select on first render. */
  initialPath?: string;
  /** Directories to open on mount, each with its own chain. A seed, not tracked state — see the effect. */
  autoExpandPaths?: readonly string[];
  /** Told about every selection change, including the ones the component makes on its own. */
  onSelectEntry?: (entry: FsEntry | null) => void;
  locale: Locale;
  /** Ceiling for one directory's auto-paging walk. */
  maxEntries?: number;
  /** Ceiling on concurrent uploads (the AIMD upper bound). Defaults to the queue's own 3. */
  uploadConcurrency?: number;
  readOnly: boolean;
  onError?: (error: unknown) => void;
  /** Ask the user for a name; resolves `null` when dismissed. */
  requestInput: (options: { title: string; defaultValue?: string }) => Promise<string | null>;
  /** Ask the user to confirm; resolves `true` only on explicit confirmation. */
  requestConfirm: (options: { title: string }) => Promise<boolean>;
}

export interface SourceSetExplorerController {
  listings: Readonly<Record<string, DirListing>>;
  expanded: ReadonlySet<string>;
  selected: FsEntry | null;
  openFile: FsEntry | null;
  clipboard: ClipboardState | null;
  /** Last failed operation, for the shell's error bar. `null` when the last one succeeded. */
  error: string | null;
  /** Bumped by refresh; the file view is keyed on it so a refresh re-reads the open file too. */
  refreshToken: number;
  busy: boolean;
  dismissError: () => void;
  select: (entry: FsEntry | null) => void;
  toggleExpand: (entry: FsEntry) => void;
  open: (entry: FsEntry) => void;
  closeFile: () => void;
  refresh: () => void;
  newFile: () => Promise<void>;
  newFolder: () => Promise<void>;
  /**
   * The batch upload queue (BUG-008): worker pool, AIMD back-off, collision prompts, cancellation.
   *
   * Deliberately the same `useUploadQueue` the chat explorer drives rather than a second limiter — see
   * `components/upload-queue/index.ts`. The batch therefore does **not** go through `mutate()`: its
   * progress lives in the queue's own panel, and routing it through `busy` would report the same thing
   * twice, in less detail.
   */
  uploads: UploadQueue;
  /** Start a batch into `dir`. An empty plan (dismissed picker, drop carrying nothing) is a no-op. */
  startUpload: (dir: string, plan: UploadPlan) => void;
  download: () => Promise<void>;
  copy: () => void;
  cut: () => void;
  paste: () => Promise<void>;
  rename: () => Promise<void>;
  remove: () => Promise<void>;
  readFile: (path: string) => Promise<string>;
  saveFile: (path: string, content: string) => Promise<void>;
  /** The directory new entries land in: the selection if it is a directory, else its parent. */
  targetDir: string;
}

/** The root entry stands in for the volume root, which has no listing entry of its own. */
export function rootEntry(rootPath: string): FsEntry {
  return { name: baseName(rootPath) || '/', isDir: true, path: rootPath, sizeBytes: 0, mtimeUnix: 0, mode: 0 };
}

/** Directories between `root` and `path`, so revealing `initialPath` expands each one. */
function ancestorDirs(root: string, path: string): string[] {
  if (!isWithin(root, path) || path === root) return [];

  const rest = root === '' ? path : path.slice(root.length + 1);
  const parts = rest.split('/').filter(Boolean);
  parts.pop();

  const dirs: string[] = [];
  let cur = root;
  for (const part of parts) {
    cur = joinPath(cur, part);
    dirs.push(cur);
  }

  return dirs;
}

/**
 * The directories a fresh tree opens with: the root, the chain down to `initialPath`, and every chain
 * named by `autoExpandPaths` (BUILD-075 R4).
 *
 * `ancestorDirs` deliberately stops one short of its argument — `initialPath` is usually a file, and a
 * file has nothing to open. A search path is the opposite: `git/skills/pdf` is asking to see *inside*
 * `git/skills/pdf`, so its own level belongs in the set. Each chain is clipped to `root`, which is both
 * what keeps a path outside the subtree from opening anything and what drops the levels above the root.
 */
function seedExpansion(
  root: string,
  initialPath: string | undefined,
  autoExpandPaths?: readonly string[],
): Set<string> {
  const reveal = initialPath && isWithin(root, initialPath) ? initialPath : null;
  const seed = new Set([root, ...(reveal ? ancestorDirs(root, reveal) : [])]);

  for (const raw of autoExpandPaths ?? []) {
    const path = normalizeRefPath(raw);
    if (path === '' || !isWithin(root, path)) continue;

    for (const dir of pathChain(path)) {
      if (isWithin(root, dir)) seed.add(dir);
    }
  }

  return seed;
}

/**
 * The SourceSet explorer's whole state machine: which directories are listed, what is expanded and
 * selected, the clipboard, and every mutation.
 *
 * Deliberately one hook rather than a context provider. The sandbox explorer needs a context because its
 * parts are composed by hosts; this component is a single closed shell (F-025), so a context would be an
 * export surface with nothing to plug into it.
 */
export function useSourceSetExplorer(options: SourceSetExplorerOptions): SourceSetExplorerController {
  const {
    client,
    rootPath,
    initialPath,
    autoExpandPaths,
    onSelectEntry,
    locale,
    maxEntries,
    uploadConcurrency,
    readOnly,
    onError,
    requestInput,
    requestConfirm,
  } = options;

  const [listings, setListings] = useState<Record<string, DirListing>>({});
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() =>
    seedExpansion(rootPath, initialPath, autoExpandPaths),
  );
  const [selected, setSelected] = useState<FsEntry | null>(null);
  const [openFile, setOpenFile] = useState<FsEntry | null>(null);
  const [clipboard, setClipboard] = useState<ClipboardState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [busy, setBusy] = useState(false);

  // A listing that arrives after a newer one for the same path was requested must not overwrite it —
  // collapsing and re-expanding a large directory otherwise settles on whichever walk finished last.
  const seq = useRef<Record<string, number>>({});

  const report = useCallback(
    (e: unknown, contextKey?: string): void => {
      setError(volumeErrorMessage(e, locale, contextKey ? t(locale, contextKey) : undefined));
      onError?.(e);
    },
    [locale, onError],
  );

  const listDir = useCallback(
    async (path: string): Promise<void> => {
      const ticket = (seq.current[path] ?? 0) + 1;
      seq.current[path] = ticket;

      setListings(prev => ({
        ...prev,
        [path]: { status: 'loading', entries: prev[path]?.entries ?? [], total: 0, complete: true },
      }));

      try {
        const result = await client.listAll(path, maxEntries != null ? { maxEntries } : undefined);
        if (seq.current[path] !== ticket) return;

        const entries = sortEntries(result.entries.map(entry => ({ ...entry, path: joinPath(path, entry.name) })));

        setListings(prev => ({
          ...prev,
          [path]: { status: 'loaded', entries, total: result.total, complete: result.complete },
        }));
      } catch (e) {
        if (seq.current[path] !== ticket) return;

        // A failed page must not leave a partial listing looking whole (F-026). The node reports the
        // error and shows nothing rather than the entries an earlier walk happened to collect.
        setListings(prev => ({
          ...prev,
          [path]: {
            status: 'error',
            entries: [],
            total: 0,
            complete: false,
            error: volumeErrorMessage(e, locale),
          },
        }));
        onError?.(e);
      }
    },
    [client, maxEntries, locale, onError],
  );

  // `autoExpandPaths` is read through a ref so it can seed this effect without being a dependency of it
  // (BUILD-075 R5). As a dependency it would be tracked state rather than a seed: the host recomputes
  // the array whenever its own Search Paths change, and re-running would spring the tree back open over
  // whatever the user had collapsed — mid-gesture, while they are still choosing the next folder.
  const autoExpandRef = useRef(autoExpandPaths);
  autoExpandRef.current = autoExpandPaths;

  // First listing, plus revealing `initialPath`. Re-runs when the volume itself changes.
  useEffect(() => {
    setListings({});
    setSelected(null);
    setOpenFile(null);
    setClipboard(null);
    setError(null);
    seq.current = {};

    const reveal = initialPath && isWithin(rootPath, initialPath) ? initialPath : null;
    const dirs = reveal ? [rootPath, ...ancestorDirs(rootPath, reveal)] : [rootPath];
    setExpanded(seedExpansion(rootPath, initialPath, autoExpandRef.current));
    // Only the root and `initialPath`'s ancestors are fetched here. A seeded chain is walked one level
    // at a time by the effect below instead — see there for why it cannot be fetched up front.
    dirs.forEach(dir => void listDir(dir));
  }, [rootPath, initialPath, listDir]);

  // Fetches the seeded chain, one confirmed directory at a time (R4).
  //
  // Not part of the eager list above, because a seed is a path a *host* wrote and nothing has said it is
  // a directory yet: firing `list` at `notes/todo.md` answers 400 and reaches the host as an `onError`
  // it can do nothing about. Waiting for the parent's listing settles the question — an entry that turns
  // out to be a file is simply never listed, and never renders a body either way.
  //
  // Terminates because every path it acts on gets a listing (`loading` synchronously, then `loaded` or
  // `error`), and the first guard skips any path that has one.
  useEffect(() => {
    for (const path of expanded) {
      if (path === rootPath || listings[path]) continue;

      const parent = listings[parentDir(path)];
      if (parent?.status !== 'loaded') continue;

      if (parent.entries.some(entry => entry.path === path && entry.isDir)) void listDir(path);
    }
  }, [expanded, listings, rootPath, listDir]);

  // Reports selection changes to the host (R6).
  //
  // Watched rather than wired into `select`, because `select` is only one of the ways the selection
  // moves: revealing `initialPath` sets it, `rename` and `remove` drop it, and changing `rootPath`
  // clears it. A watcher covers all of them without every call site having to remember, and it reports
  // changes only — `lastReported` starts at `null` so a mount with nothing selected stays quiet.
  const onSelectEntryRef = useRef(onSelectEntry);
  onSelectEntryRef.current = onSelectEntry;
  const lastReported = useRef<FsEntry | null>(null);
  useEffect(() => {
    if (lastReported.current === selected) return;

    lastReported.current = selected;
    onSelectEntryRef.current?.(selected);
  }, [selected]);

  // Select `initialPath` once its parent listing lands, so the selection carries the real entry (with
  // `isDir`) rather than one synthesized from the path.
  const revealed = useRef(false);
  useEffect(() => {
    if (revealed.current || !initialPath || !isWithin(rootPath, initialPath)) return;

    const entry = listings[parentDir(initialPath)]?.entries.find(it => it.path === initialPath);
    if (entry) {
      revealed.current = true;
      setSelected(entry);
    }
  }, [listings, initialPath, rootPath]);

  const targetDir = useMemo((): string => {
    if (!selected) return rootPath;

    return selected.isDir ? selected.path : parentDir(selected.path);
  }, [selected, rootPath]);

  /** Re-list a directory that is on screen; a collapsed one just drops its cache and re-lists on expand. */
  const invalidate = useCallback(
    (path: string): void => {
      if (expanded.has(path) || path === rootPath) {
        void listDir(path);

        return;
      }

      setListings(prev => {
        if (!(path in prev)) return prev;

        const next = { ...prev };
        delete next[path];

        return next;
      });
    },
    [expanded, rootPath, listDir],
  );

  /** Run a mutation, then re-list what it touched and surface any failure. */
  const mutate = useCallback(
    async (contextKey: string, run: () => Promise<void>, touched: string[]): Promise<void> => {
      setBusy(true);
      try {
        await run();
        setError(null);
        [...new Set(touched)].forEach(invalidate);
      } catch (e) {
        report(e, contextKey);
      } finally {
        setBusy(false);
      }
    },
    [invalidate, report],
  );

  /** Names already used in `dir`, for dedupe. Loads the listing first when it is not on hand. */
  const takenIn = useCallback(
    async (dir: string): Promise<Set<string>> => {
      const known = listings[dir];
      if (known?.status === 'loaded') return new Set(known.entries.map(it => it.name));

      const result = await client.listAll(dir, maxEntries != null ? { maxEntries } : undefined);

      return new Set(result.entries.map(it => it.name));
    },
    [listings, client, maxEntries],
  );

  const select = useCallback((entry: FsEntry | null): void => setSelected(entry), []);

  const toggleExpand = useCallback(
    (entry: FsEntry): void => {
      if (!entry.isDir) return;

      setExpanded(prev => {
        const next = new Set(prev);
        if (next.has(entry.path)) {
          next.delete(entry.path);
        } else {
          next.add(entry.path);
          if (listings[entry.path]?.status !== 'loaded') void listDir(entry.path);
        }

        return next;
      });
    },
    [listings, listDir],
  );

  const open = useCallback((entry: FsEntry): void => {
    if (entry.isDir) return;

    setOpenFile(entry);
  }, []);

  const closeFile = useCallback((): void => setOpenFile(null), []);

  const refresh = useCallback((): void => {
    setError(null);
    setRefreshToken(n => n + 1);
    [...expanded].forEach(dir => void listDir(dir));
  }, [expanded, listDir]);

  const newFile = useCallback(async (): Promise<void> => {
    const name = await requestInput({ title: t(locale, 'sourceSetExplorer.newFilePrompt') });
    if (!name) return;

    const dir = targetDir;
    await mutate(
      'sourceSetExplorer.opNewFile',
      async () => {
        try {
          await client.write(joinPath(dir, name), '', { createOnly: true });
        } catch (e) {
          // R9: `createOnly` turns an existing name into a 409 instead of an overwrite. Say which name.
          if (isConflict(e)) throw new Error(t(locale, 'sourceSetExplorer.errorNameTaken', { name }));

          throw e;
        }
      },
      [dir],
    );
  }, [requestInput, locale, targetDir, mutate, client]);

  const newFolder = useCallback(async (): Promise<void> => {
    const name = await requestInput({ title: t(locale, 'sourceSetExplorer.newFolderPrompt') });
    if (!name) return;

    const dir = targetDir;
    await mutate('sourceSetExplorer.opNewFolder', () => client.mkdir(joinPath(dir, name)), [dir]);
  }, [requestInput, locale, targetDir, mutate, client]);

  // --- batch upload (BUG-008) ---
  //
  // Every file is its own `PUT volume/file`; the volume has no batch endpoint. The shared queue owns the
  // pacing, the collision prompts and cancellation, and this layer only turns a plan-relative path into a
  // volume path. Recorded when the batch starts rather than read live, so changing the selection while
  // two hundred files are in flight cannot move the destination out from under them.
  const uploadDirRef = useRef(rootPath);

  /**
   * Writes one file of a batch.
   *
   * No `mkdir` for the intermediate levels of `a/b/c.txt`: `PUT volume/file` creates the parent
   * directories itself, so pre-creating them would be one extra round trip per level per file.
   */
  const uploadWrite = useCallback<UploadWrite>(
    async (relPath, file, { createOnly, signal }) => {
      await client.write(joinPath(uploadDirRef.current, relPath), file, { createOnly, signal });
    },
    [client],
  );

  /** Only the drag path can ever report an empty directory; this is what preserves it. */
  const uploadMkdir = useCallback(
    async (relPath: string, { signal }: { signal: AbortSignal }): Promise<void> => {
      await client.mkdir(joinPath(uploadDirRef.current, relPath), { signal });
    },
    [client],
  );

  // One re-list for the whole batch, not one per file: `mutate()` invalidates per action, which is right
  // for a single mutation and wrong by two hundred for a folder upload. Cancellation lands here too —
  // whatever did get written is already on the volume and has to show up.
  const onUploadSettled = useCallback((): void => {
    const dir = uploadDirRef.current;

    setExpanded(prev => (prev.has(dir) ? prev : new Set(prev).add(dir)));
    void listDir(dir);
  }, [listDir]);

  const uploads = useUploadQueue({
    write: uploadWrite,
    mkdir: uploadMkdir,
    // No `maxBytes`. The volume streams writes in chunks and has no per-file cap — the in-sandbox one is
    // a different backend's limit, and carrying it across would reject files this volume accepts.
    concurrency: uploadConcurrency,
    onSettled: onUploadSettled,
  });

  const startUpload = useCallback(
    (dir: string, plan: UploadPlan): void => {
      if (isUploadPlanEmpty(plan)) return;

      uploadDirRef.current = dir;
      uploads.start(plan);
    },
    [uploads],
  );

  const download = useCallback(async (): Promise<void> => {
    const entry = selected;
    if (!entry || entry.isDir) return;

    setBusy(true);
    try {
      const result = await client.read(entry.path);
      saveBlob(result.content, entry.name);
      setError(null);
    } catch (e) {
      report(e, 'sourceSetExplorer.opDownload');
    } finally {
      setBusy(false);
    }
  }, [selected, client, report]);

  const copy = useCallback((): void => {
    if (selected) setClipboard({ entry: selected, mode: 'copy' });
  }, [selected]);

  const cut = useCallback((): void => {
    if (selected) setClipboard({ entry: selected, mode: 'cut' });
  }, [selected]);

  const paste = useCallback(async (): Promise<void> => {
    const held = clipboard;
    if (!held) return;

    const dir = targetDir;
    // Pasting a directory into itself or its own descendant would recurse; the volume would either
    // 409 or churn, and neither reads as an explanation.
    if (held.entry.isDir && isWithin(held.entry.path, dir)) {
      setError(t(locale, 'sourceSetExplorer.errorPasteIntoSelf'));

      return;
    }

    const from = parentDir(held.entry.path);
    await mutate(
      'sourceSetExplorer.opPaste',
      async () => {
        const name = uniqueName(await takenIn(dir), held.entry.name);
        const dst = joinPath(dir, name);
        if (held.mode === 'cut') await client.move(held.entry.path, dst);
        else await client.copy(held.entry.path, dst);
      },
      [dir, from],
    );

    if (held.mode === 'cut') setClipboard(null);
  }, [clipboard, targetDir, locale, mutate, takenIn, client]);

  const rename = useCallback(async (): Promise<void> => {
    const entry = selected;
    if (!entry) return;

    const name = await requestInput({
      title: t(locale, 'sourceSetExplorer.renamePrompt'),
      defaultValue: entry.name,
    });
    if (!name || name === entry.name) return;

    const dir = parentDir(entry.path);
    await mutate(
      'sourceSetExplorer.opRename',
      async () => {
        try {
          await client.move(entry.path, joinPath(dir, name));
        } catch (e) {
          if (isConflict(e)) throw new Error(t(locale, 'sourceSetExplorer.errorNameTaken', { name }));

          throw e;
        }
      },
      [dir],
    );

    if (openFile?.path === entry.path) setOpenFile(null);

    setSelected(null);
  }, [selected, requestInput, locale, mutate, client, openFile]);

  const remove = useCallback(async (): Promise<void> => {
    const entry = selected;
    if (!entry) return;

    const confirmed = await requestConfirm({
      title: t(locale, entry.isDir ? 'sourceSetExplorer.confirmDeleteDir' : 'sourceSetExplorer.confirmDelete', {
        name: entry.name,
      }),
    });
    if (!confirmed) return;

    const dir = parentDir(entry.path);
    await mutate(
      'sourceSetExplorer.opDelete',
      // A directory goes through `removeAll`; `remove` only takes files and empty directories.
      () => (entry.isDir ? client.removeAll(entry.path) : client.remove(entry.path)),
      [dir],
    );

    if (openFile && isWithin(entry.path, openFile.path)) setOpenFile(null);

    setSelected(null);
    setClipboard(prev => (prev && isWithin(entry.path, prev.entry.path) ? null : prev));
  }, [selected, requestConfirm, locale, mutate, client, openFile]);

  const readFile = useCallback(
    async (path: string): Promise<string> => {
      const result = await client.read(path);

      return isImageName(path) ? blobToDataUrl(result.content) : blobToText(result.content);
    },
    [client],
  );

  const saveFile = useCallback(
    async (path: string, content: string): Promise<void> => {
      if (readOnly) return;

      await client.write(path, content);
    },
    [client, readOnly],
  );

  const dismissError = useCallback((): void => setError(null), []);

  return {
    listings,
    expanded,
    selected,
    openFile,
    clipboard,
    error,
    refreshToken,
    busy,
    dismissError,
    select,
    toggleExpand,
    open,
    closeFile,
    refresh,
    newFile,
    newFolder,
    uploads,
    startUpload,
    download,
    copy,
    cut,
    paste,
    rename,
    remove,
    readFile,
    saveFile,
    targetDir,
  };
}
