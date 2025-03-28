import { CSSProperties, ReactNode, useMemo } from 'react';
import clsx from 'clsx';
import { ConversationMessage } from '@asgard-js/core';
import { TemplateBox, TemplateBoxContent } from '../template-box';
import classes from './text-template.module.scss';
import { Avatar } from '../avatar';
import { Time } from '../time';
import { useAsgardContext } from 'src/context/asgard-service-context';
import { useAsgardThemeContext } from 'src/context/asgard-theme-context';

interface TextTemplateProps {
  message: ConversationMessage;
}

export function TextTemplate(props: TextTemplateProps): ReactNode {
  const { message } = props;

  const { avatar } = useAsgardContext();

  const theme = useAsgardThemeContext();

  const styles = useMemo<CSSProperties>(() => {
    switch (message.type) {
      case 'user':
        return {
          color: theme?.userMessage?.color,
          backgroundColor: theme?.userMessage?.backgroundColor,
        };
      case 'bot':
        return {
          color: theme?.botMessage?.color,
          backgroundColor: theme?.botMessage?.backgroundColor,
        };
      default:
        return {};
    }
  }, [message, theme]);

  if (message.type === 'error') return null;

  if (message.type === 'user') {
    return (
      <TemplateBox type="user" direction="horizontal">
        <div
          className={clsx(classes.text, classes['text--user'])}
          style={styles}
        >
          {message.text}
        </div>
        <Time time={message.time} />
      </TemplateBox>
    );
  }

  return (
    <TemplateBox type="bot" direction="horizontal">
      <Avatar avatar={avatar} />
      <TemplateBoxContent
        time={message.time}
        quickReplies={message.message.template?.quickReplies}
      >
        <div
          className={clsx(classes.text, classes['text--bot'])}
          style={styles}
        >
          {message.message.text}
        </div>
      </TemplateBoxContent>
    </TemplateBox>
  );
}
