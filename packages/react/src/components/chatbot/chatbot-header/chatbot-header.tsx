import { MouseEventHandler, ReactNode, useCallback, useMemo } from 'react';
import styles from './chatbot-header.module.scss';
import { ProfileIcon } from '../profile-icon';
import RefreshSvg from 'src/icons/refresh.svg?react';
import CloseSvg from 'src/icons/close.svg?react';
import {
  useAsgardAppInitializationContext,
  useAsgardThemeContext,
  useAsgardContext,
} from 'src/context/';
import clsx from 'clsx';

interface ChatbotHeaderProps {
  title: string;
  customActions?: ReactNode[];
  maintainConnectionWhenClosed?: boolean;
  onClose?: () => void;
  onReset?: () => void;
}

export function ChatbotHeader(props: ChatbotHeaderProps): ReactNode {
  const {
    title,
    onReset,
    onClose,
    customActions,
    maintainConnectionWhenClosed,
  } = props;

  const { chatbot } = useAsgardThemeContext();
  const {
    data: { annotations },
  } = useAsgardAppInitializationContext();

  const { avatar, isResetting, resetChannel, closeChannel } =
    useAsgardContext();

  const contentStyles = useMemo(
    () => ({
      maxWidth: chatbot?.contentMaxWidth ?? '1200px',
      borderBottomColor: chatbot?.borderColor,
    }),
    [chatbot]
  );

  const _onReset = useCallback<MouseEventHandler<HTMLDivElement>>(
    (e) => {
      if (!isResetting) {
        e.stopPropagation();
        onReset?.();
        resetChannel?.();
      }
    },
    [isResetting, onReset, resetChannel]
  );

  const _onClose = useCallback<MouseEventHandler<HTMLDivElement>>(
    (e) => {
      if (!isResetting) {
        e.stopPropagation();
        onClose?.();

        if (!maintainConnectionWhenClosed) {
          closeChannel?.();
        }
      }
    },
    [isResetting, onClose, closeChannel, maintainConnectionWhenClosed]
  );

  return (
    <div
      className={clsx('asgard-chatbot-header', styles.chatbot_header)}
      style={chatbot?.header?.style}
    >
      <div className={styles.chatbot_header__content} style={contentStyles}>
        <div className={styles.chatbot_header__title}>
          <ProfileIcon avatar={avatar} />
          <h4 style={chatbot?.header?.title?.style}>
            {annotations?.embedConfig?.title || title}
          </h4>
        </div>
        <div
          className={styles.chatbot_header__extra}
          style={chatbot?.header?.actionButton?.style}
        >
          {customActions}
          <div onClick={_onReset}>
            <RefreshSvg />
          </div>
          <div onClick={_onClose}>
            <CloseSvg />
          </div>
        </div>
      </div>
    </div>
  );
}
