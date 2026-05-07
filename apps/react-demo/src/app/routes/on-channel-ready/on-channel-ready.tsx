import { ReactNode, useCallback, useRef, useState } from 'react';
import { Chatbot, ChatbotRef } from '@asgard-js/react';
import '@asgard-js/react/style';
import { DemoWrapper } from '../../components/demo-wrapper';
import styles from './on-channel-ready.module.scss';

interface ReadyEvent {
  at: number;
  sendMessageAvailable: boolean;
  serviceContextAvailable: boolean;
}

export function OnChannelReady(): ReactNode {
  const chatbotRef = useRef<ChatbotRef>(null);
  const [key, setKey] = useState(0);
  const [autoSend, setAutoSend] = useState(true);
  const [events, setEvents] = useState<ReadyEvent[]>([]);

  const handleChannelReady = useCallback((): void => {
    const ctx = chatbotRef.current?.serviceContext;
    const event: ReadyEvent = {
      at: performance.now(),
      sendMessageAvailable: typeof ctx?.sendMessage === 'function',
      serviceContextAvailable: !!ctx,
    };
    setEvents(prev => [...prev, event]);

    if (autoSend && ctx?.sendMessage) {
      void ctx.sendMessage({
        text: 'auto-sent on channel ready',
        blobIds: [],
      });
    }
  }, [autoSend]);

  const handleRemount = (): void => {
    setEvents([]);
    setKey(prev => prev + 1);
  };

  const handleResetChannel = (): void => {
    void chatbotRef.current?.serviceContext?.resetChannel?.();
  };

  return (
    <DemoWrapper
      title="onChannelReady"
      description="Fires once the chat channel is ready to accept messages. Re-fires after channel reset. Use this instead of polling for sendMessage availability."
    >
      <div className={styles.controls}>
        <h3>Settings</h3>
        <div className={styles.toggles}>
          <label className={styles.toggle}>
            <input type="checkbox" checked={autoSend} onChange={() => setAutoSend(prev => !prev)} />
            <span>Auto-send a message on ready</span>
          </label>
          <button className={styles.remountButton} onClick={handleRemount}>
            Remount Chatbot (key change)
          </button>
          <button className={styles.remountButton} onClick={handleResetChannel}>
            Reset Channel (in-place)
          </button>
        </div>

        <div className={styles.info}>
          <h4>Ready events ({events.length})</h4>
          {events.length === 0 ? (
            <p className={styles.description}>Waiting for first onChannelReady...</p>
          ) : (
            <pre>{JSON.stringify(events, null, 2)}</pre>
          )}
        </div>

        <div className={styles.info}>
          <h4>Verification</h4>
          <p className={styles.description}>
            Each event records whether <code>ref.current.serviceContext.sendMessage</code> was a function at the moment
            the callback fired. Both flags should be <code>true</code> on every fire.
          </p>
        </div>
      </div>

      <div className={styles.chatbotContainer}>
        <Chatbot
          key={key}
          ref={chatbotRef}
          title="onChannelReady Demo"
          config={{ botProviderEndpoint: import.meta.env.VITE_SIMPLE_BOT_PROVIDER_ENDPOINT }}
          customChannelId="on-channel-ready-demo"
          onChannelReady={handleChannelReady}
        />
      </div>
    </DemoWrapper>
  );
}
