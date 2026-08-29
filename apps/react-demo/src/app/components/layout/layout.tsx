import { ReactNode, useState } from 'react';
import { NavLink } from 'react-router-dom';
import styles from './layout.module.scss';

interface LayoutProps {
  children: ReactNode;
}

const navItems = [
  { to: '/', label: 'Home' },
  { to: '/all-features', label: '★ All-Features Showcase (F-001~F-018)' },
  { to: '/all-features-wide', label: '★ All-Features Showcase — Wide' },
  { to: '/templates', label: 'Templates' },
  { to: '/data-insight-style', label: 'Data Insight Style' },
  { to: '/features', label: 'Features' },
  { to: '/theme', label: 'Theme' },
  { to: '/auth', label: 'Auth' },
  { to: '/events', label: 'Events' },
  { to: '/fullscreen', label: 'Fullscreen' },
  { to: '/markdown', label: 'Markdown' },
  { to: '/markdown-table', label: 'Markdown Table' },
  { to: '/markdown-theme', label: 'Markdown Theme' },
  { to: '/markdown-stream', label: 'Markdown Stream' },
  { to: '/keep-connection', label: 'Keep Connection' },
  { to: '/custom-renderer', label: 'Custom Renderer' },
  { to: '/composed-bot-text', label: 'Composed Bot Text' },
  { to: '/before-send-message', label: 'Before Send Message' },
  { to: '/custom-header', label: 'Custom Header' },
  { to: '/auto-reset-channel', label: 'Auto Reset Channel' },
  { to: '/render-menu', label: 'Render Menu' },
  { to: '/footer-end-actions', label: 'Footer End Actions' },
  { to: '/render-footer', label: 'Render Footer' },
  { to: '/http-error', label: 'HTTP Error' },
  { to: '/http-error-on-send', label: 'HTTP Error on Send' },
  { to: '/tool-call', label: 'Tool Call' },
  { to: '/tool-call-consent', label: 'Tool Call Consent' },
  { to: '/user-identity-hint', label: 'User Identity Hint' },
  { to: '/on-channel-ready', label: 'On Channel Ready' },
  { to: '/upload-mime-constraint', label: 'Upload MIME Constraint' },
  { to: '/stream-robustness', label: 'Stream Robustness (F-011)' },
  { to: '/stream-resume', label: 'Stream Resume (F-002)' },
  { to: '/transcript-replay', label: 'Transcript Replay (F-014)' },
  { to: '/thinking', label: 'Thinking (F-001)' },
  { to: '/run-indicator', label: 'Run Indicator (F-003)' },
  { to: '/sandbox-hud', label: 'Sandbox Launch HUD (F-018)' },
  { to: '/sandbox-cards', label: 'Sandbox Handoff Cards (F-020)' },
  { to: '/file-explorer', label: 'File Explorer (F-021)' },
  { to: '/tool-call-variants', label: 'Tool-Call Variants (F-004)' },
  { to: '/tool-call-i18n', label: 'Tool-Call i18n (F-005)' },
  { to: '/tool-call-grouping', label: 'Tool-Call Grouping (F-006)' },
  { to: '/tool-call-group-key', label: 'Tool-Call Group Key (same processId)' },
  { to: '/tool-call-diff', label: 'Tool-Call Diff (F-007)' },
  { to: '/tool-call-expand', label: 'Tool-Call Expand (F-008)' },
  { to: '/tool-call-iserror', label: 'Tool-Call isError (F-009)' },
  { to: '/task-list', label: 'Task Check List (F-010)' },
  { to: '/subagent-list', label: 'Subagent List (F-012)' },
  { to: '/spinner-sync', label: 'Spinner Phase Sync (BUG-007)' },
  { to: '/error-details', label: 'Error Bubble Details (#412)' },
  { to: '/derived-state', label: 'Derived-State Stores (F-013)' },
  { to: '/channel-title', label: 'Channel Title (F-016)' },
  { to: '/channel-title-ui', label: 'Channel Title UI (F-017)' },
  { to: '/chat-header', label: 'Chat Header (F-022)' },
  { to: '/composer', label: 'Composer (BUILD-028)' },
  { to: '/prompt-suggestion', label: 'Prompt Suggestion (F-028)' },
  { to: '/question-template', label: 'Question Card (F-029)' },
  { to: '/attachment-rejoin', label: 'Replayed attachments (#448)' },
  { to: '/canvas-card', label: 'Canvas Card (F-030)' },
  { to: '/delete-channel', label: 'Delete Channel (F-032)' },
];

export function Layout({ children }: LayoutProps): ReactNode {
  // Collapsed the nav shrinks to a rail holding only the toggle — with 49 unlabelled entries an icon rail
  // would be unreadable, and the point is to hand the horizontal space to the demo (the wide chatbot
  // routes in particular). Collapsed is the default: the demo is what you came to look at, and the nav
  // is one click away.
  const [collapsed, setCollapsed] = useState(true);

  return (
    <div className={styles.layout}>
      <aside className={collapsed ? `${styles.sidebar} ${styles.collapsed}` : styles.sidebar}>
        <div className={styles.logo}>
          {!collapsed && <h1>Asgard SDK Demo</h1>}
          <button
            type="button"
            className={styles.toggle}
            onClick={() => setCollapsed(v => !v)}
            aria-expanded={!collapsed}
            aria-label={collapsed ? '展開側邊欄' : '收合側邊欄'}
            title={collapsed ? '展開側邊欄' : '收合側邊欄'}
          >
            {collapsed ? '»' : '«'}
          </button>
        </div>
        <nav className={styles.nav}>
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => (isActive ? `${styles.navLink} ${styles.active}` : styles.navLink)}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
