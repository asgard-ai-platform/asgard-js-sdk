import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { Chatbot, useAsgardContext, useToolCallConsentQueue } from '@asgard-js/react';
import { ToolCallConsentAnswer, ToolCallConsentResult } from '@asgard-js/core';
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
    <div className={styles.card} role="group" aria-label="工具使用授權">
      <div>
        允許使用「<strong>{pendingCall.reason || pendingCall.toolName}</strong>」？
      </div>
      <div className={styles.cardMeta}>
        {pendingCall.toolsetName}/{pendingCall.toolName} · {currentIndex}/{totalCount} · {pendingCall.toolCallId}
      </div>
      <div className={styles.cardActions}>
        <button type="button" onClick={(): void => decide({ result: 'ALLOW_ONCE' })}>
          僅此次允許
        </button>
        <button type="button" onClick={(): void => decide({ result: 'DENY_ONCE', denyReason: '' })}>
          拒絕
        </button>
      </div>
    </div>
  );
}

const renderHostConsentCard = (): ReactNode => <HostConsentCard />;

/**
 * The failure #901 reported: a host hides the built-in modal with CSS and answers through
 * `replyToolCallConsents` itself. The hidden modal used to stay mounted with the body scroll lock on.
 */
function BypassReplyButton(): ReactNode {
  const { pendingConsent, replyToolCallConsents } = useAsgardContext();

  return (
    <div className={styles.card}>
      <button
        type="button"
        disabled={!pendingConsent || !replyToolCallConsents}
        onClick={(): void => {
          if (!pendingConsent) return;

          void replyToolCallConsents?.(
            pendingConsent.pendingCalls.map(c => ({
              toolCallId: c.toolCallId,
              result: ToolCallConsentResult.ALLOW_ONCE,
              denyReason: '',
            })),
          );
        }}
      >
        繞過佇列直接回覆（{pendingConsent?.pendingCalls.length ?? 0} 筆全部僅此次允許）
      </button>
    </div>
  );
}

const renderBypassReplyButton = (): ReactNode => <BypassReplyButton />;

/** Live readout of `document.body.style.overflow` — what the consent modal locks. */
function BodyLockIndicator(): ReactNode {
  const [overflow, setOverflow] = useState(document.body.style.overflow);

  useEffect(() => {
    const observer = new MutationObserver(() => setOverflow(document.body.style.overflow));
    observer.observe(document.body, { attributes: true, attributeFilter: ['style'] });

    return (): void => observer.disconnect();
  }, []);

  return (
    <div className={overflow === 'hidden' ? styles.lockOn : styles.lockOff}>
      body overflow：{overflow === '' ? '（空）可捲動' : `${overflow} —— 被鎖住`}
    </div>
  );
}

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
  const onBypassReply = useMemo(() => replyLogger('bypass'), [replyLogger]);

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
            <li>開場那輪會一次要 4 個工具（或送出「找宇宙和動物的電影」之類的訊息）。</li>
            <li>授權卡片出現在輸入框正上方 —— 沒有全螢幕對話框，頁面照常可以捲動。</li>
            <li>
              按 <strong>僅此次允許</strong> 或 <strong>拒絕</strong>；run 會續跑，回覆記在下面的 log。
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
                locale="zh-TW"
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
                locale="zh-TW"
                toolCallConsent="off"
                renderComposerAbove={renderHostConsentCard}
                onToolCallConsentReply={onNarrowReply}
                onSseError={handleSseError}
              />
            </div>
          </div>
        </div>

        <div className={styles.bypass}>
          <div className={styles.sizeLabel}>
            重現 #901：預設 <code>&apos;builtin&apos;</code>、內建 modal 以 CSS 藏起來，由 host 直接回覆
          </div>
          <BodyLockIndicator />
          <div className={styles.bypassBox}>
            <Chatbot
              title="Consent Bot"
              config={config}
              customChannelId="tool-call-consent-custom-demo-bypass"
              locale="zh-TW"
              theme={WIDE_THEME}
              renderComposerAbove={renderBypassReplyButton}
              onToolCallConsentReply={onBypassReply}
              onSseError={handleSseError}
            />
          </div>
        </div>
      </div>
    </DemoWrapper>
  );
}
