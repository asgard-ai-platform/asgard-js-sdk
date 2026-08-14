import { ReactNode, useEffect, useMemo } from 'react';
import { AsgardSourceSetClient } from '@asgard-js/core';
import { AsgardThemeContextValue } from '../../context/asgard-theme-context';
import { useFileExplorerController } from '../../hooks/use-file-explorer-controller';
import { Locale } from '../../i18n';
import { AsgardThemeScope } from '../theme-scope/theme-scope';
import { FileExplorerProvider } from '../file-explorer/file-explorer-context';
import {
  FileExplorerHeader,
  FileExplorerHeaderRow,
  FileExplorerReadOnlyBadge,
  FileExplorerRoot,
  FileExplorerWorkspace,
} from '../file-explorer/file-explorer-parts';
import { FsSource } from '../file-explorer/types';
import { createSourceSetFsProviders, volumeSourceRoot } from './create-source-set-fs-providers';
import styles from '../file-explorer/file-explorer-panel.module.scss';

// F-025 — the File Explorer mounted on a SourceSet volume, with no chat anywhere in sight.
//
// It is an *assembly*, not a second explorer. The tree, toolbar, context menu, clipboard, dialogs and
// FileView are the same parts the in-chat panel composes; all that differs is the header (a fixed
// source, so no picker) and the absence of everything sandbox-shaped — no source dropdown, no Nudge,
// no watch, no liveness. See `asgard-sdk-pm#79` for why this is a composition rather than the separate
// component F-025 originally specified.

export interface SourceSetFileExplorerProps {
  /**
   * The volume endpoint, pointed at `…/volume` directly. Works against the edge server and all three
   * BFF relays — their path segments after the base are identical by design.
   */
  sourceSetEndpoint: string;
  /**
   * `X-API-KEY` for the edge server. **Leave this out when talking to a BFF relay**: the volume key is
   * the relay's to hold, and it has no business reaching the browser.
   */
  apiKey?: string;
  /** Extra headers for every request — `{ Authorization: 'Bearer …' }` when the endpoint is a relay. */
  customHeaders?: Record<string, string>;
  /** Name shown in the header. Purely cosmetic; the volume is identified by the endpoint. */
  label?: string;
  /** Lock the tree to a subdirectory of the volume (relative, e.g. `notes`). */
  rootPath?: string;
  /** Reveal and select this path on mount (relative to the volume, not to `rootPath`). */
  initialPath?: string;
  /** Hide every action that would change the volume, and mark the panel read-only. */
  readOnly?: boolean;
  /** Defaults to `en-US`. No surrounding Chatbot is needed for this to take effect. */
  locale?: Locale;
  /**
   * Same shape as `<Chatbot theme>`; pass the same value to keep both surfaces in step.
   *
   * The panel always establishes its own theme scope, with or without this — the design tokens are
   * emitted onto the chat shell's root, and this component is deliberately mounted nowhere near one, so
   * without a scope it renders the light defaults on whatever page it lands on.
   */
  theme?: Partial<AsgardThemeContextValue>;
  /** Called with the untouched failure on any failed action; the panel shows its own sentence too. */
  onError?: (error: unknown) => void;
}

/** One volume is one source, so the id is a constant — there is never a second one to tell apart. */
const SOURCE_ID = 'source-set-volume';

export function SourceSetFileExplorer(props: SourceSetFileExplorerProps): ReactNode {
  const { sourceSetEndpoint, apiKey, customHeaders, label, rootPath, initialPath, readOnly, locale, theme, onError } =
    props;

  // `customHeaders` is an object literal at most call sites, so a fresh identity arrives every render.
  // The client is rebuilt from the serialized headers rather than the object, so it survives renders
  // that changed nothing — an identity that churns is what produced the File Explorer's render loop
  // in #427, and here it would also throw away every in-flight request.
  const headerKey = JSON.stringify(customHeaders ?? {});
  const client = useMemo(
    () =>
      new AsgardSourceSetClient({
        sourceSetEndpoint,
        apiKey,
        customHeaders: headerKey === '{}' ? undefined : (JSON.parse(headerKey) as Record<string, string>),
      }),
    [sourceSetEndpoint, apiKey, headerKey],
  );
  const providers = useMemo(() => createSourceSetFsProviders(client), [client]);

  const root = volumeSourceRoot(rootPath);
  const sources = useMemo<FsSource[]>(() => [{ id: SOURCE_ID, label: label ?? '', rootPath: root }], [label, root]);

  const controller = useFileExplorerController({ activeSourceId: SOURCE_ID });

  // `initialPath` is a one-shot: it names where to start, not a controlled selection. Re-firing it on
  // every render would drag the user back there each time they navigated away.
  const { requestFile } = controller;
  useEffect(() => {
    if (!initialPath) return;

    requestFile(SOURCE_ID, volumeSourceRoot(initialPath), { reveal: false });
  }, [initialPath, requestFile]);

  return (
    // `height: 100%` on the scope is load-bearing, not tidiness: it is a plain div, the explorer inside
    // it is `height: 100%`, and an `auto`-height link anywhere in that chain turns "scroll inside the
    // panel" into "grow the page" — measured at 244,846px once already.
    <AsgardThemeScope theme={theme} style={{ height: '100%', minHeight: 0 }}>
      <FileExplorerProvider
        sources={sources}
        controller={controller}
        providers={providers}
        readOnly={readOnly}
        locale={locale}
        onError={onError}
      >
        <FileExplorerRoot>
          <FileExplorerHeader>
            <FileExplorerHeaderRow>
              {label && <span className={styles.sourceLabel}>{label}</span>}
              <span className={styles.sourceCrumb}>{root}</span>
              <FileExplorerReadOnlyBadge />
            </FileExplorerHeaderRow>
          </FileExplorerHeader>
          <FileExplorerWorkspace />
        </FileExplorerRoot>
      </FileExplorerProvider>
    </AsgardThemeScope>
  );
}

export default SourceSetFileExplorer;
