import { ReactNode, useState } from 'react';
import { Link } from 'react-router-dom';
import { Chatbot } from '@asgard-js/react';
import '@asgard-js/react/style';
import { X, MessageSquare } from 'lucide-react';
import styles from './home.module.scss';

const demoCards = [
  {
    title: 'Templates',
    description: 'Explore all message template types: Text, Button, Carousel, Image, Chart, Table, and more.',
    to: '/templates',
  },
  {
    title: 'Features',
    description: 'Test SDK features: file upload, conversation export, and voice input.',
    to: '/features',
  },
  {
    title: 'Theme',
    description: 'Customize the chatbot appearance with theme configuration.',
    to: '/theme',
  },
  {
    title: 'Auth',
    description: 'Demonstrate different authentication states and API key flow.',
    to: '/auth',
  },
  {
    title: 'Events',
    description: 'Handle EMIT actions and tool call events from the chatbot.',
    to: '/events',
  },
  {
    title: 'Fullscreen',
    description: 'View the chatbot in fullscreen mode.',
    to: '/fullscreen',
  },
  {
    title: 'Markdown',
    description: 'Test chatbot with markdown-enabled bot for rich text responses.',
    to: '/markdown',
  },
  {
    title: 'Private',
    description: 'Test chatbot with a private bot provider requiring authentication.',
    to: '/private',
  },
];

export function Home(): ReactNode {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className={styles.home}>
      <header className={styles.header}>
        <h1>Asgard JS SDK Demo</h1>
        <p>
          Interactive demonstration of the @asgard-js/react components. Explore the features and templates available in
          the SDK.
        </p>
      </header>

      <div className={styles.grid}>
        {demoCards.map(card => (
          <Link key={card.to} to={card.to} className={styles.card}>
            <h2>{card.title}</h2>
            <p>{card.description}</p>
          </Link>
        ))}
      </div>

      <footer className={styles.footer}>
        <h3>Quick Start</h3>
        <pre className={styles.code}>
          {`import { Chatbot } from '@asgard-js/react';
import '@asgard-js/react/style';

<Chatbot
  title="My Chatbot"
  config={{
    botProviderEndpoint: 'https://api.asgard-ai.com/ns/{namespace}/bot-provider/{id}',
    apiKey: 'your-api-key',
  }}
  customChannelId="my-channel"
/>`}
        </pre>
      </footer>

      {isOpen && (
        <div className={styles.chatbotContainer}>
          <Chatbot
            title="Asgard Chatbot"
            config={{
              botProviderEndpoint: import.meta.env.VITE_SIMPLE_BOT_PROVIDER_ENDPOINT,
            }}
            customChannelId="home-demo"
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
