import { FsEntry } from './types';

export function joinPath(dir: string, name: string): string {
  return `${dir.replace(/\/$/, '')}/${name}`;
}

export function baseName(path: string): string {
  return path.split('/').filter(Boolean).pop() ?? path;
}

export function parentDir(path: string): string {
  const norm = path.replace(/\/+$/, '');
  const i = norm.lastIndexOf('/');

  return i > 0 ? norm.slice(0, i) : '/';
}

/**
 * Whether `path` sits inside the tree rooted at `root` (the root itself counts).
 *
 * Compared segment-wise rather than by string prefix: `/work` must not swallow `/workspace/x`. A card can
 * legitimately point outside the root — an agent may write next to the user's attachment in the Channel Home
 * while the explorer is rooted at the sandbox's `workingDirectory` — and that case has to be told apart from
 * a path that merely starts with the same letters (F-034 AC7 / UC-061).
 */
export function isUnderRoot(root: string, path: string): boolean {
  const normRoot = root.replace(/\/+$/, '');
  const normPath = path.replace(/\/+$/, '');

  return normPath === normRoot || normPath.startsWith(`${normRoot}/`);
}

/** Dirs whose expansion reveals `filePath` under `root` (excludes root + the file itself) — for the AC9 reveal. */
export function ancestorDirs(root: string, filePath: string): string[] {
  const normRoot = root.replace(/\/+$/, '');
  if (!isUnderRoot(normRoot, filePath)) return [];

  const parts = filePath.slice(normRoot.length).split('/').filter(Boolean);
  parts.pop();

  const dirs: string[] = [];
  let cur = normRoot;
  for (const part of parts) {
    cur = `${cur}/${part}`;
    dirs.push(cur);
  }

  return dirs;
}

/**
 * A name that does not collide with `taken`, by appending ` (1)`, ` (2)`… before the extension.
 *
 * Pasting into a directory that already holds that name is the common case (copy → paste into the same
 * folder is *how* you duplicate a file), and the backends reject it: a copy/move without an overwrite
 * flag answers 409. Silently doing nothing is the worst of the options, and overwriting destroys data,
 * so the name gets a suffix instead.
 *
 * A leading dot is part of the stem, not an extension — `.gitignore` duplicates to `.gitignore (1)`.
 */
export function uniqueName(taken: Set<string>, name: string): string {
  if (!taken.has(name)) return name;

  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';

  for (let i = 1; ; i++) {
    const candidate = `${stem} (${i})${ext}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/**
 * Dirs first, then by name — a stable, predictable tree ordering (mirrors the prototype).
 *
 * The explorer always sorts client-side and never relies on backend ordering: the sandbox edge server
 * and Sindri's directory volume API disagree (the latter returns byte-wise ASCII with directories
 * interleaved, so `Zeta.txt` precedes `a.txt` and folders are not grouped).
 */
export function sortEntries(entries: FsEntry[]): FsEntry[] {
  return [...entries].sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name));
}
