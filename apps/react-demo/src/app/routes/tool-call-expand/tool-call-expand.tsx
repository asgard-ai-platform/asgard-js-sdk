import { ReactNode, useState } from 'react';
import { ToolCallGroup, ToolCallItemData, Locale } from '@asgard-js/react';
import '@asgard-js/react/style';
import { DemoWrapper } from '../../components/demo-wrapper';
import styles from './tool-call-expand.module.scss';

// F-008 — the expanded panel (Initial + Result JsonViewers) with localized section titles. Rendered via
// ToolCallGroup directly so we can also show a no-content item (no expand chevron) — the SDK's
// toolCallToItemData always fills `initial`, so a no-content case can't arrive through a real Chatbot.
const ITEMS: ToolCallItemData[] = [
  {
    id: 'with-content',
    label: 'Wrote report.html',
    status: 'completed',
    variant: 'write',
    initial: { toolsetName: '', toolName: 'Write', parameter: { file_path: '/app/report.html' } },
    result: { output: 'File created at /app/report.html' },
  },
  {
    id: 'no-content',
    label: '無 Initial / Result 的工具（不可展開、無箭頭）',
    status: 'completed',
    variant: 'generic',
  },
];

const LOCALES: Locale[] = ['en-US', 'ja-JP', 'zh-TW'];

export function ToolCallExpand(): ReactNode {
  const [locale, setLocale] = useState<Locale>('en-US');

  return (
    <DemoWrapper
      title="Tool-Call Expanded Content (F-008)"
      description="第一筆有 Initial/Result → 可展開（chevron），展開顯示兩個 JsonViewer，標題「Initial / Result」走 i18n（英/日/中）。第二筆沒有內容 → 不顯示展開箭頭。切 locale 看標題換語言。"
    >
      <div className={styles.controls}>
        <div className={styles.controls__title}>locale</div>
        {LOCALES.map(l => (
          <button
            key={l}
            type="button"
            className={locale === l ? `${styles.button} ${styles['button--active']}` : styles.button}
            onClick={() => setLocale(l)}
          >
            {l}
          </button>
        ))}
        <div className={styles.controls__hint}>展開第一筆看 Initial / Result 標題</div>
      </div>

      <div className={styles.groupContainer}>
        {/* Items are all completed; pin it open (opt out of auto-collapse) so the expand demo stays visible. */}
        <ToolCallGroup title="Tool-Call Expand Demo" items={ITEMS} defaultExpanded locale={locale} />
      </div>
    </DemoWrapper>
  );
}
