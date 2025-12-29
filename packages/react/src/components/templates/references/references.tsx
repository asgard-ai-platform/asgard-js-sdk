import { ReactNode, useCallback, useMemo, CSSProperties } from 'react';
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

  const { template, botMessage } = useAsgardThemeContext();
  const { defaultLinkTarget } = useAsgardTemplateContext();

  const handleClick = useCallback(
    (uri: string) => {
      safeWindowOpen(uri, defaultLinkTarget || '_blank');
    },
    [defaultLinkTarget],
  );

  const referenceBoxStyle = useMemo<CSSProperties>(
    () => ({
      color: botMessage?.color,
      backgroundColor: botMessage?.backgroundColor,
      ...template?.references?.style,
    }),
    [botMessage, template],
  );

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
            <span className={styles.references_title}>References</span>
          </div>
          <div className={styles.references_list}>
            {references.map((reference, index) => (
              <button key={index} className={styles.reference_item} onClick={() => handleClick(reference.uri)}>
                <span className={styles.reference_link}>{reference.title}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
      <Time time={time} />
    </div>
  );
}
