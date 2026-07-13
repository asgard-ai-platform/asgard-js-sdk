import { ReactNode, useState } from 'react';
import { AsgardConversationProvider, Chatbot } from '@asgard-js/react';
import '@asgard-js/react/style';
import { DemoWrapper } from '../../components/demo-wrapper';
import { AgentTeamsPanel, FilesPanel, PlanPanel } from './panels';
import styles from './multi-panel.module.scss';

// A Sindri-style layout (F-014): ONE <AsgardConversationProvider> owns the channel; the <Chatbot> and
// several independent panels are all siblings under it, each reading the same conversation. The demo
// (playing the role of the app) owns the layout: which panels show, and their placement. The SDK only
// contributes the channel-sharing components/hooks.

type PanelKey = 'plan' | 'agents' | 'files';

const PANELS: { key: PanelKey; label: string; render: () => ReactNode }[] = [
  { key: 'plan', label: 'Plan', render: () => <PlanPanel /> },
  { key: 'agents', label: 'Agent Teams', render: () => <AgentTeamsPanel /> },
  { key: 'files', label: 'Files', render: () => <FilesPanel /> },
];

const config = { botProviderEndpoint: `${typeof window !== 'undefined' ? window.location.origin : ''}/mock-asgard` };

export function MultiPanelDemo(): ReactNode {
  const [open, setOpen] = useState<Record<PanelKey, boolean>>({ plan: true, agents: true, files: true });
  const visible = PANELS.filter(p => open[p.key]);

  return (
    <DemoWrapper
      title="Sindri-style multi-panel layout (F-014)"
      description="一個 AsgardConversationProvider 底下：中間 Chatbot（未傳 config），右側多個獨立面板（Plan/Agent Teams/Files）各自用 hook 讀同一條對話。上方可開關面板——版面由 app 掌控，SDK 只出共用 channel 的元件。送出訊息看多面板同步。"
    >
      <div className={styles.toolbar}>
        <span className={styles.toolbar__label}>面板</span>
        {PANELS.map(p => (
          <button
            key={p.key}
            type="button"
            className={open[p.key] ? styles.toggle_on : styles.toggle_off}
            onClick={() => setOpen(o => ({ ...o, [p.key]: !o[p.key] }))}
          >
            {open[p.key] ? '☑' : '☐'} {p.label}
          </button>
        ))}
      </div>

      <AsgardConversationProvider config={config} customChannelId="multi-panel-demo">
        <div className={styles.workspace}>
          <div className={styles.chat}>
            {/* No config here — the shared provider owns the channel. */}
            <Chatbot title="Agent Hub" locale="zh-TW" />
          </div>
          {visible.length > 0 && (
            <div className={styles.dock}>
              {visible.map(p => (
                <div key={p.key}>{p.render()}</div>
              ))}
            </div>
          )}
        </div>
      </AsgardConversationProvider>
    </DemoWrapper>
  );
}
