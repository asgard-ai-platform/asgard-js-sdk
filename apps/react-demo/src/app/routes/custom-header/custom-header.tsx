import { ReactNode, useState } from 'react';
import { Chatbot, useAsgardContext } from '@asgard-js/react';
import '@asgard-js/react/style';
import { DemoWrapper } from '../../components/demo-wrapper';
import { createTextTemplateExample } from '../../mocks/messages';
import styles from './custom-header.module.scss';

function CustomHeader({ count }: { count: number }): ReactNode {
  const { avatar, resetChannel } = useAsgardContext();

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 16px',
        borderBottom: '1px solid #434343',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {avatar && <img src={avatar} alt="avatar" style={{ width: 24, height: 24, borderRadius: '50%' }} />}
        <span style={{ color: 'white', fontWeight: 600 }}>Custom Header</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>使用次數</span>
        <span
          style={{
            background: '#6366f1',
            color: 'white',
            borderRadius: 10,
            padding: '2px 8px',
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {count}
        </span>
        <button
          onClick={() => resetChannel?.()}
          style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: 12 }}
        >
          Reset
        </button>
      </div>
    </div>
  );
}

export function CustomHeaderDemo(): ReactNode {
  const [messageCount, setMessageCount] = useState(0);
  const initMessages = [createTextTemplateExample()];

  return (
    <DemoWrapper
      title="Custom Header"
      description="Demonstrates onMessageSent callback and renderHeader prop to build a custom header with message counter."
    >
      <div className={styles.chatbotContainer}>
        <Chatbot
          title="Custom Header Demo"
          config={{ botProviderEndpoint: 'skip' }}
          customChannelId="custom-header-demo"
          initMessages={initMessages}
          onMessageSent={() => setMessageCount(c => c + 1)}
          onReset={() => setMessageCount(0)}
          renderHeader={() => <CustomHeader count={messageCount} />}
        />
      </div>
    </DemoWrapper>
  );
}
