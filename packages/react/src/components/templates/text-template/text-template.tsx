import { CSSProperties, ReactNode, useMemo } from 'react';
import clsx from 'clsx';
import { ConversationBotMessage, ConversationMessage } from '@asgard-js/core';
import { TemplateBox, TemplateBoxContent } from '../template-box';
import classes from './text-template.module.scss';
import { Avatar } from '../avatar';
import { Time } from '../time';
import { useAsgardContext } from '../../../context/asgard-service-context';
import { useAsgardThemeContext } from '../../../context/asgard-theme-context';
import { StreamdownClient } from './streamdown-client';

interface TextTemplateProps {
  message: ConversationMessage;
}

export function TextTemplate(props: TextTemplateProps): ReactNode {
  const { message } = props;

  const { avatar } = useAsgardContext();

  const theme = useAsgardThemeContext();
  const { botMessage } = theme;

  const messageText = (message as ConversationBotMessage)?.message?.text || '';
  const isBot = message.type === 'bot';

  const rootStyle = theme?.template?.TextMessageTemplate?.style;

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
        return {
          color: theme?.chatbot?.primaryComponent?.secondaryColor || theme?.template?.TextMessageTemplate?.style?.color,
          backgroundColor: botMessage?.unsentBackgroundColor,
        };
    }
  }, [message, theme, botMessage]);

  if (message.type === 'error') return null;

  if (message.type === 'user') {
    return (
      <TemplateBox
        className="asgard-text-template asgard-text-template--user"
        type="user"
        direction="horizontal"
        style={rootStyle}
      >
        <div className={clsx(classes.text, classes['text--user'])} style={styles}>
          {message.text}
        </div>
        <Time time={message.time} />
      </TemplateBox>
    );
  }

  // At this point, message is either 'bot' or 'tool-call' type
  const botConversationMessage = message.type === 'bot' ? message : undefined;

  return (
    <TemplateBox
      className="asgard-text-template asgard-text-template--bot"
      type="bot"
      direction="horizontal"
      style={rootStyle}
    >
      <Avatar avatar={avatar} />
      <TemplateBoxContent
        time={message.time}
        quickReplies={botConversationMessage?.message.template?.quickReplies}
        message={botConversationMessage}
      >
        <div className={clsx(classes.text, classes['text--bot'])} style={styles}>
          {isBot ? <StreamdownClient>{messageText}</StreamdownClient> : messageText}
        </div>
      </TemplateBoxContent>
    </TemplateBox>
  );
}
