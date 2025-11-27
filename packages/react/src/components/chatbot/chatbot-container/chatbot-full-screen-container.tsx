import { PropsWithChildren, ReactNode, useMemo, useRef } from 'react';
import classes from './chatbot-container.module.scss';
import { useAsgardThemeContext } from '../../../context/asgard-theme-context';
import { useVisualViewport } from '../../../hooks';

export function ChatbotFullScreenContainer(props: PropsWithChildren): ReactNode {
  const { children } = props;

  const containerRef = useRef<HTMLDivElement>(null);
  const theme = useAsgardThemeContext();

  // Handle iOS virtual keyboard by tracking visualViewport changes
  useVisualViewport(containerRef);

  const styles = useMemo(() => {
    return theme?.chatbot?.backgroundColor ? { backgroundColor: theme.chatbot?.backgroundColor } : {};
  }, [theme]);

  return (
    <div ref={containerRef} className={classes.full_screen}>
      <div className={classes.chatbot_container} style={styles}>
        {children}
      </div>
    </div>
  );
}
