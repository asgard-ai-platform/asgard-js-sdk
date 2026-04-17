import { ReactNode, useCallback, useMemo, useState } from 'react';
import { Chatbot } from '@asgard-js/react';
import { EventType, SseResponse } from '@asgard-js/core';
import '@asgard-js/react/style';
import clsx from 'clsx';
import { DemoWrapper } from '../../components/demo-wrapper';
import styles from './tool-call-consent.module.scss';

interface LogEntry {
  id: number;
  kind: 'info' | 'consent' | 'reply';
  text: string;
  time: string;
}

export function ToolCallConsentDemo(): ReactNode {
  const endpoint = import.meta.env.VITE_CONSENT_BOT_PROVIDER_ENDPOINT;
  const apiKey = import.meta.env.VITE_CONSENT_API_KEY;

  const [log, setLog] = useState<LogEntry[]>([]);

  const pushLog = useCallback((kind: LogEntry['kind'], text: string) => {
    setLog(prev => [
      ...prev,
      {
        id: prev.length,
        kind,
        text,
        time: new Date().toLocaleTimeString('en-US', { hour12: false }),
      },
    ]);
  }, []);

  const handleSseMessage = useCallback(
    (response: SseResponse<EventType>) => {
      if (response.eventType === EventType.TOOL_CALL_CONSENT) {
        const consent = response.fact.toolCallConsent;
        if (!consent) return;

        pushLog(
          'consent',
          `consent event received · processId=${consent.processId} · ${consent.pendingCalls.length} pendingCalls`,
        );
        consent.pendingCalls.forEach((c, idx) => {
          pushLog(
            'consent',
            `  [${idx}] ${c.toolsetName}/${c.toolName}  alreadyAllowed=${c.alreadyAllowed}  parameter=${JSON.stringify(
              c.parameter,
            )}`,
          );
        });
      }
    },
    [pushLog],
  );

  const config = useMemo(
    () => ({
      botProviderEndpoint: endpoint,
      apiKey,
    }),
    [endpoint, apiKey],
  );

  if (!endpoint || !apiKey) {
    return (
      <DemoWrapper title="Tool Call Consent">
        <div className={styles.hint}>
          Missing env vars. Set <code>VITE_CONSENT_BOT_PROVIDER_ENDPOINT</code> and <code>VITE_CONSENT_API_KEY</code> in{' '}
          <code>apps/react-demo/.env</code>.
        </div>
      </DemoWrapper>
    );
  }

  return (
    <DemoWrapper
      title="Tool Call Consent"
      description="Demonstrates the asgard.tool_call.consent SSE flow: the SDK queues pending tool calls and surfaces a modal for each one (Allow Once / Allow for This Chat / Deny)."
    >
      <div className={styles.layout}>
        <div className={styles.chatbotContainer}>
          <Chatbot
            title="Consent Bot"
            config={config}
            customChannelId="tool-call-consent-demo"
            onSseMessage={handleSseMessage}
          />
        </div>

        <div className={styles.sidePanel}>
          <h3>How to test</h3>
          <ol>
            <li>Send a message that triggers tool calls (e.g. "Find movies about universe and animals").</li>
            <li>
              When <code>asgard.tool_call.consent</code> arrives, a modal pops for each pending call.
            </li>
            <li>
              Try <strong>Allow Once</strong>, <strong>Allow for This Chat</strong>, or <strong>Deny</strong> (with an
              optional reason).
            </li>
            <li>
              Send another message to see how <code>alreadyAllowed=true</code> calls are auto-consented.
            </li>
          </ol>
          <div className={styles.hint}>
            Endpoint: <code>{endpoint}</code>
          </div>

          <div className={styles.logTitleRow}>
            <h3>SSE consent log</h3>
            <button type="button" className={styles.clearBtn} onClick={(): void => setLog([])}>
              Clear
            </button>
          </div>
          <div className={styles.log}>
            {log.length === 0 ? (
              <span className={styles.logEmpty}>// consent events will appear here</span>
            ) : (
              log.map(entry => (
                <div
                  key={entry.id}
                  className={clsx(
                    styles.logLine,
                    entry.kind === 'consent' && styles.logLineConsent,
                    entry.kind === 'reply' && styles.logLineReply,
                  )}
                >
                  [{entry.time}] {entry.text}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </DemoWrapper>
  );
}
