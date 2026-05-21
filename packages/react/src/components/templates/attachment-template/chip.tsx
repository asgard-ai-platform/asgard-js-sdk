import { CSSProperties, KeyboardEvent, MouseEvent, ReactNode, useCallback } from 'react';
import { ButtonAction } from '@asgard-js/core';
import DocumentSvg from '../../../icons/document.svg?react';
import DownloadSvg from '../../../icons/download.svg?react';
import { useAsgardContext } from '../../../context/asgard-service-context';
import { useAsgardTemplateContext } from '../../../context/asgard-template-context';
import { safeWindowOpen } from '../../../utils/uri-validation';
import styles from './attachment-template.module.scss';

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

  const { sendMessage } = useAsgardContext();
  const { onTemplateBtnClick, defaultLinkTarget } = useAsgardTemplateContext();

  const dispatchAction = useCallback(
    (action: ButtonAction): void => {
      switch (action.type) {
        case 'message':
        case 'MESSAGE':
          sendMessage?.({ text: action.text });

          return;
        case 'uri':
        case 'URI':
          safeWindowOpen(action.uri, action.target || defaultLinkTarget || '_blank');

          return;
        case 'emit':
        case 'EMIT':
          if (onTemplateBtnClick) {
            onTemplateBtnClick(action.payload || {}, action.eventName || '', raw);
          }

          return;
      }
    },
    [sendMessage, onTemplateBtnClick, defaultLinkTarget, raw],
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

  const showDownloadIcon =
    (downloadAction?.type === 'emit' || downloadAction?.type === 'EMIT') &&
    downloadAction.eventName === 'download_file';

  return (
    <div
      role="button"
      tabIndex={0}
      className={styles.chip}
      onClick={handleChipClick}
      onKeyDown={handleChipKeyDown}
      style={customStyle?.style}
    >
      <span className={styles.icon_box} style={customStyle?.iconBox?.style}>
        <DocumentSvg />
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
