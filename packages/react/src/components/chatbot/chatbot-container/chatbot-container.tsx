import { PropsWithChildren, ReactNode, CSSProperties } from 'react';
import { ChatbotFullScreenContainer } from './chatbot-full-screen-container';
import classes from './chatbot-container.module.scss';
import { useAsgardThemeContext } from '../../../context/asgard-theme-context';
import clsx from 'clsx';

interface ChatbotContainerProps extends PropsWithChildren {
  className?: string;
  style?: CSSProperties;
  fullScreen?: boolean;
}

export function ChatbotContainer(props: ChatbotContainerProps): ReactNode {
  const { fullScreen, children, className, style = {} } = props;

  const {
    chatbot: { style: rootStyle, header, body, footer, ...chatbotInnerContainerStyle },
  } = useAsgardThemeContext();

  return (
    <div className={clsx(classes.chatbot_root, className)} style={Object.assign({}, rootStyle, style)}>
      {fullScreen ? (
        <ChatbotFullScreenContainer>{children}</ChatbotFullScreenContainer>
      ) : (
        <div className={classes.chatbot_container} style={chatbotInnerContainerStyle}>
          {children}
        </div>
      )}
    </div>
  );
}
