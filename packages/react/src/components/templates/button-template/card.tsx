import { MouseEventHandler, ReactNode, useCallback, useId, useMemo, useState, CSSProperties } from 'react';
import styles from './card.module.scss';
import { ButtonAction, ButtonMessageTemplate, CarouselMessageTemplate } from '@asgard-js/core';
import { useAsgardContext } from '../../../context/asgard-service-context';
import { useAsgardTemplateContext } from '../../../context/asgard-template-context';
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
import clsx from 'clsx';

interface CardProps {
  template: ButtonMessageTemplate | CarouselMessageTemplate['columns'][number];
  raw: string;
  customStyle?: {
    style?: CSSProperties;
    title?: {
      style?: CSSProperties;
    };
    description?: {
      style?: CSSProperties;
    };
    button?: {
      style?: CSSProperties;
    };
  };
}

export function Card(props: CardProps): ReactNode {
  const { template, raw, customStyle } = props;

  const { sendMessage, client, customChannelId } = useAsgardContext();
  const {
    onTemplateBtnClick,
    defaultLinkTarget,
    onSandboxOpenBrowser,
    onSandboxOpenFile,
    onSandboxOpenFolder,
    sandboxBrowserOpenTarget,
  } = useAsgardTemplateContext();
  const sandboxDownload = useSandboxDownload();
  const { isPreviewMode, tooltip } = usePreviewModeGate();
  const tooltipIdPrefix = useId();

  const [imageError, setImageError] = useState(false);

  const src = useMemo(() => {
    return template?.thumbnailImageUrl?.replace(/^http:/, '').replace(/^https:/, '') || '';
  }, [template]);

  const showImage = Boolean(src) && !imageError;

  const aspectRatio = useMemo(() => {
    switch (template?.imageAspectRatio) {
      case 'square':
        return '1 / 1';
      case 'rectangle':
      default:
        return '1.51 / 1';
    }
  }, [template]);

  const handleClick = useCallback(
    (action: ButtonAction): MouseEventHandler<HTMLButtonElement> => {
      return function clickHandler() {
        switch (action.type) {
          case 'message':
          case 'MESSAGE': {
            sendMessage?.({ text: action.text });

            return;
          }

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
      };
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

  return (
    <div className={clsx('asgard-card', styles.card_root)} style={customStyle?.style}>
      {showImage && (
        <img
          alt={template?.title}
          src={src}
          onError={() => setImageError(true)}
          style={{
            display: 'block',
            width: '100%',
            maxHeight: '170px',
            objectFit: template?.imageSize,
            aspectRatio,
          }}
        />
      )}
      <div className={styles.card_content}>
        <h5 className={styles.card_title} style={customStyle?.title?.style}>
          {template?.title}
        </h5>
        <div className={styles.card_description} style={customStyle?.description?.style}>
          {template?.text}
        </div>
        <div className={styles.card_actions}>
          {template?.buttons?.map((btn: { label: string; action: ButtonAction }, index: number) => {
            // F-040 — in preview mode a button whose action needs the channel is disabled with a tooltip; plain
            // links, MESSAGE and EMIT buttons on the same card are left as they are.
            if (isPreviewMode && isConnectionGatedAction(btn.action)) {
              const tooltipId = `${tooltipIdPrefix}-${index}`;

              return (
                <button
                  key={index}
                  type="button"
                  aria-disabled="true"
                  aria-describedby={tooltipId}
                  className={clsx(styles.button_locked, disabledActionHostClass)}
                  onPointerEnter={placeDisabledActionTooltip}
                  onFocus={placeDisabledActionTooltip}
                  style={customStyle?.button?.style}
                >
                  <LockIcon className={styles.button_lock} />
                  {btn.label}
                  <DisabledActionTooltip id={tooltipId} text={tooltip} />
                </button>
              );
            }

            return (
              <button key={index} onClick={handleClick(btn.action)} style={customStyle?.button?.style}>
                {btn.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
