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
import { validateImageFiles } from '../../../utils/file-validation';

const MAX_IMAGE_COUNT = 5;

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
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [filePreviewUrls, setFilePreviewUrls] = useState<string[]>([]);
  const [previewImage, setPreviewImage] = useState<{
    url: string;
    name: string;
  } | null>(null);
  const [selectedDocuments, setSelectedDocuments] = useState<File[]>([]);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const disabled = useMemo(
    () => isConnecting || (!value.trim() && selectedFiles.length === 0 && selectedDocuments.length === 0),
    [isConnecting, value, selectedFiles.length, selectedDocuments.length],
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

  const onSubmit = useCallback(async () => {
    if (!isComposing && !isConnecting) {
      const hasFiles = selectedFiles.length > 0;
      const hasDocuments = selectedDocuments.length > 0;
      const messageText = value.trim();

      try {
        let blobIds: string[] | undefined;

        // 上傳圖片檔案
        if (hasFiles && client?.uploadFile && customChannelId) {
          blobIds = [];

          for (const file of selectedFiles) {
            try {
              const response = await client.uploadFile(file, customChannelId);

              if (response.isSuccess && response.data?.[0]) {
                const blobData = response.data[0];
                blobIds.push(blobData.blobId);
              } else {
                // Upload failed, continue with next file
              }
            } catch {
              alert(`檔案 ${file.name} 上傳失敗`);
            }
          }
        }

        // 上傳文件檔案
        if (hasDocuments && client?.uploadFile && customChannelId) {
          if (!blobIds) {
            blobIds = [];
          }

          for (const file of selectedDocuments) {
            try {
              const response = await client.uploadFile(file, customChannelId);

              if (response.isSuccess && response.data?.[0]) {
                const blobData = response.data[0];
                blobIds.push(blobData.blobId);
              } else {
                // Upload failed, continue with next file
              }
            } catch {
              alert(`檔案 ${file.name} 上傳失敗`);
            }
          }
        }

        // 如果有檔案但全部上傳失敗，則不發送訊息
        if ((hasFiles || hasDocuments) && (!blobIds || blobIds.length === 0)) {
          return;
        }

        if (messageText || blobIds || filePreviewUrls.length > 0 || selectedDocuments.length > 0) {
          const payload: {
            text: string;
            blobIds?: string[];
            filePreviewUrls?: string[];
            documentNames?: string[];
          } = {
            text: messageText || '',
          };

          if (blobIds && blobIds.length > 0) {
            payload.blobIds = blobIds;
          }

          if (filePreviewUrls.length > 0) {
            payload.filePreviewUrls = filePreviewUrls;
          }

          if (selectedDocuments.length > 0) {
            payload.documentNames = selectedDocuments.map(file => file.name);
          }

          sendMessage?.(payload);
        }

        setValue('');
        setSelectedFiles([]);
        setFilePreviewUrls([]);
        setSelectedDocuments([]);

        if (textareaRef.current) {
          textareaRef.current.style.height = '36px';
        }
      } catch {
        alert('發送訊息失敗，請重試');
      }
    }
  }, [
    isComposing,
    isConnecting,
    sendMessage,
    value,
    selectedFiles,
    selectedDocuments,
    filePreviewUrls,
    client,
    customChannelId,
  ]);

  const onKeyDown = useCallback<KeyboardEventHandler<HTMLTextAreaElement>>(
    event => {
      if (
        event.key === 'Enter' &&
        !isComposing &&
        !isConnecting &&
        (value.trim() || selectedFiles.length > 0 || selectedDocuments.length > 0)
      ) {
        event.preventDefault();
        onSubmit();
      }
    },
    [isComposing, isConnecting, value, selectedFiles.length, selectedDocuments.length, onSubmit],
  );

  const handleFileSelect = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (files && files.length > 0) {
        const { validFiles, errors } = validateImageFiles(files);

        if (errors.length > 0) {
          alert('檔案驗證錯誤:\n' + errors.join('\n'));
        }

        if (validFiles.length > 0) {
          const remainingSlots = MAX_IMAGE_COUNT - selectedFiles.length;
          const filesToAdd = validFiles.slice(0, remainingSlots);

          if (validFiles.length > remainingSlots) {
            alert(`最多只能上傳 ${MAX_IMAGE_COUNT} 張圖片，已選擇前 ${remainingSlots} 張`);
          }

          if (filesToAdd.length > 0) {
            // 清除已選的文件（圖片和文件只能擇一）
            setSelectedDocuments([]);
            setSelectedFiles(prev => [...prev, ...filesToAdd]);

            const newPreviewUrls: string[] = [];
            for (const file of filesToAdd) {
              const reader = new FileReader();
              reader.onload = (e): void => {
                if (e.target?.result && typeof e.target.result === 'string') {
                  newPreviewUrls.push(e.target.result);
                  if (newPreviewUrls.length === filesToAdd.length) {
                    setFilePreviewUrls(prev => [...prev, ...newPreviewUrls]);
                  }
                }
              };

              reader.readAsDataURL(file);
            }
          }
        }
      }

      event.target.value = '';
    },
    [selectedFiles.length],
  );

  const handleGalleryClick = useCallback(() => {
    if (selectedFiles.length >= MAX_IMAGE_COUNT) {
      alert(`最多只能上傳 ${MAX_IMAGE_COUNT} 張圖片`);

      return;
    }

    fileInputRef.current?.click();
  }, [selectedFiles.length]);

  const handleRemoveFile = useCallback((index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    setFilePreviewUrls(prev => prev.filter((_, i) => i !== index));
  }, []);

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
      {enableUpload && selectedFiles.length > 0 && (
        <div className={styles.file_preview_container} style={{ maxWidth: contentStyles.maxWidth }}>
          <div className={styles.file_preview_grid}>
            {selectedFiles.map((file, index) => {
              const previewUrl = URL.createObjectURL(file);

              return (
                <div key={index} className={styles.file_preview_item}>
                  <div className={styles.file_preview_image_area}>
                    <img
                      src={previewUrl}
                      alt={file.name}
                      className={styles.file_preview_image}
                      onClick={() => {
                        const modalUrl = URL.createObjectURL(file);
                        setPreviewImage({ url: modalUrl, name: file.name });
                      }}
                      onLoad={() => URL.revokeObjectURL(previewUrl)}
                    />

                    <button
                      onClick={() => handleRemoveFile(index)}
                      className={styles.file_remove_button}
                      aria-label="移除"
                    >
                      ×
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {enableDocumentUpload && selectedDocuments.length > 0 && (
        <div className={styles.file_preview_container} style={{ maxWidth: contentStyles.maxWidth }}>
          <div className={styles.document_preview_grid}>
            {selectedDocuments.map((file, index) => (
              <div key={index} className={styles.document_preview_item} style={documentPreviewStyles}>
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
                <span className={styles.document_preview_name} style={documentPreviewTextStyles} title={file.name}>
                  {file.name}
                </span>
                <button
                  onClick={() => setSelectedDocuments(prev => prev.filter((_, i) => i !== index))}
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
                        input.accept = '.pdf,.doc,.docx,.txt,.xls,.xlsx,.ppt,.pptx';
                        input.onchange = (e): void => {
                          const files = (e.target as HTMLInputElement).files;

                          if (files && files.length > 0) {
                            setSelectedFiles([]);
                            setFilePreviewUrls([]);
                            setSelectedDocuments(prev => [...prev, ...Array.from(files)]);
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
                  currentCount={selectedDocuments.length}
                  onDocumentsChange={files => {
                    setSelectedFiles([]);
                    setFilePreviewUrls([]);
                    setSelectedDocuments(prev => [...prev, ...files]);
                  }}
                  className={styles.attachment_button}
                  style={chatbot.footer?.attachmentButton?.style}
                />
              )}
            </>
          )}
        </div>
        <textarea
          ref={textareaRef}
          className={styles.chatbot_textarea}
          style={chatbot.footer?.textArea?.style}
          cols={40}
          value={value}
          placeholder={inputPlaceholder || 'Enter message'}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onCompositionStart={() => setIsComposing(true)}
          onCompositionEnd={() => setIsComposing(false)}
        />
        {value || selectedFiles.length > 0 || selectedDocuments.length > 0 ? (
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
