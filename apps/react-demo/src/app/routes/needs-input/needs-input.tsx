import { ReactNode, useState } from 'react';
import { ConversationMessage, EventType } from '@asgard-js/core';
import { Chatbot, Locale } from '@asgard-js/react';
import '@asgard-js/react/style';
import { DemoWrapper } from '../../components/demo-wrapper';
import styles from './needs-input.module.scss';

// F-041 — the agent's `[NEEDS_INPUT]:` line drawn as a callout. The opening transcript covers the static
// cases (a replied callout, lines that must stay plain markdown, a callout still waiting); typing a message
// streams a new reply slowly (see `handleNeedsInputMock`) so the hold-back is visible, and sending it turns
// the last callout into its "replied" state.

const config = {
  botProviderEndpoint: `${typeof window !== 'undefined' ? window.location.origin : ''}/mock-asgard`,
};

const time = new Date();

function bot(messageId: string, text: string): ConversationMessage {
  return {
    type: 'bot',
    messageId,
    eventType: EventType.MESSAGE_COMPLETE,
    isTyping: false,
    typingText: null,
    message: { messageId, text } as never,
    time,
    raw: '',
  };
}

const INIT_MESSAGES: ConversationMessage[] = [
  bot('b1', '要查營收之前，我需要先知道範圍。\n[NEEDS_INPUT]: 要看哪個區域？'),
  { type: 'user', messageId: 'u1', text: '北區', time },
  bot(
    'b2',
    '北區上週營收是 **NT$ 320 萬**。\n\n下面這些都不是 callout：\n\n我會在回覆最後寫 [NEEDS_INPUT]: 這樣的一行\n\n**[NEEDS_INPUT]:** 粗體裡的\n\n> [NEEDS_INPUT]: 放在 引言裡的\n\n- [NEEDS_INPUT]: 放在 清單裡的\n\n[NEEDS_INPUT] 沒有冒號的\n\nblocked: 需要權限',
  ),
  bot('b3', '還差一件事就能拆到各通路。\n[NEEDS_INPUT]: 退貨要不要先扣掉？細節見[計算說明](https://example.com/docs)'),
];

const SCRIPTS: { label: string; hint: string }[] = [
  { label: '一般：隨便打一句', hint: '慢速串流一則回覆，最後一行是 [NEEDS_INPUT]:，標記原文不會先閃出來（R7）' },
  { label: '打「連續」', hint: '兩行連續的標記 → 一個 callout、兩段（R4）' },
  { label: '打「空」', hint: '標記後面沒字 → 只顯示標題（R3）' },
  { label: '打「舊」', hint: '舊寫法 needs input: 加連結（R1、R3）' },
  { label: '打「程式」', hint: 'code block 裡的標記照原樣顯示，只有最後一行是 callout（R2）' },
];

const LOCALES: Locale[] = ['en-US', 'zh-TW', 'ja-JP'];

const WIDE_THEME = { chatbot: { width: '100%', height: '100%' } };

export function NeedsInputRoute(): ReactNode {
  const [locale, setLocale] = useState<Locale>('zh-TW');

  return (
    <DemoWrapper
      title="Needs-Input Callout (F-041)"
      description="agent 被你卡住時，回覆最後一行用 [NEEDS_INPUT]: 收尾。SDK 把那一行抽出來畫成「需要你回覆」callout；這則訊息後面有你的訊息之後，改成中性色的「已回覆」。"
    >
      <div className={styles.stack}>
        <div className={styles.legend}>
          <div className={styles.legend__title}>腳本（打字內容決定走哪一條）</div>
          <ul className={styles.scripts}>
            {SCRIPTS.map(s => (
              <li key={s.label}>
                <strong>{s.label}</strong>
                <span>{s.hint}</span>
              </li>
            ))}
          </ul>
          <div className={styles.locales}>
            <span>locale：</span>
            {LOCALES.map(l => (
              <button
                type="button"
                key={l}
                className={locale === l ? styles.active : undefined}
                onClick={(): void => setLocale(l)}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.stage}>
          <div className={styles.chatbotWide}>
            <div className={styles.sizeLabel}>寬版 —— 消費端（Mimir / Sindri / Odin）實際的掛法</div>
            <div className={styles.wideBox}>
              <Chatbot
                title="營運數據助理"
                config={config}
                customChannelId="needs-input-demo"
                initMessages={INIT_MESSAGES}
                inputPlaceholder="輸入你的問題"
                locale={locale}
                theme={WIDE_THEME}
              />
            </div>
          </div>

          <div className={styles.chatbotNarrow}>
            <div className={styles.sizeLabel}>窄版 375×640 —— SDK 預設 theme</div>
            <div className={styles.narrowBox}>
              <Chatbot
                title="營運數據助理"
                config={config}
                customChannelId="needs-input-demo-narrow"
                initMessages={INIT_MESSAGES}
                inputPlaceholder="輸入你的問題"
                locale={locale}
              />
            </div>
          </div>
        </div>
      </div>
    </DemoWrapper>
  );
}
