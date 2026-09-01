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
 *
 * The "search paths" switch plays Odin's Skillset Files tab (BUILD-075): a panel under each tree holds
 * the folders that count as skills, and the tree is the only way to put one there. Picking is what the
 * four props are for — `onSelectEntry` feeds the panel's button, `extraEntryActions` gives the same
 * gesture a right-click home *including while `readOnly`*, `highlightPaths` shows which folders are in
 * and how to reach them, and `autoExpandPaths` opens to them on arrival. Each mount keeps its own
 * selection, while the list itself is shared so both trees paint the same thing.
 *
 * The list holds paths the way a search path is written — with a trailing slash — and hands them over
 * unaltered. That is deliberate: it is what proves the component absorbs the difference against
 * `entry.path`, which has none.
 */

const REAL_ENDPOINT = import.meta.env.VITE_SOURCE_SET_ENDPOINT as string | undefined;
const REAL_API_KEY = import.meta.env.VITE_SOURCE_SET_API_KEY as string | undefined;
const REAL_AUTH_TOKEN = import.meta.env.VITE_SOURCE_SET_AUTH_TOKEN as string | undefined;

const LOCALES = ['en-US', 'zh-TW', 'ja-JP'] as const;

type DemoLocale = (typeof LOCALES)[number];

/** Stands in for the host's own icon set — the SDK renders whatever node the host hands it. */
const SYNC_GLYPH = <span aria-hidden>↻</span>;
const SKILL_GLYPH = <span aria-hidden>◆</span>;

/**
 * How a search path is written down: a folder, so a trailing slash. Kept as the host writes it rather
 * than trimmed on the way in — absorbing the difference is the component's job (R3), and doing it here
 * would hide whether it actually does.
 */
const asSearchPath = (path: string): string => `${path}/`;

/**
 * The two widths, side by side rather than behind a toggle. `id` doubles as the stylesheet key, so the
 * pair cannot drift into a mount the layout has no column for.
 */
const MOUNTS = [
  { id: 'narrow', title: 'Narrow — 320px aside' },
  { id: 'wide', title: 'Full-bleed — how Platform and Agent Hub mount it' },
] as const;

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
  const [searchPathsOn, setSearchPathsOn] = useState(true);
  // Shared by both mounts on purpose: the two trees then paint the same list, which is what makes the
  // narrow / wide comparison say anything. The selection driving the panel stays per mount.
  const [searchPaths, setSearchPaths] = useState<string[]>([asSearchPath('skills/pdf')]);

  const addSearchPath = useCallback((path: string): void => {
    setSearchPaths(current => (current.includes(asSearchPath(path)) ? current : [...current, asSearchPath(path)]));
  }, []);

  const removeSearchPath = useCallback((path: string): void => {
    setSearchPaths(current => current.filter(it => it !== path));
  }, []);

  const extraEntryActions = useCallback(
    (entry: FsEntry | null): ContextMenuItem[] => {
      if (!entry?.isDir) return [];

      const items: ContextMenuItem[] = [];

      if (hostExtras) {
        const owner = pulled[entry.path];
        // Annotated rather than inlined into `push`: the two branches of a ternary lose the contextual
        // type the array position used to give them, and with it the inferred return type of `onSelect`.
        const pull: ContextMenuItem = owner
          ? {
              key: 'pull',
              label: `Pulled by ${owner}`,
              icon: SYNC_GLYPH,
              disabled: true,
              onSelect: (): void => undefined,
            }
          : {
              key: 'pull',
              label: 'Pull from external source',
              icon: SYNC_GLYPH,
              onSelect: () => setPulled(current => ({ ...current, [entry.path]: 'nightly-docs' })),
            };

        items.push(pull);
      }

      // The action that has to survive `readOnly`: it changes this route's own list, never the volume.
      if (searchPathsOn) {
        const already = searchPaths.includes(asSearchPath(entry.path));
        items.push({
          key: 'search-path',
          label: already ? 'Already a search path' : `Add ${asSearchPath(entry.path)} to search paths`,
          icon: SKILL_GLYPH,
          disabled: already,
          onSelect: () => addSearchPath(entry.path),
        });
      }

      return items;
    },
    [hostExtras, pulled, searchPathsOn, searchPaths, addSearchPath],
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
            <input type="checkbox" checked={searchPathsOn} onChange={event => setSearchPathsOn(event.target.checked)} />
            search paths panel
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
            <code>Pull from external source</code> to mark that one too. Switch <code>readOnly</code> on and the marker
            stays.
          </p>
        )}

        {searchPathsOn && (
          <p className={styles.hint}>
            Search paths are on: both trees open to <code>skills/pdf/</code> on arrival, and three strengths are on
            screen at once — <code>pdf</code> is a search path, <code>skills</code> only leads to one, and{' '}
            <code>csv</code> is neither. Add <code>skills/csv/</code> by selecting it and using the panel’s button, or
            through its right-click menu; then remove one from the panel and watch the colour go while the tree stays
            exactly where you left it (the prop is a seed, not a leash). Switch <code>readOnly</code> on: every built-in
            mutating action disappears and <code>Add … to search paths</code> stays — which is the whole point, since a
            from-git SkillSet is read-only and still needs its folders picked.
          </p>
        )}

        {ready ? (
          <div className={styles.mounts}>
            {MOUNTS.map(mount => (
              <ExplorerMount
                key={`${mount.id}:${rootPath}`}
                className={styles[mount.id]}
                title={mount.title}
                connection={connection}
                rootPath={rootPath}
                readOnly={readOnly}
                locale={locale}
                extraEntryActions={hostExtras || searchPathsOn ? extraEntryActions : undefined}
                entryBadge={hostExtras ? entryBadge : undefined}
                searchPaths={searchPathsOn ? searchPaths : undefined}
                onAddSearchPath={addSearchPath}
                onRemoveSearchPath={removeSearchPath}
              />
            ))}
          </div>
        ) : (
          <p className={styles.hint}>Starting the mock volume…</p>
        )}
      </div>
    </DemoWrapper>
  );
}

