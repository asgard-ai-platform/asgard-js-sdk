import { ReactNode, useCallback, useMemo, useState } from 'react';
import type { LaunchedSandbox } from '@asgard-js/core';
import { SandboxBrowserPanel, useSandboxBrowserController, type Locale } from '@asgard-js/react';
import '@asgard-js/react/style';
import { DemoWrapper } from '../../components/demo-wrapper';
import { createMockBrowserTransport } from './browser-mock';
import styles from './sandbox-browser.module.scss';

// F-035 — the panel on a mock transport, at both widths side by side.
//
// What this route can and cannot prove is worth being blunt about. It exercises layout, the control-state
// visuals, the empty / connecting / error states, and the coordinate arithmetic (the mock is a real
// `MediaStream`, so the letterbox path is the production one). It cannot prove **input forwarding**: there
// is no X11 on the other end, so keysyms, modifier chords, IME output and stuck keys are all trivially
// "fine" here. That half is verified on `/neko-lab` against a real container, which is the only place
// those failures are visible at all.

const SANDBOXES: LaunchedSandbox[] = [
  {
    sandboxName: 'sbx-browser-demo',
    sandboxBlueprintName: 'browser',
    workingDirectory: '/home/agent',
    editorServerEnabled: false,
    browserEnabled: true,
  },
];

const LOCALES: Locale[] = ['en-US', 'zh-TW', 'ja-JP'];

const EMPTY_SANDBOXES: LaunchedSandbox[] = [{ ...SANDBOXES[0], browserEnabled: false }];

export function SandboxBrowserRoute(): ReactNode {
  const [locale, setLocale] = useState<Locale>('zh-TW');
  const [showEmpty, setShowEmpty] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  const onLog = useCallback((line: string): void => {
    setLog(previous => [...previous.slice(-60), line]);
  }, []);

  // One transport instance: the panel's connection effect depends on it, so rebuilding it every render
  // would reconnect the stream every render.
  const transport = useMemo(() => createMockBrowserTransport(onLog), [onLog]);

  // Two controllers, because the two shells are two independent panels.
  const wideController = useSandboxBrowserController({ open: true });
  const narrowController = useSandboxBrowserController({ open: true });

  const sandboxes = showEmpty ? EMPTY_SANDBOXES : SANDBOXES;

  return (
    <DemoWrapper
      title="Sandbox Browser (F-035)"
      description="Agent 推「瀏覽器接手」卡片時，SDK 自己接 WebRTC、自己畫、自己轉送鍵鼠，而不是開新分頁載入 Neko 的前端。這一頁用 mock transport（canvas captureStream，是真的 MediaStream），驗版面、控制權視覺、座標換算與各種狀態；輸入轉送要到 /neko-lab 接真容器才驗得到。"
    >
      <div className={styles.stack}>
        <div className={styles.legend}>
          <div className={styles.legendTitle}>看什麼</div>
          <ul>
            <li>
              預設是<strong>唯讀觀看</strong>：agent 持有控制權時畫面四邊有一圈很淡的 glow 在呼吸；按「接管操作」之後
              glow 收掉、換成一圈中性細邊 —— 兩個狀態必須在餘光就分得出來。
            </li>
            <li>
              接管後在驗證碼欄打字、貼上（控制列那顆按鈕）。<strong>clipboard/set 不該讓畫面有任何變化</strong>，
              control/paste 才會真的貼出字 —— 兩者的差別在下面的 log 看得到。
            </li>
            <li>把滑鼠移到畫面上下的黑邊：那裡不該送出任何事件（log 不會有東西）。</li>
            <li>兩個寬度並排：寬版是消費端實際的掛法，窄版是 SDK 預設的 375px widget。</li>
          </ul>
          <div className={styles.locales}>
            <span>locale：</span>
            {LOCALES.map(item => (
              <button
                type="button"
                key={item}
                className={locale === item ? styles.active : undefined}
                onClick={(): void => setLocale(item)}
              >
                {item}
              </button>
            ))}
            <button type="button" onClick={(): void => setShowEmpty(value => !value)}>
              {showEmpty ? '回到有瀏覽器的 sandbox' : '看空狀態（沒有 browserEnabled 的 sandbox）'}
            </button>
          </div>
        </div>

        <div className={styles.stage}>
          <div className={styles.column}>
            <div className={styles.sizeLabel}>寬版 —— 消費端（Mimir / Sindri / Odin）實際的掛法</div>
            <div className={styles.wideBox}>
              <SandboxBrowserPanel
                sandboxes={sandboxes}
                controller={wideController}
                transport={transport}
                locale={locale}
                onLog={onLog}
              />
            </div>
          </div>

          <div className={styles.column}>
            <div className={styles.sizeLabel}>窄版 375px —— SDK 預設 theme 的寬度</div>
            <div className={styles.narrowBox}>
              <SandboxBrowserPanel
                sandboxes={sandboxes}
                controller={narrowController}
                transport={transport}
                locale={locale}
              />
            </div>
          </div>
        </div>

        <div className={styles.log}>
          {log.length === 0 ? (
            <div className={styles.logEmpty}>（還沒有訊息）</div>
          ) : (
            log.map((line, index) => <div key={`${index}-${line}`}>{line}</div>)
          )}
        </div>
      </div>
    </DemoWrapper>
  );
}

export default SandboxBrowserRoute;
