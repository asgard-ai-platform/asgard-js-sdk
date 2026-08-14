import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { useAsgardTemplateContext } from '../../context/asgard-template-context';
import { t } from '../../i18n';
import { StreamdownClient } from '../templates/text-template/streamdown-client';
import { ArrowLeftIcon, CodeIcon, DownloadIcon, EyeIcon, CircleAlertIcon, RefreshIcon } from './icons';
import { Spinner } from '../spinner';
import { CodeEditor } from './code-editor';
import { FsEntry, FsReadFile, FsSaveFile, FsWatchFile } from './types';
import styles from './file-view.module.scss';

type FileKind = 'markdown' | 'image' | 'text';

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg']);

export interface FileViewProps {
  sandboxName: string;
  /** The opened file (`isDir: false`). */
  file: FsEntry;
  /** Read content (≈ `GET fs/file`; images resolve to a data/object URL). Absent → treated as empty. */
  readFile?: FsReadFile;
  /** Save content (≈ `PUT fs/file`); debounced by this component. */
  onSaveFile?: FsSaveFile;
  /** Show the source, but never an editable buffer (F-025). */
  readOnly?: boolean;
  /** Watch this file (≈ `fs/watch` SSE) so an agent-side write reloads the view (AC3). */
  watchFile?: FsWatchFile;
  /** Report editing / unsaved-changes state so the host can guard mid-edit panel yanks (F-021 AC10). */
  onDirtyChange?: (dirty: boolean) => void;
  /**
   * Download the open file (≈ `GET fs/file`, saved under its own name). Absent → no download button at all, so a
   * consumer mounting this view on its own opts in rather than inheriting a dead control.
   */
  onDownload?: () => void;
  /** Keep the download button visible but inert — the explorer passes `!providers.download`. */
  downloadDisabled?: boolean;
  /** Back to the file tree. */
  onBack: () => void;
}

function extOf(name: string): string {
  const i = name.lastIndexOf('.');

  return i > 0 ? name.slice(i + 1).toLowerCase() : '';
}

function kindOf(ext: string): FileKind {
  if (ext === 'md' || ext === 'markdown') return 'markdown';

  if (IMAGE_EXTS.has(ext)) return 'image';

  return 'text';
}

/**
 * Single-panel two-mode file view (F-021 AC3). Text and code run through CodeMirror 6 with the grammar
 * picked by extension — read-only in preview, editable in edit, so both modes share one highlighted
 * rendering. `.md` previews as rendered markdown and edits as source; images preview only. Save debounces
 * to `onSaveFile` (≈ `PUT fs/file`); `fs/watch` reloads on an agent-side write and a manual refresh stays
 * available alongside it. Reports dirty state (AC10).
 */
