import { ReactNode, useCallback, useEffect, useState } from 'react';
import styles from './chatbot-footer.module.scss';

export interface ImagePreviewProps {
  files: File[];
  onRemove: (index: number) => void;
  disabled?: boolean;
}

interface FilePreviewItem {
  file: File;
  previewUrl: string;
}

export function ImagePreview({ files, onRemove, disabled = false }: ImagePreviewProps): ReactNode {
  const [previewItems, setPreviewItems] = useState<FilePreviewItem[]>([]);

  // 生成預覽 URL
  useEffect(() => {
    const newPreviewItems: FilePreviewItem[] = [];

    files.forEach(file => {
      if (file.type.startsWith('image/')) {
        const previewUrl = URL.createObjectURL(file);
        newPreviewItems.push({ file, previewUrl });
      }
    });

    setPreviewItems(newPreviewItems);

    // 清理函數：釋放 URL 資源
    return () => {
      newPreviewItems.forEach(item => {
        URL.revokeObjectURL(item.previewUrl);
      });
    };
  }, [files]);

  const formatFileSize = useCallback((bytes: number): string => {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }, []);

  const handleRemoveClick = useCallback((index: number, event: React.MouseEvent): void => {
    event.preventDefault();
    event.stopPropagation();

    if (!disabled) {
      onRemove(index);
    }
  }, [disabled, onRemove]);

  if (previewItems.length === 0) {
    return null;
  }

  return (
    <div className={styles.file_preview_container}>
      {previewItems.map((item, index) => (
        <div key={`${item.file.name}-${index}`} className={styles.file_preview_item}>
          <div className={styles.file_preview_image}>
            <img
              src={item.previewUrl}
              alt={item.file.name}
              className={styles.preview_thumbnail}
            />
          </div>
          <div className={styles.file_preview_info}>
            <div className={styles.file_name} title={item.file.name}>
              {item.file.name.length > 20 
                ? `${item.file.name.substring(0, 17)}...` 
                : item.file.name
              }
            </div>
            <div className={styles.file_size}>
              {formatFileSize(item.file.size)}
            </div>
          </div>
          <button
            className={styles.file_remove_button}
            onClick={(e) => handleRemoveClick(index, e)}
            disabled={disabled}
            title="移除圖片"
            type="button"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}