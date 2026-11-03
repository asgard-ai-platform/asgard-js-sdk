import { ComponentProps, ReactNode, useCallback, useState } from 'react';
import { ButtonAction, ConversationMessage, Message, MessageTemplateType } from '@asgard-js/core';
import { Chatbot, Locale } from '@asgard-js/react';
import '@asgard-js/react/style';
import { DemoWrapper } from '../../components/demo-wrapper';
import { createBaseTemplateExample } from '../../mocks/messages';
import styles from './preview-mode-cards.module.scss';

/**
 * F-040 — action cards in preview mode. One finished conversation in which the agent pushed every card that needs
 * the channel (open-file / open-folder / download-file / open-browser, an old channel-home download card, and a
 * button card pointing at two of them), plus plain links as controls.
 *
 * Preview mode (`botProviderEndpoint: 'skip'`) mounts twice, full-bleed and the SDK's 375×640 default, side by
 * side: the cards stay, but locked, with the tooltip on hover / focus. The third shell is the same conversation
 * *connected* (the dev server's `/mock-asgard`) — the control: nothing there may have changed.
 *
 * The messages are module-level constants on purpose: in preview mode the conversation is rebuilt whenever
 * `initMessages` changes identity.
 */

const SANDBOX = 'sb-3f9a1c0e7b2d4a61';
const sandboxUri = (action: string, path?: string): string =>
  `sandbox://${SANDBOX}/${action}${path ? `?absolute_path=${encodeURIComponent(path)}` : ''}`;

const OPEN_FILE: ButtonAction = { type: 'uri', uri: sandboxUri('open-file', '/agent-hub-work/outputs/報價比較.xlsx') };
const OPEN_FOLDER: ButtonAction = { type: 'uri', uri: sandboxUri('open-folder', '/agent-hub-work/quotes') };
const DOWNLOAD_FILE: ButtonAction = {
  type: 'uri',
  uri: sandboxUri('download-file', '/agent-hub-work/outputs/報價比較.xlsx'),
};
const OPEN_BROWSER: ButtonAction = { type: 'uri', uri: sandboxUri('open-browser') };
const CHANNEL_HOME: ButtonAction = { type: 'uri', uri: 'channel-home://contracts/合約草稿-v3.docx' };
const PLAIN_LINK: ButtonAction = { type: 'uri', uri: 'https://example.com/pricing' };

function botMessage(id: string, template: Message['template']): ConversationMessage {
  return createBaseTemplateExample({
    messageId: id,
    replyToCustomMessageId: '',
    // The bot text bubble renders `message.text`, not the template's copy of it.
    text: template.type === MessageTemplateType.TEXT ? template.text : '',
    payload: null,
    isDebug: false,
    idx: 0,
    template,
  });
}

const MESSAGES: ConversationMessage[] = [
  botMessage('pv-1', {
    type: MessageTemplateType.TEXT,
    quickReplies: [],
    text: '整理好了。比較表在下面，原始報價放在 `quotes/` 資料夾。供應商官網的報價頁我也用瀏覽器開好了，需要的話可以接手。\n\n參考：[各家公開價目表](https://example.com/pricing)',
  }),
  botMessage('pv-2', {
    type: MessageTemplateType.ATTACHMENT,
    quickReplies: [],
    attachments: [
      { title: '開啟檔案', text: '報價比較.xlsx', defaultAction: OPEN_FILE },
      { title: '開啟資料夾', text: 'quotes', defaultAction: OPEN_FOLDER },
      { title: '報價比較.xlsx', text: '18 KB · Excel', defaultAction: DOWNLOAD_FILE },
      { title: '接手瀏覽器', text: 'Agent 已開好瀏覽器工作階段，點此接手操作', defaultAction: OPEN_BROWSER },
      { title: '各家公開價目表（一般連結）', text: 'example.com/pricing', defaultAction: PLAIN_LINK },
    ],
  }),
  botMessage('pv-3', {
    type: MessageTemplateType.TEXT,
    quickReplies: [],
    text: '這是上個月放在 Channel Home 的那份（舊的下載卡，只會出現在較早的對話裡）。',
  }),
  botMessage('pv-4', {
    type: MessageTemplateType.ATTACHMENT,
    quickReplies: [],
    attachments: [
      { title: '合約草稿-v3.docx', text: 'Channel Home', defaultAction: CHANNEL_HOME, downloadAction: CHANNEL_HOME },
    ],
  }),
  botMessage('pv-5', {
    type: MessageTemplateType.BUTTON,
    quickReplies: [],
    title: '報價比較',
    text: '按鈕卡：前兩顆要靠連線，最後一顆是一般連結。',
    thumbnailImageUrl: '',
    imageAspectRatio: 'rectangle',
    imageSize: 'cover',
    imageBackgroundColor: '',
    defaultAction: PLAIN_LINK,
    buttons: [
      { label: '開啟比較表', action: OPEN_FILE },
      { label: '下載比較表', action: DOWNLOAD_FILE },
      { label: '各家公開價目表', action: PLAIN_LINK },
    ],
  }),
];

