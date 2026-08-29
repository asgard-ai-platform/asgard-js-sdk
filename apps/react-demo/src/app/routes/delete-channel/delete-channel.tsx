import { ReactNode, useCallback, useRef, useState } from 'react';
import { Chatbot, ChatbotRef } from '@asgard-js/react';
import '@asgard-js/react/style';
import { DemoWrapper } from '../../components/demo-wrapper';
import styles from './delete-channel.module.scss';

// F-032 — `DELETE /channel` and the retirement of `RESET_CHANNEL`.
//
// The reset button used to be one request that meant two things: delete the channel, and post the first
// message of the new conversation. Nothing could be attached to it — blobs belong to the channel that
// was live when they were uploaded, so the delete stripped them and the message's `blobIds` resolved to
// nothing, with no error anywhere. The two halves are separate calls now, and the SDK sends
// `RESET_CHANNEL` from no path at all.
//
// What is hard to see from the outside is whether a reset really reached the server: a browser that
// merely cleared its own transcript looks identical. So every reply here reads back the mock's
// server-side state — how many turns that channel has, and how many times it has been deleted.

const config = {
  botProviderEndpoint: `${typeof window !== 'undefined' ? window.location.origin : ''}/mock-asgard`,
};

interface Scenario {
  key: string;
  label: string;
  /** The wide shell's channel; the narrow one appends `-narrow` and the mock matches by prefix. */
  channelId: string;
  note: string;
}

const SCENARIOS: Scenario[] = [
  {
    key: 'reset',
    label: '① reset 按鈕：DELETE → NONE',
    channelId: 'delete-channel-demo',
    note:
      '進房時 metadata 回 404 → 開場那一發是 action=NONE、不刪任何東西（DevTools Network 裡看不到 DELETE）。' +
      '送幾則訊息後按標題列的重新整理圖示：先出去一發 DELETE /channel（204），成功之後才送 action=NONE 開場。' +
      '回覆會報出伺服器端的輪數與刪除次數 —— 輪數歸零、刪除次數 +1，才代表後端真的清乾淨了。',
  },
  {
    key: 'fail',
    label: '② DELETE 失敗：畫面必須原封不動',
    channelId: 'delete-channel-fail-demo',
    note:
      'mock 讓這個 channel 的 DELETE 回 500。按 reset：既有對話一則都不會少、也不會有任何開場 turn 送出' +
      '（Network 只有那一發失敗的 DELETE），錯誤走 onSseError 上報到下方面板。' +
      '「畫面清空了、後端還是舊對話」是這個拆分要防的唯一結果。',
  },
  {
    key: 'slow',
    label: '③ 慢速 teardown：按鈕要一直 busy',
    channelId: 'delete-channel-slow-demo',
    note:
      '後端若有活著的 Sandbox 會等它真的死掉才回（實際上限約 60 秒），mock 這裡壓成 6 秒。' +
      '按 reset 之後 isResetting 全程為 true：重新整理圖示轉圈、再按沒有反應，SDK 不會自己設一個更短的 timeout 先放棄。',
  },
  {
    key: 'host',
    label: '④ 宿主自排：刪 → 上傳 → 帶附件送出',
    channelId: 'delete-channel-host-demo',
    note:
      '這是 RESET_CHANNEL 做不到、而 deleteChannel() 打開的路。下方按鈕依序做三件事：' +
      'deleteChannel()（只刪，畫面上的對話刻意留著不動）→ client.uploadFile() 上傳一個小檔 → ' +
      'sendMessage({ blobIds }) 以 action=NONE 送出。回覆會列出收到的 blobId，證明附件沒有在刪除中蒸發。',
  },
];

const WIDE_THEME = { chatbot: { width: '100%', height: '100%' } };

type LogEntry = { at: string; text: string };

export function DeleteChannelRoute(): ReactNode {
  const [scenario, setScenario] = useState<Scenario>(SCENARIOS[0]);
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

  // Scenario ④ — the sequence a host runs itself, which is the whole reason `deleteChannel` is exposed.
  const runHostSequence = useCallback(async (): Promise<void> => {
    const context = wideRef.current?.serviceContext;

    if (!context?.deleteChannel || !context.sendMessage || !context.client) {
      append('宿主流程：serviceContext 還沒就緒');

      return;
    }

    setRunning(true);
    try {
      append('① deleteChannel() —— 只刪，畫面上的對話刻意不動');
      await context.deleteChannel();

      append('② uploadFile() —— 在「已經是新 channel」的狀態下上傳');
      const file = new File(['第三季毛利率 41.2%\n第四季預估 43.5%\n'], 'margins.txt', { type: 'text/plain' });
      const uploaded = await context.client.uploadFile(file, SCENARIOS[3].channelId);
      const blobId = uploaded.data[0]?.blobId;

      if (!blobId) throw new Error('上傳沒有回傳 blobId');

      append(`③ sendMessage({ blobIds: ['${blobId}'] }) —— action=NONE`);
      await context.sendMessage({ text: '這是刪除後的第一則訊息，附件應該還在', blobIds: [blobId] });
      append('完成：附件跟著新對話的第一則訊息一起送達');
    } catch (error) {
      append(`宿主流程失敗：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setRunning(false);
    }
  }, [append]);

  return (
    <DemoWrapper
      title="Delete Channel + RESET_CHANNEL 退場 (F-032)"
      description="「結束這段對話」現在是一個明確的 DELETE /channel：後端把進行中的 run、transcript、上傳過的檔案、Sandbox 全部釋放掉才回應。reset 按鈕因此變成兩步（先刪、成功才開場），而 SDK 從此不再送出 RESET_CHANNEL —— 那個動作把「刪掉」跟「送第一則訊息」綁在同一個請求裡，剛上傳的附件會在中間被刪掉、還不會報錯。"
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
        <p className={styles.note}>{scenario.note}</p>

        {scenario.key === 'host' && (
          <div className={styles.hostBar}>
            <button
              type="button"
              className={styles.primary}
              disabled={running}
              onClick={(): void => void runHostSequence()}
            >
              {running ? '執行中…' : '執行：刪 → 上傳 → 帶附件送出'}
            </button>
            <span className={styles.hostHint}>
              三步都打在寬版那個 shell 上；DevTools Network 可看到 DELETE / POST blob / POST message 的順序。
            </span>
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
            <div className={styles.logEmpty}>（還沒有事件 —— DELETE 失敗與宿主流程會記在這裡）</div>
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
                title="頻道刪除展示"
                config={config}
                customChannelId={scenario.channelId}
                inputPlaceholder="送幾則訊息，再按標題列的重新整理"
                theme={WIDE_THEME}
                onSseError={onSseError}
                enableUpload
              />
            </div>
          </div>

          <div className={styles.chatbotNarrow}>
            <div className={styles.sizeLabel}>窄版 375×640 —— SDK 預設 theme</div>
            <div className={styles.narrowBox}>
              <Chatbot
                key={`${scenario.key}-narrow`}
                title="頻道刪除展示"
                config={config}
                customChannelId={`${scenario.channelId}-narrow`}
                inputPlaceholder="送幾則訊息，再按標題列的重新整理"
                onSseError={onSseError}
                enableUpload
              />
            </div>
          </div>
        </div>
      </div>
    </DemoWrapper>
  );
}
