import { CSSProperties, KeyboardEvent, MouseEvent, ReactNode, useCallback, useMemo } from 'react';
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
import styles from './attachment-template.module.scss';

/** Whether an action's effect is "download this file" — an EMIT `download_file` or a `channel-home://` uri. */
export function isDownloadAction(action: ButtonAction | undefined): boolean {
  if (!action) return false;

  if (action.type === 'emit' || action.type === 'EMIT') return action.eventName === 'download_file';

  if (action.type === 'uri' || action.type === 'URI') return isChannelHomeUri(action.uri);

  return false;
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

  return (
    <div
      role={bodyActsAsDownload ? undefined : 'button'}
      tabIndex={bodyActsAsDownload ? undefined : 0}
      className={clsx(styles.chip, !bodyActsAsDownload && styles['chip--interactive'])}
      onClick={bodyActsAsDownload ? undefined : handleChipClick}
      onKeyDown={bodyActsAsDownload ? undefined : handleChipKeyDown}
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
      {showDownloadIcon && (
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
    </div>
  );
}
