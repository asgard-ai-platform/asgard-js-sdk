import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { type Locale, t } from '../../i18n';
import { StreamdownClient } from '../templates/text-template/streamdown-client';
import { MarkdownFrontmatter, splitFrontmatter } from '../markdown-frontmatter/frontmatter';
import type { FsEntry } from '../file-explorer/types';
import { ArrowLeftIcon, CodeIcon, DownloadIcon, EyeIcon, CircleAlertIcon, RefreshIcon } from './icons';
import { Spinner } from '../spinner';
import { CodeEditor } from './code-editor';
import styles from './file-view.module.scss';

type FileKind = 'markdown' | 'image' | 'text';

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg']);

export interface SourceSetFileViewProps {
  /** The opened file (`isDir: false`). */
  file: FsEntry;
  /** Read content; images resolve to a data/object URL. Absent → treated as empty. */
  readFile?: (path: string) => Promise<string>;
  /** Persist content; debounced by this component. Ignored while `editable` is false. */
  onSaveFile?: (path: string, content: string) => Promise<void>;
  /**
   * Whether this view may mutate the file (F-025 R10). `false` keeps every reading capability — text and
   * image preview, syntax highlighting, and the markdown rendered↔source toggle — but the source is
   * read-only and nothing is ever saved.
   *
   * This flag is the reason the view is copied rather than imported: the shipped
   * `file-explorer/file-view.tsx` renders its edit toggle unconditionally and F-025 requires that module
   * to stay byte-identical, so a read-only volume had no way to suppress an edit it cannot persist.
   */
  editable: boolean;
  /** Download the open file. Absent → no download button, so a read-only mount does not inherit a dead control. */
  onDownload?: () => void;
  /** Keep the download button visible but inert. */
  downloadDisabled?: boolean;
  /** Back to the file tree. */
  onBack: () => void;
  /** Passed in rather than read from a context: this explorer mounts without a Chatbot (F-025 R3). */
  locale: Locale;
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
 * Single-panel two-mode file view for a SourceSet volume. Text and code run through CodeMirror 6 with the
 * grammar picked by extension — read-only in preview, editable in edit, so both modes share one
 * highlighted rendering. `.md` previews as rendered markdown and switches to source; images preview only.
 * Save debounces to `onSaveFile`.
 *
 * Two deliberate differences from `file-explorer/file-view.tsx`, which this is copied from under F-025's
 * "先在本票內複製一份" rule (F-027 folds them back together):
 *
 * - **No watch.** A volume is served by multiple replicas and has no `fs/watch` equivalent, so freshness
 *   comes from the explicit refresh button rather than a stream.
 * - **`editable`.** See the prop's own note.
 */
export function SourceSetFileView(props: SourceSetFileViewProps): ReactNode {
  const { file, readFile, onSaveFile, editable, onDownload, downloadDisabled, onBack, locale } = props;
  const ext = extOf(file.name);
  const kind = kindOf(ext);

  // Markdown keeps its rendered↔source toggle even read-only: reading the source mutates nothing. Other
  // text kinds render through the same highlighted editor in both modes, so without `editable` the toggle
  // would be a no-op — and an image has no source view at all.
  const canToggle = kind === 'markdown' || (editable && kind === 'text');

  const [mode, setMode] = useState<'preview' | 'edit'>('preview');
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  // A manual refresh sits alongside the tree's; bumping this re-reads from the volume.
  const [reloadKey, setReloadKey] = useState(0);

  // Load content. Keyed by path, so switching files re-runs this.
  useEffect(() => {
    let cancelled = false;
    setContent(null);
    setError(null);
    setDirty(false);
    setMode('preview');

    Promise.resolve(readFile ? readFile(file.path) : '')
      .then(c => {
        if (!cancelled) setContent(c);
      })
      .catch(e => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });

    return (): void => {
      cancelled = true;
    };
  }, [file.path, readFile, reloadKey]);

  // Edit → debounced save.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleSave = (val: string): void => {
    if (!editable || !onSaveFile) return;

    if (saveTimer.current) clearTimeout(saveTimer.current);

    saveTimer.current = setTimeout(() => {
      void Promise.resolve(onSaveFile(file.path, val))
        .then(() => setDirty(false))
        .catch(e => setError(e instanceof Error ? e.message : String(e)));
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
          <Spinner size={14} /> {t(locale, 'sourceSetExplorer.loading')}
        </div>
      );
    }

    if (error) {
      return (
        <div className={`${styles.status} ${styles.error}`}>
          <CircleAlertIcon size={14} /> {t(locale, 'sourceSetExplorer.loadError', { error })}
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
      // Frontmatter shows as fields above the body, as in the sandbox FileView (asgard-heimdall-pm#375).
      const { frontmatter, body } = splitFrontmatter(content ?? '');

      return (
        <div className={styles.markdown}>
          <MarkdownFrontmatter text={frontmatter} body={body} />
          <StreamdownClient>{body}</StreamdownClient>
        </div>
      );
    }

    return (
      <CodeEditor
        ext={ext}
        value={content ?? ''}
        editable={editable && mode === 'edit'}
        locale={locale}
        onChange={val => {
          setContent(val);
          setDirty(true);
          scheduleSave(val);
        }}
      />
    );
  }, [content, error, kind, mode, file.name, ext, locale, editable]);

  const toggleLabelKey = editable
    ? mode === 'preview'
      ? 'sourceSetExplorer.switchToEdit'
      : 'sourceSetExplorer.switchToPreview'
    : mode === 'preview'
    ? 'sourceSetExplorer.switchToSource'
    : 'sourceSetExplorer.switchToRendered';

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <button
          type="button"
          onClick={onBack}
          className={styles.back}
          title={t(locale, 'sourceSetExplorer.backToTree')}
        >
          <ArrowLeftIcon size={15} />
          <span className={styles.name}>{file.name}</span>
        </button>
        {dirty && <span className={styles.dirty}>●</span>}
        <div className={styles.actions}>
          <button
            type="button"
            onClick={() => setReloadKey(k => k + 1)}
            aria-label={t(locale, 'sourceSetExplorer.reloadFile')}
            title={t(locale, 'sourceSetExplorer.reload')}
            className={styles.actionBtn}
          >
            <RefreshIcon size={15} />
          </button>
          {canToggle && (
            <button
              type="button"
              onClick={() => setMode(m => (m === 'preview' ? 'edit' : 'preview'))}
              aria-label={t(locale, toggleLabelKey)}
              title={t(locale, toggleLabelKey)}
              className={styles.actionBtn}
            >
              {mode === 'preview' ? <CodeIcon size={15} /> : <EyeIcon size={15} />}
            </button>
          )}
          {/* After the source toggle, and outside `canToggle` — an image has no toggle but is still
              downloadable. */}
          {onDownload && (
            <button
              type="button"
              onClick={onDownload}
              disabled={downloadDisabled}
              aria-label={t(locale, 'sourceSetExplorer.download')}
              title={t(locale, 'sourceSetExplorer.download')}
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
