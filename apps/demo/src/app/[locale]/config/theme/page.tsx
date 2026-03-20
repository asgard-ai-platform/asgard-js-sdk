'use client';

import { type ReactNode, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { AsgardThemeContextValue } from '@asgard-js/react';
import { Chatbot } from '@/components/chatbot-wrapper';

type ChatbotTheme = Partial<AsgardThemeContextValue>;
import { DemoSection } from '@/components/demo-section';
import { CodeBlock } from '@/components/code-block';
import { Button } from '@/components/ui/button';
import {
  createTextTemplateExample,
  createButtonTemplateExample,
  createCarouselTemplateExample,
} from '@/data/mock-messages';

const presets: { name: string; config: ChatbotTheme }[] = [
  { name: 'Default', config: {} },
  {
    name: 'Crazy',
    config: {
      chatbot: {
        backgroundColor: '#3c1d3b',
        borderColor: '#92ff8c',
        inactiveColor: '#ff00e6',
        primaryComponent: {
          mainColor: '#ff0000',
          secondaryColor: '#aba400',
        },
      },
      botMessage: {
        color: '#00f0ff',
        backgroundColor: '#ff7a00',
        carouselButtonBackgroundColor: '#00622a',
      },
      userMessage: {
        color: '#522801',
        backgroundColor: '#060081',
      },
    },
  },
];

const codeExample = `<Chatbot
  theme={{
    chatbot: {
      backgroundColor: '#3c1d3b',
      primaryComponent: { mainColor: '#ff0000' },
    },
    botMessage: { color: '#00f0ff', backgroundColor: '#ff7a00' },
    userMessage: { color: '#522801', backgroundColor: '#060081' },
  }}
/>`;

export default function ThemePage(): ReactNode {
  const t = useTranslations('theme');
  const [selectedPreset, setSelectedPreset] = useState('Default');
  const [theme, setTheme] = useState<ChatbotTheme>(presets[0].config);

  const initMessages = [createTextTemplateExample(), createButtonTemplateExample(), createCarouselTemplateExample()];

  const handlePresetChange = (presetName: string): void => {
    const preset = presets.find(p => p.name === presetName);
    if (preset) {
      setSelectedPreset(presetName);
      setTheme(preset.config);
    }
  };

  return (
    <DemoSection title={t('title')} description={t('description')}>
      <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
        <div className="space-y-6">
          <div className="space-y-3">
            <h3 className="text-sm font-medium">{t('presets')}</h3>
            <div className="flex gap-2">
              {presets.map(preset => (
                <Button
                  key={preset.name}
                  variant={selectedPreset === preset.name ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handlePresetChange(preset.name)}
                >
                  {preset.name}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-medium">{t('currentTheme')}</h3>
            <pre className="rounded-lg bg-muted/50 border p-3 text-xs font-mono overflow-auto max-h-60">
              {JSON.stringify(theme, null, 2)}
            </pre>
          </div>
          <CodeBlock code={codeExample} />
        </div>
        <div className="min-h-[500px]">
          <Chatbot
            key={selectedPreset}
            title="Theme Demo"
            config={{ botProviderEndpoint: 'skip' }}
            customChannelId="theme-demo"
            initMessages={initMessages}
            theme={theme}
          />
        </div>
      </div>
    </DemoSection>
  );
}
