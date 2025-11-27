import { ReactNode, useCallback, useEffect, useMemo, useRef } from 'react';
import { useAsgardContext } from '../../../context/asgard-service-context';
import styles from './chatbot-body.module.scss';
import { ConversationMessageRenderer } from './conversation-message-renderer';
import { BotTypingPlaceholder } from '../../templates';
import { useAsgardThemeContext } from '../../../context/asgard-theme-context';
import clsx from 'clsx';
import { useResizeObserver } from '../../../hooks';

/** 判斷「是否在底部」的閾值 */
const BOTTOM_THRESHOLD = 50;

export function ChatbotBody(): ReactNode {
  const { chatbot } = useAsgardThemeContext();

  const {
    messages,
    messageBoxBottomRef,
    botTypingPlaceholder,
    scrollContainerRef,
    isFollowingLatest,
    setFollowingLatest,
    scrollToBottom,
    programmaticScrollToBottom,
  } = useAsgardContext();

  const lastMessageCountRef = useRef<number>(0);
  const contentRef = useRef<HTMLDivElement>(null);

  // 監聽滾動事件，根據距離底部的距離判斷是否跟隨
  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;

    function handleScroll(): void {
      if (!scrollContainer) return;

      const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

      // 距離底部 <= 50px → 跟隨，> 50px → 不跟隨
      setFollowingLatest(distanceFromBottom <= BOTTOM_THRESHOLD);
    }

    scrollContainer.addEventListener('scroll', handleScroll, { passive: true });

    return (): void => {
      scrollContainer.removeEventListener('scroll', handleScroll);
    };
  }, [scrollContainerRef, setFollowingLatest]);

  // 當使用者發送新訊息時，強制滾動到底部並恢復跟隨
  useEffect(() => {
    const currentMessageCount = messages?.size ?? 0;
    const hasNewMessage = currentMessageCount > lastMessageCountRef.current;

    lastMessageCountRef.current = currentMessageCount;

    if (hasNewMessage && messages && messages.size > 0) {
      const messagesArray = Array.from(messages.values());
      const lastMessage = messagesArray[messagesArray.length - 1];

      if (lastMessage?.type === 'user') {
        scrollToBottom('smooth');
      }
    }
  }, [messages, scrollToBottom]);

  // 監聽內容區域高度變化來自動滾動（DOM-based）
  // 這比監聽 React 狀態更可靠，因為直接響應實際的 DOM 變化
  const onContentResize = useCallback(() => {
    if (!isFollowingLatest) return;

    programmaticScrollToBottom('smooth');
  }, [isFollowingLatest, programmaticScrollToBottom]);

  useResizeObserver({ ref: contentRef, onResize: onContentResize });

  const contentStyles = useMemo(
    () => ({
      maxWidth: chatbot?.contentMaxWidth ?? '1200px',
    }),
    [chatbot],
  );

  return (
    <div className={styles.chatbot_body_wrapper}>
      <div
        ref={scrollContainerRef}
        className={clsx('asgard-chatbot-body', styles.chatbot_body)}
        style={chatbot?.body?.style}
        data-scrollable="true"
      >
        <div ref={contentRef} className={styles.chatbot_body__content} style={contentStyles}>
          {Array.from(messages?.values() ?? []).map((message, index) => (
            <ConversationMessageRenderer
              key={message.messageId || `${message.type}-${index}-${message.time.getTime()}`}
              message={message}
            />
          ))}
          <BotTypingPlaceholder placeholder={botTypingPlaceholder ?? '正在輸入訊息'} />
          <div ref={messageBoxBottomRef} />
        </div>
      </div>
    </div>
  );
}
