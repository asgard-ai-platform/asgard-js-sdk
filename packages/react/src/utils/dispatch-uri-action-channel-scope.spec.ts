// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AsgardServiceClient } from '@asgard-js/core';
import { dispatchUriAction } from './dispatch-uri-action';

// #470 — `POST browser/open-url` is channel-scoped like the fs calls. The channel id was already on
// `DispatchUriActionOptions` for channel-home downloads and simply was not passed on.

const generateSandboxBrowserOpenUrl = vi.fn().mockResolvedValue('https://neko.example.com/t/abc');

function makeClient(): AsgardServiceClient {
  return { generateSandboxBrowserOpenUrl } as unknown as AsgardServiceClient;
}

beforeEach(() => {
  generateSandboxBrowserOpenUrl.mockClear();
  vi.stubGlobal('open', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('dispatchUriAction — open-browser channel scope (#470)', () => {
  it('hands the channel id to the open-url call', async () => {
    dispatchUriAction('sandbox://sb-1/open-browser', { client: makeClient(), customChannelId: 'ch-1' });

    await vi.waitFor(() => expect(generateSandboxBrowserOpenUrl).toHaveBeenCalled());
    expect(generateSandboxBrowserOpenUrl).toHaveBeenCalledWith('sb-1', { customChannelId: 'ch-1' });
  });

  it('omits the scope entirely when there is no channel, rather than sending an empty one', async () => {
    dispatchUriAction('sandbox://sb-1/open-browser', { client: makeClient() });

    await vi.waitFor(() => expect(generateSandboxBrowserOpenUrl).toHaveBeenCalled());
    expect(generateSandboxBrowserOpenUrl).toHaveBeenCalledWith('sb-1', undefined);
  });

  it('still defers to a host override without calling the client at all', () => {
    const onSandboxOpenBrowser = vi.fn();

    dispatchUriAction('sandbox://sb-1/open-browser', {
      client: makeClient(),
      customChannelId: 'ch-1',
      onSandboxOpenBrowser,
    });

    expect(onSandboxOpenBrowser).toHaveBeenCalledWith('sb-1');
    expect(generateSandboxBrowserOpenUrl).not.toHaveBeenCalled();
  });
});
