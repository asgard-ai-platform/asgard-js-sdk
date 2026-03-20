'use client';

import { type ReactNode, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Chatbot } from '@/components/chatbot-wrapper';
import { X, MessageSquare, Check } from 'lucide-react';
import { DemoSection } from '@/components/demo-section';
import { CodeBlock } from '@/components/code-block';
import { env } from '@/env';

const codeExample = `<Chatbot
  title="Private Bot"
  config={{
    botProviderEndpoint: process.env.NEXT_PUBLIC_PRIVATE_BOT_PROVIDER_ENDPOINT,
  }}
  customChannelId="private-demo"
/>`;

export default function PrivatePage(): ReactNode {
  const t = useTranslations('private');
  const [isOpen, setIsOpen] = useState(false);

  return (
    <DemoSection title={t('title')} description={t('description')}>
      <div className="space-y-4">
        <div className="space-y-2">
          <h3 className="text-sm font-medium">{t('authFlow')}</h3>
          <div className="rounded-lg border bg-card p-4">
            <ul className="space-y-2">
              {(['apiKey', 'stateManagement', 'errorHandling'] as const).map(key => (
                <li key={key} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Check size={16} className="text-primary shrink-0" />
                  {t(`features.${key}`)}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <CodeBlock code={codeExample} />
      </div>

      {isOpen && (
        <div className="fixed bottom-20 right-6 z-50">
          <Chatbot
            title="Private Bot"
            config={{ botProviderEndpoint: env.NEXT_PUBLIC_PRIVATE_BOT_PROVIDER_ENDPOINT }}
            customChannelId="private-demo"
            theme={{ chatbot: { width: '380px', height: '550px', borderRadius: '16px' } }}
            onClose={() => setIsOpen(false)}
          />
        </div>
      )}

      <button
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95"
        onClick={() => setIsOpen(!isOpen)}
        aria-label={isOpen ? 'Close chatbot' : 'Open chatbot'}
      >
        {isOpen ? <X size={24} /> : <MessageSquare size={24} />}
      </button>
    </DemoSection>
  );
}
