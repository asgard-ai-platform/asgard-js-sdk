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
  AttachmentTemplate,
  ThinkingBlock,
  TemplateBox,
  TemplateBoxContent,
} from '../../templates';
import { useAsgardTemplateContext, MessageContainerProps } from '../../../context';

interface ConversationMessageRendererProps {
  message: ConversationMessage;
}

export function ConversationMessageRenderer(props: ConversationMessageRendererProps): ReactNode {
  const { message } = props;
  const { renderMessageContent } = useAsgardTemplateContext();

  // Create MessageContainer component that wraps custom content in the SDK's
  // chrome-free bot message layout.
  const MessageContainer = useMemo(() => {
    return function Container({ children }: MessageContainerProps): ReactNode {
      if (message.type === 'bot') {
        return (
          <TemplateBox type="bot" direction="horizontal">
            <TemplateBoxContent message={message}>{children}</TemplateBoxContent>
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
      return children;
    };
  }, [message]);

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

    // Extended-thinking (reasoning) renders as its own collapsible block, separate from the answer (F-001).
    if (message.type === 'thinking') {
      return <ThinkingBlock message={message} />;
    }

    // Subagent lifecycle events are run-level chrome shown only in the docked SubagentList (F-012), never
    // inline — `groupMessages` (ChatbotBody) already filters them out, so this is defensive; it also
    // narrows `message` down to `ConversationBotMessage` for the bot-only field access below.
    if (message.type === 'subagent') {
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
      case MessageTemplateType.ATTACHMENT:
        return <AttachmentTemplate message={message} />;
      default:
        // No-template (or unknown-template) completed message → render its plain text, never an empty
        // bubble (F-011 / UC-017). TextTemplate reads `message.text` directly, independent of template.
        return message.message.text ? <TextTemplate message={message} /> : <div />;
    }
  }, [message]);

  // If custom renderer is provided, use it
  if (renderMessageContent) {
    return renderMessageContent({ message, renderDefaultContent, MessageContainer });
  }

  // Otherwise use default rendering
  return renderDefaultContent();
}
