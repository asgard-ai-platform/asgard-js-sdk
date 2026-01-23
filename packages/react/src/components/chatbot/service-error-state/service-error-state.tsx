import { ReactElement } from 'react';
import { useAsgardThemeContext } from '../../../context/asgard-theme-context';
import { useAsgardContext } from '../../../context/asgard-service-context';
import { ProfileIcon } from '../profile-icon';
import styles from './service-error-state.module.scss';

interface ServiceErrorStateProps {
  message: string;
}

export function ServiceErrorState({ message }: ServiceErrorStateProps): ReactElement {
  const { chatbot } = useAsgardThemeContext();
  const { avatar } = useAsgardContext();

  return (
    <div
      className={styles.container}
      style={{
        backgroundColor: chatbot.backgroundColor,
        borderColor: chatbot.borderColor,
      }}
    >
      <div className={styles.avatar}>
        <ProfileIcon avatar={avatar} />
      </div>
      <div className={styles.message}>{message}</div>
    </div>
  );
}
