import { ReactNode, useCallback, useRef, useState } from 'react';
import { ResetMode } from '@asgard-js/core';
import { Chatbot, ChatbotRef } from '@asgard-js/react';
import '@asgard-js/react/style';
import { DemoWrapper } from '../../components/demo-wrapper';
// Same controls / log / wide-and-narrow stage as the delete demo this one is the counterpart of.
import styles from '../delete-channel/delete-channel.module.scss';

// F-039 — `POST /channel/clear` and `<Chatbot resetMode>`.
//
// Still one reset button. The host picks what it means: 'delete' (default) takes the conversation and the
// channel's files; 'clear' takes the conversation only and keeps the Channel Home files. On screen the two
// look identical — busy, conversation clears, the agent greets — so the difference has to be read off the
// server: every reply here reports the mock's server-side turn count, clear / delete counters and the
// Channel Home file list. Each user turn leaves a file behind, the way an agent writes into `/work`.

const config = {
  botProviderEndpoint: `${typeof window !== 'undefined' ? window.location.origin : ''}/mock-asgard`,
};

type Locale = 'zh-TW' | 'en-US' | 'ja-JP';

interface Scenario {
  key: string;
  label: string;
  /** The wide shell's channel; the narrow one appends `-narrow` and the mock matches by prefix. */
  channelId: string;
  resetMode: ResetMode;
  showResetButton: boolean;
  note: string;
}

const SCENARIOS: Scenario[] = [
  {
    key: 'clear',
    label: "① resetMode='clear'：檔案留著",
    channelId: 'clear-channel-demo',
    resetMode: 'clear',
    showResetButton: true,
    note:
      '送幾則訊息（每則會在 /work 多一個 note-N.md），再按標題列的重新整理圖示 —— tooltip 是「清除對話（保留檔案）」。' +
      'Network 先出去一發 POST /channel/clear（204），成功之後才送 action=NONE 開場。' +
      '開場回覆裡：對話輪數歸零、被清除次數 +1，而 Channel Home 的檔案一個都沒少。',
  },
  {
    key: 'delete',
    label: "② 對照 resetMode='delete'（預設）",
    channelId: 'clear-channel-contrast-demo',
    resetMode: 'delete',
    showResetButton: true,
    note:
      '一樣的操作，但沒設 resetMode（＝預設 delete）：tooltip 是「重設對話」，出去的是 DELETE /channel。' +
      '畫面流程跟 ① 一模一樣，差別只在開場回覆 —— Channel Home 變成空的。',
  },
  {
    key: 'fail',
    label: '③ clear 失敗：畫面原封不動',
    channelId: 'clear-channel-fail-demo',
    resetMode: 'clear',
    showResetButton: true,
    note:
      'mock 讓這個 channel 的 POST /channel/clear 回 500。按 reset：對話一則都不會少、沒有開場 turn' +
      '（Network 只有那一發失敗的 clear），錯誤走 onSseError 記到下方面板。',
  },
  {
    key: 'slow',
    label: '④ 慢速 clear：按鈕全程 busy',
    channelId: 'clear-channel-slow-demo',
    resetMode: 'clear',
    showResetButton: true,
    note:
      '後端要等活著的 Sandbox 停掉才回（實際上限約 45 秒），mock 壓成 6 秒。這段期間重新整理圖示一直轉、再按沒反應，' +
      '送出鈕也不能按 —— 跟 delete 模式用的是同一個 isResetting。',
  },
  {
    key: 'hidden',
    label: '⑤ showResetButton={false}',
    channelId: 'clear-channel-hidden-demo',
    resetMode: 'clear',
    showResetButton: false,
    note:
      '標題列沒有重新整理圖示（關閉鈕還在）。按鈕藏起來不影響程式呼叫：下方按鈕呼叫 resetChannel()，' +
      '照樣依 resetMode 走 clear → 開場。',
  },
  {
    key: 'raw',
    label: '⑥ 原始 clearChannel()',
    channelId: 'clear-channel-raw-demo',
    resetMode: 'delete',
    showResetButton: true,
    note:
      'Workbench 這類自己排流程的宿主用這支：只清後端，不開場、畫面上的對話刻意不動（這個 shell 的 resetMode 是預設 delete，' +
      '原始 clearChannel() 不看它）。按下方按鈕後再送一則訊息，回覆會顯示對話輪數已歸零、檔案都還在。',
  },
];

const LOCALES: Locale[] = ['zh-TW', 'en-US', 'ja-JP'];

const WIDE_THEME = { chatbot: { width: '100%', height: '100%' } };

type LogEntry = { at: string; text: string };

