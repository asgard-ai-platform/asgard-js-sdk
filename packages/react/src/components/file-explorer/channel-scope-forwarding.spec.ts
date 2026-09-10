// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AsgardServiceClient } from '@asgard-js/core';
import { Observable } from 'rxjs';
import { createSandboxFsProviders } from './create-sandbox-fs-providers';

// #470 — the relay in front of asgard-core proves sandbox ownership from `custom_channel_id`, so every
// provider the File Explorer calls has to carry the channel down to the client. One table over all twelve
// provider entry points, because the defect this replaces was an omission in all of them at once: a
// provider that quietly drops the scope looks exactly like one that never had it.

/** Stub of the fs surface the providers touch — every method records what it was handed. */
function makeClient(): { client: AsgardServiceClient; calls: Record<string, unknown[][]> } {
  const calls: Record<string, unknown[][]> = {};
  const record =
    (name: string, result: unknown = undefined) =>
    (...args: unknown[]): unknown => {
      (calls[name] ??= []).push(args);

      return result;
    };

  const client = {
    sandboxFsList: vi.fn(record('sandboxFsList', Promise.resolve({ entries: [], truncated: false }))),
    // jsdom's Blob has no `text()`, and `readFile` decodes text through it — so the stub supplies one.
    sandboxFsRead: vi.fn(
      record(
        'sandboxFsRead',
        Promise.resolve({ content: { text: async () => 'hi' } as unknown as Blob, totalBytes: 2 }),
      ),
    ),
    sandboxFsWrite: vi.fn(record('sandboxFsWrite', Promise.resolve({ bytesWritten: 2 }))),
    sandboxFsWatch: vi.fn(record('sandboxFsWatch', new Observable<never>(() => (): void => undefined))),
    sandboxFsMkdir: vi.fn(record('sandboxFsMkdir', Promise.resolve())),
    sandboxFsRemove: vi.fn(record('sandboxFsRemove', Promise.resolve())),
    sandboxFsRemoveAll: vi.fn(record('sandboxFsRemoveAll', Promise.resolve())),
    sandboxFsCopy: vi.fn(record('sandboxFsCopy', Promise.resolve({ bytesCopied: 2 }))),
    sandboxFsMove: vi.fn(record('sandboxFsMove', Promise.resolve())),
  } as unknown as AsgardServiceClient;

  return { client, calls };
}

const CHANNEL = 'ch-1';
const FILE = new File(['hi'], 'a.txt');

interface Case {
  /** The provider the panel calls. */
  provider: string;
  /** The client method it must reach. */
  method: string;
  run: (providers: ReturnType<typeof createSandboxFsProviders>) => Promise<unknown> | unknown;
}

const CASES: Case[] = [
  { provider: 'listDir', method: 'sandboxFsList', run: p => p.listDir('sb', '/work') },
  { provider: 'readFile', method: 'sandboxFsRead', run: p => p.readFile('sb', '/work/a.txt') },
  { provider: 'saveFile', method: 'sandboxFsWrite', run: p => p.saveFile('sb', '/work/a.txt', 'hi') },
  { provider: 'watchFile', method: 'sandboxFsWatch', run: p => p.watchFile('sb', '/work/a.txt', () => undefined) },
  { provider: 'mkdir', method: 'sandboxFsMkdir', run: p => p.mkdir('sb', '/work/new') },
  { provider: 'remove (file)', method: 'sandboxFsRemove', run: p => p.remove('sb', '/work/a.txt', false) },
  { provider: 'remove (dir)', method: 'sandboxFsRemoveAll', run: p => p.remove('sb', '/work/dir', true) },
  { provider: 'copy', method: 'sandboxFsCopy', run: p => p.copy('sb', '/work/a', '/work/b') },
  { provider: 'move', method: 'sandboxFsMove', run: p => p.move('sb', '/work/a', '/work/b') },
  { provider: 'upload', method: 'sandboxFsWrite', run: p => p.upload('sb', '/work', FILE) },
  {
    provider: 'uploadMany',
    method: 'sandboxFsWrite',
    run: p =>
      p.uploadMany('sb', '/work', 'a.txt', FILE, {
        createOnly: true,
        signal: new AbortController().signal,
        lastAttempt: true,
      }),
  },
  { provider: 'download', method: 'sandboxFsRead', run: p => p.download('sb', '/work/a.txt', 'a.txt') },
];

/** The scope lands in the options argument, whose position differs per method. */
function scopeOf(args: unknown[]): unknown {
  return args.find(arg => typeof arg === 'object' && arg !== null && 'customChannelId' in arg);
}

beforeEach(() => {
  // jsdom has no object-URL implementation, and `download` builds one for its `<a download>`.
  Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => undefined });
});

describe('createSandboxFsProviders — channel scope forwarding (#470)', () => {
  it.each(CASES)('$provider passes the channel to $method', async ({ method, run }) => {
    const { client, calls } = makeClient();

    await run(createSandboxFsProviders(client, { customChannelId: CHANNEL }));

    expect(calls[method], `${method} was never called`).toBeDefined();
    expect(scopeOf(calls[method][0])).toMatchObject({ customChannelId: CHANNEL });
  });

  it('keeps `uploadMany`s own options — the scope is added to them, not instead of them', async () => {
    const { client, calls } = makeClient();
    const signal = new AbortController().signal;

    await createSandboxFsProviders(client, { customChannelId: CHANNEL }).uploadMany('sb', '/work', 'a.txt', FILE, {
      createOnly: true,
      signal,
      lastAttempt: true,
    });

    expect(calls.sandboxFsWrite[0][3]).toEqual({ customChannelId: CHANNEL, createOnly: true, signal });
  });

  it('sends no scope at all when there is no channel, rather than an empty one', async () => {
    const { client, calls } = makeClient();

    await createSandboxFsProviders(client, { customChannelId: null }).listDir('sb', '/work');

    expect(calls.sandboxFsList[0][2]).toEqual({});
  });
});
