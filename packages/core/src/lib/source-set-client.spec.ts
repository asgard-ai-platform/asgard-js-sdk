import { afterEach, describe, expect, it, vi } from 'vitest';
import AsgardSourceSetClient, { SOURCE_SET_MAX_PAGE_SIZE } from './source-set-client';
import type { SourceSetDirEntry } from '../types/source-set-fs';
import { isHttpError } from '../types/http-error';

// F-024 / F-026 — the SourceSet volume client. Contract verified against the dev edge-server OpenAPI
// (`/swagger/doc.json`) on 2026-08-14; see BUILD-060's execution log.

const ENDPOINT = 'https://api.example.com/v1/source-set/ss-1/volume';

function fakeJsonResponse(status: number, body: unknown): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    statusText: status === 409 ? 'Conflict' : status === 400 ? 'Bad Request' : 'OK',
    headers: new Headers(),
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  } as unknown as Response;
}

function fakeBlobResponse(body: string, headers: Record<string, string>): Response {
  return {
    status: 200,
    ok: true,
    statusText: 'OK',
    headers: new Headers(headers),
    blob: async () => new Blob([body]),
    text: async () => body,
  } as unknown as Response;
}

function entry(name: string, isDir = false): SourceSetDirEntry {
  return { name, isDir, sizeBytes: isDir ? 0 : 12, mtimeUnix: 1_700_000_000, mode: 420 };
}

/** `page`-indexed pages of `total` synthetic entries, in the wire's envelope shape. */
function pagedResponse(page: number, pageSize: number, total: number): Response {
  const start = page * pageSize;
  const entries = Array.from({ length: Math.max(0, Math.min(pageSize, total - start)) }, (_, i) =>
    entry(`f${start + i}.txt`),
  );

  return fakeJsonResponse(200, { isSuccess: true, data: { entries, paging: { index: page, size: pageSize, total } } });
}

function makeClient(overrides?: { apiKey?: string; customHeaders?: Record<string, string> }): AsgardSourceSetClient {
  return new AsgardSourceSetClient({ sourceSetEndpoint: ENDPOINT, ...overrides });
}

function lastCall(fetchMock: ReturnType<typeof vi.fn>): {
  url: URL;
  init: RequestInit & { headers: Record<string, string> };
} {
  const [url, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];

  return { url: new URL(url as string), init: init as RequestInit & { headers: Record<string, string> } };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AsgardSourceSetClient — auth headers (F-024 R1)', () => {
  it('sends X-API-KEY when apiKey is set', async () => {
    const fetchMock = vi.fn().mockResolvedValue(pagedResponse(0, 1000, 0));
    vi.stubGlobal('fetch', fetchMock);

    await makeClient({ apiKey: 'volume-key' }).list('');

    expect(lastCall(fetchMock).init.headers['X-API-KEY']).toBe('volume-key');
  });

  it('omits X-API-KEY entirely when apiKey is absent — a BFF relay holds the key itself', async () => {
    const fetchMock = vi.fn().mockResolvedValue(pagedResponse(0, 1000, 0));
    vi.stubGlobal('fetch', fetchMock);

    await makeClient().list('');

    expect(lastCall(fetchMock).init.headers).not.toHaveProperty('X-API-KEY');
  });

  it('merges customHeaders into a multipart upload and a binary download, not just JSON calls', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(fakeJsonResponse(200, { data: { bytesWritten: 3 } }))
      .mockResolvedValueOnce(fakeBlobResponse('abc', {}));
    vi.stubGlobal('fetch', fetchMock);

    const client = makeClient({ customHeaders: { Authorization: 'Bearer t0ken' } });
    await client.write('a.txt', 'abc');
    expect(lastCall(fetchMock).init.headers['Authorization']).toBe('Bearer t0ken');

    await client.read('a.txt');
    expect(lastCall(fetchMock).init.headers['Authorization']).toBe('Bearer t0ken');
  });
});

describe('AsgardSourceSetClient — path guard (F-024 R2)', () => {
  it('rejects a sandbox-style absolute path before issuing a request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(makeClient().stat('/notes/todo.md')).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts the empty string as the volume root for list, but not for a mutation', async () => {
    const fetchMock = vi.fn().mockResolvedValue(pagedResponse(0, 1000, 0));
    vi.stubGlobal('fetch', fetchMock);

    await expect(makeClient().list('')).resolves.toBeDefined();
    await expect(makeClient().removeAll('')).rejects.toThrow();
  });
});

