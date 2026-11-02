import { CSSProperties, KeyboardEvent, MouseEvent, ReactNode, useCallback, useId, useMemo } from 'react';
import { ButtonAction, resolveSandboxUri } from '@asgard-js/core';
import clsx from 'clsx';
import DocumentSvg from '../../../icons/document.svg?react';
import DownloadSvg from '../../../icons/download.svg?react';
import FolderOpenSvg from '../../../icons/folder-open.svg?react';
import GlobeSvg from '../../../icons/globe.svg?react';
import { useAsgardContext } from '../../../context/asgard-service-context';
import { useAsgardTemplateContext } from '../../../context/asgard-template-context';
import { isChannelHomeUri } from '../../../utils/channel-home-download';
import { dispatchUriAction } from '../../../utils/dispatch-uri-action';
import { useSandboxDownload } from '../../sandbox-download/sandbox-download-context';
import {
  DisabledActionTooltip,
  disabledActionHostClass,
  isConnectionGatedAction,
  placeDisabledActionTooltip,
  usePreviewModeGate,
} from '../../disabled-action/disabled-action';
import { LockIcon } from '../../file-explorer/icons';
import styles from './attachment-template.module.scss';

/**
 * Whether an action's effect is "download this file" — an EMIT `download_file`, a `channel-home://` uri, or a
 * `sandbox://<name>/download-file` uri (F-038).
 */
export function isDownloadAction(action: ButtonAction | undefined): boolean {
  if (!action) return false;

  if (action.type === 'emit' || action.type === 'EMIT') return action.eventName === 'download_file';

  if (action.type === 'uri' || action.type === 'URI') {
    return isChannelHomeUri(action.uri) || resolveSandboxUri(action.uri)?.kind === 'download-file';
  }

  return false;
}

function preventActivation(event: KeyboardEvent<HTMLDivElement>): void {
  if (event.key === 'Enter' || event.key === ' ') event.preventDefault();
}

interface AttachmentChipProps {
  title: string;
  text: string;
  defaultAction: ButtonAction;
  downloadAction?: ButtonAction;
  raw: string;
  customStyle?: {
    style?: CSSProperties;
    title?: { style?: CSSProperties };
    description?: { style?: CSSProperties };
    iconBox?: { style?: CSSProperties };
    downloadButton?: { style?: CSSProperties };
  };
}

