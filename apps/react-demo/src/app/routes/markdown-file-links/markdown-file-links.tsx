import { ReactNode, useState } from 'react';
import { Chatbot, ChatbotTheme, Locale } from '@asgard-js/react';
import '@asgard-js/react/style';
import { ConversationMessage, EventType, MessageTemplateType } from '@asgard-js/core';
import { DemoWrapper } from '../../components/demo-wrapper';
import styles from './markdown-file-links.module.scss';

// BUG-025 (asgard-sindri-pm#350): file:// links in a bot message rendered as "name [blocked]". Browsers
// will not open file:// from an http(s) page, so they now show the path plus a copy button; a link to a
// network share copies as a Windows UNC path. The https and javascript: rows check nothing else moved.
const DEMO_TEXT = `以下是查到的檔案：

- [test.txt](file:///tmp/test.txt)
- [規格書.pdf](file://192.168.0.10/share/規格書.pdf)
- [對照組 example](https://example.com)
- [不該能點的 javascript 連結](javascript:alert(1))

句子中間的連結：請參考 [2026 第三季營運報告（最終版）.xlsx](file://fileserver.corp.local/財務部/報表/2026/Q3/2026%20第三季營運報告（最終版）.xlsx) 第二頁。

自動連結：<file:///Users/shared/readme.md>`;

const LOCALES: Locale[] = ['en-US', 'zh-TW', 'ja-JP'];
// Same light preset as /markdown-theme: the path's code background follows the theme foreground there.
const LIGHT_THEME: ChatbotTheme = {
  chatbot: {
    backgroundColor: '#fafafa',
    borderColor: '#e5e5e5',
    inactiveColor: '#737373',
    primaryComponent: { mainColor: '#171717', secondaryColor: '#171717' },
  },
  botMessage: { color: '#171717', backgroundColor: '#ffffff' },
  userMessage: { color: '#fafafa', backgroundColor: '#171717' },
};

function createDemoMessage(): ConversationMessage {
  const messageId = 'markdown-file-links';
  const message = {
    text: DEMO_TEXT,
    template: { type: MessageTemplateType.TEXT as const, text: DEMO_TEXT, quickReplies: [] },
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
    raw: JSON.stringify({ eventType: EventType.MESSAGE_COMPLETE, fact: { messageComplete: { message } } }),
  };
}

export function MarkdownFileLinks(): ReactNode {
  const [locale, setLocale] = useState<Locale>('zh-TW');
  const [light, setLight] = useState(false);
  const baseTheme: ChatbotTheme = light ? LIGHT_THEME : {};
  const wideTheme: ChatbotTheme = { ...baseTheme, chatbot: { ...baseTheme.chatbot, width: '100%', height: '100%' } };
  const initMessages = [createDemoMessage()];

  return (
    <DemoWrapper
      title="Markdown file:// 連結"
      description="BUG-025：file:// 連結顯示為路徑＋複製按鈕，網路磁碟路徑複製成 UNC；https 與 javascript: 連結行為不變。"
    >
      <div className={styles.stack}>
        <div className={styles.locales}>
          <span>locale：</span>
          {LOCALES.map(l => (
            <button key={l} className={locale === l ? styles.active : undefined} onClick={() => setLocale(l)}>
              {l}
            </button>
          ))}
          <span>theme：</span>
          <button className={light ? undefined : styles.active} onClick={() => setLight(false)}>
            Default
          </button>
          <button className={light ? styles.active : undefined} onClick={() => setLight(true)}>
            Light
          </button>
        </div>

        <div className={styles.stage}>
          <div className={styles.chatbotWide}>
            <div className={styles.sizeLabel}>Full-bleed（Sindri 的掛法）</div>
            <div className={styles.wideBox}>
              <Chatbot
                key={`wide-${locale}-${light}`}
                title="file:// 連結"
                config={{ botProviderEndpoint: 'skip' }}
                customChannelId="markdown-file-links-wide"
                initMessages={initMessages}
                autoResetChannel={false}
                locale={locale}
                theme={wideTheme}
              />
            </div>
          </div>
          <div className={styles.chatbotNarrow}>
            <div className={styles.sizeLabel}>預設 375×640</div>
            <Chatbot
              key={`narrow-${locale}-${light}`}
              title="file:// 連結"
              config={{ botProviderEndpoint: 'skip' }}
              customChannelId="markdown-file-links-narrow"
              initMessages={initMessages}
              autoResetChannel={false}
              locale={locale}
              theme={baseTheme}
            />
          </div>
        </div>
      </div>
    </DemoWrapper>
  );
}
