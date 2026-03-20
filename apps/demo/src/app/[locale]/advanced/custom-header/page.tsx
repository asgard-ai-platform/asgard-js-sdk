'use client';

import { type ReactNode, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Chatbot, useAsgardContext } from '@/components/chatbot-wrapper';
import { DemoSection } from '@/components/demo-section';
import { CodeBlock } from '@/components/code-block';
import { createTextTemplateExample } from '@/data/mock-messages';

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

const codeExample = `function CustomHeader({ count }) {
  const { avatar, resetChannel } = useAsgardContext();
  return (
    <div>
      {avatar && <img src={avatar} alt="avatar" />}
      <span>Custom Header</span>
      <span>{count}</span>
      <button onClick={() => resetChannel?.()}>Reset</button>
    </div>
  );
}

<Chatbot
  onMessageSent={() => setMessageCount(c => c + 1)}
  onReset={() => setMessageCount(0)}
  renderHeader={() => <CustomHeader count={messageCount} />}
/>`;

export default function CustomHeaderPage(): ReactNode {
  const t = useTranslations('customHeader');
  const [messageCount, setMessageCount] = useState(0);
  const initMessages = [createTextTemplateExample()];

  return (
    <DemoSection title={t('title')} description={t('description')}>
      <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
        <div className="space-y-4">
          <CodeBlock code={codeExample} />
        </div>
        <div className="min-h-[500px]">
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
      </div>
    </DemoSection>
  );
}
