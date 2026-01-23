import { ReactElement } from 'react';
import { ProfileIcon } from '../profile-icon';
import styles from './service-error-state.module.scss';

interface ServiceErrorStateProps {
  message: string;
  avatar?: string;
}

export function ServiceErrorState({ message, avatar }: ServiceErrorStateProps): ReactElement {
  return (
    <div className={styles.container}>
      <div className={styles.avatar}>
        <ProfileIcon avatar={avatar} />
      </div>
      <div className={styles.message}>{message}</div>
    </div>
  );
}
