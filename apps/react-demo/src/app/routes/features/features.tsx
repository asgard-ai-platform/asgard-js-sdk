import { ReactNode, useState } from 'react';
import { Chatbot } from '@asgard-js/react';
import '@asgard-js/react/style';
import { DemoWrapper } from '../../components/demo-wrapper';
import { createTextTemplateExample } from '../../mocks/messages';
import styles from './features.module.scss';

interface FeatureConfig {
  enableUpload: boolean;
  enableExport: boolean;
  enableDocumentUpload: boolean;
}

export function Features(): ReactNode {
  const [config, setConfig] = useState<FeatureConfig>({
    enableUpload: true,
    enableExport: true,
    enableDocumentUpload: true,
  });

  const toggleFeature = (feature: keyof FeatureConfig): void => {
    setConfig(prev => ({
      ...prev,
      [feature]: !prev[feature],
    }));
  };

  const initMessages = [createTextTemplateExample()];

  return (
    <DemoWrapper title="SDK Features" description="Toggle features to see how they affect the chatbot interface.">
      <div className={styles.controls}>
        <h3>Feature Toggles</h3>
        <div className={styles.toggles}>
          <label className={styles.toggle}>
            <input type="checkbox" checked={config.enableUpload} onChange={() => toggleFeature('enableUpload')} />
            <span>Enable Upload</span>
          </label>
          <label className={styles.toggle}>
            <input type="checkbox" checked={config.enableExport} onChange={() => toggleFeature('enableExport')} />
            <span>Enable Export</span>
          </label>
          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={config.enableDocumentUpload}
              onChange={() => toggleFeature('enableDocumentUpload')}
            />
            <span>Enable Document Upload</span>
          </label>
        </div>

        <div className={styles.info}>
          <h4>Current Configuration</h4>
          <pre>{JSON.stringify(config, null, 2)}</pre>
        </div>
      </div>

      <div className={styles.chatbotContainer}>
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
    </DemoWrapper>
  );
}
