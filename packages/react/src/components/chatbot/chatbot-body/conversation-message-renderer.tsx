import { ReactNode, useCallback, useMemo } from 'react';
import { ConversationMessage, MessageTemplateType } from '@asgard-js/core';
import {
  BotTypingBox,
  ButtonTemplate,
  CarouselTemplate,
  HintTemplate,
  TextTemplate,
  ChartTemplate,
  ImageTemplate,
  VideoTemplate,
  AudioTemplate,
  LocationTemplate,
  UserImageTemplate,
  TableTemplate,
  TemplateBox,
  TemplateBoxContent,
} from '../../templates';
import { Avatar } from '../../templates/avatar';
import { useAsgardTemplateContext, useAsgardContext, MessageContainerProps } from '../../../context';

interface ConversationMessageRendererProps {
  message: ConversationMessage;
}

export function ConversationMessageRenderer(props: ConversationMessageRendererProps): ReactNode {
  const { message } = props;
  const { renderMessageContent } = useAsgardTemplateContext();
  const { avatar } = useAsgardContext();

  // Create MessageContainer component that wraps custom content with Avatar
  const MessageContainer = useMemo(() => {
    return function Container({ children }: MessageContainerProps): ReactNode {
      // Bot message: show Avatar + content
      if (message.type === 'bot') {
        return (
          <TemplateBox type="bot" direction="horizontal">
            <Avatar avatar={avatar} />
            <TemplateBoxContent message={message} time={message.time}>
              {children}
            </TemplateBoxContent>
          </TemplateBox>
        );
      }

      // User message: right-aligned content only
      if (message.type === 'user') {
        return (
          <TemplateBox type="user" direction="horizontal">
            {children}
          </TemplateBox>
        );
      }

      // Other types: return children directly
      return <>{children}</>;
    };
  }, [message, avatar]);

  const renderDefaultContent = useCallback((): ReactNode => {
    if (message.type === 'user') {
      if (message.blobIds && message.blobIds.length > 0) {
        return <UserImageTemplate message={{ type: 'user', message }} />;
      }

      return <TextTemplate message={message} />;
    }

    if (message.type === 'error') {
      return <HintTemplate message={message} />;
    }

    // tool-call messages are not rendered in the message flow for now
    if (message.type === 'tool-call') {
      return null;
    }

    if (message.isTyping) {
      return <BotTypingBox isTyping={message.isTyping} typingText={message.typingText} />;
    }

    switch (message.message.template?.type) {
      case MessageTemplateType.TEXT:
        return <TextTemplate message={message} />;
      case MessageTemplateType.HINT:
        return <HintTemplate message={message} />;
      case MessageTemplateType.BUTTON:
        return <ButtonTemplate message={message} />;
      case MessageTemplateType.CAROUSEL:
        return <CarouselTemplate message={message} />;
      case MessageTemplateType.CHART:
        return <ChartTemplate message={message} />;
      case MessageTemplateType.IMAGE:
        return <ImageTemplate message={message} />;
      case MessageTemplateType.VIDEO:
        return <VideoTemplate message={message} />;
      case MessageTemplateType.AUDIO:
        return <AudioTemplate message={message} />;
      case MessageTemplateType.LOCATION:
        return <LocationTemplate message={message} />;
      case MessageTemplateType.TABLE:
        return <TableTemplate message={message} />;
      default:
        return <div />;
    }
  }, [message]);

  // If custom renderer is provided, use it
  if (renderMessageContent) {
    return renderMessageContent({ message, renderDefaultContent, MessageContainer });
  }

  // Otherwise use default rendering
  return renderDefaultContent();
}
