import { ReactElement } from 'react';
import { useAsgardContext } from '../../../context/asgard-service-context';
import { ProfileIcon } from '../profile-icon';
import styles from './service-error-state.module.scss';

interface ServiceErrorStateProps {
  message: string;
}

export function ServiceErrorState({ message }: ServiceErrorStateProps): ReactElement {
  const { avatar } = useAsgardContext();

  return (
    <div className={styles.container}>
      <div className={styles.avatar}>
        <ProfileIcon avatar={avatar} />
      </div>
      <div className={styles.message}>{message}</div>
    </div>
  );
}
