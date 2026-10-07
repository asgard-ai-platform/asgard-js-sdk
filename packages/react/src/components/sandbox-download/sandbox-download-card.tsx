import { CSSProperties, ReactNode } from 'react';
import clsx from 'clsx';
import { useAsgardTemplateContext } from '../../context/asgard-template-context';
import { t } from '../../i18n';
import { CircleAlertIcon, CircleCheckIcon, DownloadIcon, RefreshIcon, ZapIcon } from '../file-explorer/icons';
import { Spinner } from '../spinner/spinner';
import chipStyles from '../templates/attachment-template/attachment-template.module.scss';
import {
  downloadFileName,
  SandboxDownloadError,
  SandboxDownloadState,
  useSandboxDownload,
} from './sandbox-download-context';
import styles from './sandbox-download-card.module.scss';

const ERROR_KEY: Record<SandboxDownloadError, string> = {
  'not-found': 'sandboxDownload.error.notFound',
  'wake-failed': 'sandboxDownload.error.wakeFailed',
  incomplete: 'sandboxDownload.error.incomplete',
  failed: 'sandboxDownload.error.failed',
};

const IDLE: SandboxDownloadState = { phase: 'idle' };

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;

  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;

  return `${bytes} B`;
}

export interface SandboxDownloadCardProps {
  sandboxName: string;
  absolutePath: string;
  /** The agent's title (usually the file name); falls back to the path's basename. */
  title?: string;
  /** The agent's description; replaced by the state while the card is busy or failed. */
  text?: string;
  /** The ATTACHMENT template theme slots, so the card takes the same overrides as its sibling chips. */
  customStyle?: {
    style?: CSSProperties;
    title?: { style?: CSSProperties };
    description?: { style?: CSSProperties };
    iconBox?: { style?: CSSProperties };
  };
}

/**
 * The `sandbox://<name>/download-file` card (F-038). Same family as the open-file / open-folder chips, with a
 * download glyph; unlike them it has state, because a click on a recycled sandbox wakes it (through the channel's
 * one shared wake), waits, then downloads — all on the card, never opening the File Explorer.
 */
export function SandboxDownloadCard(props: SandboxDownloadCardProps): ReactNode {
  const { sandboxName, absolutePath, title, text, customStyle } = props;
  const { locale = 'en-US' } = useAsgardTemplateContext();
  const controller = useSandboxDownload();

  const state = controller?.stateOf(sandboxName, absolutePath) ?? IDLE;
  const sandboxStatus = controller?.sandboxStatusOf(sandboxName) ?? 'live';
  const fileName = downloadFileName(absolutePath);
  const busy = state.phase === 'waiting' || state.phase === 'downloading';
  const canRetry = state.phase === 'error' && state.error !== 'not-found';
  const notFound = state.phase === 'error' && state.error === 'not-found';
  const clickable = !!controller && !busy && !notFound;

  let icon: ReactNode = <DownloadIcon />;
  let description: ReactNode = text || fileName;
  let tone: 'ok' | 'error' | undefined;

  if (state.phase === 'waiting') {
    icon = <Spinner />;
    description = t(locale, 'sandboxDownload.waiting');
  } else if (state.phase === 'downloading') {
    icon = <Spinner />;
    description = state.total
      ? t(locale, 'sandboxDownload.progress', {
          received: formatBytes(state.received),
          total: formatBytes(state.total),
        })
      : t(locale, 'sandboxDownload.downloading');
  } else if (state.phase === 'done') {
    icon = <CircleCheckIcon />;
    description = t(locale, 'sandboxDownload.done');
    tone = 'ok';
  } else if (state.phase === 'error') {
    icon = <CircleAlertIcon />;
    description = t(locale, ERROR_KEY[state.error]);
    tone = 'error';
  }

  const percent =
    state.phase === 'downloading' && state.total ? Math.min(100, (state.received / state.total) * 100) : null;

  return (
    <div
      // The family's hover, only while a click would do something (the button fills the card).
      className={clsx(chipStyles.chip, clickable && chipStyles['chip--interactive'], styles.card)}
      data-phase={state.phase}
      data-tone={tone}
      title={absolutePath}
      style={customStyle?.style}
    >
      <button
        type="button"
        className={styles.main}
        onClick={(): void => controller?.download(sandboxName, absolutePath)}
        disabled={!clickable}
        aria-label={t(locale, 'sandboxDownload.download', { name: fileName })}
      >
        <span className={chipStyles.icon_box} style={customStyle?.iconBox?.style}>
          {icon}
        </span>
        <span className={chipStyles.body}>
          <span className={chipStyles.title} style={customStyle?.title?.style}>
            {title || fileName}
          </span>
          <span
            className={clsx(chipStyles.text, styles.tone)}
            style={customStyle?.description?.style}
            aria-live="polite"
          >
            {description}
          </span>
          {state.phase === 'idle' && sandboxStatus === 'cold' && (
            <span className={styles.hint}>
              <ZapIcon size={11} /> {t(locale, 'sandboxDownload.coldHint')}
            </span>
          )}
          {state.phase === 'idle' && sandboxStatus === 'waking' && (
            <span className={styles.hint}>
              <Spinner size={11} /> {t(locale, 'sandboxDownload.wakingHint')}
            </span>
          )}
        </span>
        {/* Inside the button, not in `.side`: the glyph reads as "click to download", so it has to be part of
            what the click lands on. `.side` only holds the actions that are not the download. */}
        {state.phase === 'idle' && <DownloadIcon className={styles.sideIcon} />}
      </button>
      <span className={styles.side}>
        {state.phase === 'waiting' && (
          <button
            type="button"
            className={styles.textButton}
            onClick={(): void => controller?.cancel(sandboxName, absolutePath)}
          >
            {t(locale, 'sandboxDownload.cancel')}
          </button>
        )}
        {canRetry && (
          <button
            type="button"
            className={styles.textButton}
            onClick={(): void => controller?.download(sandboxName, absolutePath)}
          >
            <RefreshIcon size={12} /> {t(locale, 'sandboxDownload.retry')}
          </button>
        )}
      </span>
      {busy && (
        <span className={styles.progress} aria-hidden>
          <span
            className={clsx(styles.progressBar, percent === null && styles.indeterminate)}
            style={percent === null ? undefined : { width: `${percent}%` }}
          />
        </span>
      )}
    </div>
  );
}
