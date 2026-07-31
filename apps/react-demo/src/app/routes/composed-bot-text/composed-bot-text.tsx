import { ReactNode, useCallback, useState } from 'react';
import {
  BotMessageText,
  Chatbot,
  MessageContentRendererProps,
  TemplateBox,
  TemplateBoxContent,
} from '@asgard-js/react';
import '@asgard-js/react/style';
import { ConversationMessage, EventType, MessageTemplateType } from '@asgard-js/core';
import { nanoid } from 'nanoid';
import { DemoWrapper } from '../../components/demo-wrapper';
import styles from './composed-bot-text.module.scss';

const DEMO_TEXT =
  '這一列用來確認預設 TextTemplate 與自組路徑（TemplateBox + TemplateBoxContent + BotMessageText）都使用無頭像、無時間戳、無泡泡的滿寬 bot 文字版面。\n\n### Markdown 也要照舊\n\n- 清單項目\n- `inline code`\n\n> blockquote 一樣要正常渲染。';

function createDemoMessage(): ConversationMessage {
  const messageId = nanoid();
  const message = {
    text: DEMO_TEXT,
    template: {
      type: MessageTemplateType.TEXT as const,
      text: DEMO_TEXT,
      quickReplies: [],
    },
    messageId,
    replyToCustomMessageId: '',
    payload: undefined,
    isDebug: false,
    idx: 0,
  };

  return {
    type: 'bot',
    messageId,
    isTyping: false,
    typingText: '',
    eventType: EventType.MESSAGE_COMPLETE,
    time: new Date(),
    message,
    raw: JSON.stringify({
      eventType: EventType.MESSAGE_COMPLETE,
      fact: { messageComplete: { message } },
    }),
  };
}

export function ComposedBotText(): ReactNode {
  const [composed, setComposed] = useState(true);
  const [initMessages] = useState(() => [createDemoMessage()]);

  // The Sindri-style self-composed bot row: no Avatar, no time, content fills the reading width.
  const composedRenderer = useCallback((props: MessageContentRendererProps): ReactNode => {
    const { message, renderDefaultContent } = props;

    if (message.type === 'bot') {
      const template = message.message?.template;
      const isText = template?.type === MessageTemplateType.TEXT || !template?.type;
      const text = message.isTyping ? message.typingText : message.message?.text;

      if (isText && text) {
        return (
          <TemplateBox type="bot" direction="horizontal">
            <TemplateBoxContent message={message} quickReplies={template?.quickReplies}>
              <BotMessageText>{text}</BotMessageText>
            </TemplateBoxContent>
          </TemplateBox>
        );
      }
    }

    return renderDefaultContent();
  }, []);

  return (
    <DemoWrapper
      title="自組 Bot 文字列"
      description="確認預設 TextTemplate 與用 TemplateBox + TemplateBoxContent + BotMessageText 自組的訊息列採用相同的滿寬無 chrome 版面。"
    >
      <div className={styles.controls}>
        <button className={composed ? styles.active : ''} onClick={() => setComposed(true)}>
          Composed（自組，應滿寬）
        </button>
        <button className={!composed ? styles.active : ''} onClick={() => setComposed(false)}>
          Default（預設，同樣滿寬）
        </button>
      </div>

      <div className={styles.chatbotContainer}>
        <Chatbot
          key={composed ? 'composed' : 'default'}
          title="Composed Bot Text"
          config={{ botProviderEndpoint: 'skip' }}
          customChannelId={`composed-bot-text-${composed ? 'composed' : 'default'}`}
          initMessages={initMessages}
          renderMessageContent={composed ? composedRenderer : undefined}
        />
      </div>
    </DemoWrapper>
  );
}
