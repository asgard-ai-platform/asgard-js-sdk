import {
  createSandboxBrowserTransport,
  type SandboxBrowserTransport,
  type SandboxBrowserTransportHandlers,
} from '@asgard-js/core';

// F-035 — the lab's transport: the **production** core transport, with only its credential source swapped.
//
// That swap is the whole point. The panel and the protocol client are exactly the ones that ship; the only
// thing this file replaces is where `{ wsUrl, token }` come from — neko's own REST login instead of the
// Asgard relay. If the seam between "get credentials" and "speak the protocol" were drawn in the wrong
// place, this file could not exist in twenty lines.

export interface NekoLabConfig {
  /** e.g. http://127.0.0.1:18090 */
  baseUrl: string;
  username: string;
  password: string;
}

export function createNekoLabTransport(
  config: NekoLabConfig,
  onWire?: SandboxBrowserTransportHandlers['onWire'],
): SandboxBrowserTransport {
  const base = config.baseUrl.replace(/\/$/, '');

  const transport = createSandboxBrowserTransport({
    displayName: 'asgard-neko-lab',
    createSession: async () => {
      // Cross-origin: neko must be started with NEKO_SERVER_CORS, or this is blocked at preflight.
      const response = await fetch(`${base}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: config.username, password: config.password }),
      });
      if (!response.ok) {
        throw new Error(`neko login failed (${response.status}) — wrong credentials, or CORS is not enabled`);
      }

      const { token } = (await response.json()) as { token: string };

      return { wsUrl: `${base.replace(/^http/, 'ws')}/api/ws`, token };
    },
  });

  if (!onWire) return transport;

  // Fold the lab's wire logger into whatever handlers the panel passes, so the page can show the traffic
  // without the panel needing to know the lab exists.
  return {
    connect: (sandboxName, handlers) => transport.connect(sandboxName, { ...handlers, onWire }),
  };
}
