import { describe, expect, it } from 'vitest';
import { baseName, isWithin, joinPath, normalizeRefPath, parentDir, pathChain, sortEntries, uniqueName } from './paths';
import type { FsEntry } from '../file-explorer/types';

/**
 * The volume root is `''`, not `/`. Every case below is one the sandbox helpers get right for their own
 * convention and wrong for this one — a leading slash, or `/` standing in for "no parent" — and each
 * reaches the backend as a 400 rather than as anything the user could act on.
 */

function entry(name: string, isDir: boolean): FsEntry {
  return { name, isDir, path: name, sizeBytes: 0, mtimeUnix: 0, mode: 420 };
}

describe('joinPath', () => {
  it('produces a bare name at the volume root, with no leading slash', () => {
    expect(joinPath('', 'notes.md')).toBe('notes.md');
  });

  it('joins under a directory', () => {
    expect(joinPath('notes', 'todo.md')).toBe('notes/todo.md');
    expect(joinPath('a/b', 'c.txt')).toBe('a/b/c.txt');
  });
});

describe('parentDir', () => {
  it('reports the root as the empty string, not "/"', () => {
    expect(parentDir('notes.md')).toBe('');
  });

  it('reports the containing directory', () => {
    expect(parentDir('notes/todo.md')).toBe('notes');
    expect(parentDir('a/b/c.txt')).toBe('a/b');
  });
});

describe('baseName', () => {
  it('returns the last segment', () => {
    expect(baseName('a/b/c.txt')).toBe('c.txt');
    expect(baseName('c.txt')).toBe('c.txt');
    expect(baseName('')).toBe('');
  });
});

describe('isWithin', () => {
  it('treats the root as containing everything', () => {
    expect(isWithin('', 'a/b.txt')).toBe(true);
  });

  it('matches a directory and its descendants', () => {
    expect(isWithin('a', 'a')).toBe(true);
    expect(isWithin('a', 'a/b.txt')).toBe(true);
  });

  it('does not match a sibling that merely shares a prefix', () => {
    expect(isWithin('a', 'ab/c.txt')).toBe(false);
  });
});

describe('normalizeRefPath', () => {
  it('absorbs the trailing slash a search path is conventionally written with', () => {
    expect(normalizeRefPath('git/skills/pdf/')).toBe('git/skills/pdf');
    expect(normalizeRefPath('git/skills/pdf')).toBe('git/skills/pdf');
  });

  it('absorbs a leading slash, which the volume never uses', () => {
    expect(normalizeRefPath('/git/skills')).toBe('git/skills');
    expect(normalizeRefPath('//git//')).toBe('git');
  });

  it('reduces the root, however it was written, to the empty string', () => {
    expect(normalizeRefPath('/')).toBe('');
    expect(normalizeRefPath('')).toBe('');
  });
});

describe('pathChain', () => {
  it('walks from the first segment down to the path itself', () => {
    expect(pathChain('a/b/c')).toEqual(['a', 'a/b', 'a/b/c']);
    expect(pathChain('a')).toEqual(['a']);
  });

  it('normalizes before splitting, so a written search path chains the same', () => {
    expect(pathChain('/git/skills/pdf/')).toEqual(['git', 'git/skills', 'git/skills/pdf']);
  });

  it('yields nothing for the root — it has no level of its own', () => {
    expect(pathChain('')).toEqual([]);
    expect(pathChain('/')).toEqual([]);
  });
});

describe('uniqueName', () => {
  it('leaves a free name alone', () => {
    expect(uniqueName(new Set(['b.txt']), 'a.txt')).toBe('a.txt');
  });

  it('suffixes before the extension, counting up past each taken candidate', () => {
    expect(uniqueName(new Set(['a.txt']), 'a.txt')).toBe('a (1).txt');
    expect(uniqueName(new Set(['a.txt', 'a (1).txt']), 'a.txt')).toBe('a (2).txt');
  });

  it('treats a leading dot as part of the stem', () => {
    expect(uniqueName(new Set(['.gitignore']), '.gitignore')).toBe('.gitignore (1)');
  });
});

describe('sortEntries', () => {
  it('puts directories first, then sorts each group by name', () => {
    const sorted = sortEntries([
      entry('b.txt', false),
      entry('Zeta', true),
      entry('a.txt', false),
      entry('alpha', true),
    ]);

    expect(sorted.map(e => e.name)).toEqual(['alpha', 'Zeta', 'a.txt', 'b.txt']);
  });
});
