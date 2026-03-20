'use client';

import { type ReactNode, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Chatbot } from '@/components/chatbot-wrapper';
import { DemoSection } from '@/components/demo-section';
import { CodeBlock } from '@/components/code-block';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { createTextTemplateExample, createUserMessageExample } from '@/data/mock-messages';
import { env } from '@/env';

const codeExample = `<Chatbot
  autoResetChannel={false}
  initMessages={initMessages}
/>`;

export default function AutoResetPage(): ReactNode {
  const t = useTranslations('autoReset');
  const [autoResetChannel, setAutoResetChannel] = useState(true);
  const [key, setKey] = useState(0);

  const initMessages = [createUserMessageExample('What movies are showing today?'), createTextTemplateExample()];

  return (
    <DemoSection title={t('title')} description={t('description')}>
      <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
        <div className="space-y-6">
          <div className="space-y-4">
            <h3 className="text-sm font-medium">{t('channelSettings')}</h3>
            <div className="flex items-center justify-between rounded-lg border p-3 hover:bg-accent/50 transition-colors">
              <span className="text-sm">autoResetChannel</span>
              <Switch checked={autoResetChannel} onCheckedChange={setAutoResetChannel} />
            </div>
            <Button variant="outline" size="sm" onClick={() => setKey(prev => prev + 1)}>
              {t('remount')}
            </Button>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-medium">{t('title')}</h3>
            <pre className="rounded-lg bg-muted/50 border p-3 text-xs font-mono overflow-auto">{JSON.stringify({ autoResetChannel }, null, 2)}</pre>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-medium">{t('behavior')}</h3>
            <p className="text-sm text-muted-foreground">
              {autoResetChannel ? t('enabledBehavior') : t('disabledBehavior')}
            </p>
          </div>
          <CodeBlock code={codeExample} />
        </div>
        <div className="min-h-[500px]">
          <Chatbot
            key={key}
            title="Auto Reset Channel Demo"
            config={{ botProviderEndpoint: env.NEXT_PUBLIC_SIMPLE_BOT_PROVIDER_ENDPOINT }}
            customChannelId="auto-reset-channel-demo"
            initMessages={initMessages}
            autoResetChannel={autoResetChannel}
          />
        </div>
      </div>
    </DemoSection>
  );
}
