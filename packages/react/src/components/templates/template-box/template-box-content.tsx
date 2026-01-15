import { ReactNode } from 'react';
import { ConversationBotMessage, Reference } from '@asgard-js/core';
import styles from './template-box-content.module.scss';
import { QuickReplies } from '../quick-replies';
import { References } from '../references';
import { MessageActions } from '../message-actions';
import { Time } from '../time';
import clsx from 'clsx';

interface TemplateBoxContentProps {
  children: ReactNode;
  time?: Date;
  quickReplies?: { text: string }[];
  references?: Reference[];
  message?: ConversationBotMessage;
}

export function TemplateBoxContent(props: TemplateBoxContentProps): ReactNode {
  const { quickReplies, references, time, children, message } = props;

  return (
    <div className={clsx('asgard-template-box-content', styles.template_box_content)}>
      <div className={styles.content}>
        {children}
        <Time time={time} />
      </div>
      {!!references?.length && <References references={references} time={time} />}
      {!!quickReplies?.length && <QuickReplies quickReplies={quickReplies} />}
      {message && <MessageActions message={message} />}
    </div>
  );
}
