import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SourceSetFileExplorer, type ContextMenuItem, type FsEntry } from '@asgard-js/react';
import '@asgard-js/react/style';
import { DemoWrapper } from '../../components/demo-wrapper';
import { installMockVolume, MOCK_ENDPOINT, NO_FAULTS, type VolumeFaults } from './volume-mock';
import styles from './source-set-explorer.module.scss';

/**
 * TASK-004 — the SourceSet File Explorer mounted on its own, with no Chatbot anywhere on the page.
 *
 * Two mounts side by side rather than one behind a toggle: the narrow column is the width a host aside
 * actually gives this component (where ten toolbar buttons wrap), and the wide one is how Platform and
 * Agent Hub mount it. What matters is comparing them, and a toggle makes you hold one in your head.
 *
 * With no `VITE_SOURCE_SET_ENDPOINT` set the route runs against an in-memory volume, so every action is
 * exercisable without credentials. Setting that variable points both mounts at a real volume instead.
 *
 * The "host extension points" switch stands in for Odin's Drive Files tab (BUILD-064): a folder gets an
 * extra right-click action that pulls from an external source, a folder already pulling shows that item
 * greyed with who owns it, and its row carries a marker. None of that is the SDK's — the route plays the
 * host, which is the whole point of the two props.
 */

const REAL_ENDPOINT = import.meta.env.VITE_SOURCE_SET_ENDPOINT as string | undefined;
const REAL_API_KEY = import.meta.env.VITE_SOURCE_SET_API_KEY as string | undefined;
const REAL_AUTH_TOKEN = import.meta.env.VITE_SOURCE_SET_AUTH_TOKEN as string | undefined;

const LOCALES = ['en-US', 'zh-TW', 'ja-JP'] as const;

type DemoLocale = (typeof LOCALES)[number];

/** Stands in for the host's own icon set — the SDK renders whatever node the host hands it. */
const SYNC_GLYPH = <span aria-hidden>↻</span>;

