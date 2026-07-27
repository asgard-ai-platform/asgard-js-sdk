import { ReactNode, useState } from 'react';
import clsx from 'clsx';
import PaperclipSvg from '../../../icons/paperclip.svg?react';
import styles from './attachment-preview.module.scss';
import type { AttachmentItem } from './use-attachment-upload';

/** Human-readable size for an attachment chip. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;

  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface AttachmentPreviewProps {
  items: AttachmentItem[];
  onRemove: (id: string) => void;
  removeLabel: string;
  /** Accessible label for the zoom modal's close button. */
  closeLabel: string;
}

/**
 * Pending attachments, rendered inside the composer pill above the input row.
 *
 * BUILD-030 collapsed the previous two-lane layout — an image thumbnail grid above a row of document
 * chips — into one chip shape for both kinds. The old split meant two visual languages side by side,
 * each with its own remove control (a filled square overlaying the thumbnail vs. a bare glyph inside the
 * chip), which read as two unrelated "close" buttons. Now every attachment is the same chip and carries
 * the same remove button; an image simply shows its thumbnail where a document shows a paperclip, and
 * clicking that thumbnail still opens the zoom modal.
 */
export function AttachmentPreview({ items, onRemove, removeLabel, closeLabel }: AttachmentPreviewProps): ReactNode {
  const [zoomed, setZoomed] = useState<AttachmentItem | null>(null);

  if (items.length === 0) return null;

  return (
    <div className={styles.preview}>
      {items.map(item => {
        const isImage = item.kind === 'image' && !!item.previewUrl;

        return (
          <span
            key={item.id}
            className={clsx(
              styles.chip,
              item.status === 'uploading' && styles.chip__uploading,
              item.status === 'error' && styles.chip__error,
            )}
            title={item.file.name}
          >
            {isImage ? (
              <img
                src={item.previewUrl}
                alt={item.file.name}
                className={styles.chip_thumb}
                onClick={() => setZoomed(item)}
              />
            ) : (
              <PaperclipSvg className={styles.chip_icon} />
            )}
            <span className={styles.chip_name}>{item.file.name}</span>
            <span className={styles.chip_size}>{formatFileSize(item.file.size)}</span>
            <button
              type="button"
              className={styles.chip_remove}
              aria-label={removeLabel}
              onClick={() => onRemove(item.id)}
            >
              ×
            </button>
          </span>
        );
      })}

      {zoomed?.previewUrl && (
        <div className={styles.modal} onClick={() => setZoomed(null)}>
          <img
            src={zoomed.previewUrl}
            alt={zoomed.file.name}
            className={styles.modal_image}
            onClick={event => event.stopPropagation()}
          />
          <button
            type="button"
            className={styles.modal_close}
            aria-label={closeLabel}
            onClick={event => {
              event.stopPropagation();
              setZoomed(null);
            }}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
