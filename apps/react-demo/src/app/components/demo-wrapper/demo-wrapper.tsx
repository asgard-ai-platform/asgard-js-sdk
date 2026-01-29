import { ReactNode } from 'react';
import styles from './demo-wrapper.module.scss';

interface DemoWrapperProps {
  title: string;
  description?: string;
  children: ReactNode;
}

export function DemoWrapper({ title, description, children }: DemoWrapperProps): ReactNode {
  return (
    <div className={styles.wrapper}>
      <header className={styles.header}>
        <h2 className={styles.title}>{title}</h2>
        {description && <p className={styles.description}>{description}</p>}
      </header>
      <div className={styles.content}>{children}</div>
    </div>
  );
}
