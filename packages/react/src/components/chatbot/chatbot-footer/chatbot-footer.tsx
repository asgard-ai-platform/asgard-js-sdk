import {
  ChangeEventHandler,
  KeyboardEventHandler,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useAsgardContext } from '../../../context/asgard-service-context';
import { useAsgardAppInitializationContext } from '../../../context/asgard-app-initialization-context';
import styles from './chatbot-footer.module.scss';
import SendSvg from '../../../icons/send.svg?react';
import GallerySvg from '../../../icons/gallery.svg?react';
import DownloadSvg from '../../../icons/download.svg?react';
import DocumentSvg from '../../../icons/document.svg?react';
import PlusSvg from '../../../icons/plus.svg?react';
import { SpeechInputButton } from './speech-input-button';
import { DocumentUploadButton } from './document-upload-button';
import clsx from 'clsx';
import { useAsgardThemeContext } from '../../../context/asgard-theme-context';
import { useFileDropContext } from '../../../context/file-drop-context';
import {
  validateImageFiles,
  validateDocumentFiles,
  SUPPORTED_DOCUMENT_EXTENSIONS,
  SUPPORTED_DOCUMENT_TYPES,
  UploadableImage,
  UploadableDocument,
} from '../../../utils/file-validation';

const MAX_IMAGE_COUNT = 10;
const MAX_DOCUMENT_COUNT = 10;