export function AttachmentChip(props: AttachmentChipProps): ReactNode {
  const { title, text, defaultAction, downloadAction, raw, customStyle } = props;

  const { sendMessage, client, customChannelId } = useAsgardContext();
  const sandboxDownload = useSandboxDownload();
  const {
    onTemplateBtnClick,
    defaultLinkTarget,
    onSandboxOpenBrowser,
    onSandboxOpenFile,
    onSandboxOpenFolder,
    sandboxBrowserOpenTarget,
  } = useAsgardTemplateContext();

  const dispatchAction = useCallback(
    (action: ButtonAction): void => {
      switch (action.type) {
        case 'message':
        case 'MESSAGE':
          sendMessage?.({ text: action.text });

          return;
        case 'uri':
        case 'URI':
          dispatchUriAction(action.uri, {
            client,
            customChannelId,
            target: action.target,
            defaultLinkTarget,
            onSandboxOpenBrowser,
            onSandboxOpenFile,
            onSandboxOpenFolder,
            sandboxBrowserOpenTarget,
            onSandboxDownloadFile: sandboxDownload?.download,
          });

          return;
        case 'emit':
        case 'EMIT':
          if (onTemplateBtnClick) {
            onTemplateBtnClick(action.payload || {}, action.eventName || '', raw);
          }

          return;
      }
    },
    [
      sendMessage,
      onTemplateBtnClick,
      defaultLinkTarget,
      raw,
      client,
      customChannelId,
      onSandboxOpenBrowser,
      onSandboxOpenFile,
      onSandboxOpenFolder,
      sandboxBrowserOpenTarget,
      sandboxDownload,
    ],
  );

  const handleChipClick = useCallback(() => {
    dispatchAction(defaultAction);
  }, [dispatchAction, defaultAction]);

  // Keyboard activation on the outer chip — outer is a div+role=button so React
  // doesn't fire click for Space/Enter automatically; handle both manually.
  const handleChipKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        dispatchAction(defaultAction);
      }
    },
    [dispatchAction, defaultAction],
  );

  const handleDownloadClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();

      if (downloadAction) {
        dispatchAction(downloadAction);
      }
    },
    [dispatchAction, downloadAction],
  );

  // The glyph follows the action, not the template type (BUILD-029): a chip that opens the sandbox browser
  // gets a globe, one that opens a directory gets a folder (F-034 AC6), everything else keeps the file glyph.
  // Same resolver `dispatchUriAction` routes on, so the icon and the side effect can never disagree — and the
  // open-folder card stays in the same family as the open-file card, differing only in where it lands.
  const sandboxIntentKind = useMemo(() => {
    if (defaultAction.type !== 'uri' && defaultAction.type !== 'URI') return null;

    return resolveSandboxUri(defaultAction.uri)?.kind ?? null;
  }, [defaultAction]);

  const showDownloadIcon = isDownloadAction(downloadAction);

  // When the backend hands the same download intent to both actions (the channel-home file case: chip body and
  // download button carry the identical `channel-home://` uri), clicking anywhere on the card downloaded the file —
  // the whole card behaved as one big download button, and hosts could not put their own meaning on the card body.
  // Downloading is now the download button's job alone. Only suppressed when that button is actually rendered, so a
  // chip whose sole action is a download stays clickable; `open-browser` / `open-file` / plain links are untouched.
  const bodyActsAsDownload = showDownloadIcon && isDownloadAction(defaultAction);

  // F-040 — in preview mode a card whose action needs the channel is disabled as a whole. "Its action" is the
  // download button's when that button owns the card (channel-home), otherwise the body's.
  const { isPreviewMode, tooltip } = usePreviewModeGate();
  const tooltipId = useId();
  const locked = isPreviewMode && isConnectionGatedAction(bodyActsAsDownload ? downloadAction : defaultAction);
  // A locked card stays a focusable button (the tooltip has to be reachable from the keyboard) but does nothing.
  const focusable = locked || !bodyActsAsDownload;
  const interactive = !locked && !bodyActsAsDownload;

  return (
    <div
      role={focusable ? 'button' : undefined}
      tabIndex={focusable ? 0 : undefined}
      aria-disabled={locked || undefined}
      aria-describedby={locked ? tooltipId : undefined}
      className={clsx(
        styles.chip,
        interactive && styles['chip--interactive'],
        locked && [styles['chip--locked'], disabledActionHostClass],
      )}
      onClick={interactive ? handleChipClick : undefined}
      // Locked: no action, and Space must not scroll the thread either.
      onKeyDown={locked ? preventActivation : interactive ? handleChipKeyDown : undefined}
      onPointerEnter={locked ? placeDisabledActionTooltip : undefined}
      onFocus={locked ? placeDisabledActionTooltip : undefined}
      style={customStyle?.style}
    >
      <span className={styles.icon_box} style={customStyle?.iconBox?.style}>
        {sandboxIntentKind === 'open-browser' ? (
          <GlobeSvg />
        ) : sandboxIntentKind === 'open-folder' ? (
          <FolderOpenSvg />
        ) : (
          <DocumentSvg />
        )}
      </span>
      <span className={styles.body}>
        <span className={styles.title} style={customStyle?.title?.style}>
          {title}
        </span>
        <span className={styles.text} style={customStyle?.description?.style}>
          {text}
        </span>
      </span>
      {locked && <LockIcon className={styles.lock} />}
      {!locked && showDownloadIcon && (
        <button
          type="button"
          className={styles.download_button}
          onClick={handleDownloadClick}
          aria-label="Download"
          style={customStyle?.downloadButton?.style}
        >
          <DownloadSvg />
        </button>
      )}
      {locked && <DisabledActionTooltip id={tooltipId} text={tooltip} />}
    </div>
  );
}
