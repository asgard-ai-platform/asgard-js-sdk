import { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Chatbot } from '@asgard-js/react';
import '@asgard-js/react/style';
import styles from './fullscreen.module.scss';

export function Fullscreen(): ReactNode {
  const navigate = useNavigate();

  return (
    <div className={styles.container}>
      <Chatbot
        title="Fullscreen Demo"
        config={{ botProviderEndpoint: import.meta.env.VITE_SIMPLE_BOT_PROVIDER_ENDPOINT }}
        customChannelId="fullscreen-demo"
        fullScreen
        enableUpload
        enableDocumentUpload
        onClose={() => navigate('/')}
      />
    </div>
  );
}
