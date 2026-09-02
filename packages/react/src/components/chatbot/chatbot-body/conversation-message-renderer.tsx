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
  QuestionTemplate,
  CanvasTemplate,
  ThinkingBlock,
  TemplateBox,
  TemplateBoxContent,
} from '../../templates';
import { useAsgardTemplateContext, MessageContainerProps } from '../../../context';
import { MessageFeedbackBar, isRatableReply } from '../../message-feedback';
import styles from './conversation-message-renderer.module.scss';

interface ConversationMessageRendererProps {
  message: ConversationMessage;
}

export function ConversationMessageRenderer(props: ConversationMessageRendererProps): ReactNode {
  const { message } = props;
  const { renderMessageContent, enableFeedback } = useAsgardTemplateContext();

  // Create MessageContainer component that wraps custom content in the SDK's chrome-free shell for this
  // message type — the bot message layout, the right-aligned user row, or the children as-is.
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
      // #448 — either half means "this turn had attachments": a live send fills `blobIds`, and a replayed
      // frame carries `blobs` beside them. Routing on `blobIds` alone would leave a frame that ever ships
      // metadata without ids falling through to the plain text template, silently dropping the chips.
      if (message.blobIds?.length || message.blobs?.length) {
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

    // F-030 — a canvas is its own message type, not a template on a bot message, so it branches here
    // like `thinking` does. This also narrows `message` to `ConversationBotMessage` for the template
    // access below (a canvas message has no `message` field).
    if (message.type === 'canvas') {
      return <CanvasTemplate message={message} />;
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
      // F-029 — this case *replaces* the plain-text fallback below for QUESTION cards. The backend
      // ships the questions as prose in `message.text` as well, so an SDK that predates this case
      // still shows them via the default branch instead of an empty bubble.
      case MessageTemplateType.QUESTION:
        return <QuestionTemplate message={message} />;
      default:
        // No-template (or unknown-template) completed message → render its plain text, never an empty
        // bubble (F-011 / UC-017). TextTemplate reads `message.text` directly, independent of template.
        return message.message.text ? <TextTemplate message={message} /> : <div />;
    }
  }, [message]);

  const content = renderMessageContent
    ? renderMessageContent({ message, renderDefaultContent, MessageContainer })
    : renderDefaultContent();

  // F-033 — the feedback bar is message-level chrome, mounted here *after* whatever rendered the
  // content, and not inside `renderDefaultContent()` / `TemplateBoxContent`. That is deliberate: a host
  // with a heavy `renderMessageContent` (Mimir's TABLE / CHART turns never call `renderDefaultContent`)
  // would otherwise never see it. The wrapper exists only when the feature is on, so hosts that leave it
  // off keep the exact DOM they had.
  if (enableFeedback && isRatableReply(message)) {
    return (
      <div className={styles.rated_message}>
        {content}
        <MessageFeedbackBar message={message} />
      </div>
    );
  }

  return content;
}
