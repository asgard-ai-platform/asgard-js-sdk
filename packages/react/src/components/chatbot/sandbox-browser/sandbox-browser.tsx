import { ReactNode, useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import { useAsgardContext } from '../../../context/asgard-service-context';
import { useSandboxName } from '../../../hooks/use-derived-stores';
import styles from './sandbox-browser.module.scss';

type BrowserState =
  | { kind: 'waiting' } // no sandbox yet (agent hasn't opened a browser)
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; url: string };

export interface SandboxBrowserProps {
  /** Placeholder shown before the sandbox exists / a browser URL is available. */
  waitingLabel?: string;
}

// Sandbox browser panel (sandbox Files/Browser, part 2). Reads the channel's sandbox name
// (`useSandboxName()`, folded from `sandbox.launch`/`ready`), asks the client for a one-time Neko
// embed URL (`client.getSandboxBrowserUrl()` → `POST /sandbox/{name}/browser/open-url`), and embeds
// it in an iframe with a URL/reload/open-in-new-tab toolbar. UI adapted from the Sindri prototype
// `BrowserPanel`. A chrome element like `<SandboxFiles>` — the app lays it out (Sindri owns the dock).
export function SandboxBrowser({ waitingLabel = '此 browser 由 agent 自動開啟' }: SandboxBrowserProps): ReactNode {
  const { client } = useAsgardContext();
  const sandboxName = useSandboxName();
  const [state, setState] = useState<BrowserState>({ kind: 'waiting' });
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(async (): Promise<void> => {
    if (!sandboxName || !client?.getSandboxBrowserUrl) {
      setState({ kind: 'waiting' });

      return;
    }

    setState({ kind: 'loading' });

    try {
      const url = await client.getSandboxBrowserUrl(sandboxName);
      setState({ kind: 'ready', url });
    } catch (err) {
      setState({ kind: 'error', message: err instanceof Error ? err.message : 'failed to open sandbox browser' });
    }
  }, [sandboxName, client]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  const openUrl = state.kind === 'ready' ? state.url : undefined;

  return (
    <div className={clsx('asgard-sandbox-browser', styles.sandbox_browser)}>
      <div className={styles.sandbox_browser__toolbar}>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          className={styles.sandbox_browser__icon}
        >
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
          <path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" stroke="currentColor" strokeWidth="2" />
        </svg>
        <span className={styles.sandbox_browser__url} title={openUrl}>
          {openUrl ?? '—'}
        </span>
        <button
          type="button"
          className={styles.sandbox_browser__btn}
          onClick={() => setReloadKey(k => k + 1)}
          disabled={!openUrl}
          aria-label="重新整理"
        >
          ↻
        </button>
        <button
          type="button"
          className={styles.sandbox_browser__btn}
          onClick={() => openUrl && window.open(openUrl, '_blank', 'noopener,noreferrer')}
          disabled={!openUrl}
          aria-label="在新分頁開啟"
        >
          ↗
        </button>
      </div>
      <div className={styles.sandbox_browser__body}>
        {state.kind === 'waiting' && <div className={styles.sandbox_browser__empty}>{waitingLabel}</div>}
        {state.kind === 'loading' && <div className={styles.sandbox_browser__empty}>開啟中…</div>}
        {state.kind === 'error' && (
          <div className={styles.sandbox_browser__error}>無法開啟 Browser：{state.message}</div>
        )}
        {state.kind === 'ready' && (
          <iframe
            key={reloadKey}
            src={state.url}
            title="sandbox browser"
            // Neko is remote; in production re-evaluate this sandbox combo (allow-scripts + allow-same-origin).
            sandbox="allow-scripts allow-same-origin"
            className={styles.sandbox_browser__frame}
          />
        )}
      </div>
    </div>
  );
}

export default SandboxBrowser;
