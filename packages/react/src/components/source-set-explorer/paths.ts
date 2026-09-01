import type { FsEntry } from '../file-explorer/types';

// Volume-relative path helpers (F-025). The sandbox side's `file-explorer/paths.ts` solves the same
// problems for container-absolute paths, and every function here differs at exactly one point: the root
// is the empty string, not `/`. Reusing that module would produce a leading slash on every path built
// from the root, which the backend answers with a 400.

/** Join a name onto a directory. The volume root is `''`, so joining onto it yields a bare name. */
export function joinPath(dir: string, name: string): string {
  return dir === '' ? name : `${dir}/${name}`;
}

export function baseName(path: string): string {
  const i = path.lastIndexOf('/');

  return i >= 0 ? path.slice(i + 1) : path;
}

/** The containing directory, or the root `''` for a top-level entry. */
export function parentDir(path: string): string {
  const i = path.lastIndexOf('/');

  return i > 0 ? path.slice(0, i) : '';
}

/** Whether `path` is `dir` itself or lives under it — used to stop a directory being pasted into itself. */
export function isWithin(dir: string, path: string): boolean {
  return path === dir || (dir === '' ? true : path.startsWith(`${dir}/`));
}

/**
 * A path a *host* wrote, reduced to the way `entry.path` spells it: no leading slash, no trailing one.
 *
 * The two conventions genuinely differ and neither side is wrong. A search path is written as a
 * directory — `git/skills/pdf/` — while an entry's path is a node's address, `git/skills/pdf`. Compare
 * them raw and nothing ever matches, and the failure is silent: no highlight, no expansion, no error,
 * which reads as "the feature was never built" rather than "one character differs".
 */
export function normalizeRefPath(path: string): string {
  return path.replace(/^\/+/, '').replace(/\/+$/, '');
}

/**
 * Every level of a path, from its first segment down to itself: `a/b/c` → `['a', 'a/b', 'a/b/c']`.
 *
 * The chain is what both host-path features need and what neither can build from `parentDir` alone —
 * highlighting wants the last element apart from the rest, and seeding an expansion wants all of them.
 */
export function pathChain(path: string): string[] {
  const parts = normalizeRefPath(path).split('/').filter(Boolean);

  const chain: string[] = [];
  let cur = '';
  for (const part of parts) {
    cur = joinPath(cur, part);
    chain.push(cur);
  }

  return chain;
}

/**
 * A name that does not collide with `taken`, by appending ` (1)`, ` (2)`… before the extension.
 *
 * Pasting into a directory that already holds that name is the common case (copy → paste into the same
 * folder is *how* you duplicate a file), and the volume rejects it: copy/move without `overwrite`
 * answers 409. Silently doing nothing is the worst option and overwriting destroys data, so the name
 * gets a suffix instead (F-025 R6).
 *
 * A leading dot is part of the stem, not an extension — `.gitignore` duplicates to `.gitignore (1)`.
 */
export function uniqueName(taken: ReadonlySet<string>, name: string): string {
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
 * Dirs first, then by name (F-025 R4).
 *
 * Sorted client-side rather than trusting the response: the volume returns byte-wise ASCII with
 * directories interleaved, so `Zeta.txt` would precede `a.txt` and folders would not be grouped.
 */
export function sortEntries(entries: FsEntry[]): FsEntry[] {
  return [...entries].sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name));
}
