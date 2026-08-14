import { LaunchedSandbox, SandboxFsDirEntry } from '@asgard-js/core';

/**
 * A file-tree node in the File Explorer (F-021): a `fs/list` entry plus its absolute path (the list API
 * returns names relative to the queried dir; the panel composes the absolute path).
 */
export interface FsEntry extends SandboxFsDirEntry {
  /** Absolute path inside the source. */
  path: string;
}

/**
 * One file source the explorer can browse. A live sandbox is one kind; a Sindri directory volume is
 * another. The explorer itself never assumes which — it only needs an identity, a label, and a root.
 *
 * Paths flowing through the explorer (and through {@link FsProviders}) are **absolute under
 * `rootPath`**. That keeps the sandbox side — where `FsEntry.path` and `requestFile` have always been
 * absolute — unchanged; a source whose backing API speaks relative paths converts inside its provider.
 */
export interface FsSource {
  /** Identity key; every provider call locates the source by this. */
  id: string;
  /** Display label for the source picker. */
  label: string;
  /** The tree root — the explorer lists this path first and resolves everything else under it. */
  rootPath: string;
}

/** One page of a directory listing. */
export interface FsListResult {
  entries: SandboxFsDirEntry[];
  /** True when the backend capped the listing. */
  truncated: boolean;
  /**
   * How many entries the directory holds in total, when the source can say (F-026). The tree shows the
   * difference against `entries.length` as "N more items not loaded" — a capped listing that just stops
   * looks complete, which is the worst way to be wrong.
   *
   * Optional because the sandbox fs API cannot say: it answers `truncated` and no count. A source that
   * omits it gets today's behavior, cap flag and all.
   */
  totalEntries?: number;
}

/** List a directory (≈ `GET fs/list`). */
export type FsListDir = (sourceId: string, path: string) => Promise<FsListResult>;

/** Read a file's content (≈ `GET fs/file`). Images resolve to a data/object URL; text to the string body. */
export type FsReadFile = (sourceId: string, path: string) => Promise<string>;

/** Persist a file's content (≈ `PUT fs/file`). */
export type FsSaveFile = (sourceId: string, path: string, content: string) => Promise<void> | void;

/**
 * Subscribe to changes on one path (≈ `GET fs/watch` SSE) and return an unsubscribe (F-021 AC3). The
 * event payload is deliberately not surfaced: the view reloads from disk either way, so all a caller
 * needs is "it changed".
 *
 * **Optional on {@link FsProviders} by design.** The sandbox edge server has an SSE watch endpoint;
 * Sindri's directory volume API has no equivalent, so a source may legitimately not offer one. The
 * FileView degrades to load-once when it is absent.
 */
export type FsWatchFile = (sourceId: string, path: string, onChange: () => void) => () => void;

/** A directory mutation (mkdir / delete). */
export type FsMutatePath = (sourceId: string, path: string) => Promise<void>;

/** A src→dst mutation (copy / move / rename). */
export type FsMutateSrcDst = (sourceId: string, src: string, dst: string) => Promise<void>;

/** Upload a picked file into a directory. */
export type FsUpload = (sourceId: string, dirPath: string, file: File) => Promise<void>;

/**
 * Everything the explorer can ask a source to do. Only `listDir` is required — each omitted capability
 * simply disables the actions that need it (the toolbar button and context-menu item go `disabled`),
 * which is how a read-only source is expressed.
 */
export interface FsProviders {
  listDir: FsListDir;
  readFile?: FsReadFile;
  saveFile?: FsSaveFile;
  /**
   * Create a file, **failing rather than overwriting** when the path is taken (≈ `create_only=true`,
   * which answers 409). Used only by the new-file action; editing an open file always goes through
   * `saveFile`, which must overwrite.
   *
   * Optional: a source that omits it has new-file fall back to `saveFile`, which is what the sandbox
   * panel has always done. It exists because F-025 asks a name clash to say "already exists" rather
   * than quietly replace someone's file.
   */
  createFile?: FsSaveFile;
  watchFile?: FsWatchFile;
  mkdir?: FsMutatePath;
  /** Delete a file or directory — routed by `isDir` (the two often map to different endpoints). */
  remove?: (sourceId: string, path: string, isDir: boolean) => Promise<void>;
  copy?: FsMutateSrcDst;
  move?: FsMutateSrcDst;
  upload?: FsUpload;
  /** Download a file to the browser. */
  download?: (sourceId: string, path: string, name: string) => Promise<void>;
}

/**
 * A live sandbox as an {@link FsSource}. `sandboxBlueprintName` is the readable label; when more than one
 * sandbox is live the opaque `sandboxName` is appended to keep them apart.
 */
export function sandboxAsSource(sandbox: LaunchedSandbox, disambiguate = false): FsSource {
  const label = sandbox.sandboxBlueprintName || sandbox.sandboxName;

  return {
    id: sandbox.sandboxName,
    label: disambiguate ? `${label} · ${sandbox.sandboxName}` : label,
    rootPath: sandbox.workingDirectory,
  };
}

/** {@link sandboxAsSource} over a list, disambiguating labels only when there is more than one. */
export function sandboxesAsSources(sandboxes: LaunchedSandbox[]): FsSource[] {
  return sandboxes.map(s => sandboxAsSource(s, sandboxes.length > 1));
}
