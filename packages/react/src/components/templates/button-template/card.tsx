import { MouseEventHandler, ReactNode, useCallback, useMemo, useState, CSSProperties } from 'react';
import styles from './card.module.scss';
import { ButtonAction, ButtonMessageTemplate, CarouselMessageTemplate } from '@asgard-js/core';
import { useAsgardContext } from '../../../context/asgard-service-context';
import { useAsgardTemplateContext } from '../../../context/asgard-template-context';
import { safeWindowOpen } from '../../../utils/uri-validation';
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

  const { sendMessage } = useAsgardContext();
  const { onTemplateBtnClick, defaultLinkTarget } = useAsgardTemplateContext();

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
      };
    },
    [sendMessage, onTemplateBtnClick, defaultLinkTarget, raw],
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
          {template?.buttons?.map((btn: { label: string; action: ButtonAction }, index: number) => (
            <button key={index} onClick={handleClick(btn.action)} style={customStyle?.button?.style}>
              {btn.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
