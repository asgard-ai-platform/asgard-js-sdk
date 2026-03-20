import { ReactNode } from 'react';
import { useFileDropContext } from '../../../context/file-drop-context';
import styles from './drop-zone-overlay.module.scss';

export function DropZoneOverlay(): ReactNode {
  const { isDraggingOver } = useFileDropContext();

  if (!isDraggingOver) {
    return null;
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.overlay__content}>
        <svg
          className={styles.overlay__icon}
          xmlns="http://www.w3.org/2000/svg"
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        <span className={styles.overlay__text}>Drop files here</span>
      </div>
    </div>
  );
}
