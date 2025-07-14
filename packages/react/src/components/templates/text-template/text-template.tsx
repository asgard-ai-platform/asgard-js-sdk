import { CSSProperties, ReactNode, useMemo } from 'react';
import clsx from 'clsx';
import { ConversationBotMessage, ConversationMessage } from '@asgard-js/core';
import { TemplateBox, TemplateBoxContent } from '../template-box';
import classes from './text-template.module.scss';
import { Avatar } from '../avatar';
import { Time } from '../time';
import { useAsgardContext } from 'src/context/asgard-service-context';
import { useAsgardThemeContext } from 'src/context/asgard-theme-context';
import { useMarkdownRenderer } from './use-react-markdown-renderer';

interface TextTemplateProps {
  message: ConversationMessage;
}

export function TextTemplate(props: TextTemplateProps): ReactNode {
  const { message } = props;

  const { avatar } = useAsgardContext();

  const theme = useAsgardThemeContext();

  const { htmlBlocks, lastTypingText } = useMarkdownRenderer(
    (message as ConversationBotMessage)?.message?.text || '',
    20
  );

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
        return {};
    }
  }, [message, theme]);

  if (message.type === 'error') return null;

  if (message.type === 'user') {
    return (
      <TemplateBox
        className="asgard-text-template asgard-text-template--user"
        type="user"
        direction="horizontal"
        style={rootStyle}
      >
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
    <TemplateBox
      className="asgard-text-template asgard-text-template--bot"
      type="bot"
      direction="horizontal"
      style={rootStyle}
    >
      <Avatar avatar={avatar} />
      <TemplateBoxContent
        time={message.time}
        quickReplies={message.message.template?.quickReplies}
      >
        <div
          className={clsx(classes.text, classes['text--bot'])}
          style={styles}
        >
          {htmlBlocks}
          {lastTypingText ?? ''}
        </div>
      </TemplateBoxContent>
    </TemplateBox>
  );
}
