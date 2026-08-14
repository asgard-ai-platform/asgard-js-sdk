// An in-memory SourceSet volume, served by intercepting `fetch`.
//
// The interception is the point. `<SourceSetFileExplorer>` builds its own `AsgardSourceSetClient` from
// an endpoint, so handing the route fake providers would skip the two layers most likely to be wrong —
// the client's query building and the adapter's absolute↔relative conversion. Answering real HTTP
// against a fake volume exercises the whole stack, envelope and status codes included.
//
// Every response mirrors the shapes verified against the dev OpenAPI document in BUILD-060: a
// `{ data, paging }` envelope, 0-based `page`, `X-Total-Bytes` / `X-Truncated` on reads, 200 +
// `exists:false` for a missing `stat`, and 409 for a `create_only` clash.

export const MOCK_VOLUME_ENDPOINT = 'https://volume.mock.invalid/v1/source-set/demo/volume';

interface MockEntry {
  name: string;
  isDir: boolean;
  sizeBytes: number;
  mtimeUnix: number;
  mode: number;
}

const file = (name: string, sizeBytes: number): MockEntry => ({
  name,
  isDir: false,
  sizeBytes,
  mtimeUnix: 1_770_000_000,
  mode: 420,
});
const dir = (name: string): MockEntry => ({ name, isDir: true, sizeBytes: 0, mtimeUnix: 1_770_000_000, mode: 493 });

/** `docs/archive` is deliberately past one page: the tree only looks right if `listAll` walks them all. */
const ARCHIVE_COUNT = 1_200;
/**
 * `docs/vast` is past the client's 10 000-entry ceiling, so the tree has to say what it left out. It is
 * genuinely heavy to render — that is the trade being demonstrated, not an oversight.
 */
const VAST_COUNT = 10_600;

