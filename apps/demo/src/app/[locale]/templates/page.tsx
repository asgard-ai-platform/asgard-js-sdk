'use client';

import { type ReactNode, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Chatbot } from '@/components/chatbot-wrapper';
import { DemoSection } from '@/components/demo-section';
import { CodeBlock } from '@/components/code-block';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  createTextTemplateExample,
  createHintTemplateExample,
  createButtonTemplateExample,
  createCarouselTemplateExample,
  createImageTemplateExample,
  createChartTemplateExample,
  createTableTemplateExample,
  createMathTemplateExample,
} from '@/data/mock-messages';

type TemplateType = 'text' | 'hint' | 'button' | 'carousel' | 'image' | 'chart' | 'table' | 'math';

const templateOptions: { value: TemplateType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'hint', label: 'Hint' },
  { value: 'button', label: 'Button' },
  { value: 'carousel', label: 'Carousel' },
  { value: 'image', label: 'Image' },
  { value: 'chart', label: 'Chart' },
  { value: 'table', label: 'Table' },
  { value: 'math', label: 'Math' },
];

const templateCreators: Record<TemplateType, () => ReturnType<typeof createTextTemplateExample>> = {
  text: createTextTemplateExample,
  hint: createHintTemplateExample,
  button: createButtonTemplateExample,
  carousel: createCarouselTemplateExample,
  image: createImageTemplateExample,
  chart: createChartTemplateExample,
  table: createTableTemplateExample,
  math: createMathTemplateExample,
};

const codeExample = `import { Chatbot } from '@asgard-js/react';

<Chatbot
  title="Template Demo"
  config={{ botProviderEndpoint: 'skip' }}
  customChannelId="templates-demo"
  initMessages={[createTextTemplateExample()]}
/>`;

export default function TemplatesPage(): ReactNode {
  const t = useTranslations('templates');
  const [selected, setSelected] = useState<TemplateType>('text');
  const initMessages = [templateCreators[selected]()];

  return (
    <DemoSection title={t('title')} description={t('description')}>
      <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
        <div className="space-y-4">
          <h3 className="text-sm font-medium">{t('selectTemplate')}</h3>
          <Tabs value={selected} onValueChange={v => setSelected(v as TemplateType)}>
            <TabsList className="flex-wrap h-auto gap-1">
              {templateOptions.map(opt => (
                <TabsTrigger key={opt.value} value={opt.value}>
                  {opt.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <CodeBlock code={codeExample} />
        </div>
        <div className="min-h-[500px]">
          <Chatbot
            title={`${templateOptions.find(o => o.value === selected)?.label} Template Demo`}
            config={{ botProviderEndpoint: 'skip' }}
            customChannelId="templates-demo"
            initMessages={initMessages}
          />
        </div>
      </div>
    </DemoSection>
  );
}
