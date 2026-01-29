import { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import styles from './layout.module.scss';

interface LayoutProps {
  children: ReactNode;
}

const navItems = [
  { to: '/', label: 'Home' },
  { to: '/templates', label: 'Templates' },
  { to: '/features', label: 'Features' },
  { to: '/theme', label: 'Theme' },
  { to: '/auth', label: 'Auth' },
  { to: '/events', label: 'Events' },
  { to: '/fullscreen', label: 'Fullscreen' },
  { to: '/markdown', label: 'Markdown' },
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
