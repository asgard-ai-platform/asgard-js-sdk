import { ReactNode, useState } from 'react';
import { AuthState } from '@asgard-js/core';
import { Chatbot } from '@asgard-js/react';
import '@asgard-js/react/style';
import { DemoWrapper } from '../../components/demo-wrapper';
import { createTextTemplateExample } from '../../mocks/messages';
import styles from './auth.module.scss';

const authStates: { value: AuthState; label: string; description: string }[] = [
  {
    value: 'authenticated',
    label: 'Authenticated',
    description: 'User is authenticated and can use the chatbot.',
  },
  {
    value: 'needApiKey',
    label: 'Need API Key',
    description: 'User needs to enter an API key to access the chatbot.',
  },
  {
    value: 'invalidApiKey',
    label: 'Invalid API Key',
    description: 'The provided API key is invalid.',
  },
  {
    value: 'loading',
    label: 'Loading',
    description: 'The authentication state is being determined.',
  },
  {
    value: 'error',
    label: 'Error',
    description: 'An error occurred during authentication.',
  },
  {
    value: 'subscriptionExpired',
    label: 'Subscription Expired',
    description: 'The subscription has expired.',
  },
  {
    value: 'botNotFound',
    label: 'Bot Not Found',
    description: 'The requested bot could not be found.',
  },
];

export function Auth(): ReactNode {
  const [authState, setAuthState] = useState<AuthState>('authenticated');
  const [submittedKey, setSubmittedKey] = useState<string>('');

  const initMessages = [createTextTemplateExample()];

  const handleApiKeySubmit = async (apiKey: string): Promise<void> => {
    setSubmittedKey(apiKey);
    // Simulate API key validation
    await new Promise(resolve => setTimeout(resolve, 1000));
    if (apiKey === 'valid-key') {
      setAuthState('authenticated');
    } else {
      setAuthState('invalidApiKey');
    }
  };

  return (
    <DemoWrapper title="Authentication States" description="Test different authentication states and the API key flow.">
      <div className={styles.controls}>
        <h3>Auth State</h3>
        <div className={styles.states}>
          {authStates.map(state => (
            <button
              key={state.value}
              className={`${styles.stateButton} ${authState === state.value ? styles.active : ''}`}
              onClick={() => setAuthState(state.value)}
            >
              <span className={styles.stateLabel}>{state.label}</span>
              <span className={styles.stateDescription}>{state.description}</span>
            </button>
          ))}
        </div>

        {submittedKey && (
          <div className={styles.info}>
            <h4>Last Submitted Key</h4>
            <code>{submittedKey}</code>
            <p className={styles.hint}>Tip: Enter "valid-key" to simulate successful authentication.</p>
          </div>
        )}
      </div>

      <div className={styles.chatbotContainer}>
        <Chatbot
          key={authState}
          title="Auth Demo"
          config={{ botProviderEndpoint: 'skip' }}
          customChannelId="auth-demo"
          initMessages={initMessages}
          authState={authState}
          onApiKeySubmit={handleApiKeySubmit}
        />
      </div>
    </DemoWrapper>
  );
}
