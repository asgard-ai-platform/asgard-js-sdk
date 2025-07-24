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
import clsx from 'clsx';
import { useAsgardThemeContext } from 'src/context/asgard-theme-context';

export function ChatbotFooter(): ReactNode {
  const { sendMessage, isConnecting } = useAsgardContext();

  const { chatbot } = useAsgardThemeContext();

  const [value, setValue] = useState('');
  const [isComposing, setIsComposing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const disabled = useMemo(
    () => isConnecting || !value.trim(),
    [isConnecting, value]
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

  const onSubmit = useCallback(() => {
    if (!isComposing && !isConnecting) {
      sendMessage?.({ text: value });
      setValue('');

      if (textareaRef.current) {
        textareaRef.current.style.height = '36px';
      }
    }
  }, [isComposing, isConnecting, sendMessage, value]);

  const onKeyDown = useCallback<KeyboardEventHandler<HTMLTextAreaElement>>(
    (event) => {
      if (
        event.key === 'Enter' &&
        !isComposing &&
        !isConnecting &&
        value.trim()
      ) {
        sendMessage?.({ text: value });
        setValue('');

        const element = event.target as HTMLTextAreaElement;

        element.style.height = '36px';
      }
    },
    [isComposing, isConnecting, sendMessage, value]
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
            onClick={() => console.log('Camera clicked')}
            disabled={isConnecting}
            title="拍照"
          >
            <CameraSvg />
          </button>
          <button
            className={styles.attachment_button}
            onClick={() => console.log('Gallery clicked')}
            disabled={isConnecting}
            title="選擇照片"
          >
            <GallerySvg />
          </button>
        </div>
        <textarea
          ref={textareaRef}
          className={styles.chatbot_textarea}
          style={chatbot.footer?.textArea?.style}
          disabled={isConnecting}
          cols={40}
          value={value}
          placeholder="Enter message"
          onChange={onChange}
          onKeyDown={onKeyDown}
          onCompositionStart={() => setIsComposing(true)}
          onCompositionEnd={() => setIsComposing(false)}
        />
        {value ? (
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