interface ExplorerMountProps {
  className: string;
  title: string;
  connection: { sourceSetEndpoint: string; apiKey?: string; customHeaders?: Record<string, string> };
  rootPath: string;
  readOnly: boolean;
  locale: DemoLocale;
  extraEntryActions?: (entry: FsEntry | null) => ContextMenuItem[];
  entryBadge?: (entry: FsEntry) => ReactNode;
  /** The shared list, or `undefined` while the switch is off — which is also how the props go unset. */
  searchPaths?: string[];
  onAddSearchPath: (path: string) => void;
  onRemoveSearchPath: (path: string) => void;
}

/**
 * One mount, plus the Search Paths panel that stands in for Odin's.
 *
 * The selection lives here rather than in the route: two trees on one page have two selections, and a
 * panel that reports the other mount's would be worse than no panel. `onSelectEntry` is what makes that
 * possible from outside the component.
 */
function ExplorerMount(props: ExplorerMountProps): ReactNode {
  const {
    className,
    title,
    connection,
    rootPath,
    readOnly,
    locale,
    extraEntryActions,
    entryBadge,
    searchPaths,
    onAddSearchPath,
    onRemoveSearchPath,
  } = props;

  const [selected, setSelected] = useState<FsEntry | null>(null);

  // Read once at mount, on purpose: passing the live list would re-seed the tree on every add, which is
  // exactly the behaviour `autoExpandPaths` promises not to have. Holding the first value here makes the
  // demo state that promise rather than merely rely on it.
  const [autoExpandSeed] = useState(searchPaths);

  const already = selected != null && searchPaths?.includes(asSearchPath(selected.path)) === true;
  const canAdd = selected?.isDir === true && !already;

  return (
    <section className={className}>
      <h3 className={styles.mountTitle}>{title}</h3>
      <div className={styles.mountBody}>
        <SourceSetFileExplorer
          sourceSetEndpoint={connection.sourceSetEndpoint}
          apiKey={connection.apiKey}
          customHeaders={connection.customHeaders}
          rootPath={rootPath}
          readOnly={readOnly}
          locale={locale}
          extraEntryActions={extraEntryActions}
          entryBadge={entryBadge}
          highlightPaths={searchPaths}
          autoExpandPaths={autoExpandSeed}
          onSelectEntry={setSelected}
        />
      </div>

      {searchPaths && (
        <div className={styles.panel}>
          <div className={styles.panelTitle}>Search Paths</div>

          {searchPaths.length === 0 ? (
            <p className={styles.panelEmpty}>Nothing picked — every folder would be scanned.</p>
          ) : (
            <ul className={styles.pathList}>
              {searchPaths.map(path => (
                <li key={path} className={styles.pathRow}>
                  <code>{path}</code>
                  <button
                    type="button"
                    className={styles.pathRemove}
                    aria-label={`Remove ${path}`}
                    onClick={() => onRemoveSearchPath(path)}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            className={styles.panelAdd}
            disabled={!canAdd}
            onClick={() => selected && onAddSearchPath(selected.path)}
          >
            {selected?.isDir
              ? already
                ? `${asSearchPath(selected.path)} is already in`
                : `Add ${asSearchPath(selected.path)}`
              : 'Select a folder in the tree'}
          </button>
        </div>
      )}
    </section>
  );
}

export default SourceSetExplorerRoute;