function seedFs(): { dirs: Map<string, MockEntry[]>; files: Map<string, string> } {
  const dirs = new Map<string, MockEntry[]>([
    ['', [dir('docs'), dir('skills'), file('AGENTS.md', 820), file('README.md', 1_140)]],
    ['docs', [dir('archive'), dir('vast'), file('onboarding.md', 1_520), file('diagram.svg', 4_096)]],
    ['skills', [file('shortage-calc.md', 640)]],
    ['docs/archive', Array.from({ length: ARCHIVE_COUNT }, (_, i) => file(`note-${i}.md`, 128))],
    ['docs/vast', Array.from({ length: VAST_COUNT }, (_, i) => file(`row-${i}.md`, 64))],
  ]);

  const files = new Map<string, string>([
    [
      'README.md',
      '# Demo volume\n\nThis is an **in-memory** SourceSet volume served by a `fetch` interceptor.\n\n' +
        '- single click selects, double click opens\n' +
        '- right click for the same actions the toolbar offers\n' +
        '- `docs/archive` has 1,200 entries, so the client pages through them\n' +
        '- `docs/vast` is past the 10,000 ceiling, so the tree says how many it left out\n' +
        '- creating a file that already exists answers 409\n',
    ],
    ['AGENTS.md', 'Agent notes.\n\nEdit this file and save to exercise `PUT volume/file`.\n'],
    ['docs/onboarding.md', '# Onboarding\n\n1. Read this\n2. Edit it\n3. Save it\n'],
    ['docs/diagram.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60"></svg>'],
    ['skills/shortage-calc.md', '# shortage-calc\n\nA skill file.\n'],
  ]);

  return { dirs, files };
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const parentOf = (path: string): string => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');
const baseOf = (path: string): string => (path.includes('/') ? path.slice(path.lastIndexOf('/') + 1) : path);

/**
 * Install the interceptor. Returns an uninstall function — the route calls it on unmount so the demo
 * never leaves a patched `fetch` behind for another route to trip over.
 */
export function installVolumeMock(): () => void {
  const { dirs, files } = seedFs();
  const realFetch = globalThis.fetch.bind(globalThis);

  const lookup = (path: string): MockEntry | null => {
    if (path === '') return dir('');

    return dirs.get(parentOf(path))?.find(e => e.name === baseOf(path)) ?? null;
  };

  const insert = (path: string, entry: MockEntry): void => {
    const siblings = dirs.get(parentOf(path)) ?? [];
    dirs.set(parentOf(path), [...siblings.filter(e => e.name !== entry.name), entry]);
  };

  const drop = (path: string): void => {
    dirs.set(
      parentOf(path),
      (dirs.get(parentOf(path)) ?? []).filter(e => e.name !== baseOf(path)),
    );
    files.delete(path);
    dirs.delete(path);
  };

  const handle = (url: URL, method: string, body: BodyInit | null | undefined): Response => {
    const op = url.pathname.slice(url.pathname.lastIndexOf('/') + 1);
    const path = url.searchParams.get('path') ?? '';

    if (op === 'list' && method === 'GET') {
      const entries = dirs.get(path);
      if (!entries) return json({ error: 'not found' }, 404);

      const page = Number(url.searchParams.get('page') ?? 0);
      const size = Number(url.searchParams.get('page_size') ?? 1_000);

      return json({
        data: { entries: entries.slice(page * size, page * size + size) },
        paging: { index: page, size, total: entries.length },
      });
    }

    if (op === 'stat' && method === 'GET') {
      const entry = lookup(path);

      // 200 with `exists:false`, not a 404 — the contract difference that breaks code copied from the
      // sandbox fs API.
      return json({ data: entry ? { exists: true, ...entry } : { exists: false } });
    }

    if (op === 'file' && method === 'GET') {
      const content = files.get(path);
      if (content === undefined) return json({ error: 'not found' }, 404);

      return new Response(content, {
        status: 200,
        headers: { 'X-Total-Bytes': String(content.length), 'X-Truncated': 'false' },
      });
    }

    if (op === 'file' && method === 'PUT') {
      if (url.searchParams.get('create_only') === 'true' && files.has(path)) {
        return json({ error: 'already exists' }, 409);
      }

      const form = body instanceof FormData ? body : null;
      const picked = form?.get('file');
      const text = typeof picked === 'string' ? picked : '';
      files.set(path, text);
      insert(path, file(baseOf(path), text.length));

      return json({ data: { bytesWritten: text.length } });
    }

    if (op === 'mkdir' && method === 'POST') {
      if (!dirs.has(path)) dirs.set(path, []);

      insert(path, dir(baseOf(path)));

      return json({ data: {} });
    }

    if ((op === 'item' || op === 'all') && method === 'DELETE') {
      drop(path);

      return json({ data: {} });
    }

    if ((op === 'copy' || op === 'move') && method === 'POST') {
      const src = url.searchParams.get('src') ?? '';
      const dst = url.searchParams.get('dst') ?? '';
      const entry = lookup(src);
      if (!entry) return json({ error: 'not found' }, 404);

      if (entry.isDir) {
        dirs.set(dst, [...(dirs.get(src) ?? [])]);
      } else {
        files.set(dst, files.get(src) ?? '');
      }

      insert(dst, { ...entry, name: baseOf(dst) });
      if (op === 'move') drop(src);

      return json({ data: { bytesCopied: entry.sizeBytes } });
    }

    return json({ error: `unhandled ${method} ${op}` }, 400);
  };

  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!href.startsWith(MOCK_VOLUME_ENDPOINT)) return realFetch(input as RequestInfo, init);

    // Async, but with no invented latency (§7): a paged walk is many round trips, so the loading state
    // is visible on its own without a fake delay propping it up.
    return Promise.resolve(handle(new URL(href), init?.method ?? 'GET', init?.body));
  }) as typeof fetch;

  return (): void => {
    globalThis.fetch = realFetch;
  };
}
