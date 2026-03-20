import { DragEventHandler, PropsWithChildren, ReactNode, useEffect, useMemo, useRef } from 'react';
import classes from './chatbot-container.module.scss';
import { useAsgardThemeContext } from '../../../context/asgard-theme-context';
import { useVisualViewport } from '../../../hooks';

interface ChatbotFullScreenContainerProps extends PropsWithChildren {
  onDragEnter?: DragEventHandler<HTMLDivElement>;
  onDragOver?: DragEventHandler<HTMLDivElement>;
  onDragLeave?: DragEventHandler<HTMLDivElement>;
  onDrop?: DragEventHandler<HTMLDivElement>;
}

export function ChatbotFullScreenContainer(props: ChatbotFullScreenContainerProps): ReactNode {
  const { children, onDragEnter, onDragOver, onDragLeave, onDrop } = props;

  const containerRef = useRef<HTMLDivElement>(null);
  const chatbotContainerRef = useRef<HTMLDivElement>(null);
  const theme = useAsgardThemeContext();

  // Handle iOS virtual keyboard by tracking visualViewport changes
  useVisualViewport(containerRef);

  // Prevent scroll chaining to parent page
  useEffect(() => {
    const container = chatbotContainerRef.current;
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

  const styles = useMemo(() => {
    return theme?.chatbot?.backgroundColor ? { backgroundColor: theme.chatbot?.backgroundColor } : {};
  }, [theme]);

  return (
    <div ref={containerRef} className={classes.full_screen}>
      <div
        ref={chatbotContainerRef}
        className={classes.chatbot_container}
        style={styles}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        {children}
      </div>
    </div>
  );
}
