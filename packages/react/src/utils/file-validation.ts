export const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];

/**
 * 上傳狀態
 */
export type UploadStatus = 'pending' | 'uploading' | 'success' | 'error';

/**
 * 可上傳的圖片
 */
export interface UploadableImage {
  /** 唯一識別碼 */
  id: string;
  /** 原始檔案 */
  file: File;
  /** 用於顯示縮圖的 Data URL */
  previewUrl: string;
  /** 上傳狀態 */
  uploadStatus: UploadStatus;
  /** 上傳成功後的 blobId */
  blobId?: string;
  /** 上傳失敗的錯誤訊息 */
  error?: string;
}

/**
 * 可上傳的文件
 */
export interface UploadableDocument {
  /** 唯一識別碼 */
  id: string;
  /** 原始檔案 */
  file: File;
  /** 上傳狀態 */
  uploadStatus: UploadStatus;
  /** 上傳成功後的 blobId */
  blobId?: string;
  /** 上傳失敗的錯誤訊息 */
  error?: string;
}

// 支援的文件類型 MIME types
export const SUPPORTED_DOCUMENT_TYPES = [
  // Office documents
  'application/pdf',
  'application/vnd.ms-excel', // xls
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
  'application/msword', // doc
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
  'text/csv', // csv
  'application/vnd.ms-powerpoint', // ppt
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // pptx
  // Audio/Video
  'audio/mpeg', // mp3
  'video/mpeg', // mpeg
  'video/mp4', // mp4
  // Text
  'text/html', // html
  'text/xml', // xml
  'application/xml', // xml (alternative)
  'text/plain', // txt
  'application/json', // json
];

// 支援的文件副檔名（作為備用檢查）
export const SUPPORTED_DOCUMENT_EXTENSIONS = [
  '.pdf',
  '.xls',
  '.xlsx',
  '.doc',
  '.docx',
  '.csv',
  '.ppt',
  '.pptx',
  '.mp3',
  '.mpeg',
  '.mp4',
  '.html',
  '.xml',
  '.txt',
  '.json',
];

export const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

export interface FileValidationResult {
  isValid: boolean;
  error?: string;
}

export function validateImageFile(file: File): FileValidationResult {
  // 檢查檔案類型
  if (!SUPPORTED_IMAGE_TYPES.includes(file.type)) {
    const supportedFormats = SUPPORTED_IMAGE_TYPES.map(type => type.split('/')[1].toUpperCase()).join('、');

    return {
      isValid: false,
      error: `不支援的檔案格式。請選擇 ${supportedFormats} 圖片。`,
    };
  }

  // 檢查檔案大小
  if (file.size > MAX_FILE_SIZE) {
    const sizeMB = (file.size / 1024 / 1024).toFixed(1);

    return {
      isValid: false,
      error: `檔案大小 ${sizeMB}MB 超過限制 20MB。`,
    };
  }

  return { isValid: true };
}

export function validateImageFiles(files: FileList | File[]): {
  validFiles: File[];
  errors: string[];
} {
  const validFiles: File[] = [];
  const errors: string[] = [];

  const fileArray = Array.from(files);

  fileArray.forEach(file => {
    const validation = validateImageFile(file);
    if (validation.isValid) {
      validFiles.push(file);
    } else {
      errors.push(`${file.name}: ${validation.error}`);
    }
  });

  return { validFiles, errors };
}

/**
 * 檢查檔案副檔名是否在支援清單中
 */
function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1) return '';

  return filename.slice(lastDot).toLowerCase();
}

/**
 * 驗證單一文件檔案
 */
export function validateDocumentFile(file: File): FileValidationResult {
  const extension = getFileExtension(file.name);

  // 檢查 MIME type 或副檔名（某些瀏覽器可能回傳空的 MIME type）
  const isValidType = SUPPORTED_DOCUMENT_TYPES.includes(file.type);
  const isValidExtension = SUPPORTED_DOCUMENT_EXTENSIONS.includes(extension);

  if (!isValidType && !isValidExtension) {
    return {
      isValid: false,
      error: `不支援的檔案格式。請選擇 PDF、Office 文件、音訊、影片或文字檔案。`,
    };
  }

  // 檢查檔案大小
  if (file.size > MAX_FILE_SIZE) {
    const sizeMB = (file.size / 1024 / 1024).toFixed(1);

    return {
      isValid: false,
      error: `檔案大小 ${sizeMB}MB 超過限制 20MB。`,
    };
  }

  return { isValid: true };
}

/**
 * 驗證多個文件檔案
 */
export function validateDocumentFiles(files: FileList | File[]): {
  validFiles: File[];
  errors: string[];
} {
  const validFiles: File[] = [];
  const errors: string[] = [];

  const fileArray = Array.from(files);

  fileArray.forEach(file => {
    const validation = validateDocumentFile(file);
    if (validation.isValid) {
      validFiles.push(file);
    } else {
      errors.push(`${file.name}: ${validation.error}`);
    }
  });

  return { validFiles, errors };
}
