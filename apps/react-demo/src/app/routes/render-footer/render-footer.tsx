import { ChangeEvent, KeyboardEvent, ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { Chatbot, useAsgardContext } from '@asgard-js/react';
import '@asgard-js/react/style';
import { DemoWrapper } from '../../components/demo-wrapper';
import styles from './render-footer.module.scss';

function CustomFooter(): ReactNode {
  const { sendMessage, isConnecting, pendingInputValue, setPendingInputValue } = useAsgardContext();
  const [value, setValue] = useState('');
  const [isComposing, setIsComposing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (pendingInputValue === null) return;

    setValue(pendingInputValue);
    setPendingInputValue(null);
    textareaRef.current?.focus();
  }, [pendingInputValue, setPendingInputValue]);

  const isPreviewMode = !sendMessage;
  const trimmed = value.trim();
  const disabled = isPreviewMode || isConnecting || !trimmed;

  const submit = useCallback((): void => {
    if (disabled) return;

    sendMessage?.({ text: trimmed });
    setValue('');
  }, [disabled, sendMessage, trimmed]);

  const onChange = useCallback((event: ChangeEvent<HTMLTextAreaElement>): void => {
    setValue(event.target.value);
  }, []);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>): void => {
      if (event.key === 'Enter' && !event.shiftKey && !isComposing) {
        event.preventDefault();
        submit();
      }
    },
    [isComposing, submit],
  );

  const insertGreeting = useCallback((): void => {
    setValue(prev => (prev ? prev : 'Hi there!'));
    textareaRef.current?.focus();
  }, []);

  return (
    <div className={styles.footer}>
      <button
        type="button"
        className={styles.iconButton}
        onClick={insertGreeting}
        title="Insert a greeting"
        disabled={isPreviewMode}
      >
        Hi
      </button>
      <textarea
        ref={textareaRef}
        className={styles.textarea}
        rows={1}
        value={value}
        placeholder={isPreviewMode ? 'Preview mode - input disabled' : 'Type a message and press Enter'}
        disabled={isPreviewMode}
        onChange={onChange}
        onKeyDown={onKeyDown}
        onCompositionStart={() => setIsComposing(true)}
        onCompositionEnd={() => setIsComposing(false)}
      />
      <button type="button" className={styles.sendButton} onClick={submit} disabled={disabled}>
        Send
      </button>
    </div>
  );
}

export function RenderFooter(): ReactNode {
  return (
    <DemoWrapper
      title="Render Footer"
      description="Demonstrates renderFooter prop to fully replace the default footer. The custom footer uses useAsgardContext() to access sendMessage, isConnecting, and pendingInputValue."
    >
      <div className={styles.chatbotContainer}>
        <Chatbot
          title="Render Footer Demo"
          config={{ botProviderEndpoint: import.meta.env.VITE_SIMPLE_BOT_PROVIDER_ENDPOINT }}
          customChannelId="render-footer-demo"
          renderFooter={() => <CustomFooter />}
        />
      </div>
    </DemoWrapper>
  );
}
