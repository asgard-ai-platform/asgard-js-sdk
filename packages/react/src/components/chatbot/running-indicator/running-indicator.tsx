import { ReactNode } from 'react';
import clsx from 'clsx';
import { useAsgardContext } from '../../../context/asgard-service-context';
import styles from './running-indicator.module.scss';

// Run-in-progress indicator bound to the whole SSE connection (`isConnecting`), rendered as an
// indeterminate progress line at the thread↔input seam (F-003). The seam is always present as a
// structural divider; during a run a `--asg-color-primary` bar sweeps across it. Because it binds
// to the connection (not per-message events), it neither flickers nor disappears in message gaps,
// and it stays lit through the `complete`→`done` tail until the connection actually closes.
// Honors `prefers-reduced-motion` (static bar, no sweep).
export function RunningIndicator(): ReactNode {
  const { isConnecting } = useAsgardContext();

  return (
    <div
      className={clsx('asgard-running-indicator', styles.running_indicator)}
      role={isConnecting ? 'status' : undefined}
      aria-label={isConnecting ? '回應產生中' : undefined}
    >
      <div className={styles.running_indicator__seam} />
      {isConnecting && <div className={styles.running_indicator__bar} />}
    </div>
  );
}
