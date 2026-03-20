'use client';

import { type ReactNode, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Chatbot } from '@/components/chatbot-wrapper';
import { DemoSection } from '@/components/demo-section';
import { CodeBlock } from '@/components/code-block';
import { Switch } from '@/components/ui/switch';
import { createTextTemplateExample } from '@/data/mock-messages';

interface FeatureConfig {
  enableUpload: boolean;
  enableExport: boolean;
  enableDocumentUpload: boolean;
}

const codeExample = `<Chatbot
  enableUpload={true}
  enableExport={true}
  enableDocumentUpload={true}
/>`;

export default function FeaturesPage(): ReactNode {
  const t = useTranslations('features');
  const [config, setConfig] = useState<FeatureConfig>({
    enableUpload: true,
    enableExport: true,
    enableDocumentUpload: true,
  });

  const toggleFeature = (feature: keyof FeatureConfig): void => {
    setConfig(prev => ({ ...prev, [feature]: !prev[feature] }));
  };

  const initMessages = [createTextTemplateExample()];

  return (
    <DemoSection title={t('title')} description={t('description')}>
      <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
        <div className="space-y-6">
          <div className="space-y-4">
            <h3 className="text-sm font-medium">{t('featureToggles')}</h3>
            <div className="space-y-3">
              {(['enableUpload', 'enableExport', 'enableDocumentUpload'] as const).map(feature => (
                <div key={feature} className="flex items-center justify-between rounded-lg border p-3 hover:bg-accent/50 transition-colors">
                  <span className="text-sm">{t(feature)}</span>
                  <Switch checked={config[feature]} onCheckedChange={() => toggleFeature(feature)} />
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-medium">{t('title')}</h3>
            <pre className="rounded-lg bg-muted/50 border p-3 text-xs font-mono overflow-auto">{JSON.stringify(config, null, 2)}</pre>
          </div>
          <CodeBlock code={codeExample} />
        </div>
        <div className="min-h-[500px]">
          <Chatbot
            title="Features Demo"
            config={{ botProviderEndpoint: 'skip' }}
            customChannelId="features-demo"
            initMessages={initMessages}
            enableUpload={config.enableUpload}
            enableExport={config.enableExport}
            enableDocumentUpload={config.enableDocumentUpload}
          />
        </div>
      </div>
    </DemoSection>
  );
}
