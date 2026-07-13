import { Fragment, ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { ConversationMessage, ConversationToolCallMessage } from '@asgard-js/core';
import { useAsgardContext } from '../../../context/asgard-service-context';
import styles from './chatbot-body.module.scss';
import { ConversationMessageRenderer } from './conversation-message-renderer';
import { ToolCallGroupTemplate, ToolCallItemData, ToolCallStatus } from '../../templates';
import { DEFAULT_LOCALE, groupSummary, isNativeBuiltin, Locale, toolDiff, toolLabel } from '../../../i18n';
import { isTaskTool } from '../task-list';
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
function toolCallToItemData(toolCall: ConversationToolCallMessage, locale: Locale): ToolCallItemData {
  // Unified status (F-007): running → completed / error. Failure is backend-authoritative via
  // `isError` (F-009), with the legacy `result.error` heuristic as a fallback for old data.
  let status: ToolCallStatus = 'running';
  if (toolCall.isComplete) {
    const failed = toolCall.isError ?? Boolean(toolCall.result?.error);
    status = failed ? 'error' : 'completed';
  }

  return {
    id: toolCall.messageId,
    // Label priority: reason → synthesized (native built-in) → toolName (F-004).
    label: toolLabel(toolCall, locale),
    // Native built-in tool name drives the per-variant icon; undefined → generic (F-004).
    variant: isNativeBuiltin(toolCall) ? toolCall.toolName : undefined,
    // Write/Edit line diff shown on the right (F-007).
    diff: toolDiff(toolCall) ?? undefined,
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
  const { renderToolCallGroup, locale = DEFAULT_LOCALE } = useAsgardTemplateContext();

  const {
    messages,
    messageBoxBottomRef,
    scrollContainerRef,
    isFollowingLatest,
    setFollowingLatest,
    scrollToBottom,
    programmaticScrollToBottom,
  } = useAsgardContext();

  const lastMessageCountRef = useRef<number>(0);
  const contentRef = useRef<HTMLDivElement>(null);
  const didInitialScrollRef = useRef<boolean>(false);

  // 初次有 messages 時，在 browser paint 之前同步把 chat 滾到底，避免：
  // 1. 看到「先頂部 → 然後跳/滾到底」的閃爍
  // 2. ResizeObserver + 'smooth' scroll 的 race condition — smooth 動畫期間
  //    fire 的 'scroll' events 會被下方 handleScroll 誤判為使用者滾走，把
  //    isFollowingLatest 設成 false，後續 async 內容（例如圖片載入）造成的
  //    layout 增高就不再被追，scroll 停在半路。
  // useLayoutEffect 在 commit DOM 之後、瀏覽器 paint 之前同步執行；
  // 此時 scroll 事件監聽器（下方 useEffect）尚未掛上，所以直接設 scrollTop
  // 不會觸發 handleScroll，也就不會錯誤更新 isFollowingLatest。
  useLayoutEffect(() => {
    if (didInitialScrollRef.current) return;

    if (!messages || messages.size === 0) return;

    const container = scrollContainerRef.current;

    if (!container) return;

    container.scrollTop = container.scrollHeight;
    didInitialScrollRef.current = true;
  }, [messages, scrollContainerRef]);

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
          {groupMessages(Array.from(messages?.values() ?? []).filter(message => !isTaskTool(message))).map(
            (group, index) => {
              if (group.type === 'tool-call-group') {
                const items = group.toolCalls.map(toolCall => toolCallToItemData(toolCall, locale));
                const firstToolCall = group.toolCalls[0];
                const key = `tool-call-group-${firstToolCall?.processId || index}`;
                const summary = groupSummary(group.toolCalls, locale);

                const renderDefaultContent = (overrides?: { title?: string }): ReactNode => (
                  <ToolCallGroupTemplate
                    items={items}
                    time={firstToolCall?.time}
                    title={overrides?.title ?? summary}
                    locale={locale}
                  />
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
            },
          )}
          <div ref={messageBoxBottomRef} />
        </div>
      </div>
    </div>
  );
}
