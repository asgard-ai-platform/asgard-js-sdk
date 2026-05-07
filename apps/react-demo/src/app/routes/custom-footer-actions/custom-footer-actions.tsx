import { ReactNode, useCallback, useState } from 'react';
import { Chatbot } from '@asgard-js/react';
import '@asgard-js/react/style';
import { DemoWrapper } from '../../components/demo-wrapper';
import { createTextTemplateExample } from '../../mocks/messages';
import styles from './custom-footer-actions.module.scss';

interface ActionEvent {
  at: string;
  label: string;
}

export function CustomFooterActions(): ReactNode {
  const [events, setEvents] = useState<ActionEvent[]>([]);
  const initMessages = [createTextTemplateExample()];

  const log = useCallback((label: string): void => {
    setEvents(prev => [{ at: new Date().toLocaleTimeString(), label }, ...prev].slice(0, 8));
  }, []);

  const customFooterActions = [
    <button key="export" className={styles.customAction} title="Export PDF" onClick={() => log('Export PDF')}>
      PDF
    </button>,
    <button key="bookmark" className={styles.customAction} title="Bookmark" onClick={() => log('Bookmark')}>
      Bm
    </button>,
  ];

  return (
    <DemoWrapper
      title="Custom Footer Actions"
      description="Demonstrates customFooterActions prop. Items render alongside built-in attachment buttons; the rest of the footer (textarea / send / mic) is unchanged."
    >
      <div className={styles.chatbotContainer}>
        <Chatbot
          title="Custom Footer Actions Demo"
          config={{ botProviderEndpoint: 'skip' }}
          customChannelId="custom-footer-actions-demo"
          initMessages={initMessages}
          customFooterActions={customFooterActions}
        />
      </div>
      <div className={styles.controls}>
        <h4>Action click log</h4>
        {events.length === 0 ? (
          <div>Click an action button above to log here.</div>
        ) : (
          events.map((e, idx) => (
            <div key={idx} className={styles.event}>
              <span>{e.label}</span>
              <span>{e.at}</span>
            </div>
          ))
        )}
      </div>
    </DemoWrapper>
  );
}
