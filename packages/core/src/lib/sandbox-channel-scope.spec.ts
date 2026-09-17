import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchEventSource } from '@microsoft/fetch-event-source';
import AsgardServiceClient from './client';
import { SandboxChannelScope } from '../types';

// #470 — every sandbox relay is channel-scoped (`SandboxChannelScope`); a relay in front of asgard-core
// rejects the call without it. All twelve are driven from one table because the defect was an omission in
// all of them at once: an assertion written next to each method would have been just as absent.
//
// F-035 added the twelfth (`createSandboxBrowserSession`) and, in doing so, showed the coverage guard had
// a hole of its own — see the comment on the filter below.

vi.mock('@microsoft/fetch-event-source', () => ({
  fetchEventSource: vi.fn(() => Promise.resolve()),
  EventStreamContentType: 'text/event-stream',
}));

const mockedFetchEventSource = vi.mocked(fetchEventSource);

/** One response body every relay below can decode: each reads only the fields it knows. */
function anyOkResponse(): Response {
  return {
    status: 200,
    ok: true,
    statusText: 'OK',
    headers: { get: (): string | null => null },
    json: async () => ({
      data: {
        entries: [],
        truncated: false,
        bytesWritten: 1,
        bytesCopied: 1,
        exists: true,
        isDir: false,
        sizeBytes: 1,
        mtimeUnix: 1,
        mode: 420,
        openURL: 'https://neko.example.com/t/abc',
        wsUrl: 'wss://neko.example.com/api/ws',
        token: 'neko-session-token',
      },
    }),
    blob: async () => new Blob(['x']),
    text: async () => '',
  } as unknown as Response;
}

function makeClient(): AsgardServiceClient {
  return new AsgardServiceClient({
    botProviderEndpoint: 'https://api.example.com/ns/x/bot-provider/y',
    apiKey: 'test-key',
  });
}

interface Relay {
  /** The public method under test. */
  name: string;
  /** `fs/watch` is the one relay that goes out over SSE, so its URL lands in the other mock. */
  transport: 'fetch' | 'sse';
  call: (client: AsgardServiceClient, scope?: SandboxChannelScope) => Promise<unknown>;
}

const RELAYS: Relay[] = [
  {
    name: 'generateSandboxBrowserOpenUrl',
    transport: 'fetch',
    call: (c, s) => c.generateSandboxBrowserOpenUrl('sb', s),
  },
  {
    name: 'createSandboxBrowserSession',
    transport: 'fetch',
    call: (c, s) => c.createSandboxBrowserSession('sb', s),
  },
  { name: 'sandboxFsList', transport: 'fetch', call: (c, s) => c.sandboxFsList('sb', '/work', s) },
  { name: 'sandboxFsRead', transport: 'fetch', call: (c, s) => c.sandboxFsRead('sb', '/work/a.txt', s) },
  { name: 'sandboxFsWrite', transport: 'fetch', call: (c, s) => c.sandboxFsWrite('sb', '/work/a.txt', 'hi', s) },
  { name: 'sandboxFsStat', transport: 'fetch', call: (c, s) => c.sandboxFsStat('sb', '/work/a.txt', s) },
  { name: 'sandboxFsMkdir', transport: 'fetch', call: (c, s) => c.sandboxFsMkdir('sb', '/work/new', s) },
  { name: 'sandboxFsRemove', transport: 'fetch', call: (c, s) => c.sandboxFsRemove('sb', '/work/a.txt', s) },
  { name: 'sandboxFsRemoveAll', transport: 'fetch', call: (c, s) => c.sandboxFsRemoveAll('sb', '/work/dir', s) },
  { name: 'sandboxFsCopy', transport: 'fetch', call: (c, s) => c.sandboxFsCopy('sb', '/work/a', '/work/b', s) },
  { name: 'sandboxFsMove', transport: 'fetch', call: (c, s) => c.sandboxFsMove('sb', '/work/a', '/work/b', s) },
  {
    name: 'sandboxFsWatch',
    transport: 'sse',
    call: async (c, s) =>
      c
        .sandboxFsWatch('sb', '/work/a.txt', s)
        .subscribe({ error: () => undefined })
        .unsubscribe(),
  },
];

/**
 * Every sandbox method on the prototype that this table does **not** drive. The three private helpers are
 * listed by name on purpose: a new public relay is not on this list, so it turns this spec red instead of
 * shipping without the ownership parameter the way all eleven did.
 *
 * Still blind to a relay that does not live on the prototype (an instance arrow-function field).
 */
const PRIVATE_HELPERS = ['sandboxFsUrl', 'sandboxFsRequest', 'deriveSandboxFsEndpoint'];

function lastRequestUrl(relay: Relay): string {
  const calls = relay.transport === 'sse' ? mockedFetchEventSource.mock.calls : vi.mocked(global.fetch).mock.calls;

  expect(calls.length, `${relay.name} sent no request`).toBeGreaterThan(0);

  return String(calls[calls.length - 1][0]);
}

describe('sandbox relay channel scope (#470)', () => {
  beforeEach(() => {
    mockedFetchEventSource.mockReset();
    mockedFetchEventSource.mockReturnValue(Promise.resolve());
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(anyOkResponse()));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each(RELAYS)('$name sends custom_channel_id when the scope carries one', async relay => {
    await relay.call(makeClient(), { customChannelId: 'ch-1' });

    expect(new URL(lastRequestUrl(relay)).searchParams.get('custom_channel_id')).toBe('ch-1');
  });

  it.each(RELAYS)('$name leaves the url untouched without a scope (§1.7 backward compatibility)', async relay => {
    await relay.call(makeClient());

    expect(new URL(lastRequestUrl(relay)).searchParams.has('custom_channel_id')).toBe(false);
  });

  it('covers every sandbox relay on the client, so a new one cannot ship uncovered', () => {
    // Matched on "sandbox" anywhere in the name rather than on a list of prefixes. F-035's
    // `createSandboxBrowserSession` matched none of the three original prefixes, so the guard that exists
    // to catch the twelfth relay would have waved it straight through — a list of known shapes cannot
    // recognize a shape nobody has written yet.
    const onPrototype = Object.getOwnPropertyNames(AsgardServiceClient.prototype).filter(name => /sandbox/i.test(name));
    const covered = new Set([...RELAYS.map(relay => relay.name), ...PRIVATE_HELPERS]);
    const uncovered = onPrototype.filter(name => !covered.has(name));

    expect(
      uncovered,
      `these sandbox methods are not in this spec's table — add them (or to PRIVATE_HELPERS if internal): ${uncovered.join(
        ', ',
      )}`,
    ).toEqual([]);
  });

  // An empty string cannot be a channel, and sending `custom_channel_id=` earns the same "required" 400
  // as omitting it, so the url stays clean rather than carrying a value that proves nothing.
  it('keeps the parameter out when the scope is present but empty, rather than sending an empty channel', async () => {
    await makeClient().sandboxFsList('sb', '/work', { customChannelId: '' });

    expect(vi.mocked(global.fetch).mock.calls[0][0]).not.toContain('custom_channel_id');
  });
});
