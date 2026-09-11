import { describe, expect, it } from 'vitest';
import { ancestorDirs, isUnderRoot } from './paths';

/**
 * F-034 AC7 / UC-061 — root containment is compared segment by segment, not as a string prefix.
 *
 * The distinction is not academic: the explorer's tree is rooted at the sandbox's `workingDirectory`, and a
 * card may legitimately point somewhere else entirely. A plain `startsWith` puts `/workspace/x` inside
 * `/work`, which would send a reveal at a node that is not on the tree — expanding nothing and spending an
 * fs request to find that out.
 */

describe('isUnderRoot', () => {
  it('accepts the root itself and anything below it', () => {
    expect(isUnderRoot('/work', '/work')).toBe(true);
    expect(isUnderRoot('/work', '/work/a')).toBe(true);
    expect(isUnderRoot('/work', '/work/a/b/c.txt')).toBe(true);
  });

  it('rejects a sibling that merely shares the prefix', () => {
    expect(isUnderRoot('/work', '/workspace/x')).toBe(false);
    expect(isUnderRoot('/work', '/work-2/x')).toBe(false);
  });

  it('rejects a path outside the root', () => {
    // The 2026-09-09 incident: the tree was rooted at `/agent-hub-work`, the card pointed at `/work/…`.
    expect(isUnderRoot('/agent-hub-work', '/work/生活市集')).toBe(false);
    expect(isUnderRoot('/work', '/')).toBe(false);
  });

  it('ignores trailing slashes on either side', () => {
    expect(isUnderRoot('/work/', '/work')).toBe(true);
    expect(isUnderRoot('/work', '/work/a/')).toBe(true);
  });
});

describe('ancestorDirs', () => {
  it('lists the dirs between the root and the target, excluding both', () => {
    expect(ancestorDirs('/work', '/work/a/b/c.txt')).toEqual(['/work/a', '/work/a/b']);
  });

  it('returns nothing for a path outside the root — including a prefix-only match', () => {
    expect(ancestorDirs('/work', '/elsewhere/a.txt')).toEqual([]);
    expect(ancestorDirs('/work', '/workspace/a/b.txt')).toEqual([]);
  });
});
