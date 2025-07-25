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
import { useAsgardContext } from 'src/context/asgard-service-context';
import styles from './chatbot-footer.module.scss';
import SendSvg from 'src/icons/send.svg?react';
import CameraSvg from 'src/icons/camera.svg?react';
import GallerySvg from 'src/icons/gallery.svg?react';
import { SpeechInputButton } from './speech-input-button';
import { FileSelector } from './file-selector';
import { ImagePreview } from './image-preview';
import clsx from 'clsx';
import { useAsgardThemeContext } from 'src/context/asgard-theme-context';

export function ChatbotFooter(): ReactNode {
  const { sendMessage, sendMessageWithFiles, isConnecting } = useAsgardContext();

  const { chatbot } = useAsgardThemeContext();

  const [value, setValue] = useState('');
  const [isComposing, setIsComposing] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const disabled = useMemo(
    () => isConnecting || isUploading || (!value.trim() && selectedFiles.length === 0),
    [isConnecting, isUploading, value, selectedFiles.length]
  );

  const contentStyles = useMemo(
    () => ({
      maxWidth: chatbot?.contentMaxWidth ?? '1200px',
      borderTopColor: chatbot?.borderColor,
    }),
    [chatbot]
  );

  const onChange = useCallback<ChangeEventHandler<HTMLTextAreaElement>>(
    (event) => {
      const element = event.target as HTMLTextAreaElement;
      const value = element.value;

      element.style.height = '36px';

      if (value) {
        element.style.height = `${element.scrollHeight}px`;
      }

      setValue(event.target.value);
    },
    []
  );

  const handleFilesSelected = useCallback((files: File[]) => {
    setSelectedFiles(files);
  }, []);

  const handleRemoveFile = useCallback((index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  }, []);

  const onSubmit = useCallback(async () => {
    if (!isComposing && !isConnecting && (value.trim() || selectedFiles.length > 0)) {
      try {
        setIsUploading(true);
        
        if (selectedFiles.length > 0) {
          await sendMessageWithFiles?.({
            text: value,
            files: selectedFiles
          });
        } else {
          sendMessage?.({ text: value });
        }
        
        setValue('');
        setSelectedFiles([]);

        if (textareaRef.current) {
          textareaRef.current.style.height = '36px';
        }
      } catch (error) {
        // Error handling without console logging
      } finally {
        setIsUploading(false);
      }
    }
  }, [isComposing, isConnecting, sendMessage, sendMessageWithFiles, value, selectedFiles]);

  const onKeyDown = useCallback<KeyboardEventHandler<HTMLTextAreaElement>>(
    (event) => {
      if (
        event.key === 'Enter' &&
        !isComposing &&
        !isConnecting &&
        (value.trim() || selectedFiles.length > 0)
      ) {
        event.preventDefault();
        onSubmit();
      }
    },
    [isComposing, isConnecting, onSubmit, value, selectedFiles.length]
  );

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.setProperty(
        '--asg-color-text-placeholder',
        chatbot.footer?.textArea?.['::placeholder']?.color ??
          'var(--asg-color-text-placeholder)'
      );
    }
  }, [chatbot.footer?.textArea]);

  return (
    <div
      className={clsx('asgard-chatbot-footer', styles.chatbot_footer)}
      style={chatbot.footer?.style}
    >
      <div className={styles.chatbot_footer__content} style={contentStyles}>
        <div className={styles.attachment_buttons}>
          <button
            className={styles.attachment_button}
            onClick={() => {}}
            disabled={isConnecting || isUploading}
            title="拍照"
          >
            <CameraSvg />
          </button>
          <FileSelector
            onFilesSelected={handleFilesSelected}
            accept="image/*"
            multiple
            maxSize={20 * 1024 * 1024} // 20MB
            disabled={isConnecting || isUploading}
          >
            <button
              className={styles.attachment_button}
              disabled={isConnecting || isUploading}
              title="選擇照片"
            >
              <GallerySvg />
            </button>
          </FileSelector>
        </div>
        <div className={styles.input_area}>
          {selectedFiles.length > 0 && (
            <div className={styles.file_preview_wrapper}>
              <ImagePreview
                files={selectedFiles}
                onRemove={handleRemoveFile}
                disabled={isUploading}
              />
            </div>
          )}
          <textarea
            ref={textareaRef}
            className={styles.chatbot_textarea}
            style={chatbot.footer?.textArea?.style}
            disabled={isConnecting || isUploading}
            cols={40}
            value={value}
            placeholder={selectedFiles.length > 0 ? "新增訊息（可選）" : "Enter message"}
            onChange={onChange}
            onKeyDown={onKeyDown}
            onCompositionStart={() => setIsComposing(true)}
            onCompositionEnd={() => setIsComposing(false)}
          />
        </div>
        {value || selectedFiles.length > 0 ? (
          <button
            className={clsx(
              styles.chatbot_submit_button,
              disabled && styles.chatbot_submit_button__disabled
            )}
            style={chatbot.footer?.submitButton?.style}
            disabled={disabled}
            onClick={onSubmit}
          >
            <SendSvg />
          </button>
        ) : (
          <SpeechInputButton
            setValue={setValue}
            className={clsx(
              styles.chatbot_submit_button,
              isConnecting && styles.chatbot_submit_button__disabled
            )}
            style={chatbot.footer?.speechInputButton?.style}
          />
        )}
      </div>
    </div>
  );
}
