import { ReactNode, useState } from 'react';
import { Chatbot } from '@asgard-js/react';
import '@asgard-js/react/style';
import { DemoWrapper } from '../../components/demo-wrapper';
import { createTextTemplateExample } from '../../mocks/messages';
import styles from './user-identity-hint.module.scss';

export function UserIdentityHint(): ReactNode {
  const [inputValue, setInputValue] = useState('user-123');
  const [appliedHint, setAppliedHint] = useState('user-123');

  const handleApply = (): void => {
    setAppliedHint(inputValue);
  };

  const initMessages = [createTextTemplateExample()];

  return (
    <DemoWrapper
      title="User Identity Hint"
      description="When userIdentityHint is set, all requests include the X-ASGARD-USER-IDENTITY-HINT header."
    >
      <div className={styles.controls}>
        <div className={styles.section}>
          <h3>Set Identity Hint</h3>
          <p className={styles.sectionDesc}>
            Enter a value and click Apply. The chatbot will be remounted with the new <code>userIdentityHint</code>{' '}
            prop.
          </p>
          <div className={styles.inputRow}>
            <input
              className={styles.input}
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              placeholder="e.g. user-123"
            />
            <button className={styles.applyButton} onClick={handleApply}>
              Apply
            </button>
          </div>
        </div>

        <div className={styles.section}>
          <h3>Current Header</h3>
          <div className={styles.headerPreview}>
            <span className={styles.headerKey}>X-ASGARD-USER-IDENTITY-HINT</span>
            <span className={styles.headerValue}>{appliedHint || '(not set)'}</span>
          </div>
        </div>

        <div className={styles.section}>
          <h3>Code Example</h3>
          <pre className={styles.code}>{`<Chatbot
  userIdentityHint="${appliedHint}"
  config={{
    botProviderEndpoint: '...',
  }}
  customChannelId="my-channel"
/>`}</pre>
        </div>
      </div>

      <div className={styles.chatbotContainer}>
        <Chatbot
          key={appliedHint}
          title="Identity Hint Demo"
          config={{ botProviderEndpoint: import.meta.env.VITE_SIMPLE_BOT_PROVIDER_ENDPOINT }}
          customChannelId="user-identity-hint-demo"
          userIdentityHint={appliedHint || undefined}
          initMessages={initMessages}
        />
      </div>
    </DemoWrapper>
  );
}
