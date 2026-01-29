import { ReactNode, useState } from 'react';
import { Chatbot } from '@asgard-js/react';
import '@asgard-js/react/style';
import { DemoWrapper } from '../../components/demo-wrapper';
import {
  createTextTemplateExample,
  createHintTemplateExample,
  createButtonTemplateExample,
  createCarouselTemplateExample,
  createImageTemplateExample,
  createChartTemplateExample,
  createTableTemplateExample,
  createMathTemplateExample,
} from '../../mocks/messages';
import styles from './templates.module.scss';

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

export function Templates(): ReactNode {
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateType>('text');
  const initMessages = [templateCreators[selectedTemplate]()];

  return (
    <DemoWrapper
      title="Message Templates"
      description="Preview different message template types. Select a template to see how it renders."
    >
      <div className={styles.controls}>
        <h3>Select Template</h3>
        <div className={styles.buttons}>
          {templateOptions.map(option => (
            <button
              key={option.value}
              className={`${styles.button} ${selectedTemplate === option.value ? styles.active : ''}`}
              onClick={() => setSelectedTemplate(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.chatbotContainer}>
        <Chatbot
          title={`${templateOptions.find(o => o.value === selectedTemplate)?.label} Template Demo`}
          config={{ botProviderEndpoint: 'skip' }}
          customChannelId="templates-demo"
          initMessages={initMessages}
        />
      </div>
    </DemoWrapper>
  );
}
