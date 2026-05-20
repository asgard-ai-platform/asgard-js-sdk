import { ReactNode, useState } from 'react';
import { Chatbot, ChatbotTheme } from '@asgard-js/react';
import '@asgard-js/react/style';
import { DemoWrapper } from '../../components/demo-wrapper';
import {
  createTextTemplateExample,
  createButtonTemplateExample,
  createCarouselTemplateExample,
  createAttachmentTemplateExample,
} from '../../mocks/messages';
import styles from './theme.module.scss';

const presets: { name: string; config: ChatbotTheme }[] = [
  {
    name: 'Default',
    config: {},
  },
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

export function Theme(): ReactNode {
  const [selectedPreset, setSelectedPreset] = useState<string>('Default');
  const [theme, setTheme] = useState<ChatbotTheme>(presets[0].config);

  const initMessages = [
    createTextTemplateExample(),
    createButtonTemplateExample(),
    createCarouselTemplateExample(),
    createAttachmentTemplateExample(),
  ];

  const handlePresetChange = (presetName: string): void => {
    const preset = presets.find(p => p.name === presetName);
    if (preset) {
      setSelectedPreset(presetName);
      setTheme(preset.config);
    }
  };

  return (
    <DemoWrapper
      title="Theme Customization"
      description="Customize the chatbot appearance with theme configuration. Try the 'Crazy' preset to see all theme options in action."
    >
      <div className={styles.controls}>
        <h3>Presets</h3>
        <div className={styles.presets}>
          {presets.map(preset => (
            <button
              key={preset.name}
              className={`${styles.presetButton} ${selectedPreset === preset.name ? styles.active : ''}`}
              onClick={() => handlePresetChange(preset.name)}
            >
              {preset.name}
            </button>
          ))}
        </div>

        <h3>Current Theme Config</h3>
        <pre className={styles.themeCode}>{JSON.stringify(theme, null, 2)}</pre>
      </div>

      <div className={styles.chatbotContainer}>
        <Chatbot
          key={selectedPreset}
          title="Theme Demo"
          config={{ botProviderEndpoint: 'skip' }}
          customChannelId="theme-demo"
          initMessages={initMessages}
          theme={theme}
        />
      </div>
    </DemoWrapper>
  );
}
