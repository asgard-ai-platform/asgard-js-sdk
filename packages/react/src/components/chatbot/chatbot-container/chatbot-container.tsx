import { DragEventHandler, PropsWithChildren, ReactNode, CSSProperties, useRef, useEffect } from 'react';
import { ChatbotFullScreenContainer } from './chatbot-full-screen-container';
import classes from './chatbot-container.module.scss';
import { useAsgardThemeContext } from '../../../context/asgard-theme-context';
import clsx from 'clsx';

interface ChatbotContainerProps extends PropsWithChildren {
  className?: string;
  style?: CSSProperties;
  fullScreen?: boolean;
  onDragEnter?: DragEventHandler<HTMLDivElement>;
  onDragOver?: DragEventHandler<HTMLDivElement>;
  onDragLeave?: DragEventHandler<HTMLDivElement>;
  onDrop?: DragEventHandler<HTMLDivElement>;
}

export function ChatbotContainer(props: ChatbotContainerProps): ReactNode {
  const { fullScreen, children, className, style = {}, onDragEnter, onDragOver, onDragLeave, onDrop } = props;
  const containerRef = useRef<HTMLDivElement>(null);

  const { chatbot } = useAsgardThemeContext();
  const { style: rootStyle, header, body, footer, ...chatbotInnerContainerStyle } = chatbot;
  // Prevent unused variable warnings - these are intentionally extracted to exclude from chatbotInnerContainerStyle
  void header;
  void body;
  void footer;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let touchStartY = 0;

    const handleWheel = (e: WheelEvent): void => {
      const target = e.target as HTMLElement;
      const scrollableParent = target.closest('[data-scrollable="true"]');

      if (scrollableParent) {
        const { scrollTop, scrollHeight, clientHeight } = scrollableParent;
        const isAtTop = scrollTop === 0 && e.deltaY < 0;
        const isAtBottom = scrollTop + clientHeight >= scrollHeight && e.deltaY > 0;

        if (isAtTop || isAtBottom) {
          e.preventDefault();
        }
      } else {
        e.preventDefault();
      }
    };

    const handleTouchStart = (e: TouchEvent): void => {
      touchStartY = e.touches[0].clientY;
    };

    const handleTouchMove = (e: TouchEvent): void => {
      const target = e.target as HTMLElement;
      const scrollableParent = target.closest('[data-scrollable="true"]');
      const touchCurrentY = e.touches[0].clientY;
      const deltaY = touchStartY - touchCurrentY;

      if (scrollableParent) {
        const { scrollTop, scrollHeight, clientHeight } = scrollableParent;
        const isAtTop = scrollTop === 0 && deltaY < 0;
        const isAtBottom = scrollTop + clientHeight >= scrollHeight && deltaY > 0;

        if (isAtTop || isAtBottom) {
          e.preventDefault();
        }
      } else {
        e.preventDefault();
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });

    return (): void => {
      container.removeEventListener('wheel', handleWheel);
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
    };
  }, []);

  return (
    <div className={clsx(classes.chatbot_root, className)} style={Object.assign({}, rootStyle, style)}>
      {fullScreen ? (
        <ChatbotFullScreenContainer
          onDragEnter={onDragEnter}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          {children}
        </ChatbotFullScreenContainer>
      ) : (
        <div
          ref={containerRef}
          className={classes.chatbot_container}
          style={chatbotInnerContainerStyle}
          onDragEnter={onDragEnter}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          {children}
        </div>
      )}
    </div>
  );
}
