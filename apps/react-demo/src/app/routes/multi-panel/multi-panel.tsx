import { ReactNode, useState } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { AsgardConversationProvider, Chatbot } from '@asgard-js/react';
import '@asgard-js/react/style';
import { DemoWrapper } from '../../components/demo-wrapper';
import { ChannelTitleBar } from './panels';
import { DockPanels, type PanelKey } from './dock';
import styles from './multi-panel.module.scss';

// A Sindri-style layout (F-014): ONE <AsgardConversationProvider> owns the channel; the <Chatbot> and
// several independent panels are all siblings under it, each reading the same conversation. The demo
// (playing the role of the app) owns the layout, exactly the way Sindri does it: react-resizable-panels
// for the Chatbot | panels split, and dockview for the draggable/dockable panel area. The SDK only
// contributes the channel-sharing components/hooks — it does not own layout.

const PANELS: { key: PanelKey; label: string }[] = [
  { key: 'plan', label: 'Plan' },
  { key: 'agents', label: 'Agent Teams' },
  { key: 'files', label: 'Files' },
  { key: 'browser', label: 'Browser' },
];

const config = { botProviderEndpoint: `${typeof window !== 'undefined' ? window.location.origin : ''}/mock-asgard` };

export function MultiPanelDemo(): ReactNode {
  const [open, setOpen] = useState<Record<PanelKey, boolean>>({
    plan: true,
    agents: true,
    files: true,
    browser: true,
  });
  const openPanels = PANELS.filter(p => open[p.key]).map(p => p.key);
  const hasPanels = openPanels.length > 0;

  const toggle = (key: PanelKey): void => setOpen(o => ({ ...o, [key]: !o[key] }));

  return (
    <DemoWrapper
      title="Sindri-style multi-panel layout (F-014)"
      description="模擬 Sindri：一個 AsgardConversationProvider 底下，中間 Chatbot 與右側面板同層、共享一條 channel。佈局用 Sindri 同一套 —— react-resizable-panels 控 Chatbot ↔ 面板區的比例（拖中間分隔線），dockview 讓面板區可拖拉重排 / 並排 / 分頁 / 面板間 resize。Plan / Agent Teams / Files / Browser 全是 SDK 元件（useTaskList / useSubagents / <SandboxFiles> / <SandboxBrowser>）；版面全由 app 掌控，不是 SDK 的職責。上方可開關面板。"
    >
      <div className={styles.root}>
        <div className={styles.toolbar}>
          <span className={styles.toolbar__label}>面板</span>
          {PANELS.map(p => (
            <button
              key={p.key}
              type="button"
              className={open[p.key] ? styles.toggle_on : styles.toggle_off}
              onClick={() => toggle(p.key)}
            >
              {open[p.key] ? '☑' : '☐'} {p.label}
            </button>
          ))}
        </div>

        <AsgardConversationProvider config={config} customChannelId="multi-panel-demo">
          {/* F-016: channel title rendered OUTSIDE the Chatbot, from the shared provider. */}
          <ChannelTitleBar />
          <div className={styles.split}>
            <PanelGroup direction="horizontal" className={styles.group}>
              {/* main stays in one Panel with a stable id → toggling panels never remounts the chat. */}
              <Panel
                id="conversation"
                order={1}
                defaultSize={hasPanels ? 45 : 100}
                minSize={30}
                className={styles.pane}
              >
                {/* No config on <Chatbot> — the shared provider owns the channel. */}
                <Chatbot title="Agent Hub" locale="zh-TW" />
              </Panel>
              {hasPanels && (
                <>
                  <PanelResizeHandle className={styles.handle} />
                  <Panel id="panels" order={2} defaultSize={38} minSize={22} className={styles.pane}>
                    <DockPanels openPanels={openPanels} onClose={toggle} />
                  </Panel>
                </>
              )}
            </PanelGroup>
          </div>
        </AsgardConversationProvider>
      </div>
    </DemoWrapper>
  );
}
