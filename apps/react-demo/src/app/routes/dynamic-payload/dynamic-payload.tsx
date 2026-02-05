import { ReactNode, useState, useCallback } from 'react';
import { DemoWrapper } from '../../components/demo-wrapper';
import styles from './dynamic-payload.module.scss';

interface PayloadLog {
  id: number;
  timestamp: Date;
  type: 'static' | 'dynamic';
  payload: Record<string, unknown>;
}

// 靜態 payload - 在模組載入時就固定
const staticPayload = {
  source: 'external-button',
  createdAt: Date.now(),
  randomId: 'static-id-12345',
};

// 動態 payload 函式 - 每次呼叫時產生新值
const createDynamicPayload = (): Record<string, unknown> => ({
  source: 'external-button',
  createdAt: Date.now(),
  randomId: Math.random().toString(36).slice(2, 10),
});

export function DynamicPayload(): ReactNode {
  const [payloadLogs, setPayloadLogs] = useState<PayloadLog[]>([]);

  const sendStaticPayload = useCallback((): void => {
    // 靜態 payload - 每次都是相同的值（模組載入時就固定了）
    setPayloadLogs(prev =>
      [
        {
          id: Date.now(),
          timestamp: new Date(),
          type: 'static' as const,
          payload: staticPayload,
        },
        ...prev,
      ].slice(0, 10),
    );
  }, []);

  const sendDynamicPayload = useCallback((): void => {
    // 動態 payload - 每次呼叫時產生新值
    const payload = createDynamicPayload();

    setPayloadLogs(prev =>
      [
        {
          id: Date.now(),
          timestamp: new Date(),
          type: 'dynamic' as const,
          payload,
        },
        ...prev,
      ].slice(0, 10),
    );
  }, []);

  const clearLogs = (): void => {
    setPayloadLogs([]);
  };

  return (
    <DemoWrapper
      title="Dynamic Payload"
      description="Compare static vs dynamic payload in sendMessage. Dynamic payload uses a lambda function that executes at send time."
    >
      <div className={styles.controls}>
        <div className={styles.section}>
          <h3>Send Message</h3>
          <p className={styles.sectionDesc}>
            Click buttons to simulate sending messages with different payload types. Watch the payload logs to see the
            difference.
          </p>
          <div className={styles.buttonGroup}>
            <button className={`${styles.sendButton} ${styles.static}`} onClick={sendStaticPayload}>
              Static Payload
            </button>
            <button className={`${styles.sendButton} ${styles.dynamic}`} onClick={sendDynamicPayload}>
              Dynamic Payload
            </button>
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.header}>
            <h3>Payload Logs</h3>
            {payloadLogs.length > 0 && (
              <button className={styles.clearButton} onClick={clearLogs}>
                Clear
              </button>
            )}
          </div>

          {payloadLogs.length === 0 ? (
            <div className={styles.empty}>
              <p>No payloads sent yet.</p>
              <p className={styles.hint}>Click the buttons above to send messages with payload.</p>
            </div>
          ) : (
            <div className={styles.logs}>
              {payloadLogs.map(log => (
                <div key={log.id} className={styles.logEntry} data-type={log.type}>
                  <div className={styles.logHeader}>
                    <span className={`${styles.payloadType} ${styles[log.type]}`}>
                      {log.type === 'static' ? 'Static' : 'Dynamic'}
                    </span>
                    <span className={styles.timestamp}>{log.timestamp.toLocaleTimeString()}</span>
                  </div>
                  <pre className={styles.payload}>{JSON.stringify(log.payload, null, 2)}</pre>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={styles.section}>
          <h3>Code Example</h3>
          <pre className={styles.code}>
            {`// Static payload - 值在定義時就固定
sendMessage({
  text: 'Hello',
  payload: {
    createdAt: Date.now(),  // 固定值
    randomId: 'abc123',
  },
});

// Dynamic payload - 值在發送時才產生
sendMessage({
  text: 'Hello',
  payload: () => ({
    createdAt: Date.now(),  // 每次發送時重新計算
    randomId: Math.random().toString(36).slice(2),
  }),
});`}
          </pre>
        </div>
      </div>

      <div className={styles.explanation}>
        <h3>Why Dynamic Payload?</h3>
        <div className={styles.comparisonTable}>
          <div className={styles.comparisonRow}>
            <div className={styles.comparisonLabel}></div>
            <div className={styles.comparisonHeader}>Static Payload</div>
            <div className={styles.comparisonHeader}>Dynamic Payload (Lambda)</div>
          </div>
          <div className={styles.comparisonRow}>
            <div className={styles.comparisonLabel}>計算時機</div>
            <div className={styles.comparisonCell}>值在定義時就固定</div>
            <div className={styles.comparisonCell}>值在發送時才產生</div>
          </div>
          <div className={styles.comparisonRow}>
            <div className={styles.comparisonLabel}>適合場景</div>
            <div className={styles.comparisonCell}>固定資料</div>
            <div className={styles.comparisonCell}>動態資料（時間戳、隨機 ID）</div>
          </div>
          <div className={styles.comparisonRow}>
            <div className={styles.comparisonLabel}>多次發送</div>
            <div className={styles.comparisonCell}>payload 相同</div>
            <div className={styles.comparisonCell}>payload 都不同</div>
          </div>
        </div>
      </div>
    </DemoWrapper>
  );
}
