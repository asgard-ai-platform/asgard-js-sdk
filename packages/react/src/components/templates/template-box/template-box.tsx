import { CSSProperties, ReactNode, useMemo } from 'react';
import styles from './template-box.module.scss';
import clsx from 'clsx';

type TemplateBoxProps =
  | {
      type: 'user';
      direction: 'horizontal';
      children: ReactNode;
      className?: string;
      style?: CSSProperties;
    }
  | {
      type: 'bot';
      direction: 'horizontal' | 'vertical';
      children: ReactNode;
      className?: string;
      style?: CSSProperties;
      isEmpty?: boolean;
    };

export function TemplateBox(props: TemplateBoxProps): ReactNode {
  const { type, children, style, className } = props;
  const direction = props.type === 'bot' ? props.direction : 'horizontal';
  const isEmpty = props.type === 'bot' ? props.isEmpty : false;

  const boxClassName = useMemo(() => {
    switch (type) {
      case 'user':
        return clsx(styles.template_box, styles['template_box--user']);
      case 'bot':
      default:
        return clsx(
          styles.template_box,
          styles['template_box--bot'],
          direction === 'horizontal' ? styles['template_box--horizontal'] : styles['template_box--vertical'],
          isEmpty && styles['template_box--empty'],
        );
    }
  }, [direction, type, isEmpty]);

  return (
    <div className={clsx('asgard-template-box', boxClassName, className)} style={style}>
      {children}
    </div>
  );
}