describe('AsgardSourceSetClient.list (F-024 R3, R6)', () => {
  it('returns entries + paging from a `{ data }` envelope and keeps basenames untouched', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        fakeJsonResponse(200, {
          isSuccess: true,
          data: { entries: [entry('sub', true), entry('todo.md')], paging: { index: 0, size: 1000, total: 2 } },
        }),
      ),
    );

    const result = await makeClient().list('notes');

    expect(result.entries.map(e => e.name)).toEqual(['sub', 'todo.md']);
    expect(result.paging).toEqual({ index: 0, size: 1000, total: 2 });
  });

  it('tolerates a bare (un-enveloped) body, as channelMetadata does', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          fakeJsonResponse(200, { entries: [entry('a.txt')], paging: { index: 0, size: 1000, total: 1 } }),
        ),
    );

    await expect(makeClient().list('')).resolves.toMatchObject({ paging: { total: 1 } });
  });

  it('reads paging off the envelope when the payload omits it — RespWrapper declares it there too', async () => {
    // `total` must differ from `entries.length`, or the entries-derived last-resort fallback would
    // produce the same number and the assertion would pass without the envelope ever being read.
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          fakeJsonResponse(200, { data: { entries: [entry('a.txt')] }, paging: { index: 0, size: 1, total: 42 } }),
        ),
    );

    await expect(makeClient().list('')).resolves.toMatchObject({ paging: { index: 0, size: 1, total: 42 } });
  });

  it('reports paging as null when neither layer carries it, rather than inventing a total', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeJsonResponse(200, { data: { entries: [entry('a.txt')] } })));

    // A synthesized `{ total: 1 }` here is indistinguishable from a real one, and `listAll` would read
    // it as "that was everything".
    await expect(makeClient().list('')).resolves.toMatchObject({ paging: null });
  });

  it('sends a 0-based page and clamps page_size to the server maximum of 1000', async () => {
    const fetchMock = vi.fn().mockResolvedValue(pagedResponse(0, 1000, 0));
    vi.stubGlobal('fetch', fetchMock);

    await makeClient().list('', { page: 2, pageSize: 5000 });

    const { url } = lastCall(fetchMock);
    expect(url.pathname).toBe('/v1/source-set/ss-1/volume/list');
    expect(url.searchParams.get('page')).toBe('2');
    expect(url.searchParams.get('page_size')).toBe(String(SOURCE_SET_MAX_PAGE_SIZE));
  });
});

describe('AsgardSourceSetClient.stat (F-024 R4)', () => {
  it('reports a missing path as exists:false instead of throwing — the backend answers 200', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeJsonResponse(200, { data: { exists: false } })));

    await expect(makeClient().stat('nope.md')).resolves.toMatchObject({ exists: false, isDir: false, sizeBytes: 0 });
  });

  it('passes through etag when present', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        fakeJsonResponse(200, {
          data: { exists: true, isDir: false, sizeBytes: 9, mtimeUnix: 1, mode: 420, etag: 'W/"x"' },
        }),
      ),
    );

    await expect(makeClient().stat('a.txt')).resolves.toMatchObject({ exists: true, etag: 'W/"x"' });
  });
});

describe('AsgardSourceSetClient.read (F-024 R5)', () => {
  it('takes totalBytes and truncated from the X- headers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(fakeBlobResponse('abc', { 'X-Total-Bytes': '9999', 'X-Truncated': 'true' })),
    );

    const result = await makeClient().read('big.txt', { limitBytes: 3 });

    expect(result.totalBytes).toBe(9999);
    expect(result.truncated).toBe(true);
    await expect(result.content.text()).resolves.toBe('abc');
  });

  it('falls back to the blob size and to not-truncated when both headers are absent', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeBlobResponse('abcde', {})));

    await expect(makeClient().read('a.txt')).resolves.toMatchObject({ totalBytes: 5, truncated: false });
  });

  it('does not report a truncation for an offset-only read that reaches EOF', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(fakeBlobResponse('de', { 'X-Total-Bytes': '5', 'X-Truncated': 'false' })),
    );

    await expect(makeClient().read('a.txt', { offsetBytes: 3 })).resolves.toMatchObject({
      totalBytes: 5,
      truncated: false,
    });
  });
});

