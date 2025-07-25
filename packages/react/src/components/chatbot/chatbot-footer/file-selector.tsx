import { ReactNode, useCallback, useRef } from 'react';

export interface FileSelectorProps {
  onFilesSelected: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  maxSize?: number; // 單位：bytes，預設 20MB
  disabled?: boolean;
  children: ReactNode;
}

export function FileSelector({
  onFilesSelected,
  accept = 'image/*',
  multiple = true,
  maxSize = 20 * 1024 * 1024, // 20MB
  disabled = false,
  children,
}: FileSelectorProps): ReactNode {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = useCallback((file: File): string | null => {
    // Check file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      return `不支援的檔案格式：${file.type}`;
    }

    // Check file size
    if (file.size > maxSize) {
      const maxSizeMB = (maxSize / (1024 * 1024)).toFixed(1);
      const fileSizeMB = (file.size / (1024 * 1024)).toFixed(1);

      return `檔案過大：${fileSizeMB}MB（最大允許：${maxSizeMB}MB）`;
    }

    return null;
  }, [maxSize]);

  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);
    const validFiles: File[] = [];
    const errors: string[] = [];

    // Validate each file
    fileArray.forEach(file => {
      const error = validateFile(file);
      if (error) {
        errors.push(`${file.name}: ${error}`);
      } else {
        validFiles.push(file);
      }
    });

    // Display error messages if needed
    if (errors.length > 0) {
      // File selection errors can be handled with toast notifications or other UI feedback
    }

    // Return valid files
    if (validFiles.length > 0) {
      onFilesSelected(validFiles);
    }

    // Clear input to allow selecting the same files again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [onFilesSelected, validateFile]);

  const handleClick = useCallback(() => {
    if (!disabled && fileInputRef.current) {
      fileInputRef.current.click();
    }
  }, [disabled]);

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={handleFileChange}
        style={{ display: 'none' }}
        disabled={disabled}
      />
      <div onClick={handleClick} style={{ cursor: disabled ? 'not-allowed' : 'pointer' }}>
        {children}
      </div>
    </>
  );
}