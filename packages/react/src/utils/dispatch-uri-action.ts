import { AsgardServiceClient, resolveSandboxUri } from '@asgard-js/core';
import { safeWindowOpen } from './uri-validation';
import { isChannelHomeUri, downloadChannelHomeUri } from './channel-home-download';

export type LinkTarget = '_blank' | '_self' | '_parent' | '_top';

export interface DispatchUriActionOptions {
  /** The SDK client — needed for the sandbox browser open-url call and channel-home downloads. */
  client?: AsgardServiceClient | null;
  /**
   * Current channel id — needed for channel-home downloads, and for the sandbox relay's ownership proof
   * on `open-browser` (`SandboxChannelScope`; a relay answers `400` without it).
   */
  customChannelId?: string | null;
  /** The action's own target, if any (takes precedence over `defaultLinkTarget` for plain links). */
  target?: string;
  /** Fallback link target for plain (non-sandbox) uris. */
  defaultLinkTarget?: LinkTarget;
  /** Host override for `sandbox://<name>/open-browser` — if set, the SDK defers entirely to it. */
  onSandboxOpenBrowser?: (sandboxName: string) => void;
  /** Host handler for `sandbox://<name>/open-file` — the File Explorer preview destination (F-021). */
  onSandboxOpenFile?: (sandboxName: string, absolutePath: string) => void;
  /** Where the default open-browser handler opens the one-time URL. Defaults to `_blank`. */
  sandboxBrowserOpenTarget?: LinkTarget;
}

/**
 * Default `open-browser` side effect (F-020 / UC-034): fetch the one-time browser URL from the client and
 * open it. Never falls back to `window.open`ing the raw `sandbox://` URI — on failure it just logs.
 */
async function openSandboxBrowser(
  client: AsgardServiceClient,
  sandboxName: string,
  target: LinkTarget,
  customChannelId?: string | null,
): Promise<void> {
  try {
    const openUrl = await client.generateSandboxBrowserOpenUrl(
      sandboxName,
      customChannelId ? { customChannelId } : undefined,
    );
    safeWindowOpen(openUrl, target);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[asgard] sandbox browser open-url failed:', error);
  }
}

/**
 * Single shared dispatcher for a uri action, reused by the attachment chip and the button / carousel card
 * (F-020 / UC-036). Custom `sandbox://` schemes are intercepted **before** the `safeWindowOpen` fallback and
 * routed to a typed side effect (they are client-side commands, not browsable URLs); `channel-home://`
 * downloads next; everything else falls through to the existing uri-validation whitelist + `safeWindowOpen`.
 */
export function dispatchUriAction(uri: string, options: DispatchUriActionOptions): void {
  const intent = resolveSandboxUri(uri);

  if (intent) {
    if (intent.kind === 'open-browser') {
      if (options.onSandboxOpenBrowser) {
        options.onSandboxOpenBrowser(intent.sandboxName);
      } else if (options.client) {
        void openSandboxBrowser(
          options.client,
          intent.sandboxName,
          options.sandboxBrowserOpenTarget ?? '_blank',
          options.customChannelId,
        );
      }

      return;
    }

    // open-file → hand the typed intent to the host (File Explorer preview lands in F-021); no-op if unwired.
    options.onSandboxOpenFile?.(intent.sandboxName, intent.absolutePath);

    return;
  }

  if (isChannelHomeUri(uri)) {
    if (options.client && options.customChannelId) {
      void downloadChannelHomeUri(options.client, options.customChannelId, uri);
    }

    return;
  }

  safeWindowOpen(uri, options.target || options.defaultLinkTarget || '_blank');
}
