import { ReactNode, useState } from 'react';
import { Chatbot } from '@asgard-js/react';
import '@asgard-js/react/style';
import { DemoWrapper } from '../../components/demo-wrapper';
import { createTextTemplateExample, createUserMessageExample } from '../../mocks/messages';
import styles from './auto-reset-channel.module.scss';

export function AutoResetChannel(): ReactNode {
  const [autoResetChannel, setAutoResetChannel] = useState(true);
  const [key, setKey] = useState(0);

  const initMessages = [createUserMessageExample('What movies are showing today?'), createTextTemplateExample()];

  const handleRemount = (): void => {
    setKey(prev => prev + 1);
  };

  return (
    <DemoWrapper
      title="Auto Reset Channel"
      description="Control whether the channel is automatically reset on mount. When disabled, history messages from initMessages are preserved without sending RESET_CHANNEL."
    >
      <div className={styles.controls}>
        <h3>Channel Settings</h3>
        <div className={styles.toggles}>
          <label className={styles.toggle}>
            <input type="checkbox" checked={autoResetChannel} onChange={() => setAutoResetChannel(prev => !prev)} />
            <span>autoResetChannel</span>
          </label>
          <button className={styles.remountButton} onClick={handleRemount}>
            Remount Chatbot
          </button>
        </div>

        <div className={styles.info}>
          <h4>Current Configuration</h4>
          <pre>{JSON.stringify({ autoResetChannel }, null, 2)}</pre>
        </div>

        <div className={styles.info}>
          <h4>Behavior</h4>
          <p className={styles.description}>
            {autoResetChannel
              ? 'Channel will be reset on mount (sends RESET_CHANNEL action). This is the default behavior.'
              : 'Channel is created without sending RESET_CHANNEL. History messages from initMessages are preserved, and new messages can still be sent.'}
          </p>
        </div>
      </div>

      <div className={styles.chatbotContainer}>
        <Chatbot
          key={key}
          title="Auto Reset Channel Demo"
          config={{ botProviderEndpoint: import.meta.env.VITE_SIMPLE_BOT_PROVIDER_ENDPOINT }}
          customChannelId="auto-reset-channel-demo"
          initMessages={initMessages}
          autoResetChannel={autoResetChannel}
        />
      </div>
    </DemoWrapper>
  );
}
