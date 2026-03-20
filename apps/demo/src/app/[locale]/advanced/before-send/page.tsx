'use client';

import { type ReactNode, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Inbox } from 'lucide-react';
import type { SendMessageParams } from '@asgard-js/react';
import { Chatbot } from '@/components/chatbot-wrapper';
import { DemoSection } from '@/components/demo-section';
import { CodeBlock } from '@/components/code-block';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { env } from '@/env';

interface Category {
  id: string;
  nameKey: string;
  descKey: string;
}

const categories: Category[] = [
  { id: 'tech', nameKey: 'tech', descKey: 'tech' },
  { id: 'lifestyle', nameKey: 'lifestyle', descKey: 'lifestyle' },
  { id: 'business', nameKey: 'business', descKey: 'business' },
  { id: 'entertainment', nameKey: 'entertainment', descKey: 'entertainment' },
];

interface PayloadLog {
  id: number;
  timestamp: Date;
  originalText: string;
  injectedPayload: Record<string, unknown>;
}

const codeExample = `const [selectedCategory, setSelectedCategory] = useState(null);

<Chatbot
  onBeforeSendMessage={(params) => ({
    ...params,
    payload: {
      categoryId: selectedCategory?.id,
      categoryName: selectedCategory?.name,
    },
  })}
/>`;

export default function BeforeSendPage(): ReactNode {
  const t = useTranslations('beforeSend');
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [payloadLogs, setPayloadLogs] = useState<PayloadLog[]>([]);

  const handleBeforeSendMessage = useCallback(
    (params: SendMessageParams): SendMessageParams => {
      const categoryName = selectedCategory ? t(`categories.${selectedCategory.nameKey}.name`) : null;
      const injectedPayload = selectedCategory
        ? { categoryId: selectedCategory.id, categoryName, injectedAt: new Date().toISOString() }
        : { note: 'No category selected' };

      setPayloadLogs(prev =>
        [{ id: Date.now(), timestamp: new Date(), originalText: params.text, injectedPayload }, ...prev].slice(0, 10),
      );

      return { ...params, payload: injectedPayload };
    },
    [selectedCategory, t],
  );

  return (
    <DemoSection title={t('title')} description={t('description')}>
      <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
        <div className="space-y-6">
          <div className="space-y-3">
            <h3 className="text-sm font-medium">{t('selectContext')}</h3>
            <p className="text-xs text-muted-foreground">{t('contextDescription')}</p>
            <div className="space-y-2">
              {categories.map(cat => (
                <button
                  key={cat.id}
                  className={`w-full rounded-lg border p-3 text-left transition-all ${
                    selectedCategory?.id === cat.id
                      ? 'border-primary bg-primary/5 shadow-sm ring-1 ring-primary/20'
                      : 'hover:bg-accent hover:shadow-sm'
                  }`}
                  onClick={() => setSelectedCategory(cat)}
                >
                  <div className="text-sm font-medium">{t(`categories.${cat.nameKey}.name`)}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{t(`categories.${cat.descKey}.description`)}</div>
                </button>
              ))}
            </div>
            {selectedCategory && (
              <Button variant="ghost" size="sm" onClick={() => setSelectedCategory(null)}>
                {t('clearSelection')}
              </Button>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">{t('payloadLogs')}</h3>
              {payloadLogs.length > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setPayloadLogs([])}>
                  Clear
                </Button>
              )}
            </div>
            {payloadLogs.length === 0 ? (
              <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
                <Inbox size={24} className="mx-auto mb-2 text-muted-foreground/40" />
                <p>{t('noMessages')}</p>
                <p className="mt-1 text-xs">{t('sendHint')}</p>
              </div>
            ) : (
              <ScrollArea className="h-48">
                <div className="space-y-3">
                  {payloadLogs.map(log => (
                    <div key={log.id} className="rounded-md border p-3 space-y-2 hover:bg-accent/30 transition-colors">
                      <div className="flex items-center justify-between">
                        <span className="text-sm truncate">"{log.originalText}"</span>
                        <span className="text-xs text-muted-foreground">{log.timestamp.toLocaleTimeString()}</span>
                      </div>
                      <pre className="rounded-lg bg-muted/50 border p-3 text-xs font-mono overflow-auto">
                        {JSON.stringify(log.injectedPayload, null, 2)}
                      </pre>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
          <CodeBlock code={codeExample} />
        </div>
        <div className="min-h-[500px]">
          <Chatbot
            key={selectedCategory?.id ?? 'none'}
            title="Context Injection Demo"
            config={{ botProviderEndpoint: env.NEXT_PUBLIC_SIMPLE_BOT_PROVIDER_ENDPOINT }}
            customChannelId="before-send-message-demo"
            inputPlaceholder={
              selectedCategory ? `Ask about ${t(`categories.${selectedCategory.nameKey}.name`)}...` : 'Select a category first...'
            }
            onBeforeSendMessage={handleBeforeSendMessage}
          />
        </div>
      </div>
    </DemoSection>
  );
}
