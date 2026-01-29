import { ReactNode, useState } from 'react';
import { Chatbot } from '@asgard-js/react';
import '@asgard-js/react/style';
import { X, MessageSquare } from 'lucide-react';
import styles from './markdown.module.scss';

export function Markdown(): ReactNode {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className={styles.markdown}>
      <header className={styles.header}>
        <h1>Markdown Bot Demo</h1>
        <p>Test the chatbot with markdown-enabled bot provider for rich text responses.</p>
      </header>

      <div className={styles.content}>
        <div className={styles.info}>
          <h2>Features</h2>
          <ul>
            <li>Rich text formatting with Markdown</li>
            <li>Code blocks with syntax highlighting</li>
            <li>Lists, tables, and more</li>
          </ul>
        </div>
      </div>

      {isOpen && (
        <div className={styles.chatbotContainer}>
          <Chatbot
            title="Markdown Bot"
            config={{
              botProviderEndpoint: import.meta.env.VITE_MARKDOWN_BOT_PROVIDER_ENDPOINT,
            }}
            customChannelId="markdown-demo"
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
