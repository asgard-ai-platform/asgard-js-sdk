import { ReactNode } from 'react';
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
  UserImageTemplate,
} from '../../templates';

interface ConversationMessageRendererProps {
  message: ConversationMessage;
}

export function ConversationMessageRenderer(props: ConversationMessageRendererProps): ReactNode {
  const { message } = props;

  if (message.type === 'user') {
    if (message.blobIds && message.blobIds.length > 0) {
      return <UserImageTemplate message={{ type: 'user', message }} />;
    }

    return <TextTemplate message={message} />;
  }

  if (message.type === 'error') {
    return <HintTemplate message={message} />;
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
    default:
      return <div />;
  }
}
