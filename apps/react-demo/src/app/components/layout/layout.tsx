import { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import styles from './layout.module.scss';

interface LayoutProps {
  children: ReactNode;
}

const navItems = [
  { to: '/', label: 'Home' },
  { to: '/templates', label: 'Templates' },
  { to: '/data-insight-style', label: 'Data Insight Style' },
  { to: '/features', label: 'Features' },
  { to: '/theme', label: 'Theme' },
  { to: '/auth', label: 'Auth' },
  { to: '/events', label: 'Events' },
  { to: '/fullscreen', label: 'Fullscreen' },
  { to: '/markdown', label: 'Markdown' },
  { to: '/markdown-table', label: 'Markdown Table' },
  { to: '/keep-connection', label: 'Keep Connection' },
  { to: '/custom-renderer', label: 'Custom Renderer' },
  { to: '/before-send-message', label: 'Before Send Message' },
  { to: '/custom-header', label: 'Custom Header' },
  { to: '/auto-reset-channel', label: 'Auto Reset Channel' },
  { to: '/channel-restore', label: 'Channel Restore (F-015)' },
  { to: '/render-menu', label: 'Render Menu' },
  { to: '/footer-end-actions', label: 'Footer End Actions' },
  { to: '/render-footer', label: 'Render Footer' },
  { to: '/http-error', label: 'HTTP Error' },
  { to: '/http-error-on-send', label: 'HTTP Error on Send' },
  { to: '/tool-call', label: 'Tool Call' },
  { to: '/tool-call-consent', label: 'Tool Call Consent' },
  { to: '/subagent', label: 'Subagent List' },
  { to: '/shared-provider', label: 'Shared Provider' },
  { to: '/multi-panel', label: 'Multi-Panel (Sindri-style)' },
  { to: '/user-identity-hint', label: 'User Identity Hint' },
  { to: '/on-channel-ready', label: 'On Channel Ready' },
  { to: '/upload-mime-constraint', label: 'Upload MIME Constraint' },
];

export function Layout({ children }: LayoutProps): ReactNode {
  return (
    <div className={styles.layout}>
      <aside className={styles.sidebar}>
        <div className={styles.logo}>
          <h1>Asgard SDK Demo</h1>
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
