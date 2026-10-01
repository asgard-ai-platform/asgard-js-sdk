import { ReactNode, useCallback, useMemo, useState } from 'react';
import { Chatbot, useToolCallConsentQueue } from '@asgard-js/react';
import { ToolCallConsentAnswer } from '@asgard-js/core';
import '@asgard-js/react/style';
import { DemoWrapper } from '../../components/demo-wrapper';
import styles from './tool-call-consent-custom.module.scss';

const WIDE_THEME = { chatbot: { width: '100%', height: '100%' } };

interface LogEntry {
  id: number;
  kind: 'info' | 'reply' | 'error';
  text: string;
}

/**
 * asgard-freyr-pm#901 — what a host renders instead of the built-in modal: an in-panel card above the
 * composer offering only two of the three answers (Freyr's product rule, not the SDK's).
 */
function HostConsentCard(): ReactNode {
  const { pendingCall, currentIndex, totalCount, decide } = useToolCallConsentQueue();

  if (!pendingCall) return null;

  return (
    <div className={styles.card} role="group" aria-label="Tool call approval">
      <div>
        Allow <strong>{pendingCall.reason || pendingCall.toolName}</strong>?
      </div>
      <div className={styles.cardMeta}>
        {pendingCall.toolsetName}/{pendingCall.toolName} · {currentIndex}/{totalCount} · {pendingCall.toolCallId}
      </div>
      <div className={styles.cardActions}>
        <button type="button" onClick={(): void => decide({ result: 'ALLOW_ONCE' })}>
          Allow once
        </button>
        <button type="button" onClick={(): void => decide({ result: 'DENY_ONCE', denyReason: '' })}>
          Deny
        </button>
      </div>
    </div>
  );
}

const renderHostConsentCard = (): ReactNode => <HostConsentCard />;

export function ToolCallConsentCustomDemo(): ReactNode {
  const endpoint = import.meta.env.VITE_CONSENT_BOT_PROVIDER_ENDPOINT;
  const apiKey = import.meta.env.VITE_CONSENT_API_KEY;

  const [log, setLog] = useState<LogEntry[]>([]);

  const pushLog = useCallback((kind: LogEntry['kind'], text: string) => {
    setLog(prev => [...prev, { id: prev.length, kind, text }]);
  }, []);

  const replyLogger = useCallback(
    (shell: string) =>
      (answers: ToolCallConsentAnswer[]): void => {
        pushLog(
          'reply',
          `[${shell}] onToolCallConsentReply · ${answers.map(a => `${a.toolCallId}:${a.result}`).join(', ')}`,
        );
      },
    [pushLog],
  );
  const onWideReply = useMemo(() => replyLogger('wide'), [replyLogger]);
  const onNarrowReply = useMemo(() => replyLogger('narrow'), [replyLogger]);

  const handleSseError = useCallback(
    (error: unknown) => pushLog('error', `onSseError · ${error instanceof Error ? error.message : String(error)}`),
    [pushLog],
  );

  const config = useMemo(() => ({ botProviderEndpoint: endpoint, apiKey, debugMode: true }), [endpoint, apiKey]);

  if (!endpoint || !apiKey) {
    return (
      <DemoWrapper title="Tool Call Consent — custom UI">
        <div>
          Missing env vars. Set <code>VITE_CONSENT_BOT_PROVIDER_ENDPOINT</code> and <code>VITE_CONSENT_API_KEY</code> in{' '}
          <code>apps/react-demo/.env</code>.
        </div>
      </DemoWrapper>
    );
  }

  return (
    <DemoWrapper
      title="Tool Call Consent — custom UI"
      description='toolCallConsent="off" mounts no built-in modal; the card above the composer is the host’s own, rendered from useToolCallConsentQueue().'
    >
      <div className={styles.stack}>
        <div className={styles.legend}>
          <ol>
            <li>Send a message that triggers tool calls (e.g. “Find movies about universe and animals”).</li>
            <li>The approval card appears above the composer — no full-screen dialog, the page keeps scrolling.</li>
            <li>
              Answer with <strong>Allow once</strong> or <strong>Deny</strong>; the run resumes and the reply is logged
              below.
            </li>
          </ol>
        </div>

        <div className={styles.log}>
          <div className={styles.logHead}>
            <span>consent log</span>
            <button type="button" onClick={(): void => setLog([])}>
              Clear
            </button>
          </div>
          {log.length === 0 && <div>// replies will appear here</div>}
          {log.map(entry => (
            <div
              key={entry.id}
              className={
                entry.kind === 'reply' ? styles.logReply : entry.kind === 'error' ? styles.logError : undefined
              }
            >
              {entry.text}
            </div>
          ))}
        </div>

        <div className={styles.stage}>
          <div className={styles.chatbotWide}>
            <div className={styles.sizeLabel}>Wide — how consumers mount it</div>
            <div className={styles.wideBox}>
              <Chatbot
                title="Consent Bot"
                config={config}
                customChannelId="tool-call-consent-custom-demo"
                theme={WIDE_THEME}
                toolCallConsent="off"
                renderComposerAbove={renderHostConsentCard}
                onToolCallConsentReply={onWideReply}
                onSseError={handleSseError}
              />
            </div>
          </div>

          <div className={styles.chatbotNarrow}>
            <div className={styles.sizeLabel}>Narrow 375×640 — SDK default theme</div>
            <div className={styles.narrowBox}>
              <Chatbot
                title="Consent Bot"
                config={config}
                customChannelId="tool-call-consent-custom-demo-narrow"
                toolCallConsent="off"
                renderComposerAbove={renderHostConsentCard}
                onToolCallConsentReply={onNarrowReply}
                onSseError={handleSseError}
              />
            </div>
          </div>
        </div>
      </div>
    </DemoWrapper>
  );
}
