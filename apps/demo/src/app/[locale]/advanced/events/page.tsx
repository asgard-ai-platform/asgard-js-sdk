'use client';

import { type ReactNode, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Inbox } from 'lucide-react';
import { Chatbot } from '@/components/chatbot-wrapper';
import { DemoSection } from '@/components/demo-section';
import { CodeBlock } from '@/components/code-block';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { createEmitButtonTemplateExample } from '@/data/mock-messages';

interface EventLog {
  id: number;
  timestamp: Date;
  eventName: string;
  payload: unknown;
}

const codeExample = `<Chatbot
  onTemplateBtnClick={(payload, eventName, raw) => {
    console.log('Event:', eventName, payload);
  }}
/>`;

export default function EventsPage(): ReactNode {
  const t = useTranslations('events');
  const [eventLogs, setEventLogs] = useState<EventLog[]>([]);
  const initMessages = [createEmitButtonTemplateExample()];

  const handleTemplateBtnClick = useCallback(
    (payload: Record<string, unknown>, eventName: string): void => {
      setEventLogs(prev =>
        [{ id: Date.now(), timestamp: new Date(), eventName, payload }, ...prev].slice(0, 10),
      );
    },
    [],
  );

  return (
    <DemoSection title={t('title')} description={t('description')}>
      <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">{t('eventLogs')}</h3>
            {eventLogs.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setEventLogs([])}>
                {t('clear')}
              </Button>
            )}
          </div>

          {eventLogs.length === 0 ? (
            <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
              <Inbox size={24} className="mx-auto mb-2 text-muted-foreground/40" />
              <p>{t('noEvents')}</p>
              <p className="mt-1 text-xs">{t('hint')}</p>
            </div>
          ) : (
            <ScrollArea className="h-80">
              <div className="space-y-3">
                {eventLogs.map(log => (
                  <div key={log.id} className="rounded-md border p-3 space-y-2 hover:bg-accent/30 transition-colors">
                    <div className="flex items-center justify-between">
                      <Badge>{log.eventName}</Badge>
                      <span className="text-xs text-muted-foreground">{log.timestamp.toLocaleTimeString()}</span>
                    </div>
                    <pre className="rounded-lg bg-muted/50 border p-3 text-xs font-mono overflow-auto">{JSON.stringify(log.payload, null, 2)}</pre>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
          <CodeBlock code={codeExample} />
        </div>
        <div className="min-h-[500px]">
          <Chatbot
            title="Events Demo"
            config={{ botProviderEndpoint: 'skip' }}
            customChannelId="events-demo"
            initMessages={initMessages}
            onTemplateBtnClick={handleTemplateBtnClick}
          />
        </div>
      </div>
    </DemoSection>
  );
}
