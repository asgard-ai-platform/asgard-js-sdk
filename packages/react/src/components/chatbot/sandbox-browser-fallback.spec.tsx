// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { dispatchUriAction } from '../../utils/dispatch-uri-action';
import type { AsgardServiceClient } from '@asgard-js/core';

/**
 * F-035 R4 — adding the SDK-rendered panel must not take the old path away.
 *
 * `browser/open-url` + a new tab (UC-034) stays as the behavior when the host has wired neither the built-in
 * panel nor `onSandboxOpenBrowser`. Two reasons it is kept rather than replaced: it is the escape hatch for
 * "I actually want the full Neko UI in its own tab", and every consumer already shipping against the SDK
 * gets it today. A card that silently stopped doing anything would be the worst possible outcome of this
 * feature, and it is invisible from inside the new panel's own tests — hence this file.
 */

const openMock = vi.hoisted(() => vi.fn());
vi.mock('../../utils/uri-validation', () => ({
  safeWindowOpen: openMock,
  isValidUri: (): boolean => true,
}));

function clientWithOpenUrl(openURL = 'https://neko.example.com/t/abc'): AsgardServiceClient {
  return {
    generateSandboxBrowserOpenUrl: vi.fn().mockResolvedValue(openURL),
  } as unknown as AsgardServiceClient;
}

describe('open-browser card fallback (UC-034 preserved)', () => {
  it('fetches a one-time url and opens a new tab when no host handler is wired', async () => {
    openMock.mockClear();
    const client = clientWithOpenUrl();

    dispatchUriAction('sandbox://sb-1/open-browser', { client, customChannelId: 'ch-1' });
    await vi.waitFor(() => expect(openMock).toHaveBeenCalled());

    expect(client.generateSandboxBrowserOpenUrl).toHaveBeenCalledWith('sb-1', { customChannelId: 'ch-1' });
    expect(openMock).toHaveBeenCalledWith('https://neko.example.com/t/abc', '_blank');
  });

  it('honours an explicit open target', async () => {
    openMock.mockClear();

    dispatchUriAction('sandbox://sb-1/open-browser', {
      client: clientWithOpenUrl(),
      sandboxBrowserOpenTarget: '_self',
    });
    await vi.waitFor(() => expect(openMock).toHaveBeenCalled());

    expect(openMock).toHaveBeenCalledWith('https://neko.example.com/t/abc', '_self');
  });

  // With a handler wired — which is what `<Chatbot sandboxBrowser="builtin">` does — the SDK defers
  // entirely. Opening a tab *as well* would put the same session on screen twice.
  it('defers to the host handler and opens no tab', async () => {
    openMock.mockClear();
    const onSandboxOpenBrowser = vi.fn();
    const client = clientWithOpenUrl();

    dispatchUriAction('sandbox://sb-1/open-browser', { client, onSandboxOpenBrowser });

    expect(onSandboxOpenBrowser).toHaveBeenCalledWith('sb-1');
    expect(client.generateSandboxBrowserOpenUrl).not.toHaveBeenCalled();
    expect(openMock).not.toHaveBeenCalled();
  });

  // Never fall back to opening the raw `sandbox://` uri — the browser cannot do anything with it, and the
  // user would get a broken tab instead of an explanation (UC-034 ALT1, UC-036).
  it('opens nothing at all when there is no client to ask', () => {
    openMock.mockClear();

    dispatchUriAction('sandbox://sb-1/open-browser', {});

    expect(openMock).not.toHaveBeenCalled();
  });
});
