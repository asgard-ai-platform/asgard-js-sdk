import { describe, it, expect } from 'vitest';
import { resolveSandboxUri } from './resolve-sandbox-uri';

// F-020 / F-034 / UC-036 / UC-060 — resolveSandboxUri parses a sandbox://<name>/<action>?<query> custom URI
// into a typed intent. It is a client-side command, never a URL: an unresolvable URI returns null so the host
// ignores it (treats it as a plain card) and never window.open()s the raw scheme.

describe('resolveSandboxUri (F-020 / UC-036)', () => {
  it('parses open-browser → { kind, sandboxName }', () => {
    expect(resolveSandboxUri('sandbox://sbx-1/open-browser')).toEqual({
      kind: 'open-browser',
      sandboxName: 'sbx-1',
    });
  });

  it('parses open-file with absolute_path → { kind, sandboxName, absolutePath }', () => {
    expect(resolveSandboxUri('sandbox://sbx-1/open-file?absolute_path=/home/user/report.md')).toEqual({
      kind: 'open-file',
      sandboxName: 'sbx-1',
      absolutePath: '/home/user/report.md',
    });
  });

  it('url-decodes the sandbox name and the absolute_path query', () => {
    expect(resolveSandboxUri('sandbox://sbx%20a/open-file?absolute_path=%2Ftmp%2Fa%20b.txt')).toEqual({
      kind: 'open-file',
      sandboxName: 'sbx a',
      absolutePath: '/tmp/a b.txt',
    });
  });

  it('returns null for open-file without absolute_path', () => {
    expect(resolveSandboxUri('sandbox://sbx-1/open-file')).toBeNull();
  });

  it('returns null for an unknown action', () => {
    expect(resolveSandboxUri('sandbox://sbx-1/frobnicate')).toBeNull();
  });

  it('returns null for a non-sandbox scheme', () => {
    expect(resolveSandboxUri('https://example.com/open-browser')).toBeNull();
    expect(resolveSandboxUri('channel-home://foo/bar')).toBeNull();
  });

  it('returns null for a malformed / empty URI', () => {
    expect(resolveSandboxUri('sandbox://')).toBeNull();
    expect(resolveSandboxUri('')).toBeNull();
  });
});

// F-034 / UC-060 — `open-folder` is its own action, not a flag on the file card: the two destinations are not
// interchangeable (viewer vs. tree), and the backend cannot tell them apart after the fact — which tool the
// agent called is the only signal it has. Before this branch existed the card resolved to null, so an
// open-folder card was a silent no-op in the client.
describe('resolveSandboxUri — open-folder (F-034 AC1 / UC-060)', () => {
  it('parses open-folder with absolute_path → { kind, sandboxName, absolutePath }', () => {
    expect(resolveSandboxUri('sandbox://sbx-1/open-folder?absolute_path=/home/user/out')).toEqual({
      kind: 'open-folder',
      sandboxName: 'sbx-1',
      absolutePath: '/home/user/out',
    });
  });

  it('url-decodes the absolute_path of an open-folder card', () => {
    // The 2026-09-09 agent-hub incident's own path: an unzipped archive with a non-ASCII name.
    expect(
      resolveSandboxUri(
        'sandbox://sb-93a46b491b896151/open-folder?absolute_path=%2Fwork%2F%E7%94%9F%E6%B4%BB%E5%B8%82%E9%9B%86',
      ),
    ).toEqual({
      kind: 'open-folder',
      sandboxName: 'sb-93a46b491b896151',
      absolutePath: '/work/生活市集',
    });
  });

  it('returns null for open-folder without absolute_path (same rule as open-file)', () => {
    expect(resolveSandboxUri('sandbox://sbx-1/open-folder')).toBeNull();
    expect(resolveSandboxUri('sandbox://sbx-1/open-folder?absolute_path=')).toBeNull();
  });

  it('keeps open-file and open-folder distinct for the same path', () => {
    const path = '/home/user/project';
    expect(resolveSandboxUri(`sandbox://sbx-1/open-file?absolute_path=${path}`)?.kind).toBe('open-file');
    expect(resolveSandboxUri(`sandbox://sbx-1/open-folder?absolute_path=${path}`)?.kind).toBe('open-folder');
  });

  it('still returns null for an action that merely looks like one of the two', () => {
    expect(resolveSandboxUri('sandbox://sbx-1/open-folders?absolute_path=/a')).toBeNull();
    expect(resolveSandboxUri('sandbox://sbx-1/open?absolute_path=/a')).toBeNull();
  });
});
