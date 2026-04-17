import { Fragment, ReactNode, useCallback, useEffect, useMemo, useRef } from 'react';
import { ConversationMessage, ConversationToolCallMessage } from '@asgard-js/core';
import { useAsgardContext } from '../../../context/asgard-service-context';
import styles from './chatbot-body.module.scss';
import { ConversationMessageRenderer } from './conversation-message-renderer';
import { BotTypingPlaceholder, ToolCallGroupTemplate, ToolCallItemData, ToolCallStatus } from '../../templates';
import { useAsgardThemeContext } from '../../../context/asgard-theme-context';
import { useAsgardTemplateContext } from '../../../context/asgard-template-context';
import clsx from 'clsx';
import { useResizeObserver } from '../../../hooks';

// Helper type for grouped messages
type MessageGroup =
  | { type: 'message'; message: ConversationMessage }
  | { type: 'tool-call-group'; toolCalls: ConversationToolCallMessage[] };

// Group consecutive tool-call messages together
function groupMessages(messages: ConversationMessage[]): MessageGroup[] {
  const groups: MessageGroup[] = [];
  let currentToolCallGroup: ConversationToolCallMessage[] = [];

  for (const message of messages) {
    if (message.type === 'tool-call') {
      currentToolCallGroup.push(message);
    } else {
      // Flush any pending tool-call group
      if (currentToolCallGroup.length > 0) {
        groups.push({ type: 'tool-call-group', toolCalls: currentToolCallGroup });
        currentToolCallGroup = [];
      }

      groups.push({ type: 'message', message });
    }
  }

  // Flush remaining tool-call group
  if (currentToolCallGroup.length > 0) {
    groups.push({ type: 'tool-call-group', toolCalls: currentToolCallGroup });
  }

  return groups;
}

// Convert tool-call message to ToolCallItemData
function toolCallToItemData(toolCall: ConversationToolCallMessage): ToolCallItemData {
  let status: ToolCallStatus = 'pending';
  if (toolCall.isComplete) {
    status = toolCall.result?.error ? 'error' : 'completed';
  }

  return {
    id: toolCall.messageId,
    label: toolCall.toolName,
    status,
    initial: {
      toolsetName: toolCall.toolsetName,
      toolName: toolCall.toolName,
      parameter: toolCall.parameter,
    },
    result: toolCall.result,
  };
}

/** 判斷「是否在底部」的閾值 */
const BOTTOM_THRESHOLD = 50;

export function ChatbotBody(): ReactNode {
  const { chatbot } = useAsgardThemeContext();
  const { renderToolCallGroup } = useAsgardTemplateContext();

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
          {groupMessages(Array.from(messages?.values() ?? [])).map((group, index) => {
            if (group.type === 'tool-call-group') {
              const items = group.toolCalls.map(toolCallToItemData);
              const firstToolCall = group.toolCalls[0];
              const key = `tool-call-group-${firstToolCall?.processId || index}`;

              const renderDefaultContent = (overrides?: { title?: string }): ReactNode => (
                <ToolCallGroupTemplate items={items} time={firstToolCall?.time} title={overrides?.title} />
              );

              if (renderToolCallGroup) {
                const custom = renderToolCallGroup({
                  items,
                  time: firstToolCall?.time,
                  renderDefaultContent,
                });
                if (custom === null) return null;

                return <Fragment key={key}>{custom}</Fragment>;
              }

              return <Fragment key={key}>{renderDefaultContent()}</Fragment>;
            }

            return (
              <ConversationMessageRenderer
                key={group.message.messageId || `${group.message.type}-${index}-${group.message.time.getTime()}`}
                message={group.message}
              />
            );
          })}
          <BotTypingPlaceholder placeholder={botTypingPlaceholder ?? '正在輸入訊息'} />
          <div ref={messageBoxBottomRef} />
        </div>
      </div>
    </div>
  );
}
