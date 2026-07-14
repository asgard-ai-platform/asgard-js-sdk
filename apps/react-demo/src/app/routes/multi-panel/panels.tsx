import { ReactNode } from 'react';
import { SandboxBrowser, useChannelTitle, useSandboxName, useSubagents, useTaskList } from '@asgard-js/react';
import styles from './multi-panel.module.scss';

/**
 * Channel title bar (F-016) — rendered OUTSIDE the <Chatbot>, reading `useChannelTitle()` from the
 * shared provider. Also shows the current sandbox name from `useSandboxName()` (folded from the
 * `sandbox.launch`/`ready` events) — the key the Files/Browser sandbox panels will use.
 */
export function ChannelTitleBar(): ReactNode {
  const title = useChannelTitle();
  const sandboxName = useSandboxName();

  return (
    <div className={styles.titlebar}>
      <span className={styles.titlebar__icon}>#</span>
      <span className={styles.titlebar__text}>{title ?? '未命名頻道'}</span>
      {sandboxName && <span className={styles.titlebar__sandbox}>sandbox: {sandboxName}</span>}
      <span className={styles.titlebar__src}>useChannelTitle() / useSandboxName()</span>
    </div>
  );
}

// Each panel is an INDEPENDENT component that reads the shared conversation via a hook (F-013/F-014).
// They are siblings of <Chatbot> under one <AsgardConversationProvider> — the SDK contributes the
// components; the app (this demo, or Sindri) owns which show and how they're laid out.

function PanelShell({ title, count, children }: { title: string; count?: string; children: ReactNode }): ReactNode {
  return (
    <section className={styles.panel}>
      <header className={styles.panel__header}>
        <span>{title}</span>
        {count !== undefined && <span className={styles.panel__count}>{count}</span>}
      </header>
      <div className={styles.panel__body}>{children}</div>
    </section>
  );
}

const TASK_GLYPH: Record<string, string> = { completed: '✓', in_progress: '◐' };

/** Plan / Task panel — derived from the conversation's TaskCreate/TaskUpdate stream via useTaskList(). */
export function PlanPanel(): ReactNode {
  const tasks = useTaskList();
  const done = tasks.filter(t => t.status === 'completed').length;

  return (
    <PanelShell title="Plan" count={tasks.length ? `${done}/${tasks.length}` : undefined}>
      {tasks.length === 0 ? (
        <div className={styles.panel__empty}>尚無計畫項目</div>
      ) : (
        <ul className={styles.list}>
          {tasks.map(t => (
            <li key={t.id} className={styles.list__row}>
              <span className={styles.list__glyph} data-status={t.status}>
                {TASK_GLYPH[t.status] ?? '○'}
              </span>
              <span className={t.status === 'completed' ? styles['list__text--done'] : undefined}>
                {t.status === 'in_progress' ? t.activeForm ?? t.subject : t.subject}
              </span>
            </li>
          ))}
        </ul>
      )}
    </PanelShell>
  );
}

const SUB_GLYPH: Record<string, string> = { running: '◐', completed: '✓', failed: '✕', cancelled: '⊘' };

/** Agent Teams / Subagent panel — derived from the Agent tool call + subagent.* events via useSubagents(). */
export function AgentTeamsPanel(): ReactNode {
  const subagents = useSubagents();
  const done = subagents.filter(s => s.status !== 'running').length;

  return (
    <PanelShell title="Agent Teams" count={subagents.length ? `${done}/${subagents.length}` : undefined}>
      {subagents.length === 0 ? (
        <div className={styles.panel__empty}>尚無子代理</div>
      ) : (
        <ul className={styles.list}>
          {subagents.map(s => (
            <li key={s.parentToolUseId} className={styles.list__row}>
              <span className={styles.list__glyph} data-status={s.status}>
                {SUB_GLYPH[s.status] ?? '○'}
              </span>
              <span className={styles.agent}>
                <b>{s.subagentType ?? 'subagent'}</b>
                <span className={styles.agent__desc}>{s.description}</span>
                <span className={styles.agent__meta}>{s.tools.length} 個工具</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </PanelShell>
  );
}

/** Files panel — placeholder until the SDK <SandboxFiles> (part 3) lands. */
export function FilesPanel(): ReactNode {
  return (
    <PanelShell title="Files" count="SDK 待做（part 3）">
      <ul className={styles.list}>
        <li className={styles.list__row}>📄 README.md</li>
        <li className={styles.list__row}>📁 outputs / 客服月報.xlsx</li>
        <li className={styles.list__row}>📁 uploads /</li>
      </ul>
      <div className={styles.panel__note}>示意；SDK &lt;SandboxFiles&gt; 尚未實作</div>
    </PanelShell>
  );
}

/** Browser panel — the SDK <SandboxBrowser> (part 2): reads useSandboxName() + calls the sandbox
 * browser API and embeds the Neko iframe. An SDK component (not app-owned). */
export function BrowserPanel(): ReactNode {
  return (
    <PanelShell title="Browser" count="SDK 元件">
      <div className={styles.browser_host}>
        <SandboxBrowser />
      </div>
    </PanelShell>
  );
}
