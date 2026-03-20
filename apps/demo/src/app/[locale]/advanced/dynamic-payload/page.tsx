'use client';

import { type ReactNode, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Inbox } from 'lucide-react';
import { DemoSection } from '@/components/demo-section';
import { CodeBlock } from '@/components/code-block';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

interface PayloadLog {
  id: number;
  timestamp: Date;
  type: 'static' | 'dynamic';
  payload: Record<string, unknown>;
}

const staticPayload = {
  source: 'external-button',
  createdAt: Date.now(),
  randomId: 'static-id-12345',
};

const createDynamicPayload = (): Record<string, unknown> => ({
  source: 'external-button',
  createdAt: Date.now(),
  randomId: Math.random().toString(36).slice(2, 10),
});

const codeExample = `// Static payload - value fixed at definition
sendMessage({
  text: 'Hello',
  payload: {
    createdAt: Date.now(),  // fixed value
    randomId: 'abc123',
  },
});

// Dynamic payload - value generated at send time
sendMessage({
  text: 'Hello',
  payload: () => ({
    createdAt: Date.now(),  // recalculated each send
    randomId: Math.random().toString(36).slice(2),
  }),
});`;

export default function DynamicPayloadPage(): ReactNode {
  const t = useTranslations('dynamicPayload');
  const [payloadLogs, setPayloadLogs] = useState<PayloadLog[]>([]);

  const sendStaticPayload = useCallback((): void => {
    setPayloadLogs(prev =>
      [{ id: Date.now(), timestamp: new Date(), type: 'static' as const, payload: staticPayload }, ...prev].slice(0, 10),
    );
  }, []);

  const sendDynamicPayload = useCallback((): void => {
    setPayloadLogs(prev =>
      [{ id: Date.now(), timestamp: new Date(), type: 'dynamic' as const, payload: createDynamicPayload() }, ...prev].slice(0, 10),
    );
  }, []);

  return (
    <DemoSection title={t('title')} description={t('description')}>
      <div className="space-y-6">
        <div className="space-y-3">
          <h3 className="text-sm font-medium">{t('sendMessage')}</h3>
          <p className="text-xs text-muted-foreground">{t('sendDescription')}</p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={sendStaticPayload}>
              {t('staticPayload')}
            </Button>
            <Button onClick={sendDynamicPayload}>{t('dynamicPayloadBtn')}</Button>
          </div>
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
              <p>{t('noPayloads')}</p>
              <p className="mt-1 text-xs">{t('payloadHint')}</p>
            </div>
          ) : (
            <ScrollArea className="h-64">
              <div className="space-y-3">
                {payloadLogs.map(log => (
                  <div key={log.id} className="rounded-md border p-3 space-y-2 hover:bg-accent/30 transition-colors">
                    <div className="flex items-center justify-between">
                      <Badge variant={log.type === 'static' ? 'secondary' : 'default'}>{log.type === 'static' ? 'Static' : 'Dynamic'}</Badge>
                      <span className="text-xs text-muted-foreground">{log.timestamp.toLocaleTimeString()}</span>
                    </div>
                    <pre className="rounded-lg bg-muted/50 border p-3 text-xs font-mono overflow-auto">{JSON.stringify(log.payload, null, 2)}</pre>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>

        <div className="space-y-3">
          <h3 className="text-sm font-medium">{t('whyDynamic')}</h3>
          <div className="rounded-lg border overflow-hidden text-sm">
            <div className="grid grid-cols-3 bg-muted font-medium">
              <div className="p-2" />
              <div className="p-2">{t('staticPayload')}</div>
              <div className="p-2">Dynamic Payload</div>
            </div>
            {(['timing', 'useCase', 'multipleSends'] as const).map(row => (
              <div key={row} className="grid grid-cols-3 border-t">
                <div className="p-2 font-medium bg-muted/50">{t(`comparison.${row}`)}</div>
                <div className="p-2">{t(`comparison.static${row.charAt(0).toUpperCase() + row.slice(1)}` as `comparison.${string}`)}</div>
                <div className="p-2">{t(`comparison.dynamic${row.charAt(0).toUpperCase() + row.slice(1)}` as `comparison.${string}`)}</div>
              </div>
            ))}
          </div>
        </div>

        <CodeBlock code={codeExample} />
      </div>
    </DemoSection>
  );
}