export function SourceSetExplorerRoute(): ReactNode {
  const usingMock = !REAL_ENDPOINT;
  const [ready, setReady] = useState(!usingMock);
  const [readOnly, setReadOnly] = useState(false);
  const [locale, setLocale] = useState<DemoLocale>('en-US');
  const [rootPath, setRootPath] = useState('');
  const [hostExtras, setHostExtras] = useState(true);
  // Batch upload (BUG-008) needs a volume that is slow enough to watch and rude enough to back off from.
  const [slowWrites, setSlowWrites] = useState(true);
  const [throttle, setThrottle] = useState(false);
  const faults = useRef<VolumeFaults>(NO_FAULTS);
  faults.current = {
    writeLatencyMs: slowWrites ? 700 : 0,
    // Enough to halve the ceiling twice over, so the panel's "slowed to N" line is unmissable.
    throttleFirst: throttle ? 4 : 0,
  };
  // Which directories a pretend syncer writes into. `notes` starts mounted so the badge and the greyed-out
  // menu item are both on screen without setting anything up first.
  const [pulled, setPulled] = useState<Record<string, string>>({ notes: 'nightly-docs' });

  const extraEntryActions = useCallback(
    (entry: FsEntry | null): ContextMenuItem[] => {
      if (!entry?.isDir) return [];

      const owner = pulled[entry.path];

      return owner
        ? [
            {
              key: 'pull',
              label: `Pulled by ${owner}`,
              icon: SYNC_GLYPH,
              disabled: true,
              onSelect: (): void => undefined,
            },
          ]
        : [
            {
              key: 'pull',
              label: 'Pull from external source',
              icon: SYNC_GLYPH,
              onSelect: () => setPulled(current => ({ ...current, [entry.path]: 'nightly-docs' })),
            },
          ];
    },
    [pulled],
  );

  const entryBadge = useCallback(
    (entry: FsEntry): ReactNode => {
      const owner = pulled[entry.path];
      if (!owner) return null;

      return (
        <span className={styles.pulledBadge} title={`Pulled from ${owner} (git)`}>
          {SYNC_GLYPH}
        </span>
      );
    },
    [pulled],
  );

  // Patch `fetch` only while this route is mounted, so navigating away leaves the rest of the demo alone.
  useEffect(() => {
    if (!usingMock) return;

    // Read per request, not captured: flipping a fault control must not tear the volume down and lose
    // everything already uploaded into it.
    const restore = installMockVolume(() => faults.current);
    setReady(true);

    return (): void => {
      setReady(false);
      restore();
    };
  }, [usingMock]);

  const connection = useMemo(
    () => ({
      sourceSetEndpoint: REAL_ENDPOINT ?? MOCK_ENDPOINT,
      apiKey: REAL_ENDPOINT ? REAL_API_KEY : undefined,
      customHeaders: REAL_ENDPOINT && REAL_AUTH_TOKEN ? { Authorization: `Bearer ${REAL_AUTH_TOKEN}` } : undefined,
    }),
    [],
  );

  return (
    <DemoWrapper
      title="SourceSet File Explorer"
      description="A standalone file explorer mounted straight on a SourceSet volume — no chat, no sandbox. Configured entirely by props."
    >
      <div className={styles.stack}>
        <div className={styles.controls}>
          <label className={styles.control}>
            <input type="checkbox" checked={readOnly} onChange={event => setReadOnly(event.target.checked)} />
            readOnly
          </label>

          <label className={styles.control}>
            <input type="checkbox" checked={hostExtras} onChange={event => setHostExtras(event.target.checked)} />
            host extension points
          </label>

          <label className={styles.control}>
            <input type="checkbox" checked={slowWrites} onChange={event => setSlowWrites(event.target.checked)} />
            slow writes (700ms)
          </label>

          <label className={styles.control}>
            <input type="checkbox" checked={throttle} onChange={event => setThrottle(event.target.checked)} />
            volume pushes back (429 × 4)
          </label>

          <label className={styles.control}>
            locale
            <select value={locale} onChange={event => setLocale(event.target.value as DemoLocale)}>
              {LOCALES.map(value => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.control}>
            rootPath
            <input
              type="text"
              value={rootPath}
              placeholder="(volume root)"
              onChange={event => setRootPath(event.target.value)}
            />
          </label>

          <span className={styles.source}>
            {usingMock ? 'in-memory mock volume' : `live volume · ${new URL(REAL_ENDPOINT ?? '').host}`}
          </span>
        </div>

        <p className={styles.hint}>
          Try: <code>notes/</code> for markdown and plain text · <code>logo.png</code> for the image branch ·{' '}
          <code>empty/</code> for the empty-directory state · <code>paged/</code> for a 1,200-entry directory that pages
          twice and still loads completely · <code>overclaimed/</code> for one where the volume claims more than it
          serves, which is where the “not loaded” notice appears.
        </p>

        <p className={styles.hint}>
          Batch upload: the toolbar’s upload button asks <code>files</code> or <code>folder</code>, and you can also
          drag either in from the desktop. With <code>slow writes</code> on, the progress panel below the tree stays up
          long enough to read the <code>n / N</code> count and to hit Cancel; <code>volume pushes back</code> makes the
          first four writes answer <code>429</code>, which is what brings the concurrency ceiling down and puts the
          “slowed to N” line on screen. Upload something named <code>README.md</code> to reach the conflict dialog.
        </p>

        {hostExtras && (
          <p className={styles.hint}>
            Host extension points are on: <code>notes/</code> already carries a marker, and its right-click menu shows{' '}
            <code>Pulled by nightly-docs</code> greyed out. Right-click <code>empty/</code> and pick{' '}
            <code>Pull from external source</code> to mark that one too. Switch <code>readOnly</code> on and the extra
            action goes away while the marker stays.
          </p>
        )}

        {ready ? (
          <div className={styles.mounts}>
            <section className={styles.narrow}>
              <h3 className={styles.mountTitle}>Narrow — 320px aside</h3>
              <div className={styles.mountBody}>
                <SourceSetFileExplorer
                  key={`narrow:${rootPath}`}
                  sourceSetEndpoint={connection.sourceSetEndpoint}
                  apiKey={connection.apiKey}
                  customHeaders={connection.customHeaders}
                  rootPath={rootPath}
                  readOnly={readOnly}
                  locale={locale}
                  extraEntryActions={hostExtras ? extraEntryActions : undefined}
                  entryBadge={hostExtras ? entryBadge : undefined}
                />
              </div>
            </section>

            <section className={styles.wide}>
              <h3 className={styles.mountTitle}>Full-bleed — how Platform and Agent Hub mount it</h3>
              <div className={styles.mountBody}>
                <SourceSetFileExplorer
                  key={`wide:${rootPath}`}
                  sourceSetEndpoint={connection.sourceSetEndpoint}
                  apiKey={connection.apiKey}
                  customHeaders={connection.customHeaders}
                  rootPath={rootPath}
                  readOnly={readOnly}
                  locale={locale}
                  extraEntryActions={hostExtras ? extraEntryActions : undefined}
                  entryBadge={hostExtras ? entryBadge : undefined}
                />
              </div>
            </section>
          </div>
        ) : (
          <p className={styles.hint}>Starting the mock volume…</p>
        )}
      </div>
    </DemoWrapper>
  );
}

export default SourceSetExplorerRoute;
