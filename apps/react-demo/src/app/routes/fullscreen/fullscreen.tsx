import { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Chatbot } from '@asgard-js/react';
import '@asgard-js/react/style';
import { createTextTemplateExample, createCarouselTemplateExample } from '../../mocks/messages';
import styles from './fullscreen.module.scss';

export function Fullscreen(): ReactNode {
  const navigate = useNavigate();
  const initMessages = [createTextTemplateExample(), createCarouselTemplateExample()];

  return (
    <div className={styles.container}>
      <Chatbot
        title="Fullscreen Demo"
        config={{ botProviderEndpoint: 'skip' }}
        customChannelId="fullscreen-demo"
        initMessages={initMessages}
        fullScreen
        onClose={() => navigate('/')}
      />
    </div>
  );
}