describe('AsgardSourceSetClient — mutations (F-024 R6)', () => {
  it('writes as multipart/form-data with a `file` field and create_only when asked', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeJsonResponse(200, { data: { bytesWritten: 5 } }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await makeClient().write('a.txt', 'hello', { createOnly: true, mode: 420 });

    const { url, init } = lastCall(fetchMock);
    expect(init.method).toBe('PUT');
    expect(url.pathname.endsWith('/volume/file')).toBe(true);
    expect(url.searchParams.get('create_only')).toBe('true');
    expect(url.searchParams.get('mode')).toBe('420');
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get('file')).toBeInstanceOf(Blob);
    expect(result).toEqual({ bytesWritten: 5 });
  });

  it.each([
    ['mkdir', 'mkdir', 'POST'],
    ['remove', 'item', 'DELETE'],
    ['removeAll', 'all', 'DELETE'],
  ] as const)('%s hits volume/%s with %s', async (method, op, httpMethod) => {
    const fetchMock = vi.fn().mockResolvedValue(fakeJsonResponse(200, { isSuccess: true }));
    vi.stubGlobal('fetch', fetchMock);

    await makeClient()[method]('notes/x');

    const { url, init } = lastCall(fetchMock);
    expect(url.pathname.endsWith(`/volume/${op}`)).toBe(true);
    expect(init.method).toBe(httpMethod);
    expect(url.searchParams.get('path')).toBe('notes/x');
  });

  it('copy returns bytesCopied and forwards overwrite; move sends src/dst', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(fakeJsonResponse(200, { data: { bytesCopied: 42 } }))
      .mockResolvedValueOnce(fakeJsonResponse(200, { isSuccess: true }));
    vi.stubGlobal('fetch', fetchMock);

    const client = makeClient();
    await expect(client.copy('a.txt', 'b.txt', { overwrite: true })).resolves.toEqual({ bytesCopied: 42 });
    expect(lastCall(fetchMock).url.searchParams.get('overwrite')).toBe('true');

    await client.move('a.txt', 'sub/a.txt');
    const { url } = lastCall(fetchMock);
    expect(url.searchParams.get('src')).toBe('a.txt');
    expect(url.searchParams.get('dst')).toBe('sub/a.txt');
    expect(url.searchParams.get('overwrite')).toBeNull();
  });
});

describe('AsgardSourceSetClient — cancellation (BUG-008 R5)', () => {
  it('hands `write` its caller signal so an aborted batch stops the request in flight', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeJsonResponse(200, { data: { bytesWritten: 5 } }));
    vi.stubGlobal('fetch', fetchMock);

    const controller = new AbortController();
    await makeClient().write('a.txt', 'hello', { createOnly: true, signal: controller.signal });

    // Identity, not merely presence: a batch cancel is one controller shared by every worker, so the
    // signal that reaches `fetch` has to be the one the caller can abort.
    expect(lastCall(fetchMock).init.signal).toBe(controller.signal);
  });

  it('hands `mkdir` its caller signal too — the empty-directory pass runs inside the same batch', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeJsonResponse(200, { isSuccess: true }));
    vi.stubGlobal('fetch', fetchMock);

    const controller = new AbortController();
    await makeClient().mkdir('notes/sub', { signal: controller.signal });

    expect(lastCall(fetchMock).init.signal).toBe(controller.signal);
  });

  it('leaves `signal` undefined when no caller asked for one', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeJsonResponse(200, { data: { bytesWritten: 5 } }));
    vi.stubGlobal('fetch', fetchMock);

    await makeClient().write('a.txt', 'hello');

    expect(lastCall(fetchMock).init.signal).toBeUndefined();
  });
});

