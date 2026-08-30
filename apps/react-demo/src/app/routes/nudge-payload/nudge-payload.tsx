import { ReactNode, useCallback, useRef, useState } from 'react';
import { Chatbot, ChatbotRef, SendMessageParams } from '@asgard-js/react';
import '@asgard-js/react/style';
import { DemoWrapper } from '../../components/demo-wrapper';
import styles from './nudge-payload.module.scss';

// BUG-004 — `nudge` was the only outbound that never collected payload: it skipped `resolvePayload()` in
// core and `onBeforeSendMessage` in react, so a consumer had no way at all to attach one. That matters
// because the backend rebuilds `prevPayload` from *this* turn's incoming payload and never carries the
// previous turn's over — a payload-less NUDGE wakes a sandbox with no subagents and the default working
// directory, silently, since those blueprint expressions all have falsy fallbacks.
//
// This route points at the real dev bot provider so the NUDGE actually goes on the wire: open DevTools →
// Network → `message/sse` and read the request body. That body is the thing under test, not the response
// — the backend still rejects a NUDGE on a channel that has been chatted with (BUG-005 / asgard-sdk-pm#40,
// asgard-core side), so an error frame coming back is expected here and is not this fix's business.
const SESSION_PAYLOAD = {
  agent_hub: {
    agent_names: ['researcher', 'writer'],
    working_directory: '/work/demo-project',
  },
};

const EXPECTED = [
  '「Nudge」→ Network 的 message/sse request body 是 action=NUDGE、text=""，且帶有 payload.agent_hub（來自 onBeforeSendMessage）',
  '「Nudge（帶 turn 級 payload）」→ body 的 payload 同時有 agent_hub 與 turn:"explicit-override"（callback 看得到呼叫端傳的值，可自行合併）',
  '「送一則訊息」→ 同一個 payload 也在，證明 nudge 與 sendMessage 走的是同一條收集路徑',
  '下方 log 顯示 onBeforeSendMessage 在 nudge 時確實被呼叫，且 text 為空字串',
];

interface CallLog {
  id: number;
  label: string;
  incoming: SendMessageParams;
  outgoing: Record<string, unknown> | undefined;
}

interface ErrorLog {
  id: number;
  text: string;
}

export function NudgePayload(): ReactNode {
  const chatbotRef = useRef<ChatbotRef>(null);
  const logId = useRef(0);
  const [logs, setLogs] = useState<CallLog[]>([]);
  const [errors, setErrors] = useState<ErrorLog[]>([]);

  const handleBeforeSendMessage = useCallback((params: SendMessageParams): SendMessageParams => {
    const caller = typeof params.payload === 'function' ? params.payload() : params.payload ?? {};
    const payload = { ...SESSION_PAYLOAD, ...caller };

    logId.current += 1;
    const id = logId.current;

    setLogs(prev =>
      [
        {
          id,
          label: params.text ? `sendMessage("${params.text}")` : 'textless outbound (nudge / consent)',
          incoming: params,
          outgoing: payload,
        },
        ...prev,
      ].slice(0, 8),
    );

    return { ...params, payload };
  }, []);

  const nudge = useCallback((payload?: Record<string, unknown>): void => {
    // The backend rejects this turn until BUG-005 lands, and the SDK surfaces that as a rejected promise —
    // swallow it so the demo does not raise an unhandled rejection while the request body is inspected.
    void chatbotRef.current?.serviceContext?.nudge?.(payload)?.catch(() => undefined);
  }, []);

  const clearLogs = useCallback((): void => setLogs([]), []);
  const clearErrors = useCallback((): void => setErrors([]), []);

  // asgard-js-sdk#459 §1 — a nudge is invisible on screen by design, so before the fix a failed one was
  // invisible everywhere: `use-channel` never gave core an `onSseError` to call. Logging it here is what
  // makes the fix visible; the dev backend already refuses this turn (see `nudge` above), so pressing the
  // button is enough to exercise it.
  const pushError = useCallback((text: string): void => {
    logId.current += 1;
    const id = logId.current;

    setErrors(prev => [{ id, text }, ...prev].slice(0, 8));
  }, []);

  const handleSseError = useCallback(
    (error: unknown): void => {
      pushError(`onSseError · ${error instanceof Error ? error.message : JSON.stringify(error)}`);
    },
    [pushError],
  );

  const handleAuthError = useCallback(
    (error: { isAuthError: boolean; isBotProviderError: boolean }): void => {
      pushError(`onAuthError · isAuthError=${error.isAuthError} isBotProviderError=${error.isBotProviderError}`);
    },
    [pushError],
  );

  return (
    <DemoWrapper
      title="NUDGE carries payload (BUG-004)"
      description="驗證 action=NUDGE 這條 outbound 現在會跟 sendMessage / resetChannel / consent 回覆一樣收集 payload。打的是真的 dev bot provider，請開 DevTools → Network 看 message/sse 的 request body。"
    >
      <div className={styles.controls}>
        <div className={styles.section}>
          <div className={styles.sectionTitle}>預期</div>
          <ol className={styles.list}>
            {EXPECTED.map(e => (
              <li key={e}>{e}</li>
            ))}
          </ol>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionTitle}>Session payload（由 onBeforeSendMessage 注入）</div>
          <pre className={styles.code}>{JSON.stringify(SESSION_PAYLOAD, null, 2)}</pre>
          <div className={styles.buttons}>
            <button className={styles.button} onClick={(): void => nudge()}>
              Nudge
            </button>
            <button className={styles.button} onClick={(): void => nudge({ turn: 'explicit-override' })}>
              Nudge（帶 turn 級 payload）
            </button>
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionTitle}>onBeforeSendMessage 呼叫紀錄</div>
            {logs.length > 0 && (
              <button className={styles.button} onClick={clearLogs}>
                Clear
              </button>
            )}
          </div>
          {logs.length === 0 ? (
            <p className={styles.hint}>還沒有 outbound。按 Nudge 或在對話框送一則訊息。</p>
          ) : (
            <div className={styles.logs}>
              {logs.map(log => (
                <div key={log.id} className={styles.log}>
                  <div className={styles.logLabel}>{log.label}</div>
                  <pre className={styles.code}>
                    {JSON.stringify({ seen: log.incoming, returnedPayload: log.outgoing }, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionTitle}>onSseError / onAuthError 紀錄（#459 §1）</div>
            {errors.length > 0 && (
              <button className={styles.button} onClick={clearErrors}>
                Clear
              </button>
            )}
          </div>
          {errors.length === 0 ? (
            <p className={styles.hint}>
              還沒有錯誤。一個被拒絕的 nudge 會顯示在這裡（後端拒絕，或在 Network 層把 NUDGE 那發擋成 4xx）。
            </p>
          ) : (
            <div className={styles.logs}>
              {errors.map(entry => (
                <div key={entry.id} className={styles.log}>
                  <div className={styles.logLabel}>{entry.text}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className={styles.chatbotContainer}>
        <Chatbot
          ref={chatbotRef}
          title="Nudge payload demo"
          config={{ botProviderEndpoint: import.meta.env.VITE_SIMPLE_BOT_PROVIDER_ENDPOINT }}
          customChannelId="nudge-payload-demo"
          onBeforeSendMessage={handleBeforeSendMessage}
          onSseError={handleSseError}
          onAuthError={handleAuthError}
        />
      </div>
    </DemoWrapper>
  );
}