export function ChatbotFooter(): ReactNode {
  const {
    sendMessage,
    isConnecting,
    inputPlaceholder,
    client,
    customChannelId,
    enableUpload: enableUploadProp,
    enableExport: enableExportProp,
    enableDocumentUpload: enableDocumentUploadProp,
    messages,
    title,
    programmaticScrollToBottom,
    onBeforeSendMessage,
    pendingInputValue,
    setPendingInputValue,
  } = useAsgardContext();
  const { data } = useAsgardAppInitializationContext();

  const { chatbot } = useAsgardThemeContext();

  // Determine enableUpload: prioritize prop, then annotations
  const enableUpload = useMemo(() => {
    if (enableUploadProp !== undefined) {
      return enableUploadProp;
    }

    return data.annotations?.embedConfig?.enableUpload ?? false;
  }, [enableUploadProp, data.annotations?.embedConfig?.enableUpload]);

  // Determine enableExport: prioritize prop, then annotations
  const enableExport = useMemo(() => {
    if (enableExportProp !== undefined) {
      return enableExportProp;
    }

    return data.annotations?.embedConfig?.enableExport ?? false;
  }, [enableExportProp, data.annotations?.embedConfig?.enableExport]);

  // Determine enableDocumentUpload: prioritize prop, then annotations
  const enableDocumentUpload = useMemo(() => {
    if (enableDocumentUploadProp !== undefined) {
      return enableDocumentUploadProp;
    }

    return data.annotations?.embedConfig?.enableDocumentUpload ?? false;
  }, [enableDocumentUploadProp, data.annotations?.embedConfig?.enableDocumentUpload]);

  // Determine bot name: prioritize annotations, then prop, then default
  const botName = useMemo(() => {
    return data.annotations?.embedConfig?.title || title || 'Bot';
  }, [data.annotations?.embedConfig?.title, title]);

  const [value, setValue] = useState('');
  const [isComposing, setIsComposing] = useState(false);
  const [uploadableImages, setUploadableImages] = useState<UploadableImage[]>([]);
  const [previewImage, setPreviewImage] = useState<{
    url: string;
    name: string;
  } | null>(null);
  const [uploadableDocuments, setUploadableDocuments] = useState<UploadableDocument[]>([]);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // 檢查是否有圖片正在上傳
  const isImageUploading = useMemo(
    () => uploadableImages.some(img => img.uploadStatus === 'uploading'),
    [uploadableImages],
  );

  // 檢查是否有文件正在上傳
  const isDocumentUploading = useMemo(
    () => uploadableDocuments.some(doc => doc.uploadStatus === 'uploading'),
    [uploadableDocuments],
  );

  // Preview mode: sendMessage is undefined
  const isPreviewMode = !sendMessage;

  const disabled = useMemo(
    () =>
      isPreviewMode ||
      isConnecting ||
      isImageUploading ||
      isDocumentUploading ||
      (!value.trim() && uploadableImages.length === 0 && uploadableDocuments.length === 0),
    [
      isPreviewMode,
      isConnecting,
      isImageUploading,
      isDocumentUploading,
      value,
      uploadableImages.length,
      uploadableDocuments.length,
    ],
  );

  const contentStyles = useMemo(
    () => ({
      maxWidth: chatbot?.contentMaxWidth ?? '1200px',
    }),
    [chatbot],
  );

  const footerStyles = useMemo(
    () => ({
      ...chatbot?.footer?.style,
      borderTopColor: chatbot?.borderColor,
    }),
    [chatbot],
  );

  const documentPreviewStyles = useMemo(
    () => ({
      backgroundColor: chatbot?.backgroundColor,
      borderColor: chatbot?.borderColor,
    }),
    [chatbot],
  );

  const documentPreviewTextStyles = useMemo(
    () => ({
      color: chatbot?.primaryComponent?.secondaryColor,
    }),
    [chatbot],
  );

  // 計算啟用的按鈕數量
  const enabledButtonCount = useMemo(() => {
    let count = 0;

    if (enableExport) count++;

    if (enableUpload) count++;

    if (enableDocumentUpload) count++;

    return count;
  }, [enableExport, enableUpload, enableDocumentUpload]);

  const showCollapsedMenu = enabledButtonCount >= 3;

  // 點擊外部關閉選單
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return (): void => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMenuOpen]);

  const onChange = useCallback<ChangeEventHandler<HTMLTextAreaElement>>(event => {
    const element = event.target as HTMLTextAreaElement;
    const value = element.value;

    element.style.height = '36px';

    if (value) {
      element.style.height = `${element.scrollHeight}px`;
    }

    setValue(event.target.value);
  }, []);

  // 控制 textarea 的 focused 狀態，用於觸發 CSS 動畫防止 iOS scroll chaining
  const [isTextareaFocused, setIsTextareaFocused] = useState(false);

  // 當 textarea 獲得焦點時，觸發 CSS 動畫防止 iOS Safari 自動滾動
  // 並延遲滾動 chatbot 內部到底部
  const onFocus = useCallback(() => {
    // 觸發 CSS 動畫防止 iOS scroll chaining
    setIsTextareaFocused(true);

    // 延遲執行讓 iOS 虛擬鍵盤有時間彈出並調整 viewport，然後滾動 chatbot 到底部
    setTimeout(() => {
      programmaticScrollToBottom('smooth');
    }, 300);
  }, [programmaticScrollToBottom]);

  // 動畫結束後重置狀態，確保下次 focus 時動畫會重新執行
  const onAnimationEnd = useCallback(() => {
    setIsTextareaFocused(false);
  }, []);

  const onSubmit = useCallback(() => {
    if (!isComposing && !isConnecting) {
      const messageText = value.trim();

      // 取得已上傳成功的圖片 blobIds（圖片已在選擇時上傳完成）
      const successfulImages = uploadableImages.filter(
        (img): img is UploadableImage & { blobId: string } =>
          img.uploadStatus === 'success' && img.blobId !== undefined,
      );

      // 取得已上傳成功的文件 blobIds（文件已在選擇時上傳完成）
      const successfulDocuments = uploadableDocuments.filter(
        (doc): doc is UploadableDocument & { blobId: string } =>
          doc.uploadStatus === 'success' && doc.blobId !== undefined,
      );

      // 合併所有 blobIds
      const allBlobIds = [...successfulImages.map(img => img.blobId), ...successfulDocuments.map(doc => doc.blobId)];

      // 取得圖片預覽 URL（只取上傳成功的）
      const filePreviewUrls = successfulImages.map(img => img.previewUrl);

      if (messageText || allBlobIds.length > 0 || filePreviewUrls.length > 0 || successfulDocuments.length > 0) {
        let params: {
          text: string;
          blobIds?: string[];
          filePreviewUrls?: string[];
          documentNames?: string[];
          payload?: Record<string, unknown> | (() => Record<string, unknown>);
        } = {
          text: messageText || '',
        };

        if (allBlobIds.length > 0) {
          params.blobIds = allBlobIds;
        }

        if (filePreviewUrls.length > 0) {
          params.filePreviewUrls = filePreviewUrls;
        }

        if (successfulDocuments.length > 0) {
          params.documentNames = successfulDocuments.map(doc => doc.file.name);
        }

        // Apply onBeforeSendMessage hook if provided
        if (onBeforeSendMessage) {
          params = onBeforeSendMessage(params);
        }

        sendMessage?.(params);
      }

      setValue('');
      setUploadableImages([]);
      setUploadableDocuments([]);

      if (textareaRef.current) {
        textareaRef.current.style.height = '36px';
      }
    }
  }, [isComposing, isConnecting, sendMessage, onBeforeSendMessage, value, uploadableImages, uploadableDocuments]);

  const onKeyDown = useCallback<KeyboardEventHandler<HTMLTextAreaElement>>(
    event => {
      if (
        event.key === 'Enter' &&
        !isComposing &&
        !isConnecting &&
        (value.trim() || uploadableImages.length > 0 || uploadableDocuments.length > 0)
      ) {
        event.preventDefault();
        onSubmit();
      }
    },
    [isComposing, isConnecting, value, uploadableImages.length, uploadableDocuments.length, onSubmit],
  );

  // 上傳單一圖片
  const uploadImage = useCallback(
    async (imageId: string, file: File) => {
      if (!client?.uploadFile || !customChannelId) {
        setUploadableImages(prev =>
          prev.map(img =>
            img.id === imageId ? { ...img, uploadStatus: 'error' as const, error: '上傳服務不可用' } : img,
          ),
        );

        return;
      }

      try {
        const response = await client.uploadFile(file, customChannelId);

        const blobData = response.data?.[0];
        if (blobData?.blobId) {
          setUploadableImages(prev =>
            prev.map(img =>
              img.id === imageId ? { ...img, uploadStatus: 'success' as const, blobId: blobData.blobId } : img,
            ),
          );
        } else {
          setUploadableImages(prev =>
            prev.map(img => (img.id === imageId ? { ...img, uploadStatus: 'error' as const, error: '上傳失敗' } : img)),
          );
        }
      } catch {
        setUploadableImages(prev =>
          prev.map(img => (img.id === imageId ? { ...img, uploadStatus: 'error' as const, error: '上傳失敗' } : img)),
        );
      }
    },
    [client, customChannelId],
  );

  const processImageFiles = useCallback(
    (files: File[]) => {
      const { validFiles, errors } = validateImageFiles(files);

      if (errors.length > 0) {
        alert('檔案驗證錯誤:\n' + errors.join('\n'));
      }

      if (validFiles.length > 0) {
        const remainingSlots = MAX_IMAGE_COUNT - uploadableImages.length;
        const filesToAdd = validFiles.slice(0, remainingSlots);

        if (validFiles.length > remainingSlots) {
          alert(`最多只能上傳 ${MAX_IMAGE_COUNT} 張圖片，已選擇前 ${remainingSlots} 張`);
        }

        if (filesToAdd.length > 0) {
          // 清除已選的文件（圖片和文件只能擇一）
          setUploadableDocuments([]);

          // 為每個檔案建立 UploadableImage 並讀取預覽 URL，然後立即上傳
          for (const file of filesToAdd) {
            const id = crypto.randomUUID();
            const reader = new FileReader();

            reader.onload = (e): void => {
              if (e.target?.result && typeof e.target.result === 'string') {
                const newImage: UploadableImage = {
                  id,
                  file,
                  previewUrl: e.target.result,
                  uploadStatus: 'uploading',
                };
                setUploadableImages(prev => [...prev, newImage]);

                // 立即開始上傳
                uploadImage(id, file);
              }
            };

            reader.readAsDataURL(file);
          }
        }
      }
    },
    [uploadableImages.length, uploadImage],
  );

  const handleFileSelect = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (files && files.length > 0) {
        processImageFiles(Array.from(files));
      }

      event.target.value = '';
    },
    [processImageFiles],
  );

  const handleGalleryClick = useCallback(() => {
    if (uploadableImages.length >= MAX_IMAGE_COUNT) {
      alert(`最多只能上傳 ${MAX_IMAGE_COUNT} 張圖片`);

      return;
    }

    fileInputRef.current?.click();
  }, [uploadableImages.length]);

  const handleRemoveImage = useCallback((id: string) => {
    setUploadableImages(prev => prev.filter(img => img.id !== id));
  }, []);

  // 上傳單一文件
  const uploadDocument = useCallback(
    async (docId: string, file: File) => {
      if (!client?.uploadFile || !customChannelId) {
        setUploadableDocuments(prev =>
          prev.map(doc =>
            doc.id === docId ? { ...doc, uploadStatus: 'error' as const, error: '上傳服務不可用' } : doc,
          ),
        );

        return;
      }

      try {
        const response = await client.uploadFile(file, customChannelId);

        const blobData = response.data?.[0];
        if (blobData?.blobId) {
          setUploadableDocuments(prev =>
            prev.map(doc =>
              doc.id === docId ? { ...doc, uploadStatus: 'success' as const, blobId: blobData.blobId } : doc,
            ),
          );
        } else {
          setUploadableDocuments(prev =>
            prev.map(doc => (doc.id === docId ? { ...doc, uploadStatus: 'error' as const, error: '上傳失敗' } : doc)),
          );
        }
      } catch {
        setUploadableDocuments(prev =>
          prev.map(doc => (doc.id === docId ? { ...doc, uploadStatus: 'error' as const, error: '上傳失敗' } : doc)),
        );
      }
    },
    [client, customChannelId],
  );

  // 處理文件選擇（共用邏輯）
  const handleDocumentSelect = useCallback(
    (files: FileList | File[]) => {
      const { validFiles, errors } = validateDocumentFiles(files);

      if (errors.length > 0) {
        alert('檔案驗證錯誤:\n' + errors.join('\n'));
      }

      if (validFiles.length > 0) {
        const remainingSlots = MAX_DOCUMENT_COUNT - uploadableDocuments.length;
        const filesToAdd = validFiles.slice(0, remainingSlots);

        if (validFiles.length > remainingSlots) {
          alert(`最多只能上傳 ${MAX_DOCUMENT_COUNT} 個檔案，已選擇前 ${remainingSlots} 個`);
        }

        if (filesToAdd.length > 0) {
          // 清除已選的圖片（圖片和文件只能擇一）
          setUploadableImages([]);

          // 建立新文件並立即開始上傳
          for (const file of filesToAdd) {
            const id = crypto.randomUUID();
            const newDoc: UploadableDocument = {
              id,
              file,
              uploadStatus: 'uploading',
            };
            setUploadableDocuments(prev => [...prev, newDoc]);

            // 立即開始上傳
            uploadDocument(id, file);
          }
        }
      }
    },
    [uploadableDocuments.length, uploadDocument],
  );

  // Handle dropped files from drag & drop
  const { droppedFiles, clearDroppedFiles } = useFileDropContext();

  useEffect(() => {
    if (droppedFiles.length === 0) return;

    const imageFiles: File[] = [];
    const documentFiles: File[] = [];

    for (const file of droppedFiles) {
      if (file.type.startsWith('image/')) {
        imageFiles.push(file);
      } else {
        documentFiles.push(file);
      }
    }

    if (imageFiles.length > 0 && enableUpload) {
      processImageFiles(imageFiles);
    } else if (documentFiles.length > 0 && enableDocumentUpload) {
      handleDocumentSelect(documentFiles);
    } else if (imageFiles.length > 0 && !enableUpload && enableDocumentUpload) {
      // If image upload is disabled but document upload is enabled, treat as documents
      handleDocumentSelect(imageFiles);
    }

    clearDroppedFiles();
  }, [droppedFiles, clearDroppedFiles, enableUpload, enableDocumentUpload, processImageFiles, handleDocumentSelect]);

  // Handle paste from clipboard
  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>): void => {
      if (!enableUpload) return;

      const items = e.clipboardData?.items;
      if (!items) return;

      const imageFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) imageFiles.push(file);
        }
      }

      if (imageFiles.length > 0) {
        e.preventDefault();
        processImageFiles(imageFiles);
      }
      // 沒有圖片時不干預，讓文字正常貼上
    },
    [enableUpload, processImageFiles],
  );

  // Handle pending input value from external ref (e.g. menu click)
  useEffect(() => {
    if (pendingInputValue === null) return;

    setValue(pendingInputValue);
    setPendingInputValue(null);

    if (textareaRef.current) {
      textareaRef.current.style.height = '36px';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
      textareaRef.current.focus();
    }
  }, [pendingInputValue, setPendingInputValue]);

  const handleDownloadClick = useCallback(async () => {
    if (!messages) {
      alert('目前沒有可下載的對話紀錄');

      return;
    }

    try {
      const { exportConversationToMarkdown, downloadMarkdown } = await import('../../../utils/export-conversation');

      const markdown = exportConversationToMarkdown(messages, {
        customChannelId,
        botName,
      });

      downloadMarkdown(markdown, { botName });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('下載對話紀錄失敗:', error);
      alert('下載失敗，請重試');
    }
  }, [messages, customChannelId, botName]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.setProperty(
        '--asg-color-text-placeholder',
        chatbot.footer?.textArea?.['::placeholder']?.color ?? 'var(--asg-color-text-placeholder)',
      );
    }
  }, [chatbot.footer?.textArea]);

  return (
    <div className={clsx('asgard-chatbot-footer', styles.chatbot_footer)} style={footerStyles}>
      {enableUpload && uploadableImages.length > 0 && (
        <div
          className={styles.file_preview_container}
          style={{ maxWidth: contentStyles.maxWidth }}
          data-scrollable="true"
        >
          <div className={styles.file_preview_grid}>
            {uploadableImages.map(image => (
              <div
                key={image.id}
                className={clsx(
                  styles.file_preview_item,
                  image.uploadStatus === 'error' && styles.file_preview_item__error,
                )}
              >
                <div className={styles.file_preview_image_area}>
                  <img
                    src={image.previewUrl}
                    alt={image.file.name}
                    className={styles.file_preview_image}
                    onClick={() => {
                      setPreviewImage({ url: image.previewUrl, name: image.file.name });
                    }}
                  />

                  {/* 上傳中遮罩 */}
                  {image.uploadStatus === 'uploading' && (
                    <div className={styles.file_upload_overlay}>
                      <div className={styles.file_upload_spinner} />
                    </div>
                  )}

                  {/* 上傳失敗遮罩 */}
                  {image.uploadStatus === 'error' && (
                    <div className={styles.file_error_overlay}>
                      <svg
                        className={styles.file_error_icon}
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <line x1="15" y1="9" x2="9" y2="15" />
                        <line x1="9" y1="9" x2="15" y2="15" />
                      </svg>
                    </div>
                  )}

                  <button
                    onClick={() => handleRemoveImage(image.id)}
                    className={styles.file_remove_button}
                    aria-label="移除"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {enableDocumentUpload && uploadableDocuments.length > 0 && (
        <div
          className={styles.file_preview_container}
          style={{ maxWidth: contentStyles.maxWidth }}
          data-scrollable="true"
        >
          <div className={styles.document_preview_grid}>
            {uploadableDocuments.map(doc => (
              <div
                key={doc.id}
                className={clsx(
                  styles.document_preview_item,
                  doc.uploadStatus === 'error' && styles.file_preview_item__error,
                )}
                style={documentPreviewStyles}
              >
                <div className={styles.document_preview_icon_wrapper}>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={styles.document_preview_icon}
                    style={documentPreviewTextStyles}
                  >
                    <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
                    <path d="M14 2v4a2 2 0 0 0 2 2h4" />
                    <path d="M10 9H8" />
                    <path d="M16 13H8" />
                    <path d="M16 17H8" />
                  </svg>
                </div>
                <span className={styles.document_preview_name} style={documentPreviewTextStyles} title={doc.file.name}>
                  {doc.file.name}
                </span>

                {/* 上傳中遮罩 */}
                {doc.uploadStatus === 'uploading' && (
                  <div className={styles.file_upload_overlay}>
                    <div className={styles.file_upload_spinner} />
                  </div>
                )}

                {/* 上傳失敗遮罩 */}
                {doc.uploadStatus === 'error' && (
                  <div className={styles.file_error_overlay}>
                    <svg
                      className={styles.file_error_icon}
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <line x1="15" y1="9" x2="9" y2="15" />
                      <line x1="9" y1="9" x2="15" y2="15" />
                    </svg>
                  </div>
                )}

                <button
                  onClick={() => setUploadableDocuments(prev => prev.filter(d => d.id !== doc.id))}
                  className={styles.file_remove_button}
                  aria-label="移除"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className={styles.chatbot_footer__content} style={contentStyles}>
        {/* Hidden file input for image upload */}
        {enableUpload && (
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
            onChange={handleFileSelect}
            className={styles.file_input_hidden}
          />
        )}

        <div className={styles.attachment_buttons}>
          {showCollapsedMenu ? (
            <div className={styles.attachment_menu_container} ref={menuRef}>
              <button
                className={styles.attachment_button}
                style={chatbot.footer?.attachmentButton?.style}
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                title="更多選項"
              >
                <PlusSvg />
              </button>
              {isMenuOpen && (
                <div
                  className={styles.attachment_menu}
                  style={{ backgroundColor: chatbot?.backgroundColor, borderColor: chatbot?.borderColor }}
                >
                  {enableDocumentUpload && (
                    <button
                      className={styles.attachment_menu_item}
                      style={{ color: chatbot?.primaryComponent?.secondaryColor }}
                      onClick={() => {
                        const input = document.createElement('input');
                        input.type = 'file';
                        input.multiple = true;
                        input.accept = [...SUPPORTED_DOCUMENT_TYPES, ...SUPPORTED_DOCUMENT_EXTENSIONS].join(',');
                        input.onchange = (e): void => {
                          const files = (e.target as HTMLInputElement).files;

                          if (files && files.length > 0) {
                            handleDocumentSelect(files);
                          }
                        };

                        input.click();
                        setIsMenuOpen(false);
                      }}
                    >
                      <DocumentSvg />
                      <span>Document</span>
                    </button>
                  )}
                  {enableUpload && (
                    <button
                      className={styles.attachment_menu_item}
                      style={{ color: chatbot?.primaryComponent?.secondaryColor }}
                      onClick={() => {
                        handleGalleryClick();
                        setIsMenuOpen(false);
                      }}
                    >
                      <GallerySvg />
                      <span>Image</span>
                    </button>
                  )}
                  {enableExport && (
                    <button
                      className={styles.attachment_menu_item}
                      style={{ color: chatbot?.primaryComponent?.secondaryColor }}
                      onClick={() => {
                        handleDownloadClick();
                        setIsMenuOpen(false);
                      }}
                    >
                      <DownloadSvg />
                      <span>Export History</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <>
              {enableExport && (
                <button
                  className={styles.attachment_button}
                  style={chatbot.footer?.attachmentButton?.style}
                  onClick={handleDownloadClick}
                  title="下載"
                >
                  <DownloadSvg />
                </button>
              )}
              {enableUpload && (
                <button
                  className={styles.attachment_button}
                  style={chatbot.footer?.attachmentButton?.style}
                  onClick={handleGalleryClick}
                  title="選擇照片"
                >
                  <GallerySvg />
                </button>
              )}
              {enableDocumentUpload && (
                <DocumentUploadButton
                  currentCount={uploadableDocuments.length}
                  onDocumentsChange={files => handleDocumentSelect(files)}
                  className={styles.attachment_button}
                  style={chatbot.footer?.attachmentButton?.style}
                />
              )}
            </>
          )}
        </div>
        <textarea
          ref={textareaRef}
          className={clsx(styles.chatbot_textarea, isTextareaFocused && styles['chatbot_textarea--focused'])}
          style={chatbot.footer?.textArea?.style}
          cols={40}
          value={value}
          disabled={isPreviewMode}
          placeholder={isPreviewMode ? 'Preview mode - input disabled' : inputPlaceholder || 'Enter message'}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onPaste={handlePaste}
          onFocus={onFocus}
          onAnimationEnd={onAnimationEnd}
          onCompositionStart={() => setIsComposing(true)}
          onCompositionEnd={() => setIsComposing(false)}
        />
        {value || uploadableImages.length > 0 || uploadableDocuments.length > 0 ? (
          <button
            className={clsx(styles.chatbot_submit_button, disabled && styles.chatbot_submit_button__disabled)}
            style={chatbot.footer?.submitButton?.style}
            disabled={disabled}
            onClick={onSubmit}
          >
            <SendSvg />
          </button>
        ) : (
          <SpeechInputButton
            setValue={setValue}
            className={clsx(styles.chatbot_submit_button, isConnecting && styles.chatbot_submit_button__disabled)}
            style={chatbot.footer?.speechInputButton?.style}
          />
        )}
      </div>

      {previewImage && (
        <div
          className={styles.image_modal}
          onClick={() => {
            if (previewImage.url) {
              URL.revokeObjectURL(previewImage.url);
            }

            setPreviewImage(null);
          }}
        >
          <div className={styles.image_modal_content}>
            <img
              src={previewImage.url}
              alt={previewImage.name}
              className={styles.image_modal_image}
              onClick={e => e.stopPropagation()}
            />
          </div>

          <button
            onClick={e => {
              e.stopPropagation();
              if (previewImage.url) {
                URL.revokeObjectURL(previewImage.url);
              }

              setPreviewImage(null);
            }}
            className={styles.image_modal_close_button}
            aria-label="關閉預覽"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
