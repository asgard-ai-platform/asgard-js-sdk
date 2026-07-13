import { ReactNode } from 'react';
import { AsgardConversationProvider, Chatbot, useSubagents, useTaskList } from '@asgard-js/react';
import '@asgard-js/react/style';
import { DemoWrapper } from '../../components/demo-wrapper';
import styles from './shared-provider.module.scss';

// F-014 smoke demo: one `<AsgardConversationProvider>` wraps both the chat AND a sibling panel.
// `<SiblingPanel>` is rendered OUTSIDE `<Chatbot>` (a true sibling) yet reads the same conversation
// via `useTaskList()` / `useSubagents()` — proving the channel is shared, not duplicated. This is the
// pattern Sindri needs: the SDK contributes channel-sharing components; the app owns the layout.
function SiblingPanel(): ReactNode {
  const tasks = useTaskList();
  const subagents = useSubagents();

  return (
    <div className={styles.sibling} data-testid="sibling-panel">
      <div className={styles.sibling__title}>Sibling panel (outside &lt;Chatbot&gt;)</div>
      <div>
        useTaskList() →{' '}
        <b>
          {tasks.filter(t => t.status === 'completed').length}/{tasks.length}
        </b>{' '}
        tasks
      </div>
      <div>
        useSubagents() →{' '}
        <b>
          {subagents.filter(s => s.status !== 'running').length}/{subagents.length}
        </b>{' '}
        subagents
      </div>
      <ul className={styles.sibling__list}>
        {tasks.map(t => (
          <li key={t.id}>{t.status === 'in_progress' ? t.activeForm ?? t.subject : t.subject}</li>
        ))}
      </ul>
    </div>
  );
}

const config = { botProviderEndpoint: `${typeof window !== 'undefined' ? window.location.origin : ''}/mock-asgard` };

export function SharedProviderDemo(): ReactNode {
  return (
    <DemoWrapper
      title="Shared conversation provider (F-014)"
      description="AsgardConversationProvider 包住 Chatbot 與左側 sibling 面板；面板在 Chatbot 之外，用 useTaskList()/useSubagents() 讀到同一條對話。送出訊息後兩邊會同步。"
    >
      <AsgardConversationProvider config={config} customChannelId="shared-provider-demo">
        <div className={styles.layout}>
          <SiblingPanel />
          <div className={styles.chat}>
            {/* No config / customChannelId here — the shared provider owns the channel (F-014). */}
            <Chatbot title="Shared Channel Demo" locale="zh-TW" />
          </div>
        </div>
      </AsgardConversationProvider>
    </DemoWrapper>
  );
}