describe('AsgardSourceSetClient.listAll (F-026 R7)', () => {
  it('walks every page until it has paging.total', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const page = Number(new URL(url).searchParams.get('page') ?? 0);

      return pagedResponse(page, 2, 5);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await makeClient().listAll('', { pageSize: 2 });

    expect(result.entries).toHaveLength(5);
    expect(result.total).toBe(5);
    expect(result.complete).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('stops at the cap and reports the shortfall as data rather than silently truncating', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const page = Number(new URL(url).searchParams.get('page') ?? 0);

      return pagedResponse(page, 2, 100);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await makeClient().listAll('', { pageSize: 2, maxEntries: 4 });

    expect(result.entries).toHaveLength(4);
    expect(result.total).toBe(100);
    expect(result.complete).toBe(false);
  });

  it('throws when a page fails — a partial walk must never pass as the whole directory', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(pagedResponse(0, 2, 6))
      .mockResolvedValueOnce(fakeJsonResponse(500, 'boom'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(makeClient().listAll('', { pageSize: 2 })).rejects.toSatisfy(isHttpError);
  });

  it('terminates when the backend returns an empty page despite a larger total', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(pagedResponse(0, 2, 99))
      .mockResolvedValueOnce(
        fakeJsonResponse(200, { data: { entries: [], paging: { index: 1, size: 2, total: 99 } } }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const result = await makeClient().listAll('', { pageSize: 2 });

    expect(result.entries).toHaveLength(2);
    expect(result.complete).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('AsgardSourceSetClient.listAll — when the backend cannot be trusted about paging (F-026)', () => {
  /**
   * The whole point of F-026 is that a short listing must never look like a complete one. Two shapes
   * defeat the naive walk, and both come from relays this SDK does not own:
   * a response with no `paging` at all, and one whose `paging.index` ignores the page we asked for.
   */
  const pageOf = (entries: SourceSetDirEntry[], paging?: { index: number; size: number; total: number }): Response =>
    fakeJsonResponse(200, paging ? { data: { entries, paging } } : { data: { entries } });

  it('reports a full page with no paging as NOT complete — it cannot tell whether more exists', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => pageOf(Array.from({ length: 3 }, (_, i) => entry(`f${i}.txt`)))),
    );

    const result = await makeClient().listAll('', { pageSize: 3 });

    expect(result.entries).toHaveLength(3);
    expect(result.complete).toBe(false);
    expect(result.total).toBe(0);
  });

  it('reports a short page with no paging as complete — that really is the whole directory', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => pageOf([entry('only.txt')])),
    );

    const result = await makeClient().listAll('', { pageSize: 3 });

    expect(result.entries).toHaveLength(1);
    expect(result.complete).toBe(true);
  });

  it('stops on a page index that is not the one asked for, instead of collecting duplicates', async () => {
    // A relay that ignores `page` and always serves the first one. The naive walk returned the same
    // three names three times and called it complete.
    const fetchMock = vi.fn(async () =>
      pageOf(
        Array.from({ length: 3 }, (_, i) => entry(`f${i}.txt`)),
        { index: 0, size: 3, total: 9 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await makeClient().listAll('', { pageSize: 3 });

    expect(result.entries.map(e => e.name)).toEqual(['f0.txt', 'f1.txt', 'f2.txt']);
    expect(result.complete).toBe(false);
    expect(result.total).toBe(9);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('still walks a well-behaved backend to the end and calls it complete', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const page = Number(new URL(url).searchParams.get('page') ?? 0);

      return pagedResponse(page, 2, 5);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await makeClient().listAll('', { pageSize: 2 });

    expect(result.entries).toHaveLength(5);
    expect(result.total).toBe(5);
    expect(result.complete).toBe(true);
  });

  it('reports the cap as incomplete', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => pagedResponse(Number(new URL(url).searchParams.get('page') ?? 0), 2, 100)),
    );

    const result = await makeClient().listAll('', { pageSize: 2, maxEntries: 4 });

    expect(result.total).toBe(100);
    expect(result.complete).toBe(false);
  });
});

describe('AsgardSourceSetClient — errors (F-024 R8)', () => {
  it('surfaces 409 as an HttpError the caller can branch on, so "already exists" beats overwriting', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeJsonResponse(409, 'already exists')));

    const error = await makeClient()
      .write('a.txt', 'x', { createOnly: true })
      .catch((e: unknown) => e);

    expect(isHttpError(error)).toBe(true);
    expect(isHttpError(error) && error.status).toBe(409);
    expect(isHttpError(error) && error.body).toBe('already exists');
  });

  it('throws HttpError for any other non-2xx', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeJsonResponse(400, 'bad path')));

    await expect(makeClient().list('')).rejects.toSatisfy(isHttpError);
  });
});