const PREVIEW = { botProviderEndpoint: 'skip' };
const CONNECTED = {
  botProviderEndpoint: `${typeof window !== 'undefined' ? window.location.origin : ''}/mock-asgard`,
};
const WIDE_THEME = { chatbot: { width: '100%', height: '100%' } };
const LOCALES: Locale[] = ['zh-TW', 'en-US', 'ja-JP'];
// Deliberately about no product: the SDK does not know why the host is in preview mode.
const CUSTOM_TOOLTIP = '這份紀錄是唯讀的，無法開啟這個項目';

export function PreviewModeCards(): ReactNode {
  const [locale, setLocale] = useState<Locale>('zh-TW');
  const [custom, setCustom] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  const hostProps = useCallback(
    (shell: string): Partial<ComponentProps<typeof Chatbot>> => ({
      locale,
      title: 'Agent Hub',
      initMessages: MESSAGES,
      disabledActionTooltip: custom ? CUSTOM_TOOLTIP : undefined,
      // The panel this route is not about: an arriving open-file card must not pull the aside open.
      autoRevealOnOpenFileCard: false,
      onSandboxOpenBrowser: (name: string) => setLog(prev => [...prev, `${shell} · open-browser → ${name}`]),
      onSandboxOpenFile: (name: string, path: string) => setLog(prev => [...prev, `${shell} · open-file → ${path}`]),
      onSandboxOpenFolder: (name: string, path: string) =>
        setLog(prev => [...prev, `${shell} · open-folder → ${path}`]),
    }),
    [locale, custom],
  );

  return (
    <DemoWrapper
      title="Preview-mode Action Cards (F-040)"
      description="預覽模式（botProviderEndpoint: 'skip'）沒有 channel 連線。要靠連線的動作卡照樣顯示，但 disabled：次要色、右側鎖頭、游標 not-allowed，點了沒反應；滑鼠移上去或 Tab 聚焦時顯示 tooltip。一般連結照常可開。最下面那個 shell 是同一段對話「有連線」的樣子，當對照組。"
    >
      <div className={styles.stack}>
        <div className={styles.controls}>
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
          <button
            type="button"
            className={custom ? styles.active : undefined}
            onClick={(): void => setCustom(on => !on)}
          >
            宿主覆寫 tooltip（disabledActionTooltip）
          </button>
          <span className={styles.note}>tooltip：「{custom ? CUSTOM_TOOLTIP : '依 locale 的預設文案'}」</span>
        </div>

        {/* Above the shells: anything below a 375×640 shell gets covered rather than pushed down. */}
        <div className={styles.log}>
          <div className={styles.log__head}>
            <span>宿主收到的回呼</span>
            <button type="button" onClick={(): void => setLog([])}>
              清空
            </button>
          </div>
          <p className={styles.note}>
            卡片「出現」時就會各記一次（arrival，不是點擊，不在本張範圍）。清空後再點：預覽模式的卡不該留下任何紀錄，有連線的卡照常記錄。
          </p>
          <ol data-testid="preview-mode-log">
            {log.map((entry, i) => (
              <li key={i}>{entry}</li>
            ))}
          </ol>
        </div>

        <div className={styles.stage}>
          <div className={styles.chatbotWide}>
            <div className={styles.sizeLabel}>預覽模式 · 寬版（消費端實際的掛法）</div>
            <div className={styles.wideBox}>
              <Chatbot
                {...hostProps('預覽·寬')}
                config={PREVIEW}
                customChannelId="preview-mode-cards-wide"
                theme={WIDE_THEME}
              />
            </div>
          </div>
          <div className={styles.chatbotNarrow}>
            <div className={styles.sizeLabel}>預覽模式 · 窄版 375×640（SDK 預設 theme）</div>
            <div className={styles.narrowBox}>
              <Chatbot {...hostProps('預覽·窄')} config={PREVIEW} customChannelId="preview-mode-cards-narrow" />
            </div>
          </div>
        </div>

        <div className={styles.stage}>
          <div className={styles.chatbotNarrow}>
            <div className={styles.sizeLabel}>對照組 · 有連線（/mock-asgard）—— 行為必須與改動前相同</div>
            <div className={styles.narrowBox}>
              <Chatbot {...hostProps('連線')} config={CONNECTED} customChannelId="preview-mode-cards-connected" />
            </div>
          </div>
        </div>
      </div>
    </DemoWrapper>
  );
}
