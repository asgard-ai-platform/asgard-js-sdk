import { PropsWithChildren, ReactNode, useMemo } from 'react';
import classes from './chatbot-container.module.scss';
import { useAsgardThemeContext } from '../../../context/asgard-theme-context';

export function ChatbotFullScreenContainer(props: PropsWithChildren): ReactNode {
  const { children } = props;

  const theme = useAsgardThemeContext();

  const styles = useMemo(() => {
    return theme?.chatbot?.backgroundColor
      ? { backgroundColor: theme.chatbot?.backgroundColor }
      : {};
  }, [theme]);

  return (
    <div className={classes.full_screen}>
      <div className={classes.chatbot_container} style={styles}>
        {children}
      </div>
    </div>
  );
}
