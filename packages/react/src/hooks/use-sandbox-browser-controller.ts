import { useCallback, useMemo, useRef, useState } from 'react';

// F-035 — the shared sandbox browser controller, the same shape as `useFileExplorerController` and for the
// same reason (F-019 / F-021): *behavior* and *placement* are separate concerns. Three sources can drive
// "is the browser panel open / which sandbox am I watching": (1) the built-in header toggle, (2) an agent
// `sandbox://<name>/open-browser` card, (3) a consumer-placed <SandboxBrowserPanel> in
// `sandboxBrowser="off"` mode. If that state lived inside the panel, where the panel is mounted would
// decide whether a card can reach it — and a host that remounts its subtree would wipe it.
//
// **Control ownership is deliberately not here.** It is connection state, not placement state: offline
// means there is no control to hold, and a reconnect has the server re-declare it (`control/host`). A copy
// kept here would be a shadow value that can disagree with the server — and this panel's worst failure is
// a UI that believes it holds control while the server discards everything it sends, with no error
// anywhere (spec §6). The panel owns it, and the transport's reported host is the only truth.

/** One "open this sandbox's browser" request; the nonce lets a repeat request for the same sandbox re-fire. */
export interface RequestedBrowser {
  sandboxName: string;
  /**
   * Bumped on every request. Without it, asking for the same sandbox twice is an identical object and the
   * panel's effect never re-runs — so a second card for a sandbox already on screen would do nothing, which
   * reads as the card being broken.
   */
  nonce: number;
}

/** Options for {@link SandboxBrowserController.requestBrowser}. */
export interface RequestBrowserOptions {
  /**
   * Also open the built-in aside. Default true. Separating "route the intent" from "open the panel" is what
   * lets a card arrival be notify-not-force: the controller learns which sandbox was asked for either way.
   */
  reveal?: boolean;
}

export interface SandboxBrowserController {
  // --- state ---
  /** Whether the built-in aside is open. A consumer-placed panel can ignore this and render permanently. */
  open: boolean;
  /** Which sandbox is being viewed; `null` until one is chosen (the panel falls back to the first browser-enabled one and writes it back). */
  activeSandboxName: string | null;
  /** The most recent open request. The panel connects from this, and re-connects when the nonce moves. */
  requestedBrowser: RequestedBrowser | null;

  // --- actions ---
  // Named `openBrowser` / `closeBrowser` rather than `open` / `close` so they do not collide with the
  // `open` boolean above — the same reason `useFileExplorerController` uses `openExplorer`.
  openBrowser: () => void;
  closeBrowser: () => void;
  toggle: () => void;
  selectSandbox: (sandboxName: string) => void;
  /** The card / deep-link entry point: open the panel, select the sandbox, and request a connection at once. */
  requestBrowser: (sandboxName: string, options?: RequestBrowserOptions) => void;
}

export interface UseSandboxBrowserControllerOptions {
  open?: boolean;
  activeSandboxName?: string | null;
}

export function useSandboxBrowserController({
  open: initialOpen = false,
  activeSandboxName: initialActive = null,
}: UseSandboxBrowserControllerOptions = {}): SandboxBrowserController {
  const [open, setOpen] = useState(initialOpen);
  const [activeSandboxName, setActiveSandboxName] = useState<string | null>(initialActive);
  const [requestedBrowser, setRequestedBrowser] = useState<RequestedBrowser | null>(null);
  const nonce = useRef(0);

  const openBrowser = useCallback((): void => setOpen(true), []);
  const closeBrowser = useCallback((): void => setOpen(false), []);
  const toggle = useCallback((): void => setOpen(v => !v), []);

  const selectSandbox = useCallback((sandboxName: string): void => {
    setActiveSandboxName(sandboxName);
    // Switching sandboxes by hand makes a pending request for a different one stale.
    setRequestedBrowser(rb => (rb && rb.sandboxName !== sandboxName ? null : rb));
  }, []);

  const requestBrowser = useCallback((sandboxName: string, options?: RequestBrowserOptions): void => {
    nonce.current += 1;
    if (options?.reveal ?? true) setOpen(true);

    setActiveSandboxName(sandboxName);
    setRequestedBrowser({ sandboxName, nonce: nonce.current });
  }, []);

  // A fresh object literal every render defeats every consumer's memo and dependency array — and here the
  // panel's connection effect depends on this object, so churn would mean reconnecting on every render
  // (issue #427 was the same defect on the file-explorer controller). Identity moves only with the state.
  return useMemo(
    () => ({
      open,
      activeSandboxName,
      requestedBrowser,
      openBrowser,
      closeBrowser,
      toggle,
      selectSandbox,
      requestBrowser,
    }),
    [open, activeSandboxName, requestedBrowser, openBrowser, closeBrowser, toggle, selectSandbox, requestBrowser],
  );
}

export default useSandboxBrowserController;
