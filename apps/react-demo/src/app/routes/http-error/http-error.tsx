import { ReactNode, useCallback, useEffect, useState } from 'react';
import { Chatbot } from '@asgard-js/react';
import { isHttpError } from '@asgard-js/core';
import '@asgard-js/react/style';
import { DemoWrapper } from '../../components/demo-wrapper';
import { createTextTemplateExample } from '../../mocks/messages';
import styles from './http-error.module.scss';

export function HttpErrorDemo(): ReactNode {
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const initMessages = [createTextTemplateExample()];

  const handleSseError = useCallback((error: unknown): void => {
    if (isHttpError(error) && error.status === 429) {
      setToastMessage('用量已達上限，請稍後再試');
    }
  }, []);

  useEffect(() => {
    if (!toastMessage) return;

    const timer = setTimeout(() => setToastMessage(null), 5000);

    return (): void => {
      clearTimeout(timer);
    };
  }, [toastMessage]);

  return (
    <DemoWrapper
      title="HTTP Error"
      description="Demonstrates onSseError handling for HTTP 429 rate limit errors. This demo connects to a mock server that always returns 429."
    >
      <div className={styles.chatbotContainer}>
        <Chatbot
          title="Data Analyst"
          config={{ botProviderEndpoint: 'http://localhost:8429' }}
          customChannelId="http-error-demo"
          initMessages={initMessages}
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
