import { ReactNode, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { AsgardConversationProvider, Chatbot } from '@asgard-js/react';
import '@asgard-js/react/style';
import { DemoWrapper } from '../../components/demo-wrapper';
import { AgentTeamsPanel, BrowserPanel, ChannelTitleBar, FilesPanel, PlanPanel } from './panels';
import styles from './multi-panel.module.scss';

// A Sindri-style layout (F-014): ONE <AsgardConversationProvider> owns the channel; the <Chatbot> and
// several independent panels are all siblings under it, each reading the same conversation. The demo
// (playing the role of the app) owns the layout: which panels show, and their placement. The SDK only
// contributes the channel-sharing components/hooks.

type PanelKey = 'plan' | 'agents' | 'files' | 'browser';

const PANELS: { key: PanelKey; label: string; render: () => ReactNode }[] = [
  { key: 'plan', label: 'Plan', render: () => <PlanPanel /> },
  { key: 'agents', label: 'Agent Teams', render: () => <AgentTeamsPanel /> },
  { key: 'files', label: 'Files', render: () => <FilesPanel /> },
  { key: 'browser', label: 'Browser', render: () => <BrowserPanel /> },
];

const config = { botProviderEndpoint: `${typeof window !== 'undefined' ? window.location.origin : ''}/mock-asgard` };

// Draggable split — the APP owns layout/proportions (not the SDK). The SDK components inside just fill
// whatever width the app gives them. (Sindri uses react-resizable-panels for the same job.)
function ResizableSplit({ left, right }: { left: ReactNode; right: ReactNode }): ReactNode {
  const [leftWidth, setLeftWidth] = useState(400);

  const startDrag = (e: ReactMouseEvent): void => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = leftWidth;
    const onMove = (ev: MouseEvent): void =>
      setLeftWidth(Math.min(760, Math.max(300, startWidth + ev.clientX - startX)));
    const onUp = (): void => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <div className={styles.split}>
      <div className={styles.split__pane} style={{ width: leftWidth }}>
        {left}
      </div>
      <div className={styles.split__handle} onMouseDown={startDrag} role="separator" aria-orientation="vertical" />
      <div className={styles.split__grow}>{right}</div>
    </div>
  );
}

export function MultiPanelDemo(): ReactNode {
  const [open, setOpen] = useState<Record<PanelKey, boolean>>({ plan: true, agents: true, files: true, browser: true });
  const visible = PANELS.filter(p => open[p.key]);

  return (
    <DemoWrapper
      title="Sindri-style multi-panel layout (F-014)"
      description="Sindri 四格：一個 AsgardConversationProvider 底下，中間 Chatbot（未傳 config）與右側面板同層、共享一條 channel。Plan / Agent Teams 是 SDK 元件（useTaskList() / useSubagents() 讀同一 channel）；Files / Browser 是 app 自己的面板（sandbox / agent browser，非 SDK 衍生）。上方可開關面板、拖分隔線調比例——版面全由 app 掌控，不是 SDK 的職責。"
    >
      <div className={styles.root}>
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
          {/* F-016: channel title rendered OUTSIDE the Chatbot, from the shared provider. */}
          <ChannelTitleBar />
          <ResizableSplit
            // No config on <Chatbot> — the shared provider owns the channel; drag the divider to resize.
            left={<Chatbot title="Agent Hub" locale="zh-TW" />}
            right={
              visible.length > 0 ? (
                <div className={styles.dock}>
                  {visible.map(p => (
                    <div key={p.key}>{p.render()}</div>
                  ))}
                </div>
              ) : null
            }
          />
        </AsgardConversationProvider>
      </div>
    </DemoWrapper>
  );
}
