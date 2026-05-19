import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { Chatbot, ChatbotRef, useAsgardContext } from '@asgard-js/react';
import '@asgard-js/react/style';
import { DemoWrapper } from '../../components/demo-wrapper';
import { createTextTemplateExample } from '../../mocks/messages';
import styles from './render-footer.module.scss';

const QUICK_PROMPTS = ['Hello from menu', 'What is Asgard?', 'Tell me a joke'];

function CustomFooter(): ReactNode {
  const { sendMessage, isConnecting, pendingInputValue, setPendingInputValue, inputPlaceholder } = useAsgardContext();
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (pendingInputValue === null) return;

    setValue(pendingInputValue);
    setPendingInputValue(null);
    textareaRef.current?.focus();
  }, [pendingInputValue, setPendingInputValue]);

  const isPreview = !sendMessage;
  const trimmed = value.trim();
  const disabled = isPreview || isConnecting || !trimmed;

  const submit = useCallback((): void => {
    if (isPreview || isConnecting) return;

    const text = value.trim();

    if (!text) return;

    sendMessage?.({ text });
    setValue('');
  }, [isPreview, isConnecting, value, sendMessage]);

  return (
    <div className={styles.footer}>
      <textarea
        ref={textareaRef}
        className={styles.textarea}
        placeholder={inputPlaceholder ?? 'Type a message...'}
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          }
        }}
        disabled={isPreview}
        rows={1}
      />
      <button type="button" className={styles.sendButton} onClick={submit} disabled={disabled}>
        Send
      </button>
    </div>
  );
}

export function RenderFooter(): ReactNode {
  const chatbotRef = useRef<ChatbotRef>(null);
  const initMessages = [createTextTemplateExample()];

  const handlePromptClick = useCallback((prompt: string): void => {
    chatbotRef.current?.setInputValue?.(prompt);
  }, []);

  return (
    <DemoWrapper
      title="Render Footer"
      description="Demonstrates renderFooter prop. The default ChatbotFooter is fully replaced by a minimal custom textarea + Send button that talks to useAsgardContext(). Click a quick prompt (in renderMenu) to verify pendingInputValue is forwarded into the custom textarea via ChatbotRef.setInputValue."
    >
      <div className={styles.chatbotContainer}>
        <Chatbot
          ref={chatbotRef}
          title="Render Footer Demo"
          config={{ botProviderEndpoint: import.meta.env.VITE_SIMPLE_BOT_PROVIDER_ENDPOINT }}
          customChannelId="render-footer-demo"
          initMessages={initMessages}
          renderMenu={() => (
            <div className={styles.menu}>
              {QUICK_PROMPTS.map(prompt => (
                <button
                  key={prompt}
                  type="button"
                  className={styles.menuItem}
                  onClick={() => handlePromptClick(prompt)}
                >
                  {prompt}
                </button>
              ))}
            </div>
          )}
          renderFooter={() => <CustomFooter />}
        />
      </div>
    </DemoWrapper>
  );
}
