import { ReactNode, useState } from 'react';
import { Chatbot } from '@asgard-js/react';
import '@asgard-js/react/style';
import { DemoWrapper } from '../../components/demo-wrapper';
import {
  createTextTemplateExample,
  createStreamingTextTemplateExample,
  createTextAuxiliaryTemplateExample,
  createUserMessageExample,
  createHintTemplateExample,
  createButtonTemplateExample,
  createCarouselTemplateExample,
  createImageTemplateExample,
  createVideoTemplateExample,
  createAudioTemplateExample,
  createLocationTemplateExample,
  createChartTemplateExample,
  createTableTemplateExample,
  createMathTemplateExample,
  createAttachmentTemplateExample,
} from '../../mocks/messages';
import styles from './templates.module.scss';

type TemplateType =
  | 'text'
  | 'streaming-text'
  | 'text-auxiliary'
  | 'user-regression'
  | 'hint'
  | 'button'
  | 'carousel'
  | 'image'
  | 'video'
  | 'audio'
  | 'location'
  | 'chart'
  | 'table'
  | 'math'
  | 'attachment';

type PreviewWidth = 'narrow' | 'wide';

const templateOptions: { value: TemplateType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'streaming-text', label: 'Streaming Text' },
  { value: 'text-auxiliary', label: 'Text Auxiliary' },
  { value: 'user-regression', label: 'User Regression' },
  { value: 'hint', label: 'Hint' },
  { value: 'button', label: 'Button' },
  { value: 'carousel', label: 'Carousel' },
  { value: 'image', label: 'Image' },
  { value: 'video', label: 'Video' },
  { value: 'audio', label: 'Audio' },
  { value: 'location', label: 'Location' },
  { value: 'chart', label: 'Chart' },
  { value: 'table', label: 'Table' },
  { value: 'math', label: 'Math' },
  { value: 'attachment', label: 'Attachment' },
];

const templateCreators: Record<TemplateType, () => ReturnType<typeof createTextTemplateExample>> = {
  text: createTextTemplateExample,
  'streaming-text': createStreamingTextTemplateExample,
  'text-auxiliary': createTextAuxiliaryTemplateExample,
  'user-regression': () => createUserMessageExample('使用者訊息應繼續保留泡泡與時間戳。'),
  hint: createHintTemplateExample,
  button: createButtonTemplateExample,
  carousel: createCarouselTemplateExample,
  image: createImageTemplateExample,
  video: createVideoTemplateExample,
  audio: createAudioTemplateExample,
  location: createLocationTemplateExample,
  chart: createChartTemplateExample,
  table: createTableTemplateExample,
  math: createMathTemplateExample,
  attachment: createAttachmentTemplateExample,
};

export function Templates(): ReactNode {
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateType>('text');
  const [previewWidth, setPreviewWidth] = useState<PreviewWidth>('narrow');
  const initMessages = [templateCreators[selectedTemplate]()];

  return (
    <DemoWrapper
      title="Message Templates"
      description="Preview different message template types. Select a template to see how it renders."
    >
      <div className={styles.controls}>
        <div className={styles.previewControls}>
          <h3>Preview Width</h3>
          <div className={styles.widthButtons}>
            <button
              type="button"
              className={`${styles.button} ${previewWidth === 'narrow' ? styles.active : ''}`}
              aria-pressed={previewWidth === 'narrow'}
              onClick={() => setPreviewWidth('narrow')}
            >
              375px
            </button>
            <button
              type="button"
              className={`${styles.button} ${previewWidth === 'wide' ? styles.active : ''}`}
              aria-pressed={previewWidth === 'wide'}
              onClick={() => setPreviewWidth('wide')}
            >
              960px
            </button>
          </div>
        </div>
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

      <div className={styles.chatbotContainer} style={{ width: previewWidth === 'wide' ? 960 : 375 }}>
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
