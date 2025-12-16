import { CSSProperties, ReactNode, useCallback, useRef } from 'react';
import DocumentSvg from '../../../icons/document.svg?react';
import { validateDocumentFiles, SUPPORTED_DOCUMENT_EXTENSIONS } from '../../../utils/file-validation';
import styles from './chatbot-footer.module.scss';

const MAX_DOCUMENT_COUNT = 10;

interface DocumentUploadButtonProps {
  currentCount: number;
  onDocumentsChange: (files: File[]) => void;
  className?: string;
  style?: CSSProperties;
}

export function DocumentUploadButton(props: DocumentUploadButtonProps): ReactNode {
  const { currentCount, onDocumentsChange, className, style } = props;

  const documentInputRef = useRef<HTMLInputElement>(null);

  const handleDocumentClick = useCallback(() => {
    if (currentCount >= MAX_DOCUMENT_COUNT) {
      alert(`最多只能上傳 ${MAX_DOCUMENT_COUNT} 個檔案`);

      return;
    }

    documentInputRef.current?.click();
  }, [currentCount]);

  const handleDocumentSelect = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (files && files.length > 0) {
        const { validFiles, errors } = validateDocumentFiles(files);

        if (errors.length > 0) {
          alert('檔案驗證錯誤:\n' + errors.join('\n'));
        }

        if (validFiles.length > 0) {
          const remainingSlots = MAX_DOCUMENT_COUNT - currentCount;
          const filesToAdd = validFiles.slice(0, remainingSlots);

          if (validFiles.length > remainingSlots) {
            alert(`最多只能上傳 ${MAX_DOCUMENT_COUNT} 個檔案，已選擇前 ${remainingSlots} 個`);
          }

          onDocumentsChange(filesToAdd);
        }
      }

      event.target.value = '';
    },
    [currentCount, onDocumentsChange],
  );

  return (
    <>
      <input
        ref={documentInputRef}
        type="file"
        multiple
        accept={SUPPORTED_DOCUMENT_EXTENSIONS.join(',')}
        onChange={handleDocumentSelect}
        className={styles.file_input_hidden}
      />
      <button className={className} style={style} onClick={handleDocumentClick} title="上傳文件">
        <DocumentSvg />
      </button>
    </>
  );
}
