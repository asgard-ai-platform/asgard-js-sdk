import { describe, it, expect, vi, afterEach } from 'vitest';
import AsgardServiceClient from './client';
import { HttpError } from '../types/http-error';

// F-015: GET /channel/metadata is the existence gate for the mount lifecycle.
// These lock the response contract — 200 success envelope, 404 = not-exist, and
// non-404 errors THROW (so the caller falls back without silently wiping history).

interface StubResponse {
  status: number;
  ok: boolean;
  statusText?: string;
  json?: unknown;
  text?: string;
}

function stubFetch(response: StubResponse): ReturnType<typeof vi.fn> {
  const fn = vi.fn().mockResolvedValue({
    status: response.status,
    ok: response.ok,
    statusText: response.statusText ?? '',
    json: async () => response.json,
    text: async () => response.text ?? '',
  });
  vi.stubGlobal('fetch', fn);

  return fn;
}

describe('AsgardServiceClient.getChannelMetadata (F-015)', () => {
  const client = new AsgardServiceClient({ botProviderEndpoint: 'https://api.example.com/bp' });

  afterEach(() => vi.unstubAllGlobals());

  it('parses the success envelope into ChannelMetadata and issues a GET with the id in the query', async () => {
    const fetchFn = stubFetch({
      status: 200,
      ok: true,
      json: {
        isSuccess: true,
        data: { customChannelId: 'c1', title: 'Hi', runState: 'RUNNING', lastActivityAt: '2026-07-13T00:00:00Z' },
      },
    });

    const meta = await client.getChannelMetadata('c1');

    expect(meta).toEqual({
      exists: true,
      customChannelId: 'c1',
      title: 'Hi',
      runState: 'RUNNING',
      lastActivityAt: '2026-07-13T00:00:00Z',
    });

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('https://api.example.com/bp/channel/metadata?custom_channel_id=c1');
    expect(init.method).toBe('GET');
  });

  it('returns exists:false on 404 (without reading the body)', async () => {
    stubFetch({ status: 404, ok: false, json: { isSuccess: false } });

    await expect(client.getChannelMetadata('missing')).resolves.toEqual({ exists: false });
  });

  it('throws HttpError on a non-404 error (no silent history loss)', async () => {
    stubFetch({ status: 500, ok: false, statusText: 'Internal Server Error', text: 'boom' });

    await expect(client.getChannelMetadata('c1')).rejects.toBeInstanceOf(HttpError);
  });

  it('url-encodes the channel id in the query string', async () => {
    const fetchFn = stubFetch({ status: 404, ok: false, json: {} });

    await client.getChannelMetadata('a/b c');

    expect(fetchFn.mock.calls[0][0]).toContain('custom_channel_id=a%2Fb%20c');
  });

  it('tolerates a success envelope with an absent (omitempty) title', async () => {
    stubFetch({ status: 200, ok: true, json: { isSuccess: true, data: { customChannelId: 'c2', runState: 'IDLE' } } });

    const meta = await client.getChannelMetadata('c2');

    expect(meta).toEqual({
      exists: true,
      customChannelId: 'c2',
      title: undefined,
      runState: 'IDLE',
      lastActivityAt: undefined,
    });
  });
});
