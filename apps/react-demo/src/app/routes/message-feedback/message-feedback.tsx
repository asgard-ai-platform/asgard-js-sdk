import { ReactNode, useState } from 'react';
import { Chatbot, Locale } from '@asgard-js/react';
import '@asgard-js/react/style';
import { DemoWrapper } from '../../components/demo-wrapper';
import styles from './message-feedback.module.scss';

// F-033 — Good / Bad response feedback. Both shells mount on channels the mock says already exist, so the
// page opens through the rejoin path: the transcript it replays carries `asgard.message.feedback` frames,
// which is exactly what a reload looks like — the rated state comes back from the server, not from
// anything this page remembers (UC-058). The mock scripts are keyed on message ids and on the comment
// text (see `sse-mock.ts`), because the interesting paths are the ones a live bot will not produce on
// demand: a rating the server refuses, and a reply rated twice.

const config = {
  botProviderEndpoint: `${typeof window !== 'undefined' ? window.location.origin : ''}/mock-asgard`,
};

const SCRIPTS: { label: string; hint: string }[] = [
  {
    label: '點任一則回覆下方的 👍 / 👎',
    hint: 'modal：標題分正負向、說明欄選填且自動 focus、「同時告訴 AI」預設勾選、取消 / 送出；Esc 或點外側關閉（R7）',
  },
  {
    label: '不填字直接送出',
    hint: '該顆亮起，對話多一則 [Response Feedback: Good] 訊息，agent 當插曲簡短回應（R8 / R10 / UC-057）',
  },
  { label: '取消勾選「同時告訴 AI」再送出', hint: '只亮起、不送訊息，對話完全不受打擾（UC-057 Alt B）' },
  {
    label: '對第一則回覆（已是 👎）改點 👍',
    hint: '重播裡它被評了兩次（先 GOOD 後 BAD），所以開頭亮的是 👎；改評後 👍 亮、👎 熄（R11 / UC-059）',
  },
  {
    label: '評第三則回覆（標示「後端會拒絕」）',
    hint: 'POST 回 404：modal 不關、文字保留、顯示錯誤、不亮、不續送（R9 / UC-055 Alt A）',
  },
  { label: '說明欄打「爆」再送出', hint: 'POST 回 500 —— 同一條失敗路徑，看不同狀態碼一樣被接住' },
  { label: '重新整理頁面', hint: '已評狀態全部從重播回來 —— 沒有任何本地記憶（UC-058）' },
  { label: '送一句話、趁串流時看評價列', hint: 'run 進行中兩顆都 disabled，避免續送撞上忙碌中的頻道（R13）' },
];

const LOCALES: Locale[] = ['zh-TW', 'en-US', 'ja-JP'];

// Both sizes on screen at once (FRONTEND_RULE_COMMON §4.3+): the SDK's default theme is a 375×640 mobile
// widget, every consumer mounts it full-bleed, and a modal is exactly the thing that fits one and gets
// clipped in the other.
const WIDE_THEME = { chatbot: { width: '100%', height: '100%' } };

export function MessageFeedbackRoute(): ReactNode {
  const [locale, setLocale] = useState<Locale>('zh-TW');

  return (
    <DemoWrapper
      title="Message Feedback (F-033)"
      description="每一則 assistant 回覆下方有 👍 / 👎。評價會寫進後端 transcript（重整、換分頁、換裝置都看得到同一個狀態），並可選填原因。「同時告訴 AI」預設勾選：評價送出成功後，另外照常送一則以 [Response Feedback: Good|Bad] 開頭的普通訊息，agent 會把它當插曲、回應完繼續原本的話題。後端 append-only、最新一筆為準、v1 沒有取消評價。"
    >
      <div className={styles.stack}>
        <div className={styles.legend}>
          <div className={styles.legend__title}>走查腳本</div>
          <ol className={styles.scripts}>
            {SCRIPTS.map(script => (
              <li key={script.label}>
                <strong>{script.label}</strong>
                <span>{script.hint}</span>
              </li>
            ))}
          </ol>
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
            <span className={styles.localeHint}>
              按鈕 aria-label、tooltip、modal 全部文案跟著切；重播的訊息內容是後端資料，不翻譯。
            </span>
          </div>
        </div>

        <div className={styles.stage}>
          <div className={styles.chatbotWide}>
            <div className={styles.sizeLabel}>寬版 —— 消費端（Mimir / Sindri / Odin）實際的掛法</div>
            <div className={styles.wideBox}>
              <Chatbot
                title="營運數據助理"
                config={config}
                customChannelId="message-feedback-demo"
                inputPlaceholder="輸入你的問題"
                locale={locale}
                theme={WIDE_THEME}
                enableFeedback
              />
            </div>
          </div>

          <div className={styles.chatbotNarrow}>
            <div className={styles.sizeLabel}>窄版 375×640 —— SDK 預設 theme</div>
            <div className={styles.narrowBox}>
              <Chatbot
                title="營運數據助理"
                config={config}
                customChannelId="message-feedback-demo-narrow"
                inputPlaceholder="輸入你的問題"
                locale={locale}
                enableFeedback
              />
            </div>
          </div>
        </div>
      </div>
    </DemoWrapper>
  );
}
