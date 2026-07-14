import { ReactNode, useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import type { SandboxFsEntry } from '@asgard-js/core';
import { useAsgardContext } from '../../../context/asgard-service-context';
import { useSandboxName } from '../../../hooks/use-derived-stores';
import styles from './sandbox-files.module.scss';

const ROOT = '/';
const joinPath = (dir: string, name: string): string => (dir === ROOT ? `/${name}` : `${dir}/${name}`);

interface SelectedFile {
  path: string;
  content: string | null;
  loading: boolean;
  error?: string;
}

export interface SandboxFilesProps {
  /** Placeholder shown before the sandbox exists. */
  waitingLabel?: string;
}

// Sandbox file browser (sandbox Files/Browser, part 3 — MVP). A lazy directory tree from
// `client.listSandboxFiles` (one dir per expand) plus a text viewer from `client.readSandboxFile`,
// keyed by the channel's sandbox name (`useSandboxName()`). UI adapted from the Sindri prototype
// `FilesPanel` (tree + viewer subset; upload / download / edit / search are follow-ups). Renders
// nothing (a placeholder) before the sandbox exists.
export function SandboxFiles({ waitingLabel = '此 sandbox 尚未建立' }: SandboxFilesProps): ReactNode {
  const { client } = useAsgardContext();
  const sandboxName = useSandboxName();

  const [children, setChildren] = useState<Record<string, SandboxFsEntry[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<SelectedFile | null>(null);
  const [rootError, setRootError] = useState<string | null>(null);

  const loadDir = useCallback(
    async (path: string): Promise<void> => {
      if (!sandboxName || !client?.listSandboxFiles) return;

      try {
        const res = await client.listSandboxFiles(sandboxName, path);
        setChildren(prev => ({ ...prev, [path]: res.entries }));
      } catch (err) {
        if (path === ROOT) setRootError(err instanceof Error ? err.message : 'failed to list files');
      }
    },
    [sandboxName, client],
  );

  // (Re)load the root when the sandbox appears / changes; reset the tree + viewer.
  useEffect(() => {
    setChildren({});
    setExpanded(new Set());
    setSelected(null);
    setRootError(null);
    if (sandboxName) void loadDir(ROOT);
  }, [sandboxName, loadDir]);

  const toggleDir = (path: string): void => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
        if (!children[path]) void loadDir(path);
      }

      return next;
    });
  };

  const openFile = useCallback(
    async (path: string): Promise<void> => {
      if (!sandboxName || !client?.readSandboxFile) return;

      setSelected({ path, content: null, loading: true });

      try {
        const content = await client.readSandboxFile(sandboxName, path);
        setSelected({ path, content, loading: false });
      } catch (err) {
        setSelected({ path, content: null, loading: false, error: err instanceof Error ? err.message : 'read failed' });
      }
    },
    [sandboxName, client],
  );

  const renderEntries = (dir: string, depth: number): ReactNode => {
    const entries = children[dir];
    if (!entries) return null;

    return entries.map(entry => {
      const path = joinPath(dir, entry.name);
      const isOpen = expanded.has(path);

      return (
        <div key={path}>
          <button
            type="button"
            className={clsx(styles.row, selected?.path === path && styles['row--selected'])}
            style={{ paddingLeft: 8 + depth * 14 }}
            onClick={() => (entry.isDir ? toggleDir(path) : openFile(path))}
          >
            <span className={styles.row__glyph} aria-hidden="true">
              {entry.isDir ? (isOpen ? '▾' : '▸') : '📄'}
            </span>
            <span className={styles.row__name}>{entry.name}</span>
          </button>
          {entry.isDir && isOpen && renderEntries(path, depth + 1)}
        </div>
      );
    });
  };

  if (!sandboxName) return <div className={styles.sandbox_files__empty}>{waitingLabel}</div>;

  return (
    <div className={clsx('asgard-sandbox-files', styles.sandbox_files)}>
      <div className={styles.sandbox_files__tree}>
        {rootError ? (
          <div className={styles.sandbox_files__error}>無法列出檔案：{rootError}</div>
        ) : (
          renderEntries(ROOT, 0)
        )}
      </div>
      {selected && (
        <div className={styles.sandbox_files__viewer}>
          <div className={styles.sandbox_files__viewer_head} title={selected.path}>
            {selected.path}
          </div>
          <pre className={styles.sandbox_files__viewer_body}>
            {selected.loading ? '讀取中…' : selected.error ? `讀取失敗：${selected.error}` : selected.content}
          </pre>
        </div>
      )}
    </div>
  );
}

export default SandboxFiles;
