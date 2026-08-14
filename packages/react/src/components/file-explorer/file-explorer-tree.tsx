import { ReactNode, useEffect, useState } from 'react';
import { t } from '../../i18n';
import { Spinner } from '../spinner';
import { useFileExplorer } from './file-explorer-context';
import { ChevronRightIcon, CircleAlertIcon, FileIcon, FolderIcon, FolderOpenIcon } from './icons';
import { joinPath, sortEntries } from './paths';
import { FsEntry } from './types';
import styles from './file-explorer-panel.module.scss';

/** One directory level; lazily lists its children, sorted dirs-first then by name. */
export function DirChildren({ dirPath, depth }: { dirPath: string; depth: number }): ReactNode {
  const { activeSourceId, providers, refreshKey, locale } = useFileExplorer();
  const { listDir } = providers;
  const [entries, setEntries] = useState<FsEntry[] | null>(null);
  const [notLoaded, setNotLoaded] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeSourceId) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.resolve(listDir(activeSourceId, dirPath))
      .then(result => {
        if (cancelled) return;

        setEntries(sortEntries(result.entries.map(e => ({ ...e, path: joinPath(dirPath, e.name) }))));
        // F-026 — a source that can count says how many it held back. A source that cannot (the sandbox
        // fs API answers `truncated` with no total) reports 0 and the line stays away.
        setNotLoaded(Math.max(0, (result.totalEntries ?? 0) - result.entries.length));
      })
      .catch(e => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return (): void => {
      cancelled = true;
    };
  }, [activeSourceId, dirPath, refreshKey, listDir]);

  const pad = { paddingLeft: `${0.5 + depth * 0.85}rem` };

  if (loading) {
    return (
      <div className={styles.status} style={pad}>
        <Spinner size={12} /> {t(locale, 'fileExplorer.loading')}
      </div>
    );
  }

  if (error) {
    return (
      <div className={`${styles.status} ${styles.error}`} style={pad}>
        <CircleAlertIcon size={12} /> {t(locale, 'fileExplorer.loadError', { error })}
      </div>
    );
  }

  if (!entries || entries.length === 0) {
    return (
      <div className={styles.emptyDir} style={pad}>
        {t(locale, 'fileExplorer.emptyDir')}
      </div>
    );
  }

  return (
    <>
      {entries.map(entry => (
        <TreeNode key={entry.path} entry={entry} depth={depth} />
      ))}
      {notLoaded > 0 && (
        <div className={styles.emptyDir} style={pad}>
          {t(locale, 'fileExplorer.notLoaded', { n: notLoaded })}
        </div>
      )}
    </>
  );
}

/** A tree row: single-click selects (a dir also toggles); double-click opens a file; right-click → menu. */
function TreeNode({ entry, depth }: { entry: FsEntry; depth: number }): ReactNode {
  const { expanded, selectedPath, clipboard, toggleExpand, onSelect, setOpenFile, openContext } = useFileExplorer();
  const isOpen = entry.isDir && expanded.has(entry.path);
  const selected = selectedPath === entry.path;
  const isCut = clipboard?.op === 'cut' && clipboard.entry.path === entry.path;

  const onClick = (): void => {
    onSelect(entry);
    if (entry.isDir) toggleExpand(entry.path);
  };

  return (
    <>
      <button
        type="button"
        className={`${styles.node} ${selected ? styles.selected : ''} ${isCut ? styles.cut : ''}`}
        style={{ paddingLeft: `${0.5 + depth * 0.85}rem` }}
        onClick={onClick}
        onDoubleClick={() => !entry.isDir && setOpenFile(entry)}
        onContextMenu={e => openContext(e, { kind: entry.isDir ? 'dir' : 'file', entry })}
        title={entry.path}
      >
        {entry.isDir ? (
          <ChevronRightIcon size={14} className={`${styles.chevron} ${isOpen ? styles.open : ''}`} />
        ) : (
          <span className={styles.chevronSpacer} />
        )}
        {entry.isDir ? (
          isOpen ? (
            <FolderOpenIcon size={15} className={styles.nodeIcon} />
          ) : (
            <FolderIcon size={15} className={styles.nodeIcon} />
          )
        ) : (
          <FileIcon size={15} className={styles.nodeIcon} />
        )}
        <span className={styles.nodeName}>{entry.name}</span>
      </button>

      {entry.isDir && isOpen && <DirChildren dirPath={entry.path} depth={depth + 1} />}
    </>
  );
}

/**
 * The lazy file tree rooted at the active source. Renders nothing while a file is open — the FileView
 * takes over the body — so a consumer can place `<Tree />` and `<View />` as siblings without wiring
 * that switch themselves.
 */
export function FileExplorerTree(): ReactNode {
  const { openFile, rootPath, activeSourceId, refreshKey, openContext } = useFileExplorer();

  // No source means nothing to list. `rootPath` alone is not enough: a `basePath` override supplies one
  // even when the source list is empty, and `DirChildren` would then sit on its initial loading state
  // forever — a spinner that never resolves. The ready-made panel shows its empty state instead of ever
  // reaching here; a hand-assembled explorer can, so the guard belongs on the part itself.
  if (openFile || rootPath === null || !activeSourceId) return null;

  return (
    <div className={styles.tree} onContextMenu={e => openContext(e, { kind: 'background' })}>
      <DirChildren key={`${activeSourceId}:${rootPath}:${refreshKey}`} dirPath={rootPath} depth={0} />
    </div>
  );
}
