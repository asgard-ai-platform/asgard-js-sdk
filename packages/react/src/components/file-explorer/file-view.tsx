import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { dump, FAILSAFE_SCHEMA, load } from 'js-yaml';
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

// A leading YAML frontmatter block: `---` on the first line, through the next line that is exactly `---`. The body is
// optional and tried empty first (`??`), so an empty block closes on its own `---` rather than on a later thematic break.
const FRONTMATTER = /^---\r?\n((?:[\s\S]*?\r?\n)??)---(?:\r?\n|$)/;

export interface FileViewProps {
  sandboxName: string;
  /** The opened file (`isDir: false`). */
  file: FsEntry;
  /** Read content (≈ `GET fs/file`; images resolve to a data/object URL). Absent → treated as empty. */
  readFile?: FsReadFile;
  /** Save content (≈ `PUT fs/file`); debounced by this component. Absent → preview only, no edit toggle. */
  onSaveFile?: FsSaveFile;
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
 * Frontmatter is the file's metadata, not its body: rendered as markdown its fences become `<hr>` and its last line a
 * setext heading (asgard-heimdall-pm#375). The preview shows it as fields above the body instead — the source and what
 * gets saved keep it as written.
 */
function splitFrontmatter(markdown: string): { frontmatter: string; body: string } {
  const match = FRONTMATTER.exec(markdown);

  if (!match) return { frontmatter: '', body: markdown };

  return { frontmatter: match[1].replace(/\r?\n$/, ''), body: markdown.slice(match[0].length) };
}

// The body's first level-1 ATX heading (`# Title`), optional closing `#`s aside.
const FIRST_HEADING = /^ {0,3}#[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/m;

function firstHeading(body: string): string | null {
  return FIRST_HEADING.exec(body)?.[1].trim() ?? null;
}

// FAILSAFE keeps every scalar a string, so `1.0`, `2026-10-05` and `yes` read as written.
const YAML_TEXT = { schema: FAILSAFE_SCHEMA, noCompatMode: true, lineWidth: -1 };

function fieldText(value: unknown): string {
  if (value === null) return '';

  if (typeof value === 'string') return value.trimEnd();

  if (Array.isArray(value) && value.every(v => typeof v === 'string')) return value.join(', ');

  return dump(value, YAML_TEXT).trimEnd();
}

/**
 * A table of the block's top-level keys; the raw block when it does not read as one (nothing is dropped). A `title`
 * that repeats the body's first `# ` heading is left out, so the title shows once (asgard-heimdall-pm#375).
 */
function Frontmatter({ text, heading }: { text: string; heading: string | null }): ReactNode {
  if (!text.trim()) return null;

  let rows: [string, string][] | null = null;

  try {
    const doc = load(text, YAML_TEXT);

    if (doc !== null && typeof doc === 'object' && !Array.isArray(doc)) {
      rows = Object.entries(doc)
        .filter(([key, value]) => !(key === 'title' && typeof value === 'string' && value.trim() === heading))
        .map(([key, value]) => [key, fieldText(value)]);
    }
  } catch {
    // Not valid YAML, or a nested value `dump` cannot write back out: shown raw below.
  }

  if (!rows) return <pre className={styles.frontmatterRaw}>{text}</pre>;

  if (rows.length === 0) return null;

  return (
    <table className={styles.frontmatter}>
      <tbody>
        {rows.map(([key, value]) => (
          <tr key={key}>
            <th scope="row">{key}</th>
            <td>{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
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
  const { sandboxName, file, readFile, onSaveFile, watchFile, onDirtyChange, onDownload, downloadDisabled, onBack } =
    props;
  const ext = extOf(file.name);
  const kind = kindOf(ext);
  // Editing needs somewhere to save to. Without `onSaveFile` the debounced save below would clear the dirty
  // mark having saved nothing, so the view would present lost edits as saved (issue #476).
  const canToggle = kind !== 'image' && !!onSaveFile;

  const [chosenMode, setMode] = useState<'preview' | 'edit'>('preview');
  // A host can take `onSaveFile` away while the file is already open in source mode.
  const mode = canToggle ? chosenMode : 'preview';
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
      const { frontmatter, body } = splitFrontmatter(content ?? '');

      return (
        <div className={styles.markdown}>
          <Frontmatter text={frontmatter} heading={firstHeading(body)} />
          <StreamdownClient>{body}</StreamdownClient>
        </div>
      );
    }

    return (
      <CodeEditor
        ext={ext}
        value={content ?? ''}
        editable={mode === 'edit'}
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
              aria-label={t(locale, mode === 'preview' ? 'fileExplorer.switchToEdit' : 'fileExplorer.switchToPreview')}
              title={t(locale, mode === 'preview' ? 'fileExplorer.edit' : 'fileExplorer.preview')}
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
