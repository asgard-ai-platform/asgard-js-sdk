import { ReactNode, useState, useCallback } from 'react';
import { Chatbot } from '@asgard-js/react';
import '@asgard-js/react/style';
import { DemoWrapper } from '../../components/demo-wrapper';
import { createEmitButtonTemplateExample } from '../../mocks/messages';
import styles from './events.module.scss';

interface EventLog {
  id: number;
  timestamp: Date;
  eventName: string;
  payload: unknown;
}

export function Events(): ReactNode {
  const [eventLogs, setEventLogs] = useState<EventLog[]>([]);

  const initMessages = [createEmitButtonTemplateExample()];

  const handleTemplateBtnClick = useCallback(
    (action: { type: string; eventName?: string; payload?: unknown }): void => {
      if (action.type === 'emit' && action.eventName) {
        const newLog: EventLog = {
          id: Date.now(),
          timestamp: new Date(),
          eventName: action.eventName,
          payload: action.payload,
        };
        setEventLogs(prev => [newLog, ...prev].slice(0, 10));
      }
    },
    [],
  );

  const clearLogs = (): void => {
    setEventLogs([]);
  };

  return (
    <DemoWrapper
      title="Event Handling"
      description="Handle EMIT actions from button clicks. Click the 'Book Ticket' button to trigger an event."
    >
      <div className={styles.controls}>
        <div className={styles.header}>
          <h3>Event Logs</h3>
          {eventLogs.length > 0 && (
            <button className={styles.clearButton} onClick={clearLogs}>
              Clear
            </button>
          )}
        </div>

        {eventLogs.length === 0 ? (
          <div className={styles.empty}>
            <p>No events captured yet.</p>
            <p className={styles.hint}>Click the "Book Ticket" button in the chatbot to trigger an EMIT event.</p>
          </div>
        ) : (
          <div className={styles.logs}>
            {eventLogs.map(log => (
              <div key={log.id} className={styles.logEntry}>
                <div className={styles.logHeader}>
                  <span className={styles.eventName}>{log.eventName}</span>
                  <span className={styles.timestamp}>{log.timestamp.toLocaleTimeString()}</span>
                </div>
                <pre className={styles.payload}>{JSON.stringify(log.payload, null, 2)}</pre>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={styles.chatbotContainer}>
        <Chatbot
          title="Events Demo"
          config={{ botProviderEndpoint: 'skip' }}
          customChannelId="events-demo"
          initMessages={initMessages}
          onTemplateBtnClick={handleTemplateBtnClick}
        />
      </div>
    </DemoWrapper>
  );
}
