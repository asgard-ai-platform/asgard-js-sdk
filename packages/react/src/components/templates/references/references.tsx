import { ReactNode, CSSProperties, MouseEvent } from 'react';
import styles from './references.module.scss';
import { Reference } from '@asgard-js/core';
import { useAsgardThemeContext } from '../../../context/asgard-theme-context';
import { useAsgardTemplateContext } from '../../../context/asgard-template-context';
import { safeWindowOpen } from '../../../utils/uri-validation';
import { Time } from '../time';
import clsx from 'clsx';

interface ReferencesProps {
  references: Reference[];
  time?: Date;
}

export function References(props: ReferencesProps): ReactNode {
  const { references, time } = props;

  const { template, botMessage, chatbot } = useAsgardThemeContext();
  const { defaultLinkTarget } = useAsgardTemplateContext();

  const handleClick = (e: MouseEvent<HTMLButtonElement>): void => {
    const uri = e.currentTarget.dataset.uri;
    if (uri) {
      safeWindowOpen(uri, defaultLinkTarget || '_blank');
    }
  };

  const referenceBoxStyle: CSSProperties = {
    color: botMessage?.color,
    backgroundColor: botMessage?.backgroundColor,
    ...template?.references?.style,
  };

  const titleStyle: CSSProperties = {
    color: chatbot?.inactiveColor,
    ...template?.references?.title?.style,
  };

  const dividerStyle: CSSProperties = {
    backgroundColor: chatbot?.borderColor,
  };

  if (!references?.length) {
    return null;
  }

  return (
    <div className={styles.references_wrapper}>
      <div
        className={clsx('asgard-references', styles.references_box, styles['references_box--bot'])}
        style={referenceBoxStyle}
      >
        <div className={styles.references_inner}>
          <div className={styles.references_header}>
            <span className={styles.references_title} style={titleStyle}>
              Reference
            </span>
            <span className={styles.references_divider} style={dividerStyle} />
          </div>
          <div className={styles.references_list}>
            {references.map((reference, index) => {
              const hasUri = reference.uri && reference.uri.trim() !== '';
              if (hasUri) {
                return (
                  <button key={index} className={styles.reference_item} data-uri={reference.uri} onClick={handleClick}>
                    <span className={styles.reference_link}>{reference.title}</span>
                  </button>
                );
              }

              return (
                <span key={index} className={styles.reference_item_text}>
                  {reference.title}
                </span>
              );
            })}
          </div>
        </div>
      </div>
      <Time time={time} />
    </div>
  );
}
