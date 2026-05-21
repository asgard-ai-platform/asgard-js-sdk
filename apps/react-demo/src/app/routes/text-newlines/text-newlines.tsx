import { ReactNode } from 'react';
import { Chatbot } from '@asgard-js/react';
import '@asgard-js/react/style';
import { ConversationMessage, EventType, MessageTemplateType } from '@asgard-js/core';
import { nanoid } from 'nanoid';
import { DemoWrapper } from '../../components/demo-wrapper';
import styles from './text-newlines.module.scss';

// 示範 bot TEXT template 的換行渲染：
// - 前段：一整行裡面混 markdown 結構（## / *），但沒有真的換行符。模擬上游
//   把 `\n` 換成空格的狀況。`##` 跟 `*` 不在行首就會以 literal 顯示（這是
//   CommonMark 預期行為，SDK 無法救沒換行符的內容）。
// - 中間：`\n\n` 應該渲染成有視覺空白的段落分隔。
// - 後段：每行用單 `\n` 分隔，靠 `remark-breaks` plugin 渲染成 `<br>`。
const DEMO_TEXT =
  '單個換行與段落分隔的示範。  行內 `## 標題` 跟 `* 項目` 標記會以原文顯示，因為它們不在行首 —— 這是標準 Markdown 規範，SDK 沒辦法補回上游遺失的換行符。\n\n這是 \\n\\n 之後的下一段，上方應該有明顯的空白間距。\n第一行\n第二行\n第三行\n以上每一行都是用單個 \\n 分隔，應該各自獨立一行顯示。';

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

export function TextNewlines(): ReactNode {
  const initMessages = [createDemoMessage()];

  return (
    <DemoWrapper
      title="文字換行渲染"
      description="示範 bot TEXT 訊息裡單個 \\n（換行）與 \\n\\n（段落分隔）的渲染效果。"
    >
      <div className={styles.chatbotContainer}>
        <Chatbot
          title="文字換行渲染"
          config={{ botProviderEndpoint: 'skip' }}
          customChannelId="text-newlines-demo"
          initMessages={initMessages}
        />
      </div>
    </DemoWrapper>
  );
}
