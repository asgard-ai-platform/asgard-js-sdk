'use client';

import { type ReactNode, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AuthState } from '@asgard-js/core';
import { Chatbot } from '@/components/chatbot-wrapper';
import { DemoSection } from '@/components/demo-section';
import { CodeBlock } from '@/components/code-block';
import { Badge } from '@/components/ui/badge';
import { createTextTemplateExample } from '@/data/mock-messages';

const authStateValues: AuthState[] = [
  'authenticated',
  'needApiKey',
  'invalidApiKey',
  'loading',
  'error',
  'subscriptionExpired',
  'botNotFound',
];

const codeExample = `<Chatbot
  authState="needApiKey"
  onApiKeySubmit={async (apiKey) => {
    // Validate API key
    if (apiKey === 'valid-key') {
      setAuthState('authenticated');
    } else {
      setAuthState('invalidApiKey');
    }
  }}
/>`;

export default function AuthPage(): ReactNode {
  const t = useTranslations('auth');
  const [authState, setAuthState] = useState<AuthState>('authenticated');
  const [submittedKey, setSubmittedKey] = useState('');

  const initMessages = [createTextTemplateExample()];

  const handleApiKeySubmit = async (apiKey: string): Promise<void> => {
    setSubmittedKey(apiKey);
    await new Promise(resolve => setTimeout(resolve, 1000));
    if (apiKey === 'valid-key') {
      setAuthState('authenticated');
    } else {
      setAuthState('invalidApiKey');
    }
  };

  return (
    <DemoSection title={t('title')} description={t('description')}>
      <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
        <div className="space-y-6">
          <div className="space-y-3">
            <h3 className="text-sm font-medium">{t('authState')}</h3>
            <div className="flex flex-wrap gap-2">
              {authStateValues.map(state => (
                <button
                  key={state}
                  onClick={() => setAuthState(state)}
                  className={`rounded-lg border p-3 text-left transition-all ${
                    authState === state
                      ? 'border-primary bg-primary/5 shadow-sm ring-1 ring-primary/20'
                      : 'hover:bg-accent hover:shadow-sm'
                  }`}
                >
                  <div className="text-sm font-medium">{t(`states.${state}.label`)}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{t(`states.${state}.description`)}</div>
                </button>
              ))}
            </div>
          </div>

          {submittedKey && (
            <div className="space-y-2 rounded-md bg-muted p-3">
              <h4 className="text-sm font-medium">{t('lastSubmittedKey')}</h4>
              <Badge variant="secondary">{submittedKey}</Badge>
              <p className="text-xs text-muted-foreground">{t('hint')}</p>
            </div>
          )}
          <CodeBlock code={codeExample} />
        </div>
        <div className="min-h-[500px]">
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
      </div>
    </DemoSection>
  );
}
