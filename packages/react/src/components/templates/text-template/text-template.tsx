import { CSSProperties, ReactNode, useMemo } from 'react';
import clsx from 'clsx';
import { ConversationBotMessage, ConversationMessage } from '@asgard-js/core';
import { TemplateBox, TemplateBoxContent } from '../template-box';
import classes from './text-template.module.scss';
import { Time } from '../time';
import { useAsgardThemeContext } from '../../../context/asgard-theme-context';
import { BotMessageText } from './bot-message-text';

interface TextTemplateProps {
  message: ConversationMessage;
}

export function TextTemplate(props: TextTemplateProps): ReactNode {
  const { message } = props;

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

  // Check if this is an empty message (no text but may have references or quick replies)
  const hasText = messageText.trim() !== '';
  const references = botConversationMessage?.message.template?.references;
  const quickReplies = botConversationMessage?.message.template?.quickReplies;
  const hasReferences = !!references?.length;
  const hasQuickReplies = !!quickReplies?.length;
  const isEmptyMessage = !hasText;

  // If no text and no references and no quick replies, don't render anything
  if (isEmptyMessage && !hasReferences && !hasQuickReplies) {
    return null;
  }

  // Empty message with references or quick replies: render the auxiliary content without bot chrome.
  if (isEmptyMessage) {
    return (
      <TemplateBox
        className={clsx('asgard-text-template', 'asgard-text-template--bot', 'asgard-text-template--empty')}
        type="bot"
        direction="horizontal"
        style={rootStyle}
        isEmpty
      >
        <TemplateBoxContent
          quickReplies={quickReplies}
          references={references}
          message={botConversationMessage}
          isEmpty
        />
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
      <TemplateBoxContent quickReplies={quickReplies} references={references} message={botConversationMessage}>
        {isBot ? (
          <BotMessageText className={classes['text--bot-default']}>{messageText}</BotMessageText>
        ) : (
          <div className={clsx(classes.text, classes['text--bot'], classes['text--bot-default'])} style={styles}>
            {messageText}
          </div>
        )}
      </TemplateBoxContent>
    </TemplateBox>
  );
}
