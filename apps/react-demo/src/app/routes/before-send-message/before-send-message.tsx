import { ReactNode, useState, useCallback } from 'react';
import { Chatbot, SendMessageParams } from '@asgard-js/react';
import '@asgard-js/react/style';
import { DemoWrapper } from '../../components/demo-wrapper';
import styles from './before-send-message.module.scss';

interface Category {
  id: string;
  name: string;
  description: string;
}

const categories: Category[] = [
  { id: 'tech', name: 'Technology', description: 'Tech news and updates' },
  { id: 'lifestyle', name: 'Lifestyle', description: 'Daily life tips' },
  { id: 'business', name: 'Business', description: 'Business insights' },
  { id: 'entertainment', name: 'Entertainment', description: 'Fun and games' },
];

interface PayloadLog {
  id: number;
  timestamp: Date;
  originalText: string;
  injectedPayload: Record<string, unknown>;
}

export function BeforeSendMessage(): ReactNode {
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [payloadLogs, setPayloadLogs] = useState<PayloadLog[]>([]);

  const handleBeforeSendMessage = useCallback(
    (params: SendMessageParams): SendMessageParams => {
      const injectedPayload = selectedCategory
        ? {
            categoryId: selectedCategory.id,
            categoryName: selectedCategory.name,
            injectedAt: new Date().toISOString(),
          }
        : { note: 'No category selected' };

      // Log the injection for demo purposes
      setPayloadLogs(prev =>
        [
          {
            id: Date.now(),
            timestamp: new Date(),
            originalText: params.text,
            injectedPayload,
          },
          ...prev,
        ].slice(0, 10),
      );

      return {
        ...params,
        payload: injectedPayload,
      };
    },
    [selectedCategory],
  );

  const clearLogs = (): void => {
    setPayloadLogs([]);
  };

  return (
    <DemoWrapper
      title="onBeforeSendMessage Hook"
      description="Inject contextual data into messages before sending. Select a category and send a message to see the payload injection."
    >
      <div className={styles.controls}>
        <div className={styles.section}>
          <h3>Select Context</h3>
          <p className={styles.sectionDesc}>
            Choose a category to inject into every message. This simulates a parent component providing context to the
            chatbot.
          </p>
          <div className={styles.categoryList}>
            {categories.map(category => (
              <button
                key={category.id}
                className={`${styles.categoryButton} ${selectedCategory?.id === category.id ? styles.selected : ''}`}
                onClick={() => setSelectedCategory(category)}
              >
                <span className={styles.categoryName}>{category.name}</span>
                <span className={styles.categoryDesc}>{category.description}</span>
              </button>
            ))}
          </div>
          {selectedCategory && (
            <button className={styles.clearButton} onClick={() => setSelectedCategory(null)}>
              Clear Selection
            </button>
          )}
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
              <p>No messages sent yet.</p>
              <p className={styles.hint}>Send a message in the chatbot to see the injected payload.</p>
            </div>
          ) : (
            <div className={styles.logs}>
              {payloadLogs.map(log => (
                <div key={log.id} className={styles.logEntry}>
                  <div className={styles.logHeader}>
                    <span className={styles.logText}>"{log.originalText}"</span>
                    <span className={styles.timestamp}>{log.timestamp.toLocaleTimeString()}</span>
                  </div>
                  <pre className={styles.payload}>{JSON.stringify(log.injectedPayload, null, 2)}</pre>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={styles.section}>
          <h3>Code Example</h3>
          <pre className={styles.code}>
            {`const [selectedCategory, setSelectedCategory] = useState(null);

<Chatbot
  onBeforeSendMessage={(params) => ({
    ...params,
    payload: {
      categoryId: selectedCategory?.id,
      categoryName: selectedCategory?.name,
    },
  })}
/>`}
          </pre>
        </div>
      </div>

      <div className={styles.chatbotContainer}>
        <Chatbot
          title="Context Injection Demo"
          config={{
            botProviderEndpoint: import.meta.env.VITE_SIMPLE_BOT_PROVIDER_ENDPOINT,
          }}
          customChannelId="before-send-message-demo"
          inputPlaceholder={selectedCategory ? `Ask about ${selectedCategory.name}...` : 'Select a category first...'}
          onBeforeSendMessage={handleBeforeSendMessage}
        />
      </div>
    </DemoWrapper>
  );
}
