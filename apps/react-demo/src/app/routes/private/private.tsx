import { ReactNode, useState } from 'react';
import { Chatbot } from '@asgard-js/react';
import '@asgard-js/react/style';
import { X, MessageSquare } from 'lucide-react';
import styles from './private.module.scss';

export function Private(): ReactNode {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className={styles.private}>
      <header className={styles.header}>
        <h1>Private Bot Demo</h1>
        <p>Test the chatbot with a private bot provider that requires authentication.</p>
      </header>

      <div className={styles.content}>
        <div className={styles.info}>
          <h2>Authentication Flow</h2>
          <ul>
            <li>API Key required for access</li>
            <li>Auth state management</li>
            <li>Error handling for unauthorized access</li>
          </ul>
        </div>
      </div>

      {isOpen && (
        <div className={styles.chatbotContainer}>
          <Chatbot
            title="Private Bot"
            config={{
              botProviderEndpoint: import.meta.env.VITE_PRIVATE_BOT_PROVIDER_ENDPOINT,
            }}
            customChannelId="private-demo"
            theme={{
              chatbot: {
                width: '380px',
                height: '550px',
                borderRadius: '16px',
              },
            }}
            onClose={() => setIsOpen(false)}
          />
        </div>
      )}

      <button
        className={`${styles.fab} ${isOpen ? styles.fabOpen : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-label={isOpen ? 'Close chatbot' : 'Open chatbot'}
      >
        {isOpen ? <X size={24} /> : <MessageSquare size={24} />}
      </button>
    </div>
  );
}
