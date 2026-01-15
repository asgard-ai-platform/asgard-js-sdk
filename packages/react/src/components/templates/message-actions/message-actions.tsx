import { ReactNode, useCallback } from 'react';
import { ConversationBotMessage } from '@asgard-js/core';
import { useAsgardTemplateContext } from '../../../context/asgard-template-context';
import styles from './message-actions.module.scss';
import clsx from 'clsx';

interface MessageActionsProps {
  message: ConversationBotMessage;
}

export function MessageActions(props: MessageActionsProps): ReactNode {
  const { message } = props;
  const { messageActions, onMessageAction } = useAsgardTemplateContext();

  const handleClick = useCallback(
    (actionId: string) => {
      onMessageAction?.(actionId, message);
    },
    [onMessageAction, message],
  );

  // 如果沒有定義 messageActions 函數，不渲染
  if (!messageActions) {
    return null;
  }

  const actions = messageActions(message);

  // 如果沒有 actions，不渲染
  if (!actions?.length) {
    return null;
  }

  return (
    <div className={clsx('asgard-message-actions', styles.message_actions)}>
      {actions.map(action => (
        <button key={action.id} className={styles.message_action} onClick={() => handleClick(action.id)} type="button">
          {action.label}
        </button>
      ))}
    </div>
  );
}