export function FileView(props: FileViewProps): ReactNode {
  const { locale = 'en-US' } = useAsgardTemplateContext();
  const {
    sandboxName,
    file,
    readFile,
    onSaveFile,
    watchFile,
    onDirtyChange,
    onDownload,
    downloadDisabled,
    onBack,
    readOnly,
  } = props;
  const ext = extOf(file.name);
  const kind = kindOf(ext);
  const canToggle = kind !== 'image';
  /**
   * Under `readOnly` the toggle still opens the source — reading is not mutating — but it stops
   * promising an edit. Left saying "Switch to editing" (which the chat-kit prototype still does) it
   * hands back a typable buffer whose save silently goes nowhere and whose dirty dot never clears.
   *
   * Deliberately keyed on `readOnly` alone, not on `onSaveFile`. A source that merely *cannot* save has
   * the same silent-no-op problem, but fixing that would change behavior nobody asked to change; it is
   * recorded as a finding on REVIEW-061 instead.
   */
  const canEdit = !readOnly;

  const [mode, setMode] = useState<'preview' | 'edit'>('preview');
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  // AC3 keeps a manual refresh alongside any watch-driven reload; bumping this re-reads from disk.
  const [reloadKey, setReloadKey] = useState(0);

  // Load content. Keyed by sandbox + path, so switching files re-runs this.
  useEffect(() => {
    let cancelled = false;
    setContent(null);
    setError(null);
    setDirty(false);

    Promise.resolve(readFile ? readFile(sandboxName, file.path) : '')
      .then(c => {
        if (!cancelled) setContent(c);
      })
      .catch(e => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });

    return (): void => {
      cancelled = true;
    };
  }, [sandboxName, file.path, readFile, reloadKey]);

  // Surface dirty state to the host (AC10) and clean it up on unmount.
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    return (): void => onDirtyChange?.(false);
  }, [onDirtyChange]);

  // Watch-and-reload (AC3). Read through a ref so a change in dirty state doesn't tear down the stream.
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  useEffect(() => {
    if (!watchFile || !readFile) return;

    return watchFile(sandboxName, file.path, () => {
      // Never clobber an unsaved buffer; the manual refresh is there when the user does want to discard.
      if (dirtyRef.current) return;

      // Re-read in place rather than via `reloadKey`: no loading flash, and our own save echoing back as
      // a WRITE event settles on the identical string, which React bails out of.
      void Promise.resolve(readFile(sandboxName, file.path))
        .then(setContent)
        .catch(() => undefined);
    });
  }, [watchFile, readFile, sandboxName, file.path]);

  // Edit → debounced save (≈ PUT fs/file).
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleSave = (val: string): void => {
    if (saveTimer.current) clearTimeout(saveTimer.current);

    saveTimer.current = setTimeout(() => {
      void Promise.resolve(onSaveFile?.(sandboxName, file.path, val)).then(() => setDirty(false));
    }, 400);
  };

  useEffect(() => {
    return (): void => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  const body = useMemo((): ReactNode => {
    if (content === null && !error) {
      return (
        <div className={styles.status}>
          <Spinner size={14} /> {t(locale, 'fileExplorer.loading')}
        </div>
      );
    }

    if (error) {
      return (
        <div className={`${styles.status} ${styles.error}`}>
          <CircleAlertIcon size={14} /> {t(locale, 'fileExplorer.loadError', { error })}
        </div>
      );
    }

    if (kind === 'image') {
      return (
        <div className={styles.imageWrap}>
          <img src={content ?? ''} alt={file.name} className={styles.image} />
        </div>
      );
    }

    if (kind === 'markdown' && mode === 'preview') {
      return (
        <div className={styles.markdown}>
          <StreamdownClient>{content ?? ''}</StreamdownClient>
        </div>
      );
    }

    return (
      <CodeEditor
        ext={ext}
        value={content ?? ''}
        editable={mode === 'edit' && canEdit}
        onChange={val => {
          setContent(val);
          setDirty(true);
          scheduleSave(val);
        }}
      />
    );
  }, [content, error, kind, mode, file.name, ext, locale]);

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <button type="button" onClick={onBack} className={styles.back} title={t(locale, 'fileExplorer.backToTree')}>
          <ArrowLeftIcon size={15} />
          <span className={styles.name}>{file.name}</span>
        </button>
        {dirty && <span className={styles.dirty}>●</span>}
        <div className={styles.actions}>
          <button
            type="button"
            onClick={() => setReloadKey(k => k + 1)}
            aria-label={t(locale, 'fileExplorer.reloadFile')}
            title={t(locale, 'fileExplorer.reload')}
            className={styles.actionBtn}
          >
            <RefreshIcon size={15} />
          </button>
          {canToggle && (
            <button
              type="button"
              onClick={() => setMode(m => (m === 'preview' ? 'edit' : 'preview'))}
              aria-label={t(
                locale,
                mode !== 'preview'
                  ? 'fileExplorer.switchToPreview'
                  : canEdit
                  ? 'fileExplorer.switchToEdit'
                  : 'fileExplorer.switchToSource',
              )}
              title={t(
                locale,
                mode !== 'preview' ? 'fileExplorer.preview' : canEdit ? 'fileExplorer.edit' : 'fileExplorer.source',
              )}
              className={styles.actionBtn}
            >
              {mode === 'preview' ? <CodeIcon size={15} /> : <EyeIcon size={15} />}
            </button>
          )}
          {/* After the preview/source toggle, and outside `canToggle` — an image has no toggle but is still
              downloadable. */}
          {onDownload && (
            <button
              type="button"
              onClick={onDownload}
              disabled={downloadDisabled}
              aria-label={t(locale, 'fileExplorer.download')}
              title={t(locale, 'fileExplorer.download')}
              className={styles.actionBtn}
            >
              <DownloadIcon size={15} />
            </button>
          )}
        </div>
      </div>
      <div className={styles.body}>{body}</div>
    </div>
  );
}

export default FileView;
