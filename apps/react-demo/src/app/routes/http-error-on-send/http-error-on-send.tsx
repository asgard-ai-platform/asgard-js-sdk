import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { Chatbot, ChatbotRef } from '@asgard-js/react';
import { isHttpError } from '@asgard-js/core';
import '@asgard-js/react/style';
import { DemoWrapper } from '../../components/demo-wrapper';
import { createTextTemplateExample } from '../../mocks/messages';
import styles from './http-error-on-send.module.scss';

export function HttpErrorOnSendDemo(): ReactNode {
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [unhandledRejection, setUnhandledRejection] = useState<string | null>(null);
  const chatbotRef = useRef<ChatbotRef>(null);
  const initMessages = [createTextTemplateExample()];

  const handleSseError = useCallback((error: unknown): void => {
    if (isHttpError(error) && error.status === 429) {
      setToastMessage('用量已達上限，請稍後再試');
    }
  }, []);

  useEffect(() => {
    const listener = (event: PromiseRejectionEvent): void => {
      setUnhandledRejection(String(event.reason));
    };

    window.addEventListener('unhandledrejection', listener);

    return (): void => {
      window.removeEventListener('unhandledrejection', listener);
    };
  }, []);

  useEffect(() => {
    if (!toastMessage) return;

    const timer = setTimeout(() => setToastMessage(null), 5000);

    return (): void => {
      clearTimeout(timer);
    };
  }, [toastMessage]);

  const sendProgrammatically = useCallback(() => {
    chatbotRef.current?.serviceContext?.sendMessage?.({ text: 'hello', blobIds: [] });
  }, []);

  return (
    <DemoWrapper
      title="HTTP Error on Send"
      description="Reproduces Agent Hub's setup: autoResetChannel={false} + sendMessage triggering 429. Verifies onSseError fires and no unhandled rejection surfaces. Start the mock 429 server first: `node apps/react-demo/scripts/mock-429-server.js`."
    >
      <div className={styles.controls}>
        <button type="button" onClick={sendProgrammatically} className={styles.button}>
          Programmatic sendMessage
        </button>
        <span className={styles.hint}>或直接在下方輸入框送訊息</span>
      </div>

      <div className={styles.status}>
        <div>
          <strong>onSseError toast:</strong>{' '}
          <span className={toastMessage ? styles.ok : styles.pending}>{toastMessage ?? '（尚未觸發）'}</span>
        </div>
        <div>
          <strong>unhandled rejection:</strong>{' '}
          <span className={unhandledRejection ? styles.fail : styles.ok}>{unhandledRejection ?? '（無，正常）'}</span>
        </div>
      </div>

      <div className={styles.chatbotContainer}>
        <Chatbot
          ref={chatbotRef}
          title="Data Analyst"
          config={{ botProviderEndpoint: 'http://localhost:8429' }}
          customChannelId="http-error-on-send-demo"
          initMessages={initMessages}
          autoResetChannel={false}
          onSseError={handleSseError}
        />
      </div>

      {toastMessage && (
        <div className={styles.toast}>
          <span className={styles.toastIcon}>⚠</span>
          {toastMessage}
        </div>
      )}
    </DemoWrapper>
  );
}