export function ClearChannelRoute(): ReactNode {
  const [scenario, setScenario] = useState<Scenario>(SCENARIOS[0]);
  const [locale, setLocale] = useState<Locale>('zh-TW');
  const [log, setLog] = useState<LogEntry[]>([]);
  const [running, setRunning] = useState(false);
  const wideRef = useRef<ChatbotRef>(null);

  const append = useCallback((text: string): void => {
    setLog(entries => [...entries, { at: new Date().toLocaleTimeString('zh-TW', { hour12: false }), text }]);
  }, []);

  const onSseError = useCallback(
    (error: unknown): void => {
      append(`onSseError：${error instanceof Error ? error.message : String(error)}`);
    },
    [append],
  );

  // Scenario ⑤ — the button is hidden, the programmatic reset is not.
  const runProgrammaticReset = useCallback((): void => {
    const context = wideRef.current?.serviceContext;

    if (!context?.resetChannel) {
      append('resetChannel：serviceContext 還沒就緒');

      return;
    }

    append('resetChannel() —— 依 resetMode=clear：POST /channel/clear → 開場');
    context.resetChannel();
  }, [append]);

  // Scenario ⑥ — the raw call a host with its own reset flow uses.
  const runRawClear = useCallback(async (): Promise<void> => {
    const context = wideRef.current?.serviceContext;

    if (!context?.clearChannel) {
      append('clearChannel：serviceContext 還沒就緒');

      return;
    }

    setRunning(true);
    try {
      append('clearChannel() —— 只清後端，畫面上的對話刻意不動、也不開場');
      await context.clearChannel();
      append('clearChannel() 完成：再送一則訊息看伺服器端的輪數與檔案');
    } catch (error) {
      append(`clearChannel() 失敗：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setRunning(false);
    }
  }, [append]);

  const chatbotProps = {
    title: '清除對話展示',
    config,
    locale,
    resetMode: scenario.resetMode,
    showResetButton: scenario.showResetButton,
    inputPlaceholder: '送幾則訊息，再按標題列的重新整理',
    onSseError,
  };

  return (
    <DemoWrapper
      title="Clear Channel + resetMode (F-039)"
      description="同一顆 reset 鈕，兩種語意由宿主選：resetMode='delete'（預設）連檔案一起刪，'clear' 只清對話、Channel Home 檔案留著。畫面上兩者流程完全相同，差別要看伺服器端 —— 每則回覆都會報出 mock 的對話輪數、清除／刪除次數與 /work 檔案清單。"
    >
      <div className={styles.stack}>
        <div className={styles.controls}>
          {SCENARIOS.map(s => (
            <button
              key={s.key}
              type="button"
              className={scenario.key === s.key ? styles.buttonActive : styles.button}
              onClick={(): void => setScenario(s)}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className={styles.controls}>
          {LOCALES.map(l => (
            <button
              key={l}
              type="button"
              className={locale === l ? styles.buttonActive : styles.button}
              onClick={(): void => setLocale(l)}
            >
              {l}
            </button>
          ))}
        </div>
        <p className={styles.note}>{scenario.note}</p>

        {scenario.key === 'hidden' && (
          <div className={styles.hostBar}>
            <button type="button" className={styles.primary} onClick={runProgrammaticReset}>
              呼叫 resetChannel()
            </button>
            <span className={styles.hostHint}>打在寬版那個 shell 上。</span>
          </div>
        )}

        {scenario.key === 'raw' && (
          <div className={styles.hostBar}>
            <button
              type="button"
              className={styles.primary}
              disabled={running}
              onClick={(): void => void runRawClear()}
            >
              {running ? '執行中…' : '呼叫 clearChannel()'}
            </button>
            <span className={styles.hostHint}>打在寬版那個 shell 上；Network 只會有一發 POST /channel/clear。</span>
          </div>
        )}

        <div className={styles.logPanel}>
          <div className={styles.logHead}>
            <span>事件紀錄</span>
            <button type="button" className={styles.button} onClick={(): void => setLog([])}>
              清除
            </button>
          </div>
          {log.length === 0 ? (
            <div className={styles.logEmpty}>（還沒有事件 —— clear 失敗與宿主呼叫會記在這裡）</div>
          ) : (
            <ul className={styles.logList}>
              {log.map((entry, index) => (
                <li key={`${entry.at}-${index}`}>
                  <span className={styles.logTime}>{entry.at}</span>
                  {entry.text}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={styles.stage}>
          <div className={styles.chatbotWide}>
            <div className={styles.sizeLabel}>寬版 —— 消費端（Mimir / Sindri / Odin）實際的掛法</div>
            <div className={styles.wideBox}>
              <Chatbot
                ref={wideRef}
                key={`${scenario.key}-wide`}
                customChannelId={scenario.channelId}
                theme={WIDE_THEME}
                {...chatbotProps}
              />
            </div>
          </div>

          <div className={styles.chatbotNarrow}>
            <div className={styles.sizeLabel}>窄版 375×640 —— SDK 預設 theme</div>
            <div className={styles.narrowBox}>
              <Chatbot
                key={`${scenario.key}-narrow`}
                customChannelId={`${scenario.channelId}-narrow`}
                {...chatbotProps}
              />
            </div>
          </div>
        </div>
      </div>
    </DemoWrapper>
  );
}
