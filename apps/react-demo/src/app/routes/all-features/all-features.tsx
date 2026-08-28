import { ReactNode, useState } from 'react';
import { Chatbot } from '@asgard-js/react';
import '@asgard-js/react/style';
import { DemoWrapper } from '../../components/demo-wrapper';
import { SHOWCASE_THEME_PRESETS } from '../../components/showcase-theme-presets';
import styles from './all-features.module.scss';

// All-features showcase — one real <Chatbot> whose mock (customChannelId `all-features-demo`) streams
// every roadmap feature in a single run. On mount the F-015 gate hits GET /channel/metadata → 404 →
// The mount opening turn → the mock replays the whole showcase, so loading the page = watch everything stream live.
const config = {
  botProviderEndpoint: `${typeof window !== 'undefined' ? window.location.origin : ''}/mock-asgard`,
};

type Locale = 'zh-TW' | 'en-US' | 'ja-JP';
const LOCALES: Locale[] = ['zh-TW', 'en-US', 'ja-JP'];

// Maps each visible piece of the running chatbot to the feature it demonstrates.
const LEGEND: { area: string; feat: string }[] = [
  { area: '頂端標題列（進房後淡入、中途換新）', feat: 'F-016/F-017 channel title' },
  { area: '進房先打 GET /channel/metadata 再決定 restore/reset', feat: 'F-015 join-init gate' },
  { area: '💭 Thinking… → 收合「Thought for a moment」', feat: 'F-001 thinking' },
  { area: '交界（thread↔輸入）的流動進度線、run 期間禁輸入', feat: 'F-003 run indicator' },
  { area: '右下角浮出的「Sandbox 啟動中」冷啟動 HUD（撐過 1s 才浮出、ready 後收尾淡出）', feat: 'F-018 sandbox HUD' },
  { area: 'tool-call 圖示 + label（Read/Write/Bash/Skill…）', feat: 'F-004 variants' },
  { area: '切 locale → 工具 label / 摘要即時翻譯', feat: 'F-005 i18n' },
  { area: 'tool-call 群組上的「N steps · Used… · Processed…」', feat: 'F-006 grouping/summary' },
  { area: 'Write/Edit 右側 +綠/−紅 行數', feat: 'F-007 diff' },
  { area: '點 tool-call 展開 Initial / Result', feat: 'F-008 expand' },
  { area: 'WebFetch 失敗轉紅（後端 isError）', feat: 'F-009 isError' },
  { area: '交界上方的 Task 清單（三態累積）', feat: 'F-010 / F-013 store' },
  { area: 'Task 之上的 Subagent 面板（child 工具、自動收合）', feat: 'F-012 / F-013 store' },
  { area: '串流組裝（缺 start / 遲到 delta 不壞）', feat: 'F-011 / F-014 kernel' },
];

export function AllFeaturesRoute(): ReactNode {
  const [locale, setLocale] = useState<Locale>('zh-TW');
  const [runKey, setRunKey] = useState(0);
  const [themeIdx, setThemeIdx] = useState(0);

  // Theme changes re-render live (no remount → the run isn't replayed).
  const theme = SHOWCASE_THEME_PRESETS[themeIdx].config;

  return (
    <DemoWrapper
      title="All-Features Showcase (F-001 ~ F-018)"
      description="一個真正的 <Chatbot> —— 進房（mount）就用 mock 串出這次 roadmap 做的全部功能：thinking、run 指示、tool-call 各 variant / 分組 / diff / 展開 / isError、Task 面板、Subagent 面板、channel title 動態更新，最後組出 markdown 答案。切 locale 觀察 i18n、按「重新進房」重播整段。其他各功能的獨立 demo route 不受影響。"
    >
      <div className={styles.controls}>
        <button type="button" className={styles.replay} onClick={() => setRunKey(k => k + 1)}>
          ↻ 重新進房（重播整段）
        </button>

        <div className={styles.localeRow}>
          <span className={styles.localeLabel}>locale (F-005):</span>
          {LOCALES.map(l => (
            <button
              key={l}
              type="button"
              className={l === locale ? styles.localeActive : styles.locale}
              onClick={() => setLocale(l)}
            >
              {l}
            </button>
          ))}
        </div>

        <div className={styles.localeRow}>
          <span className={styles.localeLabel}>theme:</span>
          {SHOWCASE_THEME_PRESETS.map((p, i) => (
            <button
              key={p.name}
              type="button"
              className={i === themeIdx ? styles.localeActive : styles.locale}
              onClick={() => setThemeIdx(i)}
            >
              {p.name}
            </button>
          ))}
        </div>

        <ul className={styles.legend}>
          {LEGEND.map(item => (
            <li key={item.feat}>
              <span className={styles.feat}>{item.feat}</span>
              <span className={styles.area}>{item.area}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className={styles.chatbotContainer}>
        <Chatbot
          key={runKey}
          title="Asgard SDK · 全功能展示"
          config={config}
          customChannelId="all-features-demo"
          locale={locale}
          theme={theme}
          inputPlaceholder="展示串流中會停用；結束後可送訊息（會得到簡短回覆）…"
        />
      </div>
    </DemoWrapper>
  );
}
